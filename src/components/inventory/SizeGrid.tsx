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
 *
 * Three states, told apart by shape and not only colour: in stock is a solid
 * tile, low stock carries a warning corner, sold out is an empty dashed outline
 * that keeps its place — the owner sees *which* size is missing, not just that
 * something is.
 */
export function SizeGrid({ sizes, lowStockThreshold, onSelect, selected, availableOnly, size = 'sm' }: Props) {
  const rows = availableOnly ? sizes.filter((s) => s.qty > 0) : sizes;
  if (rows.length === 0) {
    return <p className="text-[0.84rem] font-semibold text-fg-3">لا توجد مقاسات</p>;
  }

  const big = size === 'lg';
  const box = big ? 'min-w-[4.5rem] h-[4.25rem] px-2' : 'min-w-[2.9rem] h-[2.9rem] px-1.5';

  return (
    <div className={`flex flex-wrap ${big ? 'gap-2' : 'gap-1.5'}`}>
      {rows.map((s) => {
        const state = stateOf(s.qty, lowStockThreshold);
        const isSelected = selected === s.size;
        const interactive = Boolean(onSelect) && s.qty > 0;

        const tone = isSelected
          ? 'border-fg bg-fg text-page'
          : state === 'out'
            ? 'border-dashed border-line-strong bg-transparent text-fg-3'
            : 'border-line-strong bg-surface text-fg';

        const Tag = interactive ? 'button' : 'div';

        return (
          <Tag
            key={s.size}
            {...(interactive
              ? { type: 'button' as const, onClick: () => onSelect?.(s.size), 'aria-pressed': isSelected }
              : {})}
            className={`relative flex flex-col items-center justify-center overflow-hidden rounded-card border-[1.5px] transition-colors
              ${box} ${tone} ${interactive ? 'press' : ''}`}
          >
            {/* Low stock: a folded warning corner, readable in greyscale. */}
            {state === 'low' && !isSelected ? (
              <span
                aria-hidden="true"
                className="absolute left-0 top-0 h-0 w-0 border-r-[12px] border-t-[12px] border-r-transparent border-t-warn"
              />
            ) : null}
            <span className={`tnum font-display font-black leading-none ${big ? 'text-[1.6rem]' : 'text-[1.05rem]'}`}>
              {s.size}
            </span>
            <span
              className={`tnum mt-1 font-bold leading-none ${big ? 'text-[0.74rem]' : 'text-[0.62rem]'}
                ${isSelected ? 'text-page/75' : state === 'low' ? 'text-warn' : 'text-fg-3'}`}
            >
              {s.qty > 0 ? `${s.qty} قطعة` : 'نافذ'}
            </span>
          </Tag>
        );
      })}
    </div>
  );
}
