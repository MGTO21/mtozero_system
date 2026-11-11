import type { CatalogItem } from '@/lib/types';

/**
 * Which product the Facebook page posts today. Pure: the catalog and the recent
 * post history go in, one decision comes out — the same inputs always give the
 * same product, so Make can ask twice and get the same answer until the post is
 * recorded.
 *
 * Reads only the public catalog: no cost, supplier or quantities ever reach a post.
 */

export type SocialKind = 'new' | 'last' | 'spotlight';

export const SOCIAL_KINDS: readonly SocialKind[] = ['new', 'last', 'spotlight'];

export interface SocialPost {
  productId: string;
  kind: SocialKind;
  fbPostId: string;
  /** Caption bank template id ("new-3"); empty for posts made before the bank. */
  templateId: string;
  /** Index into the bank's questions, -1 when none was used. */
  questionIndex: number;
  /** Index into the bank's hashtag lines, -1 when none was used. */
  hashtagIndex: number;
  /** familyKey of the product's name when it went out — it may be gone from the catalog since. */
  family: string;
  postedAtMs: number;
}

export interface SocialPick {
  item: CatalogItem;
  kind: SocialKind;
  /** Sizes still in stock, in the order the product lists them. */
  sizes: string[];
}

const DAY = 24 * 60 * 60 * 1000;

/** A product counts as a new arrival this long after it was added. */
export const NEW_DAYS = 14;
/** A "last pieces" product may come back after this long. */
export const LAST_REPEAT_DAYS = 10;
/** Any other product may come back after this long. */
export const SPOTLIGHT_REPEAT_DAYS = 14;
/** How far back the history is read; covers every window above. */
export const HISTORY_DAYS = 30;

export function inStockSizes(item: CatalogItem): string[] {
  return item.sizes.filter((s) => s.state !== 'out').map((s) => s.size);
}

/** Sizes down to their last pieces — the only ones a caption may call scarce. */
export function lastSizes(item: CatalogItem): string[] {
  return item.sizes.filter((s) => s.state === 'last').map((s) => s.size);
}

function hasPicture(item: CatalogItem): boolean {
  return Boolean(item.imageUrl || item.hdHash || item.thumbHash);
}

/** Has a picture big enough for the 1080px post; the bare thumbnail comes out soft. */
export function hasSharpPicture(item: Pick<CatalogItem, 'imageUrl' | 'hdHash'>): boolean {
  return Boolean(item.imageUrl || item.hdHash);
}

/** Within each tier, a product with a sharp picture goes out before one without. */
const sharpFirst = (a: CatalogItem, b: CatalogItem) => Number(hasSharpPicture(b)) - Number(hasSharpPicture(a));

/**
 * Products that differ only by colour, size or a number ("قميص كاروهات أزرق",
 * "قميص كاروهات 2") share a family, so a run of near-identical stock cannot fill
 * the page for a week. Letter variants are folded first so spelling differences
 * do not split one family.
 */
export function familyKey(name: string): string {
  const words = name
    .toLowerCase()
    .replace(/[ً-ْـ]/g, '') // harakat and tatweel
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[0-9٠-٩]+/g, ' ')
    .replace(/[^\p{L}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  return words.slice(0, 2).join(' ');
}

/** Each product's most recent post time within the history. */
function lastPostTimes(posts: SocialPost[]): Map<string, number> {
  const times = new Map<string, number>();
  for (const p of posts) times.set(p.productId, Math.max(times.get(p.productId) ?? 0, p.postedAtMs));
  return times;
}

const byId = (a: CatalogItem, b: CatalogItem) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);

export function pickProduct(catalog: CatalogItem[], posts: SocialPost[], now = Date.now()): SocialPick | null {
  const lastPost = lastPostTimes(posts);
  const latest = [...posts].sort((a, b) => b.postedAtMs - a.postedAtMs)[0];
  // "Consecutive days": only the most recent post blocks its family, and only
  // while it is from the last two days.
  const blockedFamily =
    latest && now - latest.postedAtMs < 2 * DAY
      ? latest.family || familyKey(catalog.find((c) => c.id === latest.productId)?.name ?? '')
      : '';

  const candidates = catalog.filter(
    (item) =>
      item.listed &&
      item.socialExclude !== true &&
      hasPicture(item) &&
      inStockSizes(item).length > 0 &&
      (!blockedFamily || familyKey(item.name) !== blockedFamily),
  );

  const postedWithin = (item: CatalogItem, days: number) => now - (lastPost.get(item.id) ?? 0) < days * DAY;
  const done = (item: CatalogItem, kind: SocialKind): SocialPick => ({ item, kind, sizes: inStockSizes(item) });

  // 1. New arrivals never posted. Oldest first, so none ages out of the window unposted.
  const fresh = candidates
    .filter((c) => c.createdAtMs > 0 && now - c.createdAtMs < NEW_DAYS * DAY && !lastPost.has(c.id))
    .sort((a, b) => sharpFirst(a, b) || a.createdAtMs - b.createdAtMs || byId(a, b));
  if (fresh[0]) return done(fresh[0], 'new');

  // 2. Down to the last pieces. The ones that are selling first.
  const last = candidates
    .filter((c) => (inStockSizes(c).length === 1 || lastSizes(c).length > 0) && !postedWithin(c, LAST_REPEAT_DAYS))
    .sort((a, b) => sharpFirst(a, b) || b.lastSoldAtMs - a.lastSoldAtMs || byId(a, b));
  if (last[0]) return done(last[0], 'last');

  // 3. Spotlight: the owner's picks, then what sells, then what waited longest.
  const spotlight = candidates
    .filter((c) => !postedWithin(c, SPOTLIGHT_REPEAT_DAYS))
    .sort(
      (a, b) =>
        sharpFirst(a, b) ||
        Number(b.featured) - Number(a.featured) ||
        b.lastSoldAtMs - a.lastSoldAtMs ||
        (lastPost.get(a.id) ?? 0) - (lastPost.get(b.id) ?? 0) ||
        byId(a, b),
    );
  if (spotlight[0]) return done(spotlight[0], 'spotlight');

  return null;
}
