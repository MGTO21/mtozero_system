'use client';

import { IconTrash } from '@/components/ui/Icons';
import { productImage } from '@/lib/db/products';
import type { CartLine } from '@/lib/db/sales';
import { money, num } from '@/lib/format';

interface Props {
  lines: CartLine[];
  onRemove: (index: number) => void;
  onChangeQty: (index: number, qty: number) => void;
}

/** The committed lines of the current invoice, editable until it is confirmed. */
export function CartList({ lines, onRemove, onChangeQty }: Props) {
  if (lines.length === 0) return null;

  const units = lines.reduce((sum, l) => sum + l.qty, 0);

  return (
    <section className="surface mb-3 overflow-hidden">
      <header className="flex items-center justify-between border-b border-ink-200 px-3.5 py-2.5 dark:border-ink-800">
        <h3 className="text-[0.95rem]">أصناف الفاتورة</h3>
        <span className="tnum text-[0.78rem] font-bold text-ink-400 dark:text-ink-500">
          {num(lines.length)} صنف · {num(units)} قطعة
        </span>
      </header>

      <ul className="divide-y divide-ink-200 dark:divide-ink-800">
        {lines.map((line, index) => {
          const thumb = productImage(line.product);
          // Stock still available for this line, counting what other lines claim.
          const onHand = line.product.sizes.find((s) => s.size === line.size)?.qty ?? 0;
          const claimedElsewhere = lines
            .filter((l, i) => i !== index && l.product.id === line.product.id && l.size === line.size)
            .reduce((sum, l) => sum + l.qty, 0);
          const max = Math.max(1, onHand - claimedElsewhere);

          return (
            <li key={`${line.product.id}-${line.size}-${index}`} className="flex items-center gap-2.5 p-2.5">
              <span className="h-11 w-11 shrink-0 overflow-hidden rounded-card bg-ink-100 dark:bg-ink-900">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" className="h-full w-full object-cover" />
                ) : null}
              </span>

              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.88rem] font-bold">{line.product.name}</span>
                <span className="tnum block text-[0.74rem] font-semibold text-ink-400 dark:text-ink-500">
                  مقاس {line.size} · {money(line.sellPrice)} للقطعة
                </span>
              </span>

              <span className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  aria-label="إنقاص"
                  onClick={() => onChangeQty(index, Math.max(1, line.qty - 1))}
                  className="h-8 w-8 rounded-card border border-ink-200 font-bold dark:border-ink-700"
                >
                  −
                </button>
                <span className="tnum w-7 text-center font-display text-[1.05rem] font-black">{line.qty}</span>
                <button
                  type="button"
                  aria-label="زيادة"
                  disabled={line.qty >= max}
                  onClick={() => onChangeQty(index, Math.min(max, line.qty + 1))}
                  className="h-8 w-8 rounded-card border border-ink-200 font-bold disabled:opacity-40 dark:border-ink-700"
                >
                  +
                </button>
              </span>

              <span className="tnum w-20 shrink-0 text-left font-display text-[0.95rem] font-black text-brand-500">
                {money(line.sellPrice * line.qty)}
              </span>

              <button
                type="button"
                aria-label="حذف الصنف"
                onClick={() => onRemove(index)}
                className="shrink-0 rounded p-1.5 text-ink-400 transition-colors hover:bg-bad/10 hover:text-bad"
              >
                <IconTrash className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
