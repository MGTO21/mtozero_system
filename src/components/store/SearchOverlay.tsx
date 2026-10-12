'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconSearch, IconX } from '@/components/ui/Icons';
import { money } from '@/lib/format';
import { productImagePath } from '@/lib/store/paths';
import { openPanel, usePanel } from '@/lib/store/prefs';
import type { CatalogItem } from '@/lib/types';

/** Arabic shoppers type أ/ا/إ and ة/ه interchangeably; match them as one. */
function fold(text: string): string {
  return text
    .toLowerCase()
    .replace(/[أإآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ً-ْ]/g, '')
    .trim();
}

/**
 * Search as you type, over the whole catalog that is already on the page —
 * results appear on the first letter, with no request on a slow connection.
 * Enter opens the full results on /shop.
 */
export function SearchOverlay({ items }: { items: CatalogItem[] }) {
  const open = usePanel() === 'search';
  const [q, setQ] = useState('');
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    openPanel(null);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    setQ('');
    const t = window.setTimeout(() => input.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && openPanel(null);
    window.addEventListener('keydown', onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const index = useMemo(() => items.map((i) => ({ item: i, text: fold(`${i.name} ${i.brand ?? ''}`) })), [items]);

  const results = useMemo(() => {
    const words = fold(q).split(/\s+/).filter(Boolean);
    if (words.length === 0) return [];
    return index.filter((r) => words.every((w) => r.text.includes(w))).slice(0, 8).map((r) => r.item);
  }, [index, q]);

  /** Brands as quick chips when nothing is typed yet. */
  const brands = useMemo(() => {
    const count = new Map<string, number>();
    for (const i of items) if (i.brand) count.set(i.brand, (count.get(i.brand) ?? 0) + 1);
    return [...count.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([b]) => b);
  }, [items]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="بحث">
      <button type="button" aria-label="إغلاق" className="absolute inset-0 animate-fade-in bg-ink-950/60" onClick={() => openPanel(null)} />
      <div className="drop-in relative border-b border-line bg-page">
        <form
          className="mx-auto flex h-20 max-w-3xl items-center gap-3 px-4 sm:px-6"
          onSubmit={(e) => {
            e.preventDefault();
            if (q.trim()) router.push(`/shop?q=${encodeURIComponent(q.trim())}`);
          }}
        >
          <IconSearch className="h-6 w-6 shrink-0 text-fg-3" />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            type="search"
            enterKeyHint="search"
            placeholder="دوّر على منتج أو ماركة…"
            className="h-12 min-w-0 flex-1 bg-transparent font-display text-[1.35rem] font-extrabold outline-none placeholder:text-fg-3"
          />
          <button type="button" onClick={() => openPanel(null)} aria-label="إغلاق" className="press flex h-11 w-11 shrink-0 items-center justify-center text-fg-2">
            <IconX className="h-5 w-5" />
          </button>
        </form>

        <div className="mx-auto max-h-[70dvh] max-w-3xl overflow-y-auto px-4 pb-5 sm:px-6">
          {q.trim() === '' ? (
            brands.length > 0 ? (
              <div className="pb-1">
                <p className="store-kicker mb-2.5">BRANDS</p>
                <div className="flex flex-wrap gap-2">
                  {brands.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => setQ(b)}
                      className="press rounded-full border border-line-strong px-3.5 py-1.5 text-[0.88rem] font-bold text-fg-2 hover:border-fg hover:text-fg"
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </div>
            ) : null
          ) : results.length === 0 ? (
            <p className="py-6 text-center text-fg-3">ما لقينا «{q}» — جرّب كلمة تانية أو اسألنا واتساب.</p>
          ) : (
            <ul className="divide-y divide-line">
              {results.map((r) => (
                <li key={r.id}>
                  <Link href={`/p/${r.id}`} className="flex items-center gap-3 py-2.5 hover:bg-sunken">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={productImagePath(r.id, r.thumbHash, r.imageUrl)}
                      alt=""
                      loading="lazy"
                      className="h-16 w-14 shrink-0 rounded-card bg-sunken object-cover"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{r.name}</span>
                      {r.brand ? <span className="block text-[0.8rem] text-fg-3">{r.brand}</span> : null}
                    </span>
                    <span className="tnum shrink-0 font-display font-black text-brand-500">{money(r.price)}</span>
                  </Link>
                </li>
              ))}
              <li>
                <Link href={`/shop?q=${encodeURIComponent(q.trim())}`} className="block py-3 text-center text-[0.9rem] font-bold text-fg-2 underline underline-offset-4">
                  كل النتائج
                </Link>
              </li>
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
