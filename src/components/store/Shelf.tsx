import Link from 'next/link';
import type { CatalogItem } from '@/lib/types';
import { ProductTile } from './ProductTile';
import { Reveal } from './Reveal';

/**
 * A titled row of products. On a phone it is a swipeable rail with the next
 * tile peeking in — it says "there is more" without a word; on a wide screen it
 * becomes a grid.
 */
export function Shelf({
  title,
  kicker,
  href,
  items,
  newDays,
  note,
}: {
  title: string;
  kicker?: string;
  href?: string;
  items: CatalogItem[];
  newDays: number;
  note?: string;
}) {
  if (items.length === 0) return null;
  return (
    <Reveal as="section" className="mx-auto mt-16 max-w-7xl sm:mt-24 sm:px-6">
      <div className="mb-5 flex items-end justify-between gap-3 px-4 sm:px-0">
        <div className="min-w-0">
          {kicker ? <p className="store-kicker mb-1.5">{kicker}</p> : null}
          <h2 className="store-title">{title}</h2>
          {note ? <p className="mt-1 text-[0.9rem] text-fg-3">{note}</p> : null}
        </div>
        {href ? (
          <Link href={href} className="shrink-0 border-b-2 border-fg pb-0.5 text-[0.9rem] font-black">
            عرض الكل
          </Link>
        ) : null}
      </div>
      <div className="shelf-rail gap-3 px-4 sm:grid-cols-3 sm:gap-x-5 sm:gap-y-9 sm:px-0 lg:grid-cols-4">
        {items.map((item, i) => (
          <div key={item.id} className={`w-[44vw] max-w-[15rem] shrink-0 sm:w-auto sm:max-w-none ${hideBeyondFullRows(i, items.length)}`}>
            <ProductTile item={item} newDays={newDays} priority={i < 2} />
          </div>
        ))}
      </div>
    </Reveal>
  );
}

/**
 * On a grid, a shelf shows whole rows only — a lone tile on a second row looks
 * like a mistake. The phone rail still swipes through every item.
 */
function hideBeyondFullRows(index: number, count: number): string {
  const rows = (cols: number) => (count >= cols ? Math.floor(count / cols) * cols : count);
  const classes: string[] = [];
  if (index >= rows(3)) classes.push('sm:max-lg:hidden');
  if (index >= rows(4)) classes.push('lg:hidden');
  return classes.join(' ');
}
