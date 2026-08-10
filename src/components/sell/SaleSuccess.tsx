'use client';

import { useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { IconCheck, IconCopy, IconDownload, IconImage, IconWhatsApp } from '@/components/ui/Icons';
import { Sheet } from '@/components/ui/Sheet';
import { saleDue, saleTotal } from '@/lib/db/sales';
import { useSettings } from '@/lib/db/settings';
import { money, num } from '@/lib/format';
import { copyText, invoiceText, whatsappLink } from '@/lib/invoice';
import { renderInvoicePng, shareInvoice } from '@/lib/invoice-image';
import type { Sale } from '@/lib/types';

interface Props {
  sale: Sale | null;
  /** Units left of the size that was just sold — the seller's next question. */
  remaining: number;
  onClose: () => void;
  onSellAnother: () => void;
}

export function SaleSuccess({ sale, remaining, onClose, onSellAnother }: Props) {
  const toast = useToast();
  const { settings } = useSettings();
  const [rendering, setRendering] = useState(false);

  if (!sale) return null;

  async function makeInvoice() {
    if (!sale) return;
    setRendering(true);
    try {
      const blob = await renderInvoicePng(sale, settings);
      if (!blob) throw new Error('render failed');
      const result = await shareInvoice(blob, sale);
      toast.success(result === 'shared' ? 'تم فتح المشاركة' : 'تم تنزيل صورة الفاتورة');
    } catch {
      toast.error('تعذّر إنشاء صورة الفاتورة.');
    } finally {
      setRendering(false);
    }
  }

  const due = saleDue(sale);
  const message = invoiceText(sale);

  return (
    <Sheet
      open
      onClose={onClose}
      title="تم تسجيل البيع"
      footer={
        <div className="flex gap-2">
          <Button block size="lg" onClick={onSellAnother}>
            بيع آخر
          </Button>
          <Button variant="secondary" size="lg" onClick={onClose}>
            إغلاق
          </Button>
        </div>
      }
    >
      <div className="flex flex-col items-center text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-good/15 text-good">
          <IconCheck className="h-7 w-7" />
        </div>
        <p className="mt-3 text-[0.9rem] font-bold">
          {sale.qty} × {sale.productName} — مقاس {sale.size}
        </p>
        <p className="tnum mt-1 font-display text-num-xl font-black text-brand-500">{money(saleTotal(sale))}</p>

        {due > 0 ? (
          <p className="tnum mt-1.5 rounded-card bg-warn/12 px-3 py-1.5 text-[0.82rem] font-bold text-warn">
            متبقٍ على العميل {money(due)} — سيظهر في صفحة الديون
          </p>
        ) : null}

        <p className="tnum mt-3 text-[0.82rem] font-bold text-ink-500 dark:text-ink-400">
          {remaining > 0 ? (
            <>المتبقي من مقاس {sale.size}: {num(remaining)} قطعة</>
          ) : (
            <span className="text-bad">نفد مقاس {sale.size} من المخزون</span>
          )}
        </p>
      </div>

      <div className="surface-sunken mt-5 p-3">
        <p className="mb-2 text-[0.75rem] font-bold text-ink-500 dark:text-ink-400">رسالة الفاتورة للعميل</p>
        <pre className="max-h-44 overflow-y-auto whitespace-pre-wrap break-words font-sans text-[0.82rem] leading-relaxed text-ink-700 dark:text-ink-200">
          {message}
        </pre>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button
          className="col-span-2"
          icon={<IconImage className="h-4 w-4" />}
          loading={rendering}
          onClick={() => void makeInvoice()}
        >
          فاتورة بالصورة واللوغو
        </Button>
        <a
          href={`/invoice/${sale.id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="col-span-2 inline-flex h-11 items-center justify-center gap-2 rounded-card border border-ink-200 font-bold transition hover:border-ink-300 dark:border-ink-700 dark:hover:border-ink-600"
        >
          <IconDownload className="h-4 w-4" />
          نسخة للطباعة / حفظ PDF
        </a>
        <Button
          variant="secondary"
          icon={<IconCopy className="h-4 w-4" />}
          onClick={async () => {
            const ok = await copyText(message);
            if (ok) toast.success('تم نسخ الفاتورة');
            else toast.error('تعذّر النسخ — انسخ النص يدوياً');
          }}
        >
          نسخ النص
        </Button>
        <a
          href={whatsappLink(sale)}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-11 items-center justify-center gap-2 rounded-card bg-good font-bold text-ink-950 transition hover:brightness-110"
        >
          <IconWhatsApp className="h-4 w-4" />
          فتح واتساب
        </a>
      </div>
    </Sheet>
  );
}
