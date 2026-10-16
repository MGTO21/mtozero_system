import {
  DEFAULT_SECTIONS,
  DEFAULT_STORE,
  HOME_SECTION_LABEL,
  MAX_GALLERY,
  type CatalogItem,
  type ProductPhoto,
  type HomeSection,
  type HomeSectionType,
  type StoreBanner,
  type StoreConfig,
} from '@/lib/types';

/**
 * Pure mapping for the public store, shared by the server pages (Firestore REST)
 * and the staff app (Firestore SDK). Neither side trusts the stored shape: a
 * field written by an older version, or missing, falls back to the default
 * instead of breaking the page.
 */

export function mapCatalog(id: string, raw: Record<string, unknown>): CatalogItem {
  const price = Number(raw.price ?? 0);
  const compareAt = Number(raw.compareAtPrice ?? 0);
  return {
    id,
    name: String(raw.name ?? ''),
    brand: (raw.brand as string) || undefined,
    category: raw.category === 'clothing' ? 'clothing' : 'shoes',
    price,
    sizes: Array.isArray(raw.sizes) ? (raw.sizes as CatalogItem['sizes']) : [],
    description: (raw.description as string) || undefined,
    imageUrl: (raw.imageUrl as string) || null,
    thumbHash: String(raw.thumbHash ?? ''),
    listed: raw.listed === true,
    createdAtMs: Number(raw.createdAtMs ?? 0),
    lastSoldAtMs: Number(raw.lastSoldAtMs ?? 0),
    compareAtPrice: compareAt > price ? compareAt : 0,
    featured: raw.featured === true,
    badge: typeof raw.badge === 'string' ? raw.badge.slice(0, 18) : '',
    gallery: mapGallery(raw.gallery),
    hdHash: typeof raw.hdHash === 'string' ? raw.hdHash : '',
  };
}

export function mapGallery(raw: unknown): ProductPhoto[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[])
    .filter((g) => g && typeof g.id === 'string' && /^[A-Za-z0-9]{1,24}$/.test(g.id))
    .slice(0, MAX_GALLERY)
    .map((g) => ({ id: String(g.id), hash: String(g.hash ?? '') }));
}

const SECTION_TYPES = new Set(Object.keys(HOME_SECTION_LABEL));

/**
 * The owner's section order, plus any section type added in a later version
 * (appended, enabled) — so a new block shows up without anyone re-saving.
 */
function mapSections(raw: unknown): HomeSection[] {
  if (!Array.isArray(raw)) return DEFAULT_SECTIONS;
  const seen = new Set<string>();
  const out: HomeSection[] = [];
  for (const r of raw as Record<string, unknown>[]) {
    const type = String(r?.type ?? '');
    if (!SECTION_TYPES.has(type) || seen.has(type)) continue;
    seen.add(type);
    out.push({ type: type as HomeSectionType, enabled: r.enabled !== false, title: String(r.title ?? '').slice(0, 60) });
  }
  for (const d of DEFAULT_SECTIONS) if (!seen.has(d.type)) out.push(d);
  return out;
}

function mapBanners(raw: unknown): StoreBanner[] {
  if (!Array.isArray(raw)) return [];
  return (raw as Record<string, unknown>[])
    .filter((b) => b && typeof b.id === 'string' && /^[A-Za-z0-9_-]{1,40}$/.test(b.id))
    .slice(0, 8)
    .map((b) => ({
      id: String(b.id),
      title: String(b.title ?? ''),
      subtitle: String(b.subtitle ?? ''),
      cta: String(b.cta ?? ''),
      href: safeHref(String(b.href ?? '/shop')),
      imageHash: String(b.imageHash ?? ''),
      tone: b.tone === 'dark' ? 'dark' : 'light',
    }));
}

const str = (v: unknown, fallback: string) => (typeof v === 'string' ? v : fallback);

export function mapStoreConfig(raw: Record<string, unknown> | null | undefined): StoreConfig {
  const r = raw ?? {};
  return {
    shopName: str(r.shopName, DEFAULT_STORE.shopName),
    tagline: str(r.tagline, DEFAULT_STORE.tagline),
    whatsapp: str(r.whatsapp, DEFAULT_STORE.whatsapp),
    address: str(r.address, DEFAULT_STORE.address),
    deliveryFee: Number(r.deliveryFee ?? DEFAULT_STORE.deliveryFee),
    freeDeliveryOver: Number(r.freeDeliveryOver ?? DEFAULT_STORE.freeDeliveryOver),
    pickupEnabled: r.pickupEnabled !== false,
    heroTitle: str(r.heroTitle, DEFAULT_STORE.heroTitle),
    heroSubtitle: str(r.heroSubtitle, DEFAULT_STORE.heroSubtitle),
    about: str(r.about, DEFAULT_STORE.about),
    returnPolicy: str(r.returnPolicy, DEFAULT_STORE.returnPolicy),
    acceptingOrders: r.acceptingOrders !== false,
    look: r.look === 'luxe' ? 'luxe' : 'light',
    lookToggle: r.lookToggle !== false,
    announcements: Array.isArray(r.announcements)
      ? (r.announcements as unknown[]).map((a) => String(a ?? '').trim()).filter(Boolean).slice(0, 6)
      : [],
    sections: mapSections(r.sections),
    banners: mapBanners(r.banners),
    newDays: Math.max(0, Number(r.newDays ?? DEFAULT_STORE.newDays) || 0),
    instagram: str(r.instagram, ''),
    facebook: str(r.facebook, ''),
    tiktok: str(r.tiktok, ''),
    sizeGuideShoes: str(r.sizeGuideShoes, DEFAULT_STORE.sizeGuideShoes).slice(0, 1200),
    sizeGuideClothing: str(r.sizeGuideClothing, DEFAULT_STORE.sizeGuideClothing).slice(0, 1200),
  };
}

/**
 * Banner and announcement links are typed by the owner. Only paths on this site
 * or plain https links are followed — never javascript: or data: URLs.
 */
export function safeHref(href: string): string {
  const h = href.trim();
  if (h.startsWith('/') && !h.startsWith('//')) return h;
  if (/^https:\/\/[^\s]+$/i.test(h)) return h;
  return '/shop';
}

/** Link to a social profile: accepts a full URL or a bare handle. */
export function socialUrl(kind: 'instagram' | 'facebook' | 'tiktok', value: string): string | null {
  const v = value.trim();
  if (!v) return null;
  if (/^https:\/\//i.test(v)) return v;
  const handle = v.replace(/^@/, '').replace(/[^A-Za-z0-9._-]/g, '');
  if (!handle) return null;
  if (kind === 'instagram') return `https://instagram.com/${handle}`;
  if (kind === 'facebook') return `https://facebook.com/${handle}`;
  return `https://www.tiktok.com/@${handle}`;
}

export function isNewArrival(item: CatalogItem, newDays: number, now = Date.now()): boolean {
  return newDays > 0 && item.createdAtMs > 0 && now - item.createdAtMs < newDays * 86_400_000;
}

/** Whole-percent discount, for the "-20%" tag. */
export function salePercent(item: Pick<CatalogItem, 'price' | 'compareAtPrice'>): number {
  if (!item.compareAtPrice || item.compareAtPrice <= item.price) return 0;
  return Math.round((1 - item.price / item.compareAtPrice) * 100);
}

export function bannerImagePath(banner: Pick<StoreBanner, 'id' | 'imageHash'>): string {
  return `/banner/${banner.id}?v=${banner.imageHash}`;
}

/** Sizes in natural order: numbers numerically, letters by the usual run. */
const LETTER_ORDER = ['XXS', 'XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL', '3XL', '4XL'];
export function compareSizes(a: string, b: string): number {
  const na = Number(a);
  const nb = Number(b);
  if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
  const la = LETTER_ORDER.indexOf(a.toUpperCase());
  const lb = LETTER_ORDER.indexOf(b.toUpperCase());
  if (la !== -1 && lb !== -1) return la - lb;
  return a.localeCompare(b, 'ar');
}

/** The delivery rule as one line, for the top bar and the product page. */
export function deliveryLine(config: Pick<StoreConfig, 'freeDeliveryOver'>, money: (n: number) => string): string {
  return config.freeDeliveryOver > 0
    ? `توصيل مجاني للطلبات فوق ${money(config.freeDeliveryOver)} · الدفع عند الاستلام`
    : 'الدفع عند الاستلام';
}

/** Small, stable string hash — enough to notice a thumbnail changed. */
export function hashString(text: string): string {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}
