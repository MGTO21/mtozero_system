'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { ReturnSheet } from '@/components/sales/ReturnSheet';
import { Button } from '@/components/ui/Button';
import { Pill, useDateRange } from '@/components/ui/DateRange';
import { EmptyState, ErrorBlock, Figure, SkeletonRows, Stamp } from '@/components/ui/Feedback';
import { IconCopy, IconDownload, IconImage, IconPrinter, IconQueue, IconReceipt, IconReturn, IconSearch, IconWhatsApp } from '@/components/ui/Icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { Sheet } from '@/components/ui/Sheet';
import { summarize } from '@/lib/analytics';
import {
  invoiceNumber,
  itemCost,
  itemGross,
  itemNetQty,
  netQty,
  saleDue,
  saleLabel,
  saleTotal,
  useSalesBetween,
} from '@/lib/db/sales';
import { useSettings } from '@/lib/db/settings';
import { downloadCsv, stamp } from '@/lib/csv';
import { formatDate, formatTime, money, num } from '@/lib/format';
import { useInvoice } from '@/lib/hooks/useInvoice';
import { copyText, invoiceText, whatsappLink } from '@/lib/invoice';
import { renderInvoicePng, shareInvoice } from '@/lib/invoice-image';
import { CHANNEL_LABEL, PAYMENT_LABEL, type PaymentStatus, type Sale } from '@/lib/types';

type StatusFilter = 'all' | PaymentStatus;

export default function SalesPage() {
  const { range, picker } = useDateRange('week');
  const { data: sales, loading, error } = useSalesBetween(range.from, range.to);
  const { canSeeProfit } = useAuth();
  const toast = useToast();
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  // Returns target one line of an invoice, so both the sale and the line are held.
  const [returning, setReturning] = useState<{ sale: Sale; itemIndex: number } | null>(null);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return sales
      .filter((s) => status === 'all' || s.paymentStatus === status)
      .filter((s) =>
        q
          ? [s.customerName, s.customerPhone, invoiceNumber(s.id), ...s.items.map((i) => i.productName)]
              .filter(Boolean)
              .join(' ')
              .toLowerCase()
              .includes(q)
          : true,
      );
  }, [sales, status, search]);
  const totals = useMemo(() => summarize(visible), [visible]);
  const open = visible.find((s) => s.id === openId) ?? sales.find((s) => s.id === openId) ?? null;

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
        invoiceNumber(s.id),
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
            <Button variant="secondary" size="sm" icon={<IconDownload className="h-4 w-4" />} onClick={exportCsv}>
              تصدير
            </Button>
          ) : null
        }
      />

      <div className="mb-4 space-y-2.5">
        {picker}
        <div className="relative">
          <IconSearch className="pointer-events-none absolute right-3 top-1/2 h-[1.1rem] w-[1.1rem] -translate-y-1/2 text-fg-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="field pr-10"
            type="search"
            placeholder="عميل، منتج، أو رقم فاتورة…"
          />
        </div>
        <div className="scroller sm:mx-0 sm:px-0">
          {(
            [
              ['all', 'الكل'],
              ['paid', 'مدفوع'],
              ['partial', 'جزئي'],
              ['debt', 'دين'],
            ] as [StatusFilter, string][]
          ).map(([key, label]) => (
            <Pill
              key={key}
              active={status === key}
              onClick={() => setStatus(key)}
              count={key === 'all' ? sales.length : sales.filter((s) => s.paymentStatus === key).length}
            >
              {label}
            </Pill>
          ))}
        </div>
      </div>

      {!loading && visible.length > 0 ? (
        <div className="surface mb-4 grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
          <Figure label="الإيرادات" value={money(totals.revenue)} tone="brand" />
          <Figure label="الفواتير · القطع" value={`${num(totals.transactions)} · ${num(totals.units)}`} />
          {canSeeProfit ? <Figure label="الربح الإجمالي" value={money(totals.grossProfit)} tone="good" /> : null}
          <Figure label="ديون مفتوحة" value={money(totals.outstanding)} tone={totals.outstanding > 0 ? 'warn' : undefined} />
        </div>
      ) : null}

      {error ? <ErrorBlock message={error} /> : null}

      {loading ? (
        <SkeletonRows count={6} />
      ) : visible.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={<IconReceipt />}
            title={sales.length === 0 ? 'لا توجد مبيعات في هذه الفترة' : 'لا توجد نتائج'}
            hint={sales.length === 0 ? 'غيّر الفترة الزمنية أو سجّل أول عملية بيع من زر «بيع».' : 'غيّر البحث أو الفلتر.'}
          />
        </div>
      ) : (
        <ul className="surface rows overflow-hidden">
          {visible.map((s) => {
            const due = saleDue(s);
            const returned = s.items.reduce((sum, i) => sum + i.returnedQty, 0);
            return (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => setOpenId(s.id)}
                  className="flex w-full items-center gap-3 px-3.5 py-3 text-right transition-colors hover:bg-sunken active:bg-sunken"
                >
                  <div className="min-w-0 flex-1">
                    <p className="flex items-center gap-1.5 truncate text-[0.98rem] font-bold">
                      {s.pending ? <IconQueue className="h-4 w-4 shrink-0 text-warn" /> : null}
                      <span className="truncate">{saleLabel(s)}</span>
                    </p>
                    <p className="tnum mt-0.5 truncate text-[0.8rem] font-semibold text-fg-3">
                      {formatTime(s.createdAt)} · {formatDate(s.createdAt)}
                      {s.customerName ? ` · ${s.customerName}` : ''}
                      {returned > 0 ? ` · مرتجع ${num(returned)}` : ''}
                    </p>
                  </div>
                  <div className="shrink-0 text-left">
                    <p className="tnum font-display text-[1.1rem] font-black">{money(saleTotal(s))}</p>
                    {due > 0 ? (
                      <p className="tnum text-[0.76rem] font-bold text-warn">باقي {money(due)}</p>
                    ) : canSeeProfit ? (
                      <p className="tnum text-[0.76rem] font-bold text-good">ربح {money(s.profit)}</p>
                    ) : (
                      <p className="text-[0.76rem] font-bold text-fg-3">{netQty(s)} قطعة</p>
                    )}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      <SaleDetail
        sale={open}
        canSeeProfit={canSeeProfit}
        onClose={() => setOpenId(null)}
        onReturn={(sale, itemIndex) => setReturning({ sale, itemIndex })}
      />
      <ReturnSheet target={returning} onClose={() => setReturning(null)} />
    </>
  );
}

/** One invoice, with what can be done to it: send it again, or take a line back. */
function SaleDetail({
  sale,
  canSeeProfit,
  onClose,
  onReturn,
}: {
  sale: Sale | null;
  canSeeProfit: boolean;
  onClose: () => void;
  onReturn: (sale: Sale, itemIndex: number) => void;
}) {
  const toast = useToast();
  const { settings } = useSettings();
  const invoice = useInvoice(sale);
  const [rendering, setRendering] = useState(false);
  if (!sale || !invoice) return null;

  const due = saleDue(sale);

  return (
    <Sheet open onClose={onClose} title={`فاتورة ${invoice.number}`} subtitle={`${invoice.date} · ${invoice.time} · ${sale.soldByName}`}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {sale.pending ? (
          <Stamp tone="warn">{sale.pending === 'conflict' ? 'تحتاج مراجعة' : 'على الجهاز'}</Stamp>
        ) : (
          <Stamp tone={sale.paymentStatus === 'paid' ? 'good' : sale.paymentStatus === 'partial' ? 'warn' : 'brand'}>
            {PAYMENT_LABEL[sale.paymentStatus]}
          </Stamp>
        )}
        <span className="text-[0.84rem] font-semibold text-fg-3">
          {CHANNEL_LABEL[sale.channel]}
          {sale.customerName ? ` · ${sale.customerName}` : ''}
        </span>
      </div>

      <ul className="surface perf-rows overflow-hidden">
        {sale.items.map((item, index) => {
          const kept = itemNetQty(item);
          return (
            <li key={`${item.productId}-${item.size}-${index}`} className={`flex items-center gap-2.5 px-3 py-2.5 ${kept === 0 ? 'opacity-55' : ''}`}>
              <span className="tnum flex h-9 min-w-[2.25rem] shrink-0 items-center justify-center rounded-card border border-line-strong px-1 font-display font-black">
                {item.size}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{item.productName}</p>
                <p className="tnum text-[0.8rem] font-semibold text-fg-3">
                  {num(kept)} × {money(item.sellPrice)}
                  {item.returnedQty > 0 ? ` · أُرجع ${num(item.returnedQty)}` : ''}
                </p>
              </div>
              <span className="tnum shrink-0 font-display font-black">{money(itemGross(item))}</span>
              {kept > 0 && !sale.pending ? (
                <button
                  type="button"
                  onClick={() => onReturn(sale, index)}
                  className="press inline-flex h-9 shrink-0 items-center gap-1 rounded-card border border-line-strong px-2 text-[0.78rem] font-bold text-fg-2 hover:border-bad hover:text-bad"
                >
                  <IconReturn className="h-4 w-4" />
                  إرجاع
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>

      <dl className="mt-3 space-y-1.5 px-1">
        {sale.creditUsed > 0 ? (
          <div className="flex justify-between text-[0.9rem] font-bold text-good">
            <dt>خصم رصيد الإحالة</dt>
            <dd className="tnum">- {money(sale.creditUsed)}</dd>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between border-t-[1.5px] border-fg pt-2">
          <dt className="font-display font-black">الإجمالي</dt>
          <dd className="tnum font-display text-num-lg font-black text-brand-500">{money(saleTotal(sale))}</dd>
        </div>
        {due > 0 ? (
          <div className="flex justify-between text-[0.92rem] font-bold text-warn">
            <dt>المتبقي على العميل</dt>
            <dd className="tnum">{money(due)}</dd>
          </div>
        ) : null}
        {canSeeProfit ? (
          <div className="flex justify-between text-[0.88rem] font-bold text-fg-3">
            <dt>الربح</dt>
            <dd className="tnum">{money(sale.profit)}</dd>
          </div>
        ) : null}
      </dl>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <a
          href={whatsappLink(invoice)}
          target="_blank"
          rel="noopener noreferrer"
          className="press col-span-2 inline-flex h-12 items-center justify-center gap-2 rounded-card bg-good font-display font-extrabold text-white"
        >
          <IconWhatsApp className="h-5 w-5" />
          إرسال الفاتورة واتساب
        </a>
        <Button
          variant="secondary"
          icon={<IconImage className="h-4 w-4" />}
          loading={rendering}
          onClick={async () => {
            setRendering(true);
            try {
              const blob = await renderInvoicePng(invoice, settings);
              if (!blob) throw new Error('render');
              await shareInvoice(blob, invoice);
            } catch {
              toast.error('تعذّر إنشاء صورة الفاتورة.');
            } finally {
              setRendering(false);
            }
          }}
        >
          صورة
        </Button>
        <a
          href={`/invoice?id=${sale.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="press inline-flex h-12 items-center justify-center gap-2 rounded-card border border-line-strong bg-surface font-display font-extrabold"
        >
          <IconPrinter className="h-4 w-4" />
          طباعة
        </a>
        <Button
          variant="ghost"
          className="col-span-2"
          icon={<IconCopy className="h-4 w-4" />}
          onClick={async () => {
            const ok = await copyText(invoiceText(invoice));
            toast[ok ? 'success' : 'error'](ok ? 'تم نسخ الفاتورة' : 'تعذّر النسخ');
          }}
        >
          نسخ النص
        </Button>
      </div>
    </Sheet>
  );
}
