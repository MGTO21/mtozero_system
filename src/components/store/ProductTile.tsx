import Link from 'next/link';
import { money } from '@/lib/format';
import { productImagePath } from '@/lib/store/paths';
import type { CatalogItem } from '@/lib/types';

/**
 * A product in a grid. The picture leads — clothes and shoes are bought with the
 * eyes — then name, price and the sizes still on the shelf, so a customer
 * looking for a 42 can tell at a glance without opening every product.
 */
export function ProductTile({ item, priority = false }: { item: CatalogItem; priority?: boolean }) {
  const available = item.sizes.filter((s) => s.state !== 'out');
  // No "last pieces" badge in the grid: in a shop that stocks one or two of each
  // size it would sit on nearly every product and mean nothing. It is shown on
  // the product page, for the size the customer actually picked.
  return (
    <Link href={`/p/${item.id}`} className="group block">
      <div className="relative aspect-[4/5] overflow-hidden rounded-card bg-sunken">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={productImagePath(item.id, item.thumbHash, item.imageUrl)}
          alt={item.name}
          loading={priority ? 'eager' : 'lazy'}
          decoding="async"
          className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
      </div>
      <div className="mt-2.5 px-0.5">
        {item.brand ? <p className="truncate text-[0.74rem] font-bold text-fg-3">{item.brand}</p> : null}
        <p className="line-clamp-2 text-[0.95rem] font-bold leading-snug">{item.name}</p>
        <p className="tnum mt-1 font-display text-[1.1rem] font-black text-brand-500">{money(item.price)}</p>
        <p className="tnum mt-1 truncate text-[0.76rem] font-semibold text-fg-3">
          {available.map((s) => s.size).join(' · ')}
        </p>
      </div>
    </Link>
  );
}
