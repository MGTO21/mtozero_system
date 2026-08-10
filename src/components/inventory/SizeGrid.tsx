'use client';

import type { SizeStock } from '@/lib/types';

interface Props {
  /** Only size and quantity are read, so form rows and stored lots both fit. */
  sizes: Pick<SizeStock, 'size' | 'qty'>[];
  lowStockThreshold: number;
  /** When set, sizes become buttons (used by the quick-sale flow). */
  onSelect?: (size: string) => void;
  selected?: string | null;
  /** Hide sold-out sizes entirely — the sale screen only offers what exists. */
  availableOnly?: boolean;
  size?: 'sm' | 'lg';
}

type State = 'out' | 'low' | 'ok';

function stateOf(qty: number, threshold: number): State {
  if (qty <= 0) return 'out';
  if (qty <= threshold) return 'low';
  return 'ok';
}

/**
 * The core inventory display: one tile per size, quantity always visible.
 * Sold-out sizes stay in place (dashed + dimmed) so the owner can see at a glance
 * *which* size is missing, not just that something is.
 */
export function SizeGrid({ sizes, lowStockThreshold, onSelect, selected, availableOnly, size = 'sm' }: Props) {
  const rows = availableOnly ? sizes.filter((s) => s.qty > 0) : sizes;
  if (rows.length === 0) {
    return <p className="text-[0.8rem] font-semibold text-ink-400 dark:text-ink-500">لا توجد مقاسات</p>;
  }

  const box = size === 'lg' ? 'min-w-[4.25rem] px-2 py-2.5' : 'min-w-[3rem] px-1.5 py-1.5';
  const sizeText = size === 'lg' ? 'text-2xl' : 'text-base';
  const qtyText = size === 'lg' ? 'text-[0.72rem]' : 'text-[0.62rem]';

  return (
    <div className="flex flex-wrap gap-1.5">
      {rows.map((s) => {
        const state = stateOf(s.qty, lowStockThreshold);
        const isSelected = selected === s.size;
        const interactive = Boolean(onSelect) && s.qty > 0;

        const tone =
          isSelected
            ? 'border-brand-500 bg-brand-500 text-white'
            : state === 'out'
              ? 'border-dashed border-ink-300 text-ink-400 dark:border-ink-700 dark:text-ink-600'
              : state === 'low'
                ? 'border-warn/55 bg-warn/10 text-warn'
                : 'border-ink-200 bg-ink-100/70 text-ink-800 dark:border-ink-700 dark:bg-ink-800/70 dark:text-ink-50';

        const Tag = interactive ? 'button' : 'div';

        return (
          <Tag
            key={s.size}
            {...(interactive
              ? { type: 'button' as const, onClick: () => onSelect?.(s.size), 'aria-pressed': isSelected }
              : {})}
            className={`flex flex-col items-center justify-center rounded-card border tabular-nums transition-colors
              ${box} ${tone} ${interactive ? 'active:scale-95' : ''} ${state === 'out' ? 'opacity-70' : ''}`}
          >
            <span className={`tnum font-display font-extrabold leading-none ${sizeText}`}>{s.size}</span>
            <span className={`tnum mt-0.5 font-bold leading-none ${qtyText} ${isSelected ? 'text-white/85' : 'opacity-75'}`}>
              {s.qty > 0 ? `${s.qty} قطعة` : 'نافذ'}
            </span>
          </Tag>
        );
      })}
    </div>
  );
}
