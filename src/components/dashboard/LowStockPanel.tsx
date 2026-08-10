'use client';

import Link from 'next/link';
import type { LowStockRow } from '@/lib/analytics';
import { IconAlert } from '@/components/ui/Icons';
import { num } from '@/lib/format';

/**
 * Per-SIZE alerts. Telling the owner "this model is low" is useless — they need
 * "size 43 of the white sneaker is gone" to reorder or answer a customer.
 */
export function LowStockPanel({ rows }: { rows: LowStockRow[] }) {
  if (rows.length === 0) {
    return (
      <p className="py-6 text-center text-[0.85rem] font-semibold text-ink-400 dark:text-ink-500">
        كل المقاسات فوق حد التنبيه ✓
      </p>
    );
  }

  const out = rows.filter((r) => r.qty === 0);
  const low = rows.filter((r) => r.qty > 0);

  return (
    <div className="space-y-1.5">
      {[...out, ...low].slice(0, 12).map((row) => (
        <Link
          key={`${row.product.id}-${row.size}`}
          href={`/inventory?focus=${row.product.id}`}
          className="flex items-center gap-2.5 rounded-card px-2 py-2 transition-colors hover:bg-ink-100 dark:hover:bg-ink-800"
        >
          <span
            className={`tnum flex h-10 w-10 shrink-0 flex-col items-center justify-center rounded-card border font-display text-[0.95rem] font-black leading-none
              ${row.qty === 0
                ? 'border-dashed border-bad/50 text-bad'
                : 'border-warn/50 bg-warn/10 text-warn'}`}
          >
            {row.size}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[0.88rem] font-bold">{row.product.name}</span>
            <span
              className={`tnum block text-[0.75rem] font-bold ${row.qty === 0 ? 'text-bad' : 'text-warn'}`}
            >
              {row.qty === 0 ? 'نفد تماماً' : `باقي ${num(row.qty)} فقط`}
            </span>
          </span>
          <IconAlert className={`h-4 w-4 shrink-0 ${row.qty === 0 ? 'text-bad' : 'text-warn'}`} />
        </Link>
      ))}

      {rows.length > 12 ? (
        <Link
          href="/inventory"
          className="block pt-1.5 text-center text-[0.8rem] font-bold text-brand-500"
        >
          و{num(rows.length - 12)} تنبيه آخر — عرض المخزون
        </Link>
      ) : null}
    </div>
  );
}
