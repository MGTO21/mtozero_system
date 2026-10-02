'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { BrandMark } from '@/components/layout/Brand';
import { Button } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Feedback';
import { IconPrinter } from '@/components/ui/Icons';
import { useSale } from '@/lib/db/sales';
import { useSettings } from '@/lib/db/settings';
import { money, num } from '@/lib/format';
import { useInvoice } from '@/lib/hooks/useInvoice';
import { STATUS_LABEL } from '@/lib/invoice';

type Paper = 'a4' | 'receipt';
const PAPER_KEY = 'mtozero-invoice-paper';

/**
 * Print-ready invoice, at /invoice?id=… — a static route on purpose, so the
 * service worker can serve it with no connection for any sale, including one
 * still waiting in the offline queue.
 *
 * Two papers: A4 for "save as PDF", and an 80mm till roll for the Bluetooth
 * thermal printers common in shops. The browser's own print dialog does the
 * rest, with no PDF library.
 */
export default function InvoicePrintPage() {
  return (
    <Suspense fallback={<LoadingBlock label="جاري تحميل الفاتورة…" />}>
      <InvoicePrint />
    </Suspense>
  );
}

function InvoicePrint() {
  const params = useSearchParams();
  const sale = useSale(params.get('id'));
  const invoice = useInvoice(sale);
  const { settings } = useSettings();
  const [paper, setPaper] = useState<Paper>('a4');

  useEffect(() => {
    try {
      if (window.localStorage.getItem(PAPER_KEY) === 'receipt') setPaper('receipt');
    } catch {
      // Default paper.
    }
  }, []);

  function choose(next: Paper) {
    setPaper(next);
    try {
      window.localStorage.setItem(PAPER_KEY, next);
    } catch {
      // Not remembered.
    }
  }

  if (!sale || !invoice) return <LoadingBlock label="جاري تحميل الفاتورة…" />;

  const receipt = paper === 'receipt';
  const statusColor =
    invoice.status === 'paid' ? 'border-good text-good' : invoice.status === 'partial' ? 'border-warn text-warn' : 'border-brand-500 text-brand-500';

  return (
    <div className="min-h-screen bg-page py-6 print:bg-white print:py-0">
      {/* The page size follows the chosen paper. */}
      <style>{`@page { size: ${receipt ? '80mm auto' : 'A4'}; margin: ${receipt ? '3mm' : '14mm'}; }`}</style>

      <div className="no-print mx-auto mb-4 flex max-w-2xl flex-wrap items-center justify-between gap-2 px-4">
        <div className="seg w-56" role="group" aria-label="حجم الورق">
          <button type="button" aria-pressed={!receipt} onClick={() => choose('a4')}>
            A4 / PDF
          </button>
          <button type="button" aria-pressed={receipt} onClick={() => choose('receipt')}>
            إيصال 80مم
          </button>
        </div>
        <Button variant="ink" icon={<IconPrinter className="h-4 w-4" />} onClick={() => window.print()}>
          طباعة / حفظ PDF
        </Button>
      </div>

      <article
        className={`mx-auto bg-white text-[#1A1714] print:border-0 print:shadow-none
          ${receipt ? 'w-[80mm] max-w-full px-3 py-4 text-[12px]' : 'max-w-2xl border border-line px-8 py-8 shadow-lift sm:rounded-card'}`}
      >
        <header className={`flex items-center gap-3 ${receipt ? 'flex-col text-center' : 'justify-between'}`}>
          <div className={`flex items-center gap-3 ${receipt ? 'flex-col' : ''}`}>
            {settings.logoData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logoData} alt="" className={receipt ? 'h-12 w-12 object-contain' : 'h-16 w-16 object-contain'} />
            ) : (
              <BrandMark className={receipt ? 'h-12 w-12' : 'h-16 w-16'} />
            )}
            <div>
              <h1 className={`font-display font-black ${receipt ? 'text-lg' : 'text-2xl'}`}>{settings.shopName}</h1>
              <p className="text-[0.7rem] font-bold tracking-[0.2em] text-[#6B6257]">{settings.tagline}</p>
              {settings.phone || settings.address ? (
                <p className="mt-0.5 text-[0.78em] text-[#6B6257]">
                  {[settings.phone, settings.address].filter(Boolean).join(' · ')}
                </p>
              ) : null}
            </div>
          </div>
          {!receipt ? <span className={`stamp ${statusColor}`}>{invoice.pending ? 'لم تُرسل بعد' : STATUS_LABEL[invoice.status]}</span> : null}
        </header>

        <div className="my-4 border-t-2 border-dashed border-[#B9B0A0]" />

        <div className={`flex items-start justify-between gap-3 ${receipt ? 'flex-col' : ''}`}>
          <div>
            <p className={`font-display font-black ${receipt ? 'text-base' : 'text-xl'}`}>فاتورة رقم {invoice.number}</p>
            <p className="tnum text-[0.85em] text-[#6B6257]">
              {invoice.date} · {invoice.time}
            </p>
          </div>
          {invoice.customerName || invoice.customerPhone ? (
            <div className={receipt ? '' : 'text-left'}>
              {invoice.customerName ? <p className="font-bold">{invoice.customerName}</p> : null}
              {invoice.customerPhone ? (
                <p dir="ltr" className="tnum text-[0.85em] text-[#6B6257]">
                  {invoice.customerPhone}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <table className="mt-4 w-full text-right">
          {!receipt ? (
            <thead>
              <tr className="border-y border-[#D9D1C2] text-[0.78rem] font-bold text-[#6B6257]">
                <th className="py-2">الصنف</th>
                <th className="py-2">المقاس</th>
                <th className="py-2">الكمية</th>
                <th className="py-2">السعر</th>
                <th className="py-2 text-left">الإجمالي</th>
              </tr>
            </thead>
          ) : null}
          <tbody>
            {invoice.lines.map((line, index) =>
              receipt ? (
                <tr key={index} className="border-b border-dashed border-[#B9B0A0] align-top">
                  <td className="py-1.5">
                    <p className="font-bold">{line.name}</p>
                    <p className="tnum text-[0.9em] text-[#6B6257]">
                      مقاس {line.size} · {num(line.qty)} × {money(line.unit)}
                      {line.listUnit ? <s className="mr-1">{money(line.listUnit)}</s> : null}
                    </p>
                  </td>
                  <td className="tnum py-1.5 text-left font-bold">{money(line.total)}</td>
                </tr>
              ) : (
                <tr key={index} className="border-b border-[#D9D1C2] text-[0.95rem]">
                  <td className="py-3 font-bold">{line.name}</td>
                  <td className="tnum py-3">{line.size}</td>
                  <td className="tnum py-3">{num(line.qty)}</td>
                  <td className="tnum py-3">
                    {money(line.unit)}
                    {line.listUnit ? <s className="mr-1.5 text-[0.8em] text-[#6B6257]">{money(line.listUnit)}</s> : null}
                  </td>
                  <td className="tnum py-3 text-left font-bold">{money(line.total)}</td>
                </tr>
              ),
            )}
          </tbody>
        </table>

        <dl className="mt-4 space-y-1.5">
          {invoice.credit > 0 ? (
            <>
              <Row label="المجموع" value={money(invoice.gross)} muted />
              <Row label="خصم رصيد الإحالة" value={`- ${money(invoice.credit)}`} good />
            </>
          ) : null}
          <div className="flex items-baseline justify-between border-t-2 border-[#1A1714] pt-2">
            <dt className={`font-display font-black ${receipt ? 'text-base' : 'text-xl'}`}>الإجمالي</dt>
            <dd className={`tnum font-display font-black text-[#C2306E] ${receipt ? 'text-xl' : 'text-3xl'}`}>
              {money(invoice.total)}
            </dd>
          </div>
          {invoice.saved > 0 ? <Row label="وفّرت معانا" value={money(invoice.saved)} good /> : null}
          {invoice.due > 0 ? (
            <>
              <Row label="المدفوع" value={money(invoice.paid)} />
              <Row label="المتبقي" value={money(invoice.due)} warn />
            </>
          ) : null}
          {receipt ? (
            <p className="pt-1 text-center font-display font-black">
              — {invoice.pending ? 'لم تُرسل بعد' : STATUS_LABEL[invoice.status]} —
            </p>
          ) : null}
        </dl>

        {invoice.referralCode && invoice.referralReward > 0 ? (
          <div className="mt-5 border-2 border-dashed border-[#1A1714] px-3 py-3 text-center">
            <p className="text-[0.85em] font-bold text-[#6B6257]">كودك للإحالة — شاركه مع صحابك</p>
            <p dir="ltr" className="font-display text-2xl font-black tracking-wider text-[#C2306E]">
              {invoice.referralCode}
            </p>
            <p className="text-[0.85em]">كل صاحب يشتري بيه، تاخد {money(invoice.referralReward)} خصم في مشترياتك الجاية</p>
          </div>
        ) : null}

        <footer className="mt-5 border-t-2 border-dashed border-[#B9B0A0] pt-4 text-center">
          {invoice.returnPolicy ? <p className="text-[0.85em] text-[#6B6257]">{invoice.returnPolicy}</p> : null}
          <p className="mt-2 font-display font-black">{invoice.footer}</p>
          <p className="text-[0.8em] text-[#6B6257]">{invoice.shopName}</p>
        </footer>
      </article>
    </div>
  );
}

function Row({ label, value, muted, good, warn }: { label: string; value: string; muted?: boolean; good?: boolean; warn?: boolean }) {
  const color = good ? 'text-[#1F7A4D]' : warn ? 'text-[#A8650F]' : muted ? 'text-[#6B6257]' : '';
  return (
    <div className={`flex justify-between text-[0.95em] font-bold ${color}`}>
      <dt>{label}</dt>
      <dd className="tnum">{value}</dd>
    </div>
  );
}
