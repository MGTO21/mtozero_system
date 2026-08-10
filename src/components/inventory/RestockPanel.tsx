'use client';

import { useMemo } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { IconCopy, IconDownload } from '@/components/ui/Icons';
import { restockPriority } from '@/lib/analytics';
import { downloadCsv, stamp } from '@/lib/csv';
import { money, num } from '@/lib/format';
import { copyText } from '@/lib/invoice';
import type { Product, Sale } from '@/lib/types';

/**
 * The buy list for the next shipment.
 *
 * Low stock alone is not a purchase decision — a size at zero that sells eight a
 * month is urgent, one that has never sold is not. Ranking by sales velocity turns
 * the alert list into something the owner can hand to a supplier as-is.
 */
export function RestockPanel({ products, sales }: { products: Product[]; sales: Sale[] }) {
  const toast = useToast();
  const rows = useMemo(() => restockPriority(products, sales, 30), [products, sales]);

  // Sizes that sell and are gone are the ones costing money right now.
  const urgent = rows.filter((r) => r.sold > 0 && r.qty === 0);
  const watch = rows.filter((r) => !(r.sold > 0 && r.qty === 0));

  const orderText = useMemo(
    () =>
      [
        '🛒 طلب توريد — Mtozero',
        '',
        ...rows
          .filter((r) => r.sold > 0)
          .map((r) => `${r.product.name} — مقاس ${r.size}: ${r.suggested} قطعة`),
      ].join('\n'),
    [rows],
  );

  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-[0.85rem] font-semibold text-ink-400 dark:text-ink-500">
        لا يوجد مقاس تحت حد التنبيه ✓
      </p>
    );
  }

  return (
    <div>
      {urgent.length > 0 ? (
        <>
          <p className="mb-2 text-[0.76rem] font-bold text-bad">
            نفدت وكانت تُباع — اطلبها أولاً ({num(urgent.length)})
          </p>
          <ul className="mb-4 space-y-1.5">
            {urgent.map((r) => (
              <Row key={`${r.product.id}-${r.size}`} row={r} urgent />
            ))}
          </ul>
        </>
      ) : null}

      {watch.length > 0 ? (
        <>
          <p className="mb-2 text-[0.76rem] font-bold text-ink-400 dark:text-ink-500">
            تحت المراقبة ({num(watch.length)})
          </p>
          <ul className="space-y-1.5">
            {watch.slice(0, 8).map((r) => (
              <Row key={`${r.product.id}-${r.size}`} row={r} />
            ))}
          </ul>
        </>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-2 border-t border-ink-200 pt-3 dark:border-ink-800">
        <Button
          size="sm"
          variant="secondary"
          icon={<IconCopy className="h-4 w-4" />}
          onClick={async () => {
            const ok = await copyText(orderText);
            toast[ok ? 'success' : 'error'](ok ? 'تم نسخ قائمة الطلب' : 'تعذّر النسخ');
          }}
        >
          نسخ قائمة الطلب
        </Button>
        <Button
          size="sm"
          variant="secondary"
          icon={<IconDownload className="h-4 w-4" />}
          onClick={() => {
            downloadCsv(
              `mtozero-restock-${stamp()}`,
              ['المنتج', 'المقاس', 'المتبقي', 'بيع في 30 يوم', 'الكمية المقترحة', 'سعر البيع'],
              rows.map((r) => [r.product.name, r.size, r.qty, r.sold, r.suggested, r.product.sellPrice]),
            );
            toast.success('تم تصدير قائمة الطلب');
          }}
        >
          تصدير CSV
        </Button>
      </div>
    </div>
  );
}

function Row({ row, urgent }: { row: ReturnType<typeof restockPriority>[number]; urgent?: boolean }) {
  return (
    <li className="flex items-center gap-2.5 rounded-card px-1 py-1.5">
      <span
        className={`tnum flex h-9 w-9 shrink-0 items-center justify-center rounded-card border font-display text-[0.9rem] font-black
          ${row.qty === 0
            ? 'border-dashed border-bad/50 text-bad'
            : 'border-warn/50 bg-warn/10 text-warn'}`}
      >
        {row.size}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.86rem] font-bold">{row.product.name}</span>
        <span className="tnum block text-[0.72rem] font-semibold text-ink-400 dark:text-ink-500">
          {row.qty === 0 ? 'نفد' : `باقي ${num(row.qty)}`}
          {row.sold > 0 ? ` · بيع ${num(row.sold)} في 30 يوم` : ' · لم يُبع'}
          {Number.isFinite(row.daysOfCover) && row.qty > 0 ? ` · يكفي ${num(row.daysOfCover)} يوم` : ''}
        </span>
      </span>
      {row.sold > 0 ? (
        <span className={`tnum shrink-0 chip ${urgent ? 'bg-bad/15 text-bad' : 'bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300'}`}>
          اطلب {num(row.suggested)}
        </span>
      ) : null}
      <span className="tnum hidden shrink-0 text-[0.78rem] font-bold text-ink-400 dark:text-ink-500 sm:block">
        {money(row.product.sellPrice)}
      </span>
    </li>
  );
}
