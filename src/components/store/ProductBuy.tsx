'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Button, Stepper } from '@/components/ui/Button';
import { IconCheck, IconWhatsApp } from '@/components/ui/Icons';
import { money } from '@/lib/format';
import { addToCart, productImagePath } from '@/lib/store/cart';
import type { CatalogItem } from '@/lib/types';

/**
 * Size, quantity, add to basket. Sold-out sizes stay visible but struck through
 * — a customer should see that 43 exists but is gone, not wonder whether the
 * shop ever carries it. "Last pieces" is shown instead of an exact count.
 */
export function ProductBuy({ item, whatsapp }: { item: CatalogItem; whatsapp: string }) {
  const router = useRouter();
  const available = item.sizes.filter((s) => s.state !== 'out');
  const [size, setSize] = useState<string | null>(available.length === 1 ? available[0]!.size : null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [needSize, setNeedSize] = useState(false);
  const chosen = item.sizes.find((s) => s.size === size);

  function add(goToCart: boolean) {
    if (!size) {
      setNeedSize(true);
      return;
    }
    addToCart({
      productId: item.id,
      name: item.name,
      size,
      qty,
      price: item.price,
      image: productImagePath(item.id, item.thumbHash, item.imageUrl),
    });
    if (goToCart) router.push('/cart');
    else {
      setAdded(true);
      window.setTimeout(() => setAdded(false), 2500);
    }
  }

  const askText = `السلام عليكم، عندكم ${item.name}${size ? ` مقاس ${size}` : ''}؟\n${typeof window !== 'undefined' ? window.location.href : ''}`;

  return (
    <div>
      <div className="flex items-baseline justify-between">
        <p className="label !mb-2">المقاس</p>
        {needSize && !size ? <p className="text-[0.82rem] font-bold text-bad">اختار مقاسك أول</p> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {item.sizes.map((s) => {
          const out = s.state === 'out';
          return (
            <button
              key={s.size}
              type="button"
              disabled={out}
              aria-pressed={size === s.size}
              onClick={() => {
                setSize(s.size);
                setNeedSize(false);
              }}
              className={`press tnum relative h-12 min-w-[3.25rem] rounded-card border-[1.5px] px-2 font-display text-[1.05rem] font-black transition-colors
                ${out ? 'cursor-not-allowed border-dashed border-line-strong text-fg-3 line-through' : size === s.size ? 'border-fg bg-fg text-page' : 'border-line-strong bg-surface text-fg hover:border-fg'}`}
            >
              {s.size}
            </button>
          );
        })}
      </div>
      {chosen?.state === 'last' ? (
        <p className="mt-2 text-[0.88rem] font-bold text-warn">آخر قطع من المقاس دا</p>
      ) : null}

      <div className="mt-5 flex items-end gap-3">
        <div className="w-36">
          <p className="label">الكمية</p>
          <Stepper value={qty} max={chosen?.state === 'last' ? 2 : 10} onChange={setQty} label="الكمية" />
        </div>
        <p className="tnum pb-2 font-display text-[1.2rem] font-black">{money(item.price * qty)}</p>
      </div>

      <div className="mt-5 grid gap-2 sm:grid-cols-2">
        <Button size="lg" onClick={() => add(true)}>
          اطلب الآن
        </Button>
        <Button size="lg" variant="secondary" onClick={() => add(false)} icon={added ? <IconCheck className="h-5 w-5" /> : undefined}>
          {added ? 'اتضاف للسلة' : 'أضف للسلة'}
        </Button>
      </div>

      {whatsapp ? (
        <a
          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(askText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-2 text-[0.92rem] font-bold text-good"
        >
          <IconWhatsApp className="h-5 w-5" />
          عندك سؤال؟ اسألنا واتساب
        </a>
      ) : null}
    </div>
  );
}
