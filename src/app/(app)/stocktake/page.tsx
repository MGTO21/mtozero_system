'use client';

import { useMemo, useState } from 'react';
import { useActor, useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/Confirm';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { IconAlert, IconBoxes, IconCheck, IconSearch } from '@/components/ui/Icons';
import { PageHeader, SectionTitle } from '@/components/ui/PageHeader';
import { errorMessage } from '@/lib/db/collections';
import { useProducts } from '@/lib/db/products';
import {
  sizeAverageCost,
  useStockCounts,
  varianceValue,
  variances,
  type CountDraft,
} from '@/lib/db/stocktake';
import { submitCount } from '@/lib/offline/operations';
import { formatDate, money, num } from '@/lib/format';
import type { Category } from '@/lib/types';

type Scope = 'all' | Category;

export default function StockTakePage() {
  const { data: products, loading, error } = useProducts();
  const history = useStockCounts(8);
  const { isOwner } = useAuth();
  const actor = useActor();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();

  const [scope, setScope] = useState<Scope>('all');
  const [search, setSearch] = useState('');
  const [note, setNote] = useState('');
  const [counted, setCounted] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState(false);

  const inScope = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products
      .filter((p) => !p.isArchived)
      .filter((p) => (scope === 'all' ? true : p.category === scope))
      .filter((p) =>
        q ? [p.name, p.brand, p.sku].filter(Boolean).join(' ').toLowerCase().includes(q) : true,
      );
  }, [products, scope, search]);

  /**
   * The full sheet. Every size starts equal to the system, so an untouched row is
   * implicitly "correct" and only what the owner actually types becomes a change.
   */
  const draft = useMemo<CountDraft[]>(() => {
    const rows: CountDraft[] = [];
    for (const product of inScope) {
      for (const size of product.sizes) {
        const key = `${product.id}|${size.size}`;
        rows.push({
          product,
          size: size.size,
          systemQty: size.qty,
          countedQty: counted[key] ?? size.qty,
          costPrice: sizeAverageCost(size, product.costPrice),
        });
      }
    }
    return rows;
  }, [inScope, counted]);

  const changed = useMemo(() => variances(draft), [draft]);
  const { shortage, surplus } = useMemo(() => varianceValue(changed), [changed]);
  const net = surplus - shortage;

  async function submit() {
    await confirm({
      title: 'تطبيق الجرد',
      message: `سيُعدَّل ${changed.length} مقاس ليطابق العدّ الفعلي. النقص ${money(shortage)} والزيادة ${money(surplus)}. العملية مسجّلة باسمك ولا يمكن التراجع عنها — لكن يمكنك جردها من جديد في أي وقت.`,
      confirmLabel: 'تطبيق',
      danger: shortage > 0,
      action: async () => {
        setBusy(true);
        try {
          const result = await submitCount(draft, note, actor);
          toast.success(
            result.queued
              ? `حُفظ جرد ${changed.length} مقاس على الجهاز — يُطبَّق عند عودة الشبكة`
              : `تم تعديل ${changed.length} مقاس`,
          );
          setCounted({});
          setNote('');
        } catch (err) {
          toast.error(errorMessage(err, 'تعذّر تطبيق الجرد.'));
        } finally {
          setBusy(false);
        }
      },
    });
  }

  if (error) return <ErrorBlock message={error} />;
  if (loading) return <SkeletonRows count={5} />;

  return (
    <>
      <PageHeader
        title="جرد المخزون"
        subtitle="عُدّ البضاعة فعلياً وصحّح الفرق"
      />

      <div className="surface mb-3 border-accent-500/40 p-3.5">
        <p className="text-[0.82rem] leading-relaxed text-fg-2">
          المخزون في أي نظام ينحرف عن الواقع مع الوقت — بيعة لم تُسجَّل، قطعة تالفة، خطأ في العدّ عند
          الاستلام. <span className="font-bold">قيمة مخزونك صادقة بقدر آخر جرد.</span> اعدد المقاس
          واكتب الرقم الحقيقي؛ ما لا تلمسه يبقى كما هو.
        </p>
      </div>

      <div className="mb-3 space-y-2.5">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute right-3 top-1/2 h-[1.1rem] w-[1.1rem] -translate-y-1/2 text-fg-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="field pr-10"
            placeholder="ابحث عن منتج لجرده…"
            type="search"
          />
        </div>

        <div className="flex gap-1.5">
          {(
            [
              ['all', 'الكل'],
              ['shoes', 'أحذية'],
              ['clothing', 'ملابس'],
            ] as [Scope, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setScope(key)}
              className={`rounded-card border px-3 py-1.5 text-[0.8rem] font-bold transition
                ${scope === key
                  ? 'border-fg bg-fg text-page'
                  : 'border-line-strong bg-surface text-fg-2'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {inScope.length === 0 ? (
        <div className="surface">
          <EmptyState icon={<IconBoxes className="h-7 w-7" />} title="لا توجد منتجات في هذا النطاق" />
        </div>
      ) : (
        <div className="space-y-2">
          {inScope.map((product) => (
            <section key={product.id} className="surface p-3">
              <h3 className="mb-2 truncate text-[0.95rem]">{product.name}</h3>
              <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
                {product.sizes.map((size) => {
                  const key = `${product.id}|${size.size}`;
                  const value = counted[key] ?? size.qty;
                  const diff = value - size.qty;
                  return (
                    <label
                      key={key}
                      className={`flex items-center gap-2 rounded-card border px-2.5 py-2 transition
                        ${diff === 0
                          ? 'border-line-strong'
                          : diff < 0
                            ? 'border-bad/50 bg-bad/8'
                            : 'border-good/50 bg-good/8'}`}
                    >
                      <span className="tnum w-10 shrink-0 text-center font-display text-[1.05rem] font-black">
                        {size.size}
                      </span>
                      <span className="tnum shrink-0 text-[0.72rem] font-bold text-fg-3">
                        النظام {num(size.qty)}
                      </span>
                      <input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        value={value}
                        onChange={(e) =>
                          setCounted((cur) => ({
                            ...cur,
                            [key]: Math.max(0, Number(e.target.value) || 0),
                          }))
                        }
                        aria-label={`العدد الفعلي لمقاس ${size.size} من ${product.name}`}
                        className="field tnum h-10 flex-1 text-center font-display font-black"
                      />
                      {diff !== 0 ? (
                        <span
                          className={`tnum w-8 shrink-0 text-center text-[0.78rem] font-black ${
                            diff < 0 ? 'text-bad' : 'text-good'
                          }`}
                        >
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      ) : (
                        <span className="w-8 shrink-0" />
                      )}
                    </label>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {history.data.length > 0 ? (
        <section className="surface mt-3 p-4">
          <SectionTitle>عمليات الجرد السابقة</SectionTitle>
          <ul className="divide-y divide-line ">
            {history.data.map((count) => (
              <li key={count.id} className="flex items-center gap-2 py-2 text-[0.82rem]">
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">{count.note || 'جرد بدون ملاحظة'}</span>
                  <span className="tnum block text-[0.72rem] text-fg-3">
                    {formatDate(count.createdAt)} · {count.countedByName} · {num(count.lines.length)} مقاس
                  </span>
                </span>
                {count.shortageValue > 0 ? (
                  <span className="tnum chip shrink-0 bg-bad/15 text-bad">−{money(count.shortageValue)}</span>
                ) : null}
                {count.surplusValue > 0 ? (
                  <span className="tnum chip shrink-0 bg-good/15 text-good">+{money(count.surplusValue)}</span>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {/* Sticky summary: the variance is the number that matters, not the count. */}
      {changed.length > 0 ? (
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mt-3 lg:bottom-4">
          <div className="surface-key p-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="min-w-0 flex-1">
                <p className="tnum text-[0.75rem] font-bold text-fg-3">
                  {num(changed.length)} مقاس مختلف عن النظام
                </p>
                <p className={`tnum font-display text-num font-black ${net < 0 ? 'text-bad' : 'text-good'}`}>
                  {net < 0 ? `نقص ${money(Math.abs(net))}` : `زيادة ${money(net)}`}
                </p>
                {shortage > 0 && surplus > 0 ? (
                  <p className="tnum text-[0.72rem] font-semibold text-fg-3">
                    نقص {money(shortage)} · زيادة {money(surplus)}
                  </p>
                ) : null}
              </div>
              <Button
                size="lg"
                loading={busy}
                icon={<IconCheck className="h-5 w-5" />}
                onClick={() => void submit()}
              >
                تطبيق الجرد
              </Button>
            </div>

            <input
              className="field mt-2.5 h-10"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="ملاحظة (جرد شهري، بعد وصول شحنة…)"
              aria-label="ملاحظة الجرد"
            />

            {shortage > 0 ? (
              <p className="mt-2 flex items-start gap-1.5 text-[0.75rem] font-semibold text-warn">
                <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                النقص يُخصم من المخزون ويظهر كخسارة في قيمة البضاعة. راجع الأرقام قبل التطبيق.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {!isOwner ? (
        <p className="mt-3 text-center text-[0.75rem] text-fg-3">
          الجرد مسجّل باسمك في سجل النشاط.
        </p>
      ) : null}

      {dialog}
    </>
  );
}
