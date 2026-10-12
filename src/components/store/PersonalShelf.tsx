'use client';

import { useMemo } from 'react';
import { useMounted, useMySizes, useRecent, useWishlist } from '@/lib/store/prefs';
import type { CatalogItem } from '@/lib/types';
import { Shelf } from './Shelf';

/**
 * Shelves that depend on this visitor — built from what their browser
 * remembers, so the server page stays the same for everyone (and cacheable).
 */
export function PersonalShelf({
  kind,
  title,
  items,
  newDays,
}: {
  kind: 'mysize' | 'recent' | 'wishlist';
  title: string;
  items: CatalogItem[];
  newDays: number;
}) {
  const mounted = useMounted();
  const recent = useRecent();
  const wishlist = useWishlist();
  const mySizes = useMySizes();

  const { list, note, href } = useMemo(() => {
    const byId = new Map(items.map((i) => [i.id, i]));
    if (kind === 'recent') {
      return { list: recent.map((id) => byId.get(id)).filter(Boolean).slice(0, 8) as CatalogItem[], note: undefined, href: undefined };
    }
    if (kind === 'wishlist') {
      return { list: wishlist.map((id) => byId.get(id)).filter(Boolean).slice(0, 8) as CatalogItem[], note: undefined, href: '/wishlist' };
    }
    const fits = items.filter((i) => {
      const mine = mySizes[i.category];
      return mine && i.sizes.some((s) => s.size === mine && s.state !== 'out');
    });
    const sizes = [mySizes.shoes && `حذاء ${mySizes.shoes}`, mySizes.clothing && `ملابس ${mySizes.clothing}`].filter(Boolean).join(' · ');
    return { list: fits.slice(0, 8), note: sizes ? `حسب مقاسك المحفوظ: ${sizes}` : undefined, href: '/shop?mine=1' };
  }, [kind, items, recent, wishlist, mySizes]);

  if (!mounted || list.length === 0) return null;
  return <Shelf title={title} href={href} items={list} newDays={newDays} note={note} />;
}
