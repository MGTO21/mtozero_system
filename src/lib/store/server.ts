import { mapCatalog, mapCategories, mapStoreConfig } from '@/lib/store/model';
import { DEFAULT_STORE, type CatalogItem, type CategoryDef, type Promo, type StoreConfig } from '@/lib/types';

/**
 * Server-side reads for the public website, over Firestore's REST API.
 *
 * The store pages are rendered on the server so they load fast on a weak
 * connection, show up in search, and unfurl with picture, name and price when a
 * link is shared on WhatsApp or Facebook. Only public collections are read here
 * (catalog, catalogThumbs, storefront, public promos) — the same rules that
 * guard the app guard these requests, with no credentials at all.
 */

const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

/** Seconds a rendered store page may be served before it is refreshed. */
export const STORE_REVALIDATE = 60;

type RestValue = {
  stringValue?: string;
  integerValue?: string;
  doubleValue?: number;
  booleanValue?: boolean;
  nullValue?: null;
  timestampValue?: string;
  arrayValue?: { values?: RestValue[] };
  mapValue?: { fields?: Record<string, RestValue> };
};

function decode(v: RestValue): unknown {
  if ('stringValue' in v) return v.stringValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('booleanValue' in v) return v.booleanValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue ?? '');
  if ('arrayValue' in v) return (v.arrayValue?.values ?? []).map(decode);
  if ('mapValue' in v) return decodeFields(v.mapValue?.fields ?? {});
  return null;
}

function decodeFields(fields: Record<string, RestValue>): Record<string, unknown> {
  return Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, decode(v)]));
}

function idOf(name: string): string {
  return name.slice(name.lastIndexOf('/') + 1);
}

async function getDoc(path: string, fresh = false): Promise<Record<string, unknown> | null> {
  if (!PROJECT) return null;
  try {
    const res = await fetch(`${BASE}/${path}`, fresh ? { cache: 'no-store' } : { next: { revalidate: STORE_REVALIDATE } });
    if (!res.ok) return null;
    const json = (await res.json()) as { fields?: Record<string, RestValue> };
    return decodeFields(json.fields ?? {});
  } catch {
    return null;
  }
}

async function runQuery(
  collectionId: string,
  filters: { field: string; value: boolean }[],
): Promise<{ id: string; data: Record<string, unknown> }[]> {
  if (!PROJECT) return [];
  const where =
    filters.length === 1
      ? { fieldFilter: { field: { fieldPath: filters[0]!.field }, op: 'EQUAL', value: { booleanValue: filters[0]!.value } } }
      : {
          compositeFilter: {
            op: 'AND',
            filters: filters.map((f) => ({
              fieldFilter: { field: { fieldPath: f.field }, op: 'EQUAL', value: { booleanValue: f.value } },
            })),
          },
        };
  try {
    const res = await fetch(`${BASE}:runQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ structuredQuery: { from: [{ collectionId }], where } }),
      next: { revalidate: STORE_REVALIDATE },
    });
    if (!res.ok) return [];
    const rows = (await res.json()) as { document?: { name: string; fields?: Record<string, RestValue> } }[];
    return rows
      .filter((r) => r.document)
      .map((r) => ({ id: idOf(r.document!.name), data: decodeFields(r.document!.fields ?? {}) }));
  } catch {
    return [];
  }
}

/** Everything currently for sale, newest first. */
export async function fetchCatalog(): Promise<CatalogItem[]> {
  const rows = await runQuery('catalog', [{ field: 'listed', value: true }]);
  return rows.map((r) => mapCatalog(r.id, r.data)).sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export async function fetchProduct(id: string): Promise<CatalogItem | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const raw = await getDoc(`catalog/${id}`);
  return raw ? mapCatalog(id, raw) : null;
}

export async function fetchStoreConfig(): Promise<StoreConfig> {
  const raw = await getDoc('storefront/config');
  return raw ? mapStoreConfig(raw) : DEFAULT_STORE;
}

/** A home-page banner picture as a data URI, for the banner route. */
export async function fetchBannerImage(id: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return null;
  // Fresh read: the URL carries the picture's hash and the response is cached
  // under it, so a cached read here would pin a replaced picture to the new URL.
  const raw = await getDoc(`storefront/banner_${id}`, true);
  return raw && typeof raw.data === 'string' && raw.data ? raw.data : null;
}

/** The thumbnail data URI for a product, for the image route. */
export async function fetchThumb(id: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  // Fresh read: the /img URL carries the picture's hash and the CDN caches the
  // response under it, so a cached read here could pin an old picture to a new URL.
  const raw = await getDoc(`catalogThumbs/${id}`, true);
  return raw && typeof raw.data === 'string' ? raw.data : null;
}

export type PublicOffer = Pick<Promo, 'code' | 'name' | 'kind' | 'value' | 'maxDiscount' | 'minTotal'> & {
  expiresAtMs: number | null;
};

/** Offers the owner chose to advertise, still running. */
export async function fetchOffers(): Promise<PublicOffer[]> {
  const rows = await runQuery('promos', [
    { field: 'public', value: true },
    { field: 'active', value: true },
  ]);
  const now = Date.now();
  return rows
    .map((r) => ({
      code: String(r.data.code ?? r.id),
      name: String(r.data.name ?? ''),
      kind: (r.data.kind as Promo['kind']) ?? 'fixed',
      value: Number(r.data.value ?? 0),
      maxDiscount: Number(r.data.maxDiscount ?? 0),
      minTotal: Number(r.data.minTotal ?? 0),
      expiresAtMs: typeof r.data.expiresAt === 'number' ? (r.data.expiresAt as number) : null,
    }))
    .filter((o) => o.kind !== 'gift' && (o.expiresAtMs === null || o.expiresAtMs > now));
}

/**
 * The shop logo (public copy of the invoice logo), or null before one is
 * uploaded. `fresh` for the image routes, cached for page metadata.
 */
export async function fetchLogo(fresh = false): Promise<{ data: string; hash: string } | null> {
  const raw = await getDoc('storefront/logo', fresh);
  if (!raw || typeof raw.data !== 'string' || !raw.data) return null;
  return { data: raw.data, hash: String(raw.hash ?? '') };
}

/** The owner's categories (the two built-ins at least). */
export async function fetchCategories(): Promise<CategoryDef[]> {
  return mapCategories(await getDoc('storefront/categories'));
}
