'use client';

import Link from 'next/link';
import { IconWhatsApp } from '@/components/ui/Icons';
import { money } from '@/lib/format';
import { useMounted, useWishlist } from '@/lib/store/prefs';
import type { CatalogItem } from '@/lib/types';
import { ProductTile } from './ProductTile';

/**
 * Saved items, kept in this browser. Items that sold out since they were saved
 * drop out of the public catalog, so they are counted and mentioned rather than
 * shown as dead tiles. The whole list can go to the shop on WhatsApp — the way
 * customers here ask "which of these do you have in 42?".
 */
export function WishlistGrid({ items, newDays, whatsapp }: { items: CatalogItem[]; newDays: number; whatsapp: string }) {
  const mounted = useMounted();
  const ids = useWishlist();
  const byId = new Map(items.map((i) => [i.id, i]));
  const saved = ids.map((id) => byId.get(id)).filter((x): x is CatalogItem => Boolean(x));
  const gone = ids.length - saved.length;

  if (!mounted) return <div className="py-24" />;

  const text = `السلام عليكم، دي القطع اللي عاجباني من الموقع:\n${saved
    .map((i) => `• ${i.name} — ${money(i.price)}\n${window.location.origin}/p/${i.id}`)
    .join('\n')}`;

  return (
    <div className="mx-auto max-w-7xl px-4 pb-6 pt-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="store-title">المفضلة</h1>
          <p className="tnum mt-1 text-fg-3">{saved.length} قطعة محفوظة في جهازك</p>
        </div>
        {whatsapp && saved.length > 0 ? (
          <a
            href={`https://wa.me/${whatsapp}?text=${encodeURIComponent(text)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="press inline-flex h-12 items-center gap-2 rounded-full bg-good px-5 font-display font-black text-white"
          >
            <IconWhatsApp className="h-5 w-5" />
            اسأل عن القائمة واتساب
          </a>
        ) : null}
      </div>

      {gone > 0 ? (
        <p className="mt-4 rounded-card border border-dashed border-line-strong px-4 py-3 text-[0.9rem] text-fg-2">
          {gone === 1 ? 'قطعة وحدة' : `${gone} قطع`} من المحفوظة خلصت من المحل — ممكن ترجع، اسألنا.
        </p>
      ) : null}

      {saved.length === 0 ? (
        <div className="py-20 text-center">
          <p className="font-display text-[1.4rem] font-black">لسه ما حفظت حاجة</p>
          <p className="mt-1 text-fg-3">دوس على القلب في أي منتج عشان ترجع ليهو بعدين.</p>
          <Link href="/shop" className="press mt-6 inline-flex h-12 items-center rounded-full bg-fg px-6 font-display font-black text-page">
            تصفّح المنتجات
          </Link>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 sm:gap-x-5 lg:grid-cols-4">
          {saved.map((item, i) => (
            <ProductTile key={item.id} item={item} newDays={newDays} priority={i < 4} />
          ))}
        </div>
      )}
    </div>
  );
}
