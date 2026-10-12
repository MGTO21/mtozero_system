'use client';

import Link from 'next/link';
import { useState } from 'react';
import { IconHeart, IconPlus } from '@/components/ui/Icons';
import { money } from '@/lib/format';
import { isNewArrival, salePercent } from '@/lib/store/model';
import { galleryImagePath, productImagePath } from '@/lib/store/paths';
import { toggleWishlist, useMounted, useMySizes, useWishlist } from '@/lib/store/prefs';
import type { CatalogItem } from '@/lib/types';
import { QuickAdd } from './QuickAdd';

/**
 * A product in a grid or a shelf. The picture leads — clothes and shoes are
 * bought with the eyes — then name, price and the sizes still on the shelf, so
 * a customer looking for a 42 can tell at a glance. When the visitor saved
 * their size, it is called out: "مقاسك متوفر".
 *
 * No "last pieces" badge here: in a shop that stocks one or two of each size it
 * would sit on nearly every product. It shows on the product page instead.
 */
export function ProductTile({
  item,
  newDays = 14,
  priority = false,
}: {
  item: CatalogItem;
  newDays?: number;
  priority?: boolean;
}) {
  const mounted = useMounted();
  const wishlist = useWishlist();
  const mySizes = useMySizes();
  const [pop, setPop] = useState(false);
  const [quick, setQuick] = useState(false);

  const saved = mounted && wishlist.includes(item.id);
  const available = item.sizes.filter((s) => s.state !== 'out');
  const mySize = mounted ? mySizes[item.category] : undefined;
  const fitsMe = Boolean(mySize && available.some((s) => s.size === mySize));
  const off = salePercent(item);
  const fresh = isNewArrival(item, newDays);

  // One tag at most on the picture: the strongest reason to look.
  const tag = off > 0 ? `-${off}%` : item.badge || (fresh ? 'جديد' : '');

  return (
    <div className="tile group relative">
      <div className="relative aspect-[4/5] overflow-hidden rounded-card bg-sunken">
        <Link href={`/p/${item.id}`} className="block h-full w-full" tabIndex={-1} aria-hidden="true">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={productImagePath(item.id, item.thumbHash, item.imageUrl)}
            alt=""
            loading={priority ? 'eager' : 'lazy'}
            decoding="async"
            className="tile-img h-full w-full object-cover"
          />
          {/* Second picture on hover, where there is a mouse: another angle without a click. */}
          {item.gallery[0] ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={galleryImagePath(item.id, item.gallery[0])}
              alt=""
              loading="lazy"
              decoding="async"
              className="absolute inset-0 hidden h-full w-full object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100 [@media(hover:hover)]:block"
            />
          ) : null}
        </Link>
        {tag ? (
          <span
            className={`tnum pointer-events-none absolute right-2 top-2 rounded-[3px] px-2 py-1 font-display text-[0.74rem] font-black leading-none ${
              off > 0 ? 'bg-brand-500 text-white' : 'bg-spot text-on-spot'
            }`}
          >
            {tag}
          </span>
        ) : null}

        <button
          type="button"
          aria-label={saved ? 'شيل من المفضلة' : 'احفظ في المفضلة'}
          aria-pressed={saved}
          onClick={() => {
            toggleWishlist(item.id);
            setPop(true);
            window.setTimeout(() => setPop(false), 400);
          }}
          className="press absolute left-1.5 top-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-surface/90 text-fg-3"
        >
          <IconHeart className={`h-5 w-5 ${saved ? 'text-brand-500' : ''} ${pop ? 'pop' : ''}`} />
        </button>

        {available.length > 0 ? (
          <button
            type="button"
            onClick={() => setQuick(true)}
            aria-label={`إضافة سريعة — ${item.name}`}
            className="tile-quick press absolute bottom-1.5 left-1.5 flex h-11 w-11 items-center justify-center rounded-full bg-fg text-page md:translate-y-1 md:opacity-0 md:transition-all md:duration-300 md:focus-visible:opacity-100"
          >
            <IconPlus className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <Link href={`/p/${item.id}`} className="mt-2.5 block px-0.5">
        {item.brand ? <p className="truncate text-[0.72rem] font-bold uppercase tracking-wide text-fg-3">{item.brand}</p> : null}
        <p className="line-clamp-2 text-[0.95rem] font-bold leading-snug">{item.name}</p>
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
          <span className="tnum font-display text-[1.1rem] font-black text-brand-500">{money(item.price)}</span>
          {off > 0 ? (
            <span className="tnum text-[0.82rem] font-bold text-fg-3 line-through">{money(item.compareAtPrice)}</span>
          ) : null}
        </p>
        {fitsMe ? (
          <p className="mt-1 text-[0.76rem] font-black text-good">مقاسك {mySize} متوفر</p>
        ) : (
          <p className="tnum mt-1 truncate text-[0.76rem] font-semibold text-fg-3">{available.map((s) => s.size).join(' · ')}</p>
        )}
      </Link>

      {quick ? <QuickAdd item={item} onClose={() => setQuick(false)} /> : null}
    </div>
  );
}
