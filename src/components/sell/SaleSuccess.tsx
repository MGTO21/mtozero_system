'use client';

import { useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { IconCopy, IconImage, IconPrinter, IconQueue, IconWhatsApp } from '@/components/ui/Icons';
import { Sheet } from '@/components/ui/Sheet';
import { saleLabel, type RemainingStock } from '@/lib/db/sales';
import { useSettings } from '@/lib/db/settings';
import { money, num } from '@/lib/format';
import { useInvoice } from '@/lib/hooks/useInvoice';
import { STATUS_LABEL, copyText, invoiceText, whatsappLink } from '@/lib/invoice';
import { renderInvoicePng, shareInvoice } from '@/lib/invoice-image';
import type { Sale } from '@/lib/types';

interface Props {
  sale: Sale | null;
  /** Stock left per `productId|size` after this invoice — the seller's next question. */
  remaining: RemainingStock;
  onClose: () => void;
  onSellAnother: () => void;
}

export function SaleSuccess({ sale, remaining, onClose, onSellAnother }: Props) {
  const toast = useToast();
  const { settings } = useSettings();
  const invoice = useInvoice(sale);
  const [rendering, setRendering] = useState(false);

  if (!sale || !invoice) return null;

  async function makeImage() {
    if (!invoice) return;
    setRendering(true);
    try {
      const blob = await renderInvoicePng(invoice, settings);
      if (!blob) throw new Error('render failed');
      const result = await shareInvoice(blob, invoice);
      toast.success(result === 'shared' ? 'تم فتح المشاركة' : 'تم تنزيل صورة الفاتورة');
    } catch {
      toast.error('تعذّر إنشاء صورة الفاتورة.');
    } finally {
      setRendering(false);
    }
  }

  const stampTone = invoice.pending
    ? 'border-warn text-warn'
    : invoice.status === 'paid'
      ? 'border-good text-good'
      : invoice.status === 'partial'
        ? 'border-warn text-warn'
        : 'border-brand-500 text-brand-500';

  return (
    <Sheet
      open
      onClose={onClose}
      title={`فاتورة ${invoice.number}`}
      subtitle={saleLabel(sale)}
      footer={
        <div className="flex gap-2">
          <Button block size="lg" variant="ink" onClick={onSellAnother}>
            بيع جديد
          </Button>
          <Button variant="secondary" size="lg" onClick={onClose}>
            إغلاق
          </Button>
        </div>
      }
    >
      <div className="ticket rounded-card border border-line-strong px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[0.8rem] font-bold text-fg-3">الإجمالي</p>
            <p className="tnum font-display text-num-xl font-black text-brand-500">{money(invoice.total)}</p>
          </div>
          <span className={`stamp animate-stamp ${stampTone}`}>
            {invoice.pending ? 'على الجهاز' : STATUS_LABEL[invoice.status]}
          </span>
        </div>
        {invoice.due > 0 ? (
          <p className="tnum mt-1 text-[0.86rem] font-bold text-warn">متبقٍ على العميل {money(invoice.due)} — في صفحة الديون</p>
        ) : null}
        {invoice.pending ? (
          <p className="mt-2 flex items-center gap-1.5 text-[0.82rem] font-bold text-fg-2">
            <IconQueue className="h-4 w-4 shrink-0 text-warn" />
            محفوظة على الجهاز — تُرسل للنظام أول ما ترجع الشبكة. الفاتورة جاهزة للعميل من هسي.
          </p>
        ) : null}

        {/* What is left of each size just sold — the seller's immediate next question. */}
        <ul className="perf-rows mt-3 border-t border-dashed border-line-strong">
          {sale.items.map((item, index) => {
            const left = remaining[`${item.productId}|${item.size}`] ?? 0;
            return (
              <li
                key={`${item.productId}-${item.size}-${index}`}
                className="tnum flex items-center justify-between gap-2 py-1.5 text-[0.84rem] font-bold"
              >
                <span className="min-w-0 truncate text-fg-2">
                  {item.productName} — {item.size}
                </span>
                <span className={left > 0 ? 'shrink-0 text-fg-3' : 'shrink-0 text-bad'}>
                  {left > 0 ? `باقي ${num(left)}` : 'نفد المقاس'}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <p className="ledger-head mt-5">أرسل الفاتورة للعميل</p>
      <div className="grid grid-cols-2 gap-2">
        <a
          href={whatsappLink(invoice)}
          target="_blank"
          rel="noopener noreferrer"
          className="press col-span-2 inline-flex h-12 items-center justify-center gap-2 rounded-card bg-good font-display font-extrabold text-white"
        >
          <IconWhatsApp className="h-5 w-5" />
          {sale.customerPhone ? 'واتساب للعميل مباشرة' : 'إرسال واتساب'}
        </a>
        <Button variant="secondary" icon={<IconImage className="h-4 w-4" />} loading={rendering} onClick={() => void makeImage()}>
          صورة الفاتورة
        </Button>
        <a
          href={`/invoice?id=${sale.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="press inline-flex h-12 items-center justify-center gap-2 rounded-card border border-line-strong bg-surface font-display font-extrabold"
        >
          <IconPrinter className="h-4 w-4" />
          طباعة / PDF
        </a>
        <Button
          variant="ghost"
          className="col-span-2"
          icon={<IconCopy className="h-4 w-4" />}
          onClick={async () => {
            const ok = await copyText(invoiceText(invoice));
            if (ok) toast.success('تم نسخ نص الفاتورة');
            else toast.error('تعذّر النسخ');
          }}
        >
          نسخ النص
        </Button>
      </div>

      {invoice.referralCode ? (
        <p className="mt-3 text-center text-[0.8rem] font-semibold text-fg-3">
          الفاتورة فيها كود العميل{' '}
          <span dir="ltr" className="font-black text-fg">
            {invoice.referralCode}
          </span>{' '}
          — كل صاحب يجيبو بيكسب خصم.
        </p>
      ) : null}
    </Sheet>
  );
}
