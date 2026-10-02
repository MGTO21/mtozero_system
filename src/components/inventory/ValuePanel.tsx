'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { IconHourglass } from '@/components/ui/Icons';
import { deadCapital, inventoryValue, inventoryValueByCategory } from '@/lib/analytics';
import { money, num, percent } from '@/lib/format';
import { CATEGORY_LABEL, type Product } from '@/lib/types';

/**
 * What the stock is worth, at cost and at retail.
 *
 * Two numbers the owner otherwise has to guess: how much cash is tied up in the
 * cartons, and what that stock should return once it sells. Cost comes from the
 * lots, so it is the real amount paid rather than an average.
 */
export function ValuePanel({ products, compact = false }: { products: Product[]; compact?: boolean }) {
  const total = useMemo(() => inventoryValue(products), [products]);
  const byCategory = useMemo(() => inventoryValueByCategory(products), [products]);
  const frozen = useMemo(() => deadCapital(products, 60), [products]);

  if (total.units === 0) {
    return (
      <p className="py-6 text-center text-[0.85rem] font-semibold text-fg-3">
        لا يوجد مخزون لتقييمه
      </p>
    );
  }

  return (
    <div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="surface-sunken px-3.5 py-3">
          <p className="text-[0.76rem] font-bold text-fg-3">رأس المال في البضاعة</p>
          <p className="tnum mt-1 font-display text-num-lg font-black">{money(total.costValue)}</p>
          <p className="text-[0.72rem] font-semibold text-fg-3">
            ما دفعته فعلاً للموردين
          </p>
        </div>

        <div className="surface-sunken px-3.5 py-3">
          <p className="text-[0.76rem] font-bold text-fg-3">قيمتها بسعر البيع</p>
          <p className="tnum mt-1 font-display text-num-lg font-black text-brand-500">
            {money(total.retailValue)}
          </p>
          <p className="text-[0.72rem] font-semibold text-fg-3">
            لو بِيعت كلها بالسعر المعلن
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-line pt-3 ">
        <span className="text-[0.82rem] font-bold text-fg-2">الربح المتوقع</span>
        <span className="flex items-baseline gap-2">
          <span className="tnum font-display text-num font-black text-good">
            {money(total.expectedProfit)}
          </span>
          <span className="tnum chip bg-good/15 text-good">هامش {percent(total.marginPct)}</span>
        </span>
      </div>

      <p className="tnum mt-2 text-[0.78rem] font-semibold text-fg-3">
        {num(total.units)} قطعة · {num(total.products)} منتج
      </p>

      {!compact ? (
        <>
          <div className="mt-3 space-y-1.5 border-t border-line pt-3 ">
            {(['shoes', 'clothing'] as const).map((category) => {
              const value = byCategory[category];
              if (value.units === 0) return null;
              return (
                <div key={category} className="flex items-center gap-2 text-[0.82rem]">
                  <span className="min-w-0 flex-1 font-bold">{CATEGORY_LABEL[category]}</span>
                  <span className="tnum text-fg-3">{num(value.units)} قطعة</span>
                  <span className="tnum w-24 text-left font-bold">{money(value.costValue)}</span>
                  <span className="tnum w-24 text-left font-black text-brand-500">
                    {money(value.retailValue)}
                  </span>
                </div>
              );
            })}
          </div>

          {frozen.units > 0 ? (
            <div className="mt-3 rounded-card border border-warn/40 bg-warn/8 px-3.5 py-3">
              <p className="flex items-center gap-1.5 text-[0.8rem] font-bold text-warn">
                <IconHourglass className="h-4 w-4" />
                رأس مال مجمّد
              </p>
              <p className="tnum mt-1 font-display text-num font-black text-warn">
                {money(frozen.costValue)}
              </p>
              <p className="mt-0.5 text-[0.75rem] leading-relaxed text-fg-2">
                {num(frozen.units)} قطعة في {num(frozen.products)} منتج لم تتحرك منذ 60 يوماً —
                نقود مدفوعة وواقفة في الكراتين. فكّر في عرض يحرّرها.
              </p>
              <Link href="/reports" className="mt-1.5 inline-block text-[0.78rem] font-bold text-warn underline">
                عرض التفاصيل
              </Link>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
