'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Pill } from '@/components/ui/DateRange';
import { IconSearch } from '@/components/ui/Icons';
import { CATEGORY_LABEL, type CatalogItem, type Category } from '@/lib/types';
import { ProductTile } from './ProductTile';

type Sort = 'new' | 'popular' | 'low' | 'high';

const SORT_LABEL: Record<Sort, string> = {
  new: 'الأحدث',
  popular: 'الأكثر طلباً',
  low: 'السعر: الأقل',
  high: 'السعر: الأعلى',
};

/**
 * The whole catalog is already on the page (it is small), so every filter is
 * instant — no reload on a slow connection. The choices are mirrored in the
 * address, so "all our 42s" is a link the shop can send a customer.
 */
export function ShopBrowser({ items }: { items: CatalogItem[] }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [category, setCategory] = useState<'all' | Category>((params.get('c') as Category) || 'all');
  const [size, setSize] = useState<string | null>(params.get('size'));
  const [sort, setSort] = useState<Sort>((params.get('sort') as Sort) || 'new');
  const [q, setQ] = useState(params.get('q') ?? '');

  function sync(next: { c?: string; size?: string | null; sort?: string; q?: string }) {
    const sp = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries({ c: category, size, sort, q, ...next })) {
      if (!v || v === 'all' || (k === 'sort' && v === 'new')) sp.delete(k);
      else sp.set(k, String(v));
    }
    router.replace(`${pathname}${sp.toString() ? `?${sp}` : ''}`, { scroll: false });
  }

  const inCategory = useMemo(
    () => (category === 'all' ? items : items.filter((i) => i.category === category)),
    [items, category],
  );

  /** Sizes that exist in stock in the current department, in natural order. */
  const sizes = useMemo(() => {
    const set = new Set<string>();
    for (const i of inCategory) for (const s of i.sizes) if (s.state !== 'out') set.add(s.size);
    return [...set].sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.localeCompare(b, 'ar');
    });
  }, [inCategory]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = inCategory
      .filter((i) => (size ? i.sizes.some((s) => s.size === size && s.state !== 'out') : true))
      .filter((i) => (term ? `${i.name} ${i.brand ?? ''}`.toLowerCase().includes(term) : true));
    const sorted = [...list];
    if (sort === 'low') sorted.sort((a, b) => a.price - b.price);
    else if (sort === 'high') sorted.sort((a, b) => b.price - a.price);
    else if (sort === 'popular') sorted.sort((a, b) => b.lastSoldAtMs - a.lastSoldAtMs);
    else sorted.sort((a, b) => b.createdAtMs - a.createdAtMs);
    return sorted;
  }, [inCategory, size, q, sort]);

  return (
    <div className="mx-auto max-w-6xl px-4 pb-6 pt-6 sm:px-6">
      <h1 className="text-[2rem] sm:text-[2.6rem]">
        {category === 'all' ? 'كل المنتجات' : CATEGORY_LABEL[category]}
      </h1>

      <div className="mt-4 space-y-3">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-3" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              sync({ q: e.target.value });
            }}
            type="search"
            enterKeyHint="search"
            className="field h-12 pr-11"
            placeholder="ابحث: اير فورس، سامبا، قميص…"
          />
        </div>

        <div className="scroller sm:mx-0 sm:px-0">
          {(['all', 'shoes', 'clothing'] as const).map((c) => (
            <Pill
              key={c}
              active={category === c}
              onClick={() => {
                setCategory(c);
                setSize(null);
                sync({ c, size: null });
              }}
              count={c === 'all' ? items.length : items.filter((i) => i.category === c).length}
            >
              {c === 'all' ? 'الكل' : CATEGORY_LABEL[c]}
            </Pill>
          ))}
        </div>

        {sizes.length > 0 ? (
          <div>
            <p className="mb-1.5 text-[0.82rem] font-bold text-fg-2">مقاسك</p>
            <div className="flex flex-wrap gap-1.5">
              {sizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={size === s}
                  onClick={() => {
                    const next = size === s ? null : s;
                    setSize(next);
                    sync({ size: next });
                  }}
                  className={`press tnum h-10 min-w-[2.75rem] rounded-card border-[1.5px] px-2 font-display font-black transition-colors
                    ${size === s ? 'border-fg bg-fg text-page' : 'border-line-strong bg-surface text-fg'}`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div className="flex items-center justify-between gap-3 border-t border-line pt-3">
          <p className="tnum text-[0.88rem] font-bold text-fg-2">
            {visible.length} منتج{size ? ` بمقاس ${size}` : ''}
          </p>
          <select
            value={sort}
            onChange={(e) => {
              const v = e.target.value as Sort;
              setSort(v);
              sync({ sort: v });
            }}
            className="h-10 rounded-card border border-line-strong bg-surface px-2 text-[0.88rem] font-bold"
            aria-label="الترتيب"
          >
            {(Object.keys(SORT_LABEL) as Sort[]).map((s) => (
              <option key={s} value={s}>
                {SORT_LABEL[s]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="py-16 text-center">
          <p className="font-display text-[1.2rem] font-black">ما لقينا حاجة</p>
          <p className="mt-1 text-fg-3">جرّب مقاس أو كلمة تانية — أو اسألنا واتساب، ممكن يكون في الطريق.</p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 sm:gap-x-5">
          {visible.map((item, i) => (
            <ProductTile key={item.id} item={item} priority={i < 4} />
          ))}
        </div>
      )}
    </div>
  );
}
