'use client';

import { useParams } from 'next/navigation';
import { BrandMark } from '@/components/layout/Brand';
import { Button } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Feedback';
import { saleDue, saleGross, saleTotal, netQty, useSale } from '@/lib/db/sales';
import { useSettings } from '@/lib/db/settings';
import { formatDate, money, num } from '@/lib/format';

/**
 * Print-ready invoice. Deliberately its own route outside the app shell: the
 * browser's own "Save as PDF" is the most reliable PDF generator on every device
 * and costs no dependency.
 */
export default function InvoicePrintPage() {
  const params = useParams<{ id: string }>();
  const sale = useSale(params?.id ?? null);
  const { settings } = useSettings();

  if (!sale) return <LoadingBlock label="جاري تحميل الفاتورة…" />;

  const qty = netQty(sale);
  const due = saleDue(sale);

  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-ink-900 print:p-0">
      <div className="mb-6 flex justify-end print:hidden">
        <Button onClick={() => window.print()}>طباعة / حفظ PDF</Button>
      </div>

      <article className="rounded-card border border-ink-200 p-8 print:border-0 print:p-0">
        <div className="h-2.5 rounded-t bg-gradient-to-l from-accent-500 to-violet-500 print:h-1.5" />

        <header className="mt-6 flex items-start justify-between gap-4 border-b border-ink-200 pb-5">
          <div className="text-left">
            <p className="tnum text-[0.8rem] font-semibold text-ink-500">
              {formatDate(sale.createdAt)}
            </p>
            <p className="tnum text-[0.8rem] font-semibold text-ink-500">
              #{sale.id.slice(0, 6).toUpperCase()}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <h1 className="font-display text-2xl font-black">{settings.shopName}</h1>
              <p className="text-[0.75rem] font-bold tracking-[0.2em] text-ink-400">{settings.tagline}</p>
              {settings.phone || settings.address ? (
                <p className="mt-1 text-[0.78rem] text-ink-500">
                  {[settings.phone, settings.address].filter(Boolean).join(' · ')}
                </p>
              ) : null}
            </div>
            {settings.logoData ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={settings.logoData} alt="" className="h-16 w-16 object-contain" />
            ) : (
              <BrandMark className="h-16 w-16" />
            )}
          </div>
        </header>

        <h2 className="mt-6 text-lg font-extrabold">فاتورة بيع</h2>

        {sale.customerName || sale.customerPhone ? (
          <dl className="mt-3 space-y-1 text-[0.9rem]">
            {sale.customerName ? (
              <div className="flex justify-between">
                <dt className="font-bold text-ink-500">العميل</dt>
                <dd className="font-bold">{sale.customerName}</dd>
              </div>
            ) : null}
            {sale.customerPhone ? (
              <div className="flex justify-between">
                <dt className="font-bold text-ink-500">الهاتف</dt>
                <dd dir="ltr" className="tnum font-bold">
                  {sale.customerPhone}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : null}

        <table className="mt-6 w-full text-right">
          <thead>
            <tr className="border-y border-ink-200 text-[0.78rem] font-bold text-ink-500">
              <th className="py-2 font-bold">الصنف</th>
              <th className="py-2 font-bold">المقاس</th>
              <th className="py-2 font-bold">الكمية</th>
              <th className="py-2 font-bold">السعر</th>
              <th className="py-2 font-bold">الإجمالي</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-ink-200 text-[0.9rem]">
              <td className="py-3 font-bold">{sale.productName}</td>
              <td className="tnum py-3">{sale.size}</td>
              <td className="tnum py-3">{num(qty)}</td>
              <td className="tnum py-3">{money(sale.sellPrice)}</td>
              <td className="tnum py-3 font-bold">{money(saleGross(sale))}</td>
            </tr>
          </tbody>
        </table>

        <dl className="mt-5 space-y-2">
          {sale.creditUsed > 0 ? (
            <div className="flex justify-between text-[0.9rem]">
              <dt className="font-bold text-ink-500">خصم رصيد الإحالة</dt>
              <dd className="tnum font-bold text-good">- {money(sale.creditUsed)}</dd>
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t border-ink-200 pt-3">
            <dt className="font-display text-lg font-extrabold">الإجمالي</dt>
            <dd className="tnum font-display text-3xl font-black text-brand-500">{money(saleTotal(sale))}</dd>
          </div>
          {due > 0 ? (
            <>
              <div className="flex justify-between text-[0.9rem]">
                <dt className="font-bold text-ink-500">المدفوع</dt>
                <dd className="tnum font-bold">{money(sale.amountPaid)}</dd>
              </div>
              <div className="flex justify-between text-[0.95rem]">
                <dt className="font-bold text-warn">المتبقي</dt>
                <dd className="tnum font-black text-warn">{money(due)}</dd>
              </div>
            </>
          ) : (
            <p className="text-[0.9rem] font-bold text-good">مدفوعة بالكامل ✓</p>
          )}
        </dl>

        <footer className="mt-8 border-t border-ink-200 pt-5 text-center">
          <p className="font-bold">{settings.invoiceFooter}</p>
          <p className="mt-1 text-[0.8rem] text-ink-500">{settings.shopName}</p>
        </footer>
      </article>
    </div>
  );
}
