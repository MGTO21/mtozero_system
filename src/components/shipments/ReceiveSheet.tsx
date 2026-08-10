'use client';

import { useMemo, useState } from 'react';
import { useActor } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button, IconButton } from '@/components/ui/Button';
import { IconPlus, IconSearch, IconTrash } from '@/components/ui/Icons';
import { Sheet } from '@/components/ui/Sheet';
import { errorMessage } from '@/lib/db/collections';
import { useProducts } from '@/lib/db/products';
import { receiveStock, type ReceiveLine } from '@/lib/db/shipments';
import { money, num } from '@/lib/format';
import type { Shipment } from '@/lib/types';

/**
 * Books a delivery into stock. Each line becomes a lot tagged with this shipment,
 * so the same model arriving twice at different prices stays distinguishable.
 */
export function ReceiveSheet({ shipment, onClose }: { shipment: Shipment | null; onClose: () => void }) {
  const { data: products } = useProducts();
  const actor = useActor();
  const toast = useToast();
  const [lines, setLines] = useState<ReceiveLine[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const active = useMemo(() => products.filter((p) => !p.isArchived), [products]);
  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return [];
    return active
      .filter((p) => [p.name, p.brand, p.sku].filter(Boolean).join(' ').toLowerCase().includes(q))
      .slice(0, 6);
  }, [active, search]);

  const totalUnits = lines.reduce((sum, l) => sum + l.qty, 0);
  const totalCost = lines.reduce((sum, l) => sum + l.qty * l.costPrice, 0);

  if (!shipment) return null;

  function addLine(productId: string, productName: string, costPrice: number) {
    setLines((cur) => [...cur, { productId, productName, size: '', qty: 1, costPrice }]);
    setSearch('');
  }

  function patchLine(index: number, patch: Partial<ReceiveLine>) {
    setLines((cur) => cur.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  async function submit() {
    if (!shipment) return;
    setBusy(true);
    try {
      const result = await receiveStock(shipment, lines, actor);
      if (result.failed.length > 0) {
        toast.error(`أُضيفت ${result.received} قطعة، وفشل: ${result.failed.join('، ')}`);
      } else {
        toast.success(`تم إدخال ${result.received} قطعة إلى المخزون`);
      }
      setLines([]);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر استلام البضاعة.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      wide
      title="استلام بضاعة"
      subtitle={`${shipment.name} — ${shipment.code}`}
      footer={
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="tnum text-[0.78rem] font-bold text-ink-500 dark:text-ink-400">
              {num(totalUnits)} قطعة · تكلفة {money(totalCost)}
            </p>
          </div>
          <Button size="lg" loading={busy} disabled={lines.length === 0} onClick={() => void submit()}>
            إدخال للمخزون
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="recv-search">
            ابحث عن المنتج لإضافته
          </label>
          <div className="relative">
            <IconSearch className="pointer-events-none absolute right-3 top-1/2 h-[1.1rem] w-[1.1rem] -translate-y-1/2 text-ink-400" />
            <input
              id="recv-search"
              className="field pr-10"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="اسم المنتج…"
            />
          </div>

          {matches.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {matches.map((p) => (
                <li key={p.id}>
                  <button
                    onClick={() => addLine(p.id, p.name, p.costPrice)}
                    className="flex w-full items-center gap-2 rounded-card border border-ink-200 px-3 py-2 text-right transition hover:border-brand-500 dark:border-ink-700"
                  >
                    <IconPlus className="h-4 w-4 shrink-0 text-brand-500" />
                    <span className="min-w-0 flex-1 truncate text-[0.88rem] font-bold">{p.name}</span>
                    <span className="tnum shrink-0 text-[0.76rem] font-bold text-ink-400">
                      تكلفة {money(p.costPrice)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {search.trim() && matches.length === 0 ? (
            <p className="mt-2 text-[0.8rem] font-semibold text-ink-400 dark:text-ink-500">
              لا يوجد منتج بهذا الاسم — أضِفه من صفحة المخزون أولاً.
            </p>
          ) : null}
        </div>

        {lines.length === 0 ? (
          <p className="py-6 text-center text-[0.85rem] font-semibold text-ink-400 dark:text-ink-500">
            لم تُضف أصنافاً بعد. ابحث عن المنتج وأضِف المقاس والكمية والتكلفة.
          </p>
        ) : (
          <ul className="space-y-2">
            {lines.map((line, i) => (
              <li key={i} className="surface-sunken p-3">
                <div className="mb-2 flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate text-[0.9rem] font-bold">{line.productName}</span>
                  <IconButton
                    label="حذف السطر"
                    onClick={() => setLines((cur) => cur.filter((_, idx) => idx !== i))}
                  >
                    <IconTrash className="h-4 w-4" />
                  </IconButton>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <label className="block">
                    <span className="label">المقاس</span>
                    <input
                      className="field text-center font-display font-extrabold"
                      value={line.size}
                      onChange={(e) => patchLine(i, { size: e.target.value })}
                      placeholder="42"
                    />
                  </label>
                  <label className="block">
                    <span className="label">الكمية</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={1}
                      className="field tnum text-center font-bold"
                      value={line.qty}
                      onChange={(e) => patchLine(i, { qty: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </label>
                  <label className="block">
                    <span className="label">تكلفة القطعة</span>
                    <input
                      type="number"
                      inputMode="numeric"
                      min={0}
                      className="field tnum text-center font-bold"
                      value={line.costPrice || ''}
                      onChange={(e) => patchLine(i, { costPrice: Number(e.target.value) || 0 })}
                    />
                  </label>
                </div>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[0.75rem] leading-relaxed text-ink-400 dark:text-ink-500">
          تكلفة القطعة هنا تخصّ هذه الشحنة وحدها. عند البيع يُخصم من أقدم دفعة أولاً، فيظهر الربح
          الحقيقي لكل شحنة على حدة.
        </p>
      </div>
    </Sheet>
  );
}
