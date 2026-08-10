'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { ReturnSheet } from '@/components/sales/ReturnSheet';
import { Button, IconButton } from '@/components/ui/Button';
import { useDateRange } from '@/components/ui/DateRange';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { IconCopy, IconDownload, IconReceipt, IconReturn, IconWhatsApp } from '@/components/ui/Icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { summarize } from '@/lib/analytics';
import {
  itemCost,
  itemGross,
  itemNetQty,
  netQty,
  saleDue,
  saleLabel,
  saleTotal,
  useSalesBetween,
} from '@/lib/db/sales';
import { downloadCsv, stamp } from '@/lib/csv';
import { formatDate, formatTime, money, num } from '@/lib/format';
import { copyText, invoiceText, whatsappLink } from '@/lib/invoice';
import { CHANNEL_LABEL, PAYMENT_LABEL, type PaymentStatus, type Sale } from '@/lib/types';

type StatusFilter = 'all' | PaymentStatus;

export default function SalesPage() {
  const { range, picker } = useDateRange('week');
  const { data: sales, loading, error } = useSalesBetween(range.from, range.to);
  const { canSeeProfit } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<StatusFilter>('all');
  // Returns target one line of an invoice, so both the sale and the line are held.
  const [returning, setReturning] = useState<{ sale: Sale; itemIndex: number } | null>(null);

  const visible = useMemo(
    () => (status === 'all' ? sales : sales.filter((s) => s.paymentStatus === status)),
    [sales, status],
  );
  const totals = useMemo(() => summarize(visible), [visible]);

  function exportCsv() {
    const headers = [
      'رقم الفاتورة',
      'التاريخ',
      'الوقت',
      'المنتج',
      'المقاس',
      'الكمية',
      'المرتجع',
      'سعر القطعة',
      'قيمة الصنف',
      ...(canSeeProfit ? ['التكلفة', 'الربح'] : []),
      'إجمالي الفاتورة',
      'حالة الدفع',
      'المدفوع',
      'المتبقي',
      'العميل',
      'الهاتف',
      'القناة',
      'البائع',
    ];
    // One row per product line so the file can be pivoted by product in Excel;
    // invoice-level columns repeat, which is what makes that pivot possible.
    const rows = visible.flatMap((s) =>
      s.items.map((item) => [
        s.id.slice(0, 6).toUpperCase(),
        formatDate(s.createdAt),
        formatTime(s.createdAt),
        item.productName,
        item.size,
        item.qty,
        item.returnedQty,
        item.sellPrice,
        itemGross(item),
        ...(canSeeProfit ? [itemCost(item), itemGross(item) - itemCost(item)] : []),
        saleTotal(s),
        PAYMENT_LABEL[s.paymentStatus],
        s.amountPaid,
        saleDue(s),
        s.customerName ?? '',
        s.customerPhone ?? '',
        CHANNEL_LABEL[s.channel],
        s.soldByName,
      ]),
    );
    downloadCsv(`mtozero-sales-${stamp(range.from)}_${stamp(range.to)}`, headers, rows);
    toast.success('تم تصدير الملف');
  }

  return (
    <>
      <PageHeader
        title="المبيعات"
        subtitle={range.label}
        action={
          visible.length > 0 ? (
            <Button variant="secondary" icon={<IconDownload className="h-4 w-4" />} onClick={exportCsv}>
              تصدير
            </Button>
          ) : null
        }
      />

      <div className="mb-3 space-y-2.5">
        {picker}
        <div className="flex gap-1.5">
          {(
            [
              ['all', 'الكل'],
              ['paid', 'مدفوع'],
              ['partial', 'جزئي'],
              ['debt', 'دين'],
            ] as [StatusFilter, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setStatus(key)}
              className={`rounded-card border px-3 py-1.5 text-[0.8rem] font-bold transition
                ${status === key
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {!loading && visible.length > 0 ? (
        <div className="surface mb-3 grid grid-cols-2 divide-x divide-x-reverse divide-ink-200 sm:grid-cols-4 dark:divide-ink-800">
          <Cell label="الإيرادات" value={money(totals.revenue)} accent />
          <Cell label="القطع" value={num(totals.units)} />
          {canSeeProfit ? <Cell label="الربح الإجمالي" value={money(totals.grossProfit)} /> : null}
          <Cell label="ديون مفتوحة" value={money(totals.outstanding)} warn={totals.outstanding > 0} />
        </div>
      ) : null}

      {error ? <ErrorBlock message={error} /> : null}

      {loading ? (
        <SkeletonRows count={5} />
      ) : visible.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={<IconReceipt className="h-7 w-7" />}
            title="لا توجد مبيعات في هذه الفترة"
            hint="غيّر الفترة الزمنية أو سجّل أول عملية بيع من زر «بيع»."
          />
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((s) => {
            const due = saleDue(s);
            const kept = netQty(s);
            const returned = s.items.reduce((sum, i) => sum + i.returnedQty, 0);
            const live = s.items.filter((i) => itemNetQty(i) > 0);
            return (
              <li key={s.id} className="surface p-3">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                      <h3 className="text-[0.98rem] leading-snug">{saleLabel(s)}</h3>
                      <span className="tnum chip bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                        {num(kept)} قطعة
                      </span>
                      {returned > 0 ? (
                        <span className="tnum chip bg-bad/15 text-bad">مرتجع {num(returned)}</span>
                      ) : null}
                      <span
                        className={`chip ${
                          s.paymentStatus === 'paid'
                            ? 'bg-good/15 text-good'
                            : s.paymentStatus === 'partial'
                              ? 'bg-warn/15 text-warn'
                              : 'bg-bad/15 text-bad'
                        }`}
                      >
                        {PAYMENT_LABEL[s.paymentStatus]}
                      </span>
                    </div>

                    <p className="tnum mt-1 text-[0.76rem] font-semibold text-ink-400 dark:text-ink-500">
                      {formatDate(s.createdAt)} · {formatTime(s.createdAt)} · {CHANNEL_LABEL[s.channel]} ·{' '}
                      {s.soldByName}
                      {s.customerName ? ` · ${s.customerName}` : ''}
                    </p>

                    {due > 0 ? (
                      <p className="tnum mt-1 text-[0.8rem] font-bold text-warn">
                        متبقٍ {money(due)} من {money(saleTotal(s))}
                      </p>
                    ) : null}
                  </div>

                  <div className="shrink-0 text-left">
                    <p className="tnum font-display text-num font-black text-brand-500">{money(saleTotal(s))}</p>
                    {canSeeProfit ? (
                      <p className="tnum mt-0.5 text-[0.74rem] font-bold text-good">ربح {money(s.profit)}</p>
                    ) : null}
                  </div>
                </div>

                {/* Line breakdown. A single-item ticket needs no expansion, so it
                    is shown inline; anything larger gets its own list. */}
                <ul className="mt-2 space-y-1 border-t border-ink-200 pt-2 dark:border-ink-800">
                  {s.items.map((item, index) => {
                    const itemKept = itemNetQty(item);
                    return (
                      <li
                        key={`${item.productId}-${item.size}-${index}`}
                        className={`flex items-center gap-2 text-[0.82rem] ${itemKept === 0 ? 'opacity-50' : ''}`}
                      >
                        <span className="tnum shrink-0 rounded border border-ink-200 px-1.5 py-0.5 text-[0.72rem] font-bold text-ink-500 dark:border-ink-700 dark:text-ink-400">
                          {item.size}
                        </span>
                        <span className="min-w-0 flex-1 truncate font-semibold">{item.productName}</span>
                        <span className="tnum shrink-0 text-ink-400 dark:text-ink-500">
                          {num(itemKept)} × {money(item.sellPrice)}
                        </span>
                        <span className="tnum shrink-0 font-bold">{money(itemGross(item))}</span>
                        {itemKept > 0 ? (
                          <button
                            onClick={() => setReturning({ sale: s, itemIndex: index })}
                            aria-label={`إرجاع ${item.productName}`}
                            title="إرجاع هذا الصنف"
                            className="shrink-0 rounded p-1 text-ink-400 transition-colors hover:bg-bad/10 hover:text-bad"
                          >
                            <IconReturn className="h-3.5 w-3.5" />
                          </button>
                        ) : (
                          <span className="shrink-0 chip bg-bad/15 text-bad">مرتجع</span>
                        )}
                      </li>
                    );
                  })}
                </ul>

                <div className="mt-2 flex items-center gap-1 border-t border-ink-200 pt-2 dark:border-ink-800">
                  <IconButton
                    label="نسخ الفاتورة"
                    onClick={async () => {
                      const ok = await copyText(invoiceText(s));
                      toast[ok ? 'success' : 'error'](ok ? 'تم نسخ الفاتورة' : 'تعذّر النسخ');
                    }}
                  >
                    <IconCopy className="h-[1.05rem] w-[1.05rem]" />
                  </IconButton>
                  <a
                    href={whatsappLink(s)}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label="إرسال عبر واتساب"
                    title="إرسال عبر واتساب"
                    className="inline-flex h-9 w-9 items-center justify-center rounded-card text-ink-500 transition-colors hover:bg-ink-100 hover:text-good dark:text-ink-400 dark:hover:bg-ink-800"
                  >
                    <IconWhatsApp className="h-[1.05rem] w-[1.05rem]" />
                  </a>
                  <span className="flex-1" />
                  <span className="tnum text-[0.72rem] font-semibold text-ink-400 dark:text-ink-500">
                    {num(live.length)} صنف
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <ReturnSheet target={returning} onClose={() => setReturning(null)} />
    </>
  );
}

function Cell({ label, value, accent, warn }: { label: string; value: string; accent?: boolean; warn?: boolean }) {
  return (
    <div className="px-3 py-3">
      <p className="text-[0.72rem] font-bold text-ink-400 dark:text-ink-500">{label}</p>
      <p
        className={`tnum mt-0.5 font-display text-num font-black ${
          accent ? 'text-brand-500' : warn ? 'text-warn' : ''
        }`}
      >
        {value}
      </p>
    </div>
  );
}
