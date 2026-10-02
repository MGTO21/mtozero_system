'use client';

import { Stepper } from '@/components/ui/Button';
import { IconTrash } from '@/components/ui/Icons';
import type { CartLine } from '@/lib/db/sales';
import { money, num } from '@/lib/format';

interface Props {
  lines: CartLine[];
  onRemove: (index: number) => void;
  onChangeQty: (index: number, qty: number) => void;
}

/**
 * The committed lines of the current invoice, drawn as the bill itself: one
 * perforated row per item, editable until the sale is confirmed.
 */
export function CartList({ lines, onRemove, onChangeQty }: Props) {
  if (lines.length === 0) return null;

  const units = lines.reduce((sum, l) => sum + l.qty, 0);
  const subtotal = lines.reduce((sum, l) => sum + l.qty * l.sellPrice, 0);

  return (
    <section className="surface overflow-hidden">
      <header className="flex items-baseline justify-between gap-3 px-3.5 pb-2 pt-3">
        <h3 className="text-[1rem]">الفاتورة</h3>
        <span className="tnum text-[0.8rem] font-bold text-fg-3">
          {num(lines.length)} صنف · {num(units)} قطعة
        </span>
      </header>

      <ul className="perf-rows border-t border-dashed border-line-strong">
        {lines.map((line, index) => {
          // Stock still available for this line, counting what other lines claim.
          const onHand = line.product.sizes.find((s) => s.size === line.size)?.qty ?? 0;
          const claimedElsewhere = lines
            .filter((l, i) => i !== index && l.product.id === line.product.id && l.size === line.size)
            .reduce((sum, l) => sum + l.qty, 0);
          const max = Math.max(1, onHand - claimedElsewhere);

          return (
            <li key={`${line.product.id}-${line.size}-${index}`} className="px-3.5 py-2.5">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.95rem] font-bold">{line.product.name}</p>
                  <p className="tnum text-[0.8rem] font-semibold text-fg-3">
                    مقاس {line.size} · {money(line.sellPrice)} للقطعة
                  </p>
                </div>
                <span className="tnum shrink-0 font-display text-[1.05rem] font-black">
                  {money(line.sellPrice * line.qty)}
                </span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-2">
                <div className="w-36">
                  <Stepper
                    size="sm"
                    value={line.qty}
                    max={max}
                    onChange={(q) => onChangeQty(index, q)}
                    label={`كمية ${line.product.name}`}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="press inline-flex h-9 items-center gap-1.5 rounded-card px-2.5 text-[0.82rem] font-bold text-fg-3 hover:bg-bad/10 hover:text-bad"
                >
                  <IconTrash className="h-4 w-4" />
                  حذف
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <footer className="flex items-baseline justify-between border-t-[1.5px] border-fg px-3.5 py-2.5">
        <span className="text-[0.85rem] font-bold text-fg-2">مجموع الأصناف</span>
        <span className="tnum font-display text-[1.15rem] font-black">{money(subtotal)}</span>
      </footer>
    </section>
  );
}
