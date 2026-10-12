'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { Pill } from '@/components/ui/DateRange';
import { IconSearch } from '@/components/ui/Icons';
import { compareSizes } from '@/lib/store/model';
import { setMySize, useMounted, useMySizes } from '@/lib/store/prefs';
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
export function ShopBrowser({ items, newDays }: { items: CatalogItem[]; newDays: number }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const [category, setCategory] = useState<'all' | Category>((params.get('c') as Category) || 'all');
  const [size, setSize] = useState<string | null>(params.get('size'));
  const [sort, setSort] = useState<Sort>((params.get('sort') as Sort) || 'new');
  const [q, setQ] = useState(params.get('q') ?? '');
  const [sale, setSale] = useState(params.get('sale') === '1');
  const featuredOnly = params.get('featured') === '1';
  const mounted = useMounted();
  const mySizes = useMySizes();

  // "/shop?mine=1" (from the home shelf): start on the visitor's saved size.
  useEffect(() => {
    if (!mounted || params.get('mine') !== '1' || size) return;
    const c = category === 'all' ? null : category;
    const mine = c ? mySizes[c] : mySizes.shoes ?? mySizes.clothing;
    if (mine) setSize(mine);
    // Only on arrival.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mounted]);

  // Keep the URL in step when the search changes from the header overlay.
  useEffect(() => {
    setQ(params.get('q') ?? '');
    setSale(params.get('sale') === '1');
    const c = params.get('c') as Category | null;
    setCategory(c === 'shoes' || c === 'clothing' ? c : 'all');
  }, [params]);

  function sync(next: { c?: string; size?: string | null; sort?: string; q?: string; sale?: string | null }) {
    const sp = new URLSearchParams(params.toString());
    sp.delete('mine');
    for (const [k, v] of Object.entries({ c: category, size, sort, q, sale: sale ? '1' : null, ...next })) {
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
    return [...set].sort(compareSizes);
  }, [inCategory]);

  const visible = useMemo(() => {
    const term = q.trim().toLowerCase();
    const list = inCategory
      .filter((i) => (sale ? i.compareAtPrice > i.price : true))
      .filter((i) => (featuredOnly ? i.featured : true))
      .filter((i) => (size ? i.sizes.some((s) => s.size === size && s.state !== 'out') : true))
      .filter((i) => (term ? `${i.name} ${i.brand ?? ''}`.toLowerCase().includes(term) : true));
    const sorted = [...list];
    if (sort === 'low') sorted.sort((a, b) => a.price - b.price);
    else if (sort === 'high') sorted.sort((a, b) => b.price - a.price);
    else if (sort === 'popular') sorted.sort((a, b) => b.lastSoldAtMs - a.lastSoldAtMs);
    else sorted.sort((a, b) => b.createdAtMs - a.createdAtMs);
    return sorted;
  }, [inCategory, size, q, sort, sale, featuredOnly]);

  return (
    <div className="mx-auto max-w-7xl px-4 pb-6 pt-6 sm:px-6">
      <h1 className="store-title">
        {sale ? 'تخفيضات' : featuredOnly ? 'مختارات المحل' : category === 'all' ? 'كل المنتجات' : CATEGORY_LABEL[category]}
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
          {items.some((i) => i.compareAtPrice > i.price) ? (
            <Pill
              active={sale}
              onClick={() => {
                setSale(!sale);
                sync({ sale: sale ? null : '1' });
              }}
              count={items.filter((i) => i.compareAtPrice > i.price).length}
            >
              تخفيضات
            </Pill>
          ) : null}
        </div>

        {sizes.length > 0 ? (
          <div>
            <p className="mb-1.5 text-[0.82rem] font-bold text-fg-2">
              مقاسك
              {mounted && category !== 'all' && mySizes[category] && size !== mySizes[category] ? (
                <button
                  type="button"
                  onClick={() => {
                    const mine = mySizes[category as Category]!;
                    setSize(mine);
                    sync({ size: mine });
                  }}
                  className="mr-2 font-black text-brand-500 underline underline-offset-2"
                >
                  مقاسي المحفوظ {mySizes[category]}
                </button>
              ) : null}
            </p>
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
                    if (next && category !== 'all') setMySize(category, next);
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
          <p className="font-display text-[1.2rem] font-black">{sale ? 'ما في تخفيضات هسع' : 'ما لقينا حاجة'}</p>
          <p className="mt-1 text-fg-3">
            {sale ? 'تابعنا — العروض الجاية بتظهر هنا أول.' : 'جرّب مقاس أو كلمة تانية — أو اسألنا واتساب، ممكن يكون في الطريق.'}
          </p>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 sm:gap-x-5">
          {visible.map((item, i) => (
            <ProductTile key={item.id} item={item} newDays={newDays} priority={i < 4} />
          ))}
        </div>
      )}
    </div>
  );
}
