import { createHash, timingSafeEqual } from 'node:crypto';
import { fetchCatalog } from '@/lib/store/server';
import { siteUrl } from '@/lib/store/site';
import type { CatalogItem } from '@/lib/types';
import { recentPosts } from './admin';
import { buildCaption, nextTemplateIndex } from './captions';
import { HISTORY_DAYS, pickProduct, type SocialKind, type SocialPick, type SocialPost } from './pick';

/** Shared-secret check for the Make.com routes. Constant time; no key configured means locked. */
export function authorized(req: Request): boolean {
  const expected = process.env.SOCIAL_FEED_KEY ?? '';
  const given = req.headers.get('x-social-key') ?? '';
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
}

export async function loadHistory(now = Date.now()): Promise<SocialPost[]> {
  return recentPosts(now - HISTORY_DAYS * 24 * 60 * 60 * 1000);
}

/** Live catalog — the cached store read could be a minute behind a sale. */
export async function liveCatalog(): Promise<CatalogItem[]> {
  return fetchCatalog(true);
}

export function describe(pick: SocialPick, posts: SocialPost[]): NextProduct {
  const site = siteUrl();
  const { item, kind, sizes } = pick;
  const productUrl = `${site}/p/${item.id}`;
  return {
    productId: item.id,
    kind,
    name: item.name,
    price: item.price,
    sizes,
    caption: buildCaption(kind, item, sizes, nextTemplateIndex(kind, posts), productUrl),
    imageUrl: `${site}/api/social/card/${item.id}?kind=${kind}&v=${cardVersion(item, kind, sizes)}`,
    productUrl,
  };
}

export async function nextProduct(now = Date.now()): Promise<NextProduct | null> {
  const [catalog, posts] = await Promise.all([liveCatalog(), loadHistory(now)]);
  const pick = pickProduct(catalog, posts, now);
  return pick ? describe(pick, posts) : null;
}
