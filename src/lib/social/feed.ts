import { createHash, timingSafeEqual } from 'node:crypto';
import { categoryById } from '@/lib/store/model';
import { fetchCatalog, fetchCategories } from '@/lib/store/server';
import { siteUrl } from '@/lib/store/site';
import type { CatalogItem, CategoryDef } from '@/lib/types';
import { recentPosts } from './admin';
import { composeCaption, khartoumDay, type CaptionMeta } from './compose';
import { HISTORY_DAYS, pickProduct, type SocialKind, type SocialPick, type SocialPost } from './pick';

/**
 * Shared-secret check for the Make.com routes. Constant time; no key configured means locked.
 * Tolerates what a dashboard paste tends to add: surrounding whitespace, quotes,
 * or the whole `SOCIAL_FEED_KEY=…` line pasted as the value.
 */
export function authorized(req: Request): boolean {
  const expected = (process.env.SOCIAL_FEED_KEY ?? '')
    .trim()
    .replace(/^SOCIAL_FEED_KEY\s*=\s*/, '')
    .replace(/^["']|["']$/g, '')
    .trim();
  const given = (req.headers.get('x-social-key') ?? '').trim();
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const KIND_LABEL: Record<SocialKind, string> = {
  new: 'وصل جديد',
  last: 'آخر مقاس',
  spotlight: 'من المحل',
};

/** Changes whenever anything drawn on the card changes: price, sizes, picture or label. */
export function cardVersion(item: CatalogItem, kind: SocialKind, sizes: string[]): string {
  const picture = item.imageUrl ?? (item.hdHash ? `hd:${item.hdHash}` : `t:${item.thumbHash}`);
  return createHash('sha1')
    .update([kind, item.name, item.price, sizes.join(','), picture].join('|'))
    .digest('hex')
    .slice(0, 12);
}

export interface NextProduct {
  productId: string;
  kind: SocialKind;
  name: string;
  price: number;
  sizes: string[];
  caption: string;
  imageUrl: string;
  productUrl: string;
  /** Which bank entries made the caption. Make may echo it back to /posted; it does not have to. */
  captionMeta: CaptionMeta;
}

export async function loadHistory(now = Date.now()): Promise<SocialPost[]> {
  return recentPosts(now - HISTORY_DAYS * 24 * 60 * 60 * 1000);
}

/** Live catalog — the cached store read could be a minute behind a sale. */
export async function liveCatalog(): Promise<CatalogItem[]> {
  return fetchCatalog(true);
}

/** The caption for a pick, the same on every call that day. */
export function captionFor(pick: SocialPick, posts: SocialPost[], categories: CategoryDef[], now = Date.now()) {
  const { item, kind, sizes } = pick;
  return composeCaption({
    kind,
    item,
    sizes,
    categoryName: categoryById(categories, item.category).name,
    productUrl: `${siteUrl()}/p/${item.id}`,
    history: posts,
    day: khartoumDay(now),
  });
}

export function describe(pick: SocialPick, posts: SocialPost[], categories: CategoryDef[], now = Date.now()): NextProduct {
  const site = siteUrl();
  const { item, kind, sizes } = pick;
  const { caption, meta } = captionFor(pick, posts, categories, now);
  return {
    productId: item.id,
    kind,
    name: item.name,
    price: item.price,
    sizes,
    caption,
    imageUrl: `${site}/api/social/card/${item.id}?kind=${kind}&v=${cardVersion(item, kind, sizes)}`,
    productUrl: `${site}/p/${item.id}`,
    captionMeta: meta,
  };
}

export async function nextProduct(now = Date.now()): Promise<NextProduct | null> {
  const [catalog, posts, categories] = await Promise.all([liveCatalog(), loadHistory(now), fetchCategories()]);
  const pick = pickProduct(catalog, posts, now);
  return pick ? describe(pick, posts, categories, now) : null;
}
