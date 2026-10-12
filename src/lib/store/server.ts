import { DEFAULT_STORE, type CatalogItem, type Promo, type StoreConfig } from '@/lib/types';

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

async function getDoc(path: string): Promise<Record<string, unknown> | null> {
  if (!PROJECT) return null;
  try {
    const res = await fetch(`${BASE}/${path}`, { next: { revalidate: STORE_REVALIDATE } });
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

function toItem(id: string, raw: Record<string, unknown>): CatalogItem {
  return {
    id,
    name: String(raw.name ?? ''),
    brand: (raw.brand as string) || undefined,
    category: raw.category === 'clothing' ? 'clothing' : 'shoes',
    price: Number(raw.price ?? 0),
    sizes: Array.isArray(raw.sizes) ? (raw.sizes as CatalogItem['sizes']) : [],
    description: (raw.description as string) || undefined,
    imageUrl: (raw.imageUrl as string) || null,
    thumbHash: String(raw.thumbHash ?? ''),
    listed: raw.listed === true,
    createdAtMs: Number(raw.createdAtMs ?? 0),
    lastSoldAtMs: Number(raw.lastSoldAtMs ?? 0),
  };
}

/** Everything currently for sale, newest first. */
export async function fetchCatalog(): Promise<CatalogItem[]> {
  const rows = await runQuery('catalog', [{ field: 'listed', value: true }]);
  return rows.map((r) => toItem(r.id, r.data)).sort((a, b) => b.createdAtMs - a.createdAtMs);
}

export async function fetchProduct(id: string): Promise<CatalogItem | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const raw = await getDoc(`catalog/${id}`);
  return raw ? toItem(id, raw) : null;
}

export async function fetchStoreConfig(): Promise<StoreConfig> {
  const raw = await getDoc('storefront/config');
  if (!raw) return DEFAULT_STORE;
  return { ...DEFAULT_STORE, ...(raw as Partial<StoreConfig>) };
}

/** The thumbnail data URI for a product, for the image route. */
export async function fetchThumb(id: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return null;
  const raw = await getDoc(`catalogThumbs/${id}`);
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
