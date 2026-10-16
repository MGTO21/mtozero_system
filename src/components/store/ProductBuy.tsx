'use client';

import { useEffect, useRef, useState } from 'react';
import { Stepper } from '@/components/ui/Button';
import { IconCheck, IconHeart, IconShare, IconWhatsApp } from '@/components/ui/Icons';
import { money } from '@/lib/format';
import { addToCart, productImagePath } from '@/lib/store/cart';
import { compareSizes } from '@/lib/store/model';
import { openPanel, rememberViewed, setMySize, toggleWishlist, useMounted, useMySizes, useWishlist } from '@/lib/store/prefs';
import type { CatalogItem } from '@/lib/types';
import { NotifyMe } from './NotifyMe';
import { SizeGuide } from './SizeGuide';

/**
 * Size, quantity, add to basket. Sold-out sizes stay visible but struck through
 * — a customer should see that 43 exists but is gone. "Last pieces" is shown
 * instead of an exact count. The visitor's saved size is picked for them when
 * it is in stock, and the size they choose here becomes their saved size.
 *
 * On a phone, once the main button scrolls away a slim bar keeps "add" under
 * the thumb.
 */
export function ProductBuy({ item, whatsapp, sizeGuide }: { item: CatalogItem; whatsapp: string; sizeGuide: string }) {
  const mounted = useMounted();
  const mySizes = useMySizes();
  const wishlist = useWishlist();
  const sizes = [...item.sizes].sort((a, b) => compareSizes(a.size, b.size));
  const available = sizes.filter((s) => s.state !== 'out');
  const [size, setSize] = useState<string | null>(available.length === 1 ? available[0]!.size : null);
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState(false);
  const [needSize, setNeedSize] = useState(false);
  const [shared, setShared] = useState(false);
  const [barVisible, setBarVisible] = useState(false);
  const [notifySize, setNotifySize] = useState<string | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const mainButtons = useRef<HTMLDivElement>(null);
  const chosen = item.sizes.find((s) => s.size === size);
  const saved = mounted && wishlist.includes(item.id);

  useEffect(() => rememberViewed(item.id), [item.id]);

  // Pre-select the saved size once, if this product has it.
  const preselected = useRef(false);
  useEffect(() => {
    if (!mounted || preselected.current || size) return;
    preselected.current = true;
    const mine = mySizes[item.category];
    if (mine && available.some((s) => s.size === mine)) setSize(mine);
  }, [mounted, mySizes, item.category, available, size]);

  useEffect(() => {
    const el = mainButtons.current;
    if (!el || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver(([e]) => setBarVisible(!e!.isIntersecting && e!.boundingClientRect.top < 0), { threshold: 0 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  function add() {
    if (!size) {
      setNeedSize(true);
      document.getElementById('size-picker')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
    setMySize(item.category, size);
    setAdded(true);
    window.setTimeout(() => setAdded(false), 2000);
    openPanel('cart');
  }

  async function share() {
    const url = window.location.href;
    const text = `${item.name} — ${money(item.price)}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: item.name, text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setShared(true);
      window.setTimeout(() => setShared(false), 2000);
    } catch {
      // Cancelled by the visitor.
    }
  }

  const askText = `السلام عليكم، عندكم ${item.name}${size ? ` مقاس ${size}` : ''}؟\n${mounted ? window.location.href : ''}`;

  return (
    <div>
      <div id="size-picker" className="flex items-baseline justify-between gap-3">
        <p className="label !mb-2">
          المقاس
          {needSize && !size ? <span className="mr-2 text-bad">— اختار مقاسك أول</span> : null}
        </p>
        {sizeGuide.trim() ? (
          <button type="button" onClick={() => setGuideOpen(true)} className="pb-2 text-[0.84rem] font-bold text-fg-2 underline underline-offset-4">
            دليل المقاسات
          </button>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {sizes.map((s) => {
          const out = s.state === 'out';
          return (
            <button
              key={s.size}
              type="button"
              aria-pressed={size === s.size}
              aria-label={out ? `مقاس ${s.size} خلص — نبّهني لما يتوفر` : `مقاس ${s.size}`}
              onClick={() => {
                // A sold-out size is not a dead end: it asks to be told when it is back.
                if (out) {
                  setNotifySize(s.size);
                  return;
                }
                setSize(s.size);
                setNeedSize(false);
              }}
              className={`press tnum relative h-12 min-w-[3.25rem] rounded-card border-[1.5px] px-2 font-display text-[1.05rem] font-black transition-colors
                ${out ? 'border-dashed border-line-strong text-fg-3 line-through hover:border-fg-3' : size === s.size ? 'border-fg bg-fg text-page' : 'border-line-strong bg-surface text-fg hover:border-fg'}`}
            >
              {s.size}
            </button>
          );
        })}
      </div>
      {chosen?.state === 'last' ? <p className="mt-2 text-[0.88rem] font-bold text-warn">آخر قطع من المقاس دا — اطلبو قبل يخلص</p> : null}
      {sizes.some((s) => s.state === 'out') ? (
        <p className="mt-2 text-[0.8rem] text-fg-3">مقاسك خلصان؟ دوس عليهو ونرسل ليك واتساب لمن يرجع.</p>
      ) : null}
      {notifySize ? <NotifyMe item={item} size={notifySize} onClose={() => setNotifySize(null)} /> : null}
      {guideOpen ? <SizeGuide category={item.category} text={sizeGuide} onClose={() => setGuideOpen(false)} /> : null}

      <div className="mt-5 flex items-end gap-3">
        <div className="w-36">
          <p className="label">الكمية</p>
          <Stepper value={qty} max={chosen?.state === 'last' ? 2 : 10} onChange={setQty} label="الكمية" />
        </div>
        <p className="tnum pb-2 font-display text-[1.2rem] font-black">{money(item.price * qty)}</p>
      </div>

      <div ref={mainButtons} className="mt-5 flex gap-2">
        <button
          type="button"
          onClick={add}
          className="press flex h-14 flex-1 items-center justify-center gap-2 rounded-full bg-brand-500 font-display text-[1.08rem] font-black text-white"
        >
          {added ? <IconCheck className="h-5 w-5" /> : null}
          {added ? 'اتضاف للسلة' : 'أضف للسلة'}
        </button>
        <button
          type="button"
          onClick={() => toggleWishlist(item.id)}
          aria-label={saved ? 'شيل من المفضلة' : 'احفظ في المفضلة'}
          aria-pressed={saved}
          className="press flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line-strong hover:border-fg"
        >
          <IconHeart className={`h-6 w-6 ${saved ? 'pop text-brand-500' : 'text-fg-3'}`} />
        </button>
        <button
          type="button"
          onClick={() => void share()}
          aria-label="شارك المنتج"
          className="press relative flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-[1.5px] border-line-strong hover:border-fg"
        >
          {shared ? <IconCheck className="h-5 w-5 text-good" /> : <IconShare className="h-5 w-5 text-fg-2" />}
        </button>
      </div>
      {shared ? <p className="mt-2 text-[0.82rem] font-bold text-good">اتنسخ الرابط</p> : null}

      {whatsapp ? (
        <a
          href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(askText)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex items-center gap-2 text-[0.92rem] font-bold text-good"
        >
          <IconWhatsApp className="h-5 w-5" />
          عندك سؤال عن المقاس؟ اسألنا واتساب
        </a>
      ) : null}

      {/* Phone: the buy bar that follows once the main button is out of sight. */}
      <div
        className={`buy-bar fixed inset-x-0 bottom-0 z-30 border-t border-line bg-page px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 transition-transform duration-300 md:hidden ${
          barVisible ? 'translate-y-0' : 'translate-y-full'
        }`}
        aria-hidden={!barVisible}
      >
        <div className="flex items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.84rem] font-bold">{item.name}</p>
            <p className="tnum font-display font-black text-brand-500">
              {money(item.price)}
              {size ? <span className="text-[0.8rem] text-fg-3"> · مقاس {size}</span> : null}
            </p>
          </div>
          <button
            type="button"
            tabIndex={barVisible ? 0 : -1}
            onClick={add}
            className="press h-12 shrink-0 rounded-full bg-brand-500 px-6 font-display font-black text-white"
          >
            {size ? 'أضف للسلة' : 'اختار مقاس'}
          </button>
        </div>
      </div>
    </div>
  );
}
