'use client';

import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from '@/components/ui/Icons';
import { money } from '@/lib/format';
import { addToCart } from '@/lib/store/cart';
import { compareSizes } from '@/lib/store/model';
import { productImagePath } from '@/lib/store/paths';
import { openPanel, setMySize, useMySizes } from '@/lib/store/prefs';
import type { CatalogItem } from '@/lib/types';

/**
 * Add to basket from a grid without opening the product: one tap on a size
 * adds it and opens the basket. The visitor's saved size is marked, and picking
 * a size here remembers it — the next grid already says "مقاسك متوفر".
 */
export function QuickAdd({ item, onClose }: { item: CatalogItem; onClose: () => void }) {
  const mySizes = useMySizes();
  const mine = mySizes[item.category];
  const sizes = [...item.sizes].sort((a, b) => compareSizes(a.size, b.size));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function pick(size: string) {
    addToCart({
      productId: item.id,
      name: item.name,
      size,
      qty: 1,
      price: item.price,
      image: productImagePath(item.id, item.thumbHash, item.imageUrl),
    });
    setMySize(item.category, size);
    onClose();
    openPanel('cart');
  }

  // Rendered at the store root: a tile can sit inside a moving (transformed)
  // shelf, which would otherwise trap this fixed sheet inside the shelf.
  const host = document.getElementById('store-root') ?? document.body;
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={`اختار مقاس — ${item.name}`}>
      <button type="button" aria-label="إغلاق" className="absolute inset-0 animate-fade-in bg-ink-950/60" onClick={onClose} />
      <div className="relative w-full max-w-md animate-sheet-up rounded-t-card border border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-card">
        <div className="flex items-start gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={productImagePath(item.id, item.thumbHash, item.imageUrl)}
            alt=""
            className="h-20 w-16 shrink-0 rounded-card bg-sunken object-cover"
          />
          <div className="min-w-0 flex-1">
            <p className="line-clamp-2 font-bold leading-snug">{item.name}</p>
            <p className="tnum mt-1 font-display text-[1.2rem] font-black text-brand-500">{money(item.price)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="press -m-2 flex h-11 w-11 items-center justify-center text-fg-3">
            <IconX className="h-5 w-5" />
          </button>
        </div>

        <p className="label mt-4">اختار المقاس — بيتضاف للسلة طوالي</p>
        <div className="flex flex-wrap gap-2">
          {sizes.map((s) => {
            const out = s.state === 'out';
            return (
              <button
                key={s.size}
                type="button"
                disabled={out}
                onClick={() => pick(s.size)}
                className={`press tnum relative h-12 min-w-[3.25rem] rounded-card border-[1.5px] px-2 font-display text-[1.05rem] font-black transition-colors
                  ${out ? 'cursor-not-allowed border-dashed border-line-strong text-fg-3 line-through' : s.size === mine ? 'border-fg bg-fg text-page' : 'border-line-strong bg-surface hover:border-fg'}`}
              >
                {s.size}
                {s.state === 'last' ? <span className="absolute -top-1.5 left-1/2 h-2 w-2 -translate-x-1/2 rounded-full bg-warn" /> : null}
              </button>
            );
          })}
        </div>
        {sizes.some((s) => s.state === 'last') ? (
          <p className="mt-2.5 flex items-center gap-1.5 text-[0.78rem] font-bold text-fg-3">
            <span className="h-2 w-2 rounded-full bg-warn" /> آخر قطع من المقاس دا
          </p>
        ) : null}
      </div>
    </div>,
    host,
  );
}
