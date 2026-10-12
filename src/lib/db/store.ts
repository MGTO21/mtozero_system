'use client';

import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { useEffect, useMemo, useRef, useState } from 'react';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { whatsappNumber } from '@/lib/format';
import { useLiveQuery } from '@/lib/hooks/useFirestore';
import { submitSale } from '@/lib/offline/operations';
import { settle, withTimeout } from '@/lib/offline/write';
import {
  DEFAULT_STORE,
  ORDER_STATUS_LABEL,
  type CatalogItem,
  type OrderItem,
  type OrderStatus,
  type Product,
  type StoreConfig,
  type StoreOrder,
  type StoreSizeState,
} from '@/lib/types';
import { makeThumbnail } from '@/lib/image';
import { hashString, mapCatalog, mapStoreConfig, safeHref } from '@/lib/store/model';
import { AppError, COL } from './collections';
import { logActivity } from './activity';
import { totalStock, useServerProducts } from './products';

export { hashString, mapCatalog, mapStoreConfig };
import { invoiceNumber } from './sale-math';

/* ---------- the public catalog ---------- */

/** Pieces at or below this read as "last pieces" to customers. */
const LAST_PIECES = 2;

function sizeState(qty: number): StoreSizeState {
  if (qty <= 0) return 'out';
  if (qty <= LAST_PIECES) return 'last';
  return 'in';
}

/**
 * What the public may know about a product. Built from the private record and
 * nothing else: no cost, supplier, lots, SKU or exact quantities ever leave
 * this function.
 */
export function toCatalog(p: Product): Omit<CatalogItem, 'id'> {
  const hasPicture = Boolean(p.thumbData || p.imageUrl);
  return {
    name: p.name,
    ...(p.brand ? { brand: p.brand } : {}),
    category: p.category,
    price: p.sellPrice,
    sizes: p.sizes.map((s) => ({ size: s.size, state: sizeState(s.qty) })),
    ...(p.description ? { description: p.description } : {}),
    imageUrl: p.imageUrl ?? null,
    thumbHash: p.thumbData ? hashString(p.thumbData) : '',
    listed: !p.isArchived && p.onStore !== false && totalStock(p) > 0 && hasPicture,
    createdAtMs: p.createdAt?.toMillis?.() ?? 0,
    lastSoldAtMs: p.lastSoldAt?.toMillis?.() ?? 0,
    compareAtPrice: p.compareAtPrice && p.compareAtPrice > p.sellPrice ? p.compareAtPrice : 0,
    featured: p.featured === true,
    badge: (p.storeBadge ?? '').trim().slice(0, 18),
    gallery: (p.gallery ?? []).map((g) => ({ id: g.id, hash: g.hash })),
    hdHash: p.hdHash ?? '',
  };
}

function sameCatalog(a: Omit<CatalogItem, 'id'>, b: CatalogItem): boolean {
  const { id: _id, ...rest } = b;
  void _id;
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(rest));
}

function normalize(item: Omit<CatalogItem, 'id'>) {
  return {
    name: item.name,
    brand: item.brand ?? '',
    category: item.category,
    price: item.price,
    sizes: item.sizes,
    description: item.description ?? '',
    imageUrl: item.imageUrl ?? null,
    thumbHash: item.thumbHash,
    listed: item.listed,
    createdAtMs: item.createdAtMs,
    lastSoldAtMs: item.lastSoldAtMs,
    compareAtPrice: item.compareAtPrice,
    featured: item.featured,
    badge: item.badge,
    gallery: item.gallery,
    hdHash: item.hdHash,
  };
}

/**
 * Keeps the public catalog in step with the stock, from any signed-in device.
 *
 * The store reads a public copy of each product because the real record holds
 * cost prices. There are no server functions on the free plan, so the copy is
 * maintained here: whenever a staff device has the app open, it compares the
 * products with the published catalog and writes only what differs. Every sale,
 * delivery and price edit shows on the website within seconds, and an idle day
 * costs no writes at all. It only acts on data confirmed by the server, never on
 * the offline cache, so a stale phone cannot publish stale stock.
 */
export function useCatalogPublisher(enabled: boolean) {
  const products = useServerProducts();
  const catalog = useLiveQuery<CatalogItem>(
    () => (enabled ? collection(db(), COL.catalog) : null),
    [enabled],
    mapCatalog,
  );
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!enabled || products.loading || catalog.loading) return;
    if (products.fromCache || catalog.fromCache || products.error || catalog.error) return;

    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      const published = new Map(catalog.data.map((c) => [c.id, c]));
      const batch = writeBatch(db());
      let writes = 0;

      for (const product of products.data) {
        const next = toCatalog(product);
        const current = published.get(product.id);
        // Never-listed products that still cannot be listed need no document.
        if (!current && !next.listed) continue;
        if (current && sameCatalog(next, current)) continue;
        batch.set(doc(db(), COL.catalog, product.id), next);
        writes++;
        if (product.thumbData && next.thumbHash !== current?.thumbHash) {
          batch.set(doc(db(), COL.catalogThumbs, product.id), { data: product.thumbData });
          writes++;
        }
        if (writes >= 400) break; // under Firestore's batch limit; the rest goes next round
      }

      if (writes > 0) void batch.commit().catch(() => undefined);
    }, 2500);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [enabled, products.data, products.loading, products.fromCache, products.error, catalog.data, catalog.loading, catalog.fromCache, catalog.error]);
}

/* ---------- the shop logo, in public ---------- */

/**
 * The logo the owner uploaded for invoices lives in settings, which only staff
 * can read. The website, search engines and link previews need it too, so the
 * owner's device keeps a public copy in storefront/logo — the same "publish
 * from a signed-in device" approach as the catalog, with no server functions.
 */
export function useLogoPublisher(enabled: boolean, logoData: string | null, settingsLoading: boolean) {
  useEffect(() => {
    if (!enabled || settingsLoading || !isFirebaseConfigured) return;
    const ref = doc(db(), COL.storefront, 'logo');
    const unsubscribe = onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) => {
        // Only compare against what the server holds, never the offline cache.
        if (snap.metadata.fromCache) return;
        const want = logoData ? hashString(logoData) : '';
        const have = snap.exists() ? String(snap.data().hash ?? '') : '';
        if (want === have) return;
        void setDoc(ref, { data: logoData ?? '', hash: want, updatedAt: serverTimestamp() }).catch(() => undefined);
      },
      () => undefined,
    );
    return unsubscribe;
  }, [enabled, logoData, settingsLoading]);
}

/** The public logo for screens anyone can open (login, customer card…). */
export function useShopLogo(): string | null {
  const [logo, setLogo] = useState<string | null>(null);
  useEffect(() => {
    if (!isFirebaseConfigured) return;
    return onSnapshot(
      doc(db(), COL.storefront, 'logo'),
      (snap) => setLogo(snap.exists() && snap.data().data ? String(snap.data().data) : null),
      () => undefined,
    );
  }, []);
  return logo;
}

/* ---------- store settings ---------- */

export function useStoreConfig(): { config: StoreConfig; loading: boolean } {
  const [config, setConfig] = useState<StoreConfig>(DEFAULT_STORE);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    return onSnapshot(
      doc(db(), COL.storefront, 'config'),
      (snap) => {
        setConfig(mapStoreConfig(snap.exists() ? snap.data() : undefined));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);
  return { config, loading };
}

export async function saveStoreConfig(config: StoreConfig, actor: { uid: string; name: string }): Promise<void> {
  const phone = whatsappNumber(config.whatsapp);
  if (!phone) throw new AppError('رقم واتساب المتجر مطلوب — الطلبات بتجي عليهو.');
  if (config.deliveryFee < 0 || config.freeDeliveryOver < 0) throw new AppError('الأرقام لا تكون سالبة.');
  for (const b of config.banners) {
    if (!b.imageHash) throw new AppError('في بانر بدون صورة — أضف صورة أو احذفه.');
  }
  // Round-trip through the mapper so only known fields, in sane sizes, are stored.
  const clean = mapStoreConfig({
    ...config,
    whatsapp: phone,
    announcements: config.announcements.map((a) => a.trim()).filter(Boolean),
    banners: config.banners.map((b) => ({ ...b, href: safeHref(b.href) })),
  });
  await settle(setDoc(doc(db(), COL.storefront, 'config'), { ...clean, updatedAt: serverTimestamp() }));
  await logActivity(actor, 'edited_settings', 'حدّث واجهة المتجر الإلكتروني');
}

/** Wide, sharp enough for a full-width phone banner, small enough for one document. */
const BANNER_IMAGE = { maxDim: 1600, maxBytes: 260 * 1024 };

/**
 * Stores a banner picture. Pictures live in their own storefront/banner_{id}
 * document — publicly readable like the rest of storefront, and kept out of the
 * config document so the settings stay small. Returns the hash for the URL.
 */
export async function saveBannerImage(bannerId: string, file: File): Promise<string> {
  const { dataUrl } = await makeThumbnail(file, BANNER_IMAGE);
  await settle(setDoc(doc(db(), COL.storefront, `banner_${bannerId}`), { data: dataUrl, updatedAt: serverTimestamp() }));
  return hashString(dataUrl);
}

/** Empties a removed banner's picture document so it stops taking space. */
export async function clearBannerImage(bannerId: string): Promise<void> {
  await settle(setDoc(doc(db(), COL.storefront, `banner_${bannerId}`), { data: '' }));
}

/** Delivery charge for a basket, by the store's rule. */
export function deliveryFeeFor(config: StoreConfig, subtotal: number, fulfilment: 'delivery' | 'pickup'): number {
  if (fulfilment === 'pickup') return 0;
  if (config.freeDeliveryOver > 0 && subtotal >= config.freeDeliveryOver) return 0;
  return config.deliveryFee;
}

/* ---------- orders ---------- */

export function mapOrder(id: string, raw: Record<string, unknown>): StoreOrder {
  const customer = (raw.customer ?? {}) as Record<string, unknown>;
  return {
    id,
    number: String(raw.number ?? invoiceNumber(id)),
    status: (raw.status as OrderStatus) ?? 'new',
    items: Array.isArray(raw.items) ? (raw.items as OrderItem[]) : [],
    subtotal: Number(raw.subtotal ?? 0),
    deliveryFee: Number(raw.deliveryFee ?? 0),
    total: Number(raw.total ?? 0),
    promoCode: String(raw.promoCode ?? ''),
    fulfilment: raw.fulfilment === 'pickup' ? 'pickup' : 'delivery',
    customer: {
      name: String(customer.name ?? ''),
      phone: String(customer.phone ?? ''),
      area: String(customer.area ?? ''),
      address: String(customer.address ?? ''),
      notes: String(customer.notes ?? ''),
    },
    createdAt: (raw.createdAt as Timestamp) ?? null,
    statusAt: (raw.statusAt as Timestamp) ?? null,
    handledByName: (raw.handledByName as string) || undefined,
    saleId: (raw.saleId as string) || undefined,
    cancelReason: (raw.cancelReason as string) || undefined,
  };
}

export interface OrderInput {
  items: OrderItem[];
  fulfilment: 'delivery' | 'pickup';
  promoCode: string;
  customer: StoreOrder['customer'];
}

/**
 * Places an order from the website. The visitor is not signed in; the rules
 * accept a new order only in a strict shape. Prices are what the customer saw —
 * the shop confirms against current stock and prices before delivering.
 */
export async function placeOrder(input: OrderInput, config: StoreConfig): Promise<StoreOrder> {
  if (!config.acceptingOrders) throw new AppError('الطلبات متوقفة مؤقتاً — تواصل معنا واتساب.');
  if (input.items.length === 0) throw new AppError('السلة فاضية.');
  if (input.customer.name.trim().length < 2) throw new AppError('اكتب اسمك.');
  const phone = whatsappNumber(input.customer.phone);
  if (!phone || phone.length < 12) throw new AppError('اكتب رقم هاتف صحيح عشان نتواصل معاك.');
  if (input.fulfilment === 'delivery' && input.customer.address.trim().length < 4)
    throw new AppError('اكتب عنوان التوصيل بالتفصيل.');

  const subtotal = input.items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const deliveryFee = deliveryFeeFor(config, subtotal, input.fulfilment);
  const ref = doc(collection(db(), COL.orders));
  const order = {
    number: invoiceNumber(ref.id),
    status: 'new' as const,
    items: input.items.map((i) => ({ ...i, qty: Math.floor(i.qty) })),
    subtotal,
    deliveryFee,
    total: subtotal + deliveryFee,
    promoCode: input.promoCode.trim().toUpperCase(),
    fulfilment: input.fulfilment,
    customer: {
      name: input.customer.name.trim().slice(0, 80),
      phone,
      area: input.customer.area.trim().slice(0, 80),
      address: input.customer.address.trim().slice(0, 300),
      notes: input.customer.notes.trim().slice(0, 300),
    },
    createdAt: serverTimestamp(),
  };

  try {
    await withTimeout(setDoc(ref, order), 15000);
  } catch {
    throw new AppError('ما قدرنا نرسل الطلب — اتأكد من الشبكة وجرّب تاني.');
  }
  return mapOrder(ref.id, { ...order, createdAt: Timestamp.now() });
}

/** The WhatsApp message the customer sends the shop, with every detail. */
export function orderWhatsappText(order: StoreOrder, trackUrl: string): string {
  const lines = [`طلب جديد من الموقع — رقم ${order.number}`, ''];
  for (const i of order.items) {
    lines.push(`• ${i.name} — مقاس ${i.size} × ${i.qty} = ${(i.price * i.qty).toLocaleString('en-US')} ج`);
  }
  lines.push('', `المجموع: ${order.subtotal.toLocaleString('en-US')} ج`);
  if (order.fulfilment === 'delivery')
    lines.push(`التوصيل: ${order.deliveryFee > 0 ? `${order.deliveryFee.toLocaleString('en-US')} ج` : 'مجاني'}`);
  lines.push(`الإجمالي: ${order.total.toLocaleString('en-US')} ج — الدفع عند الاستلام`);
  if (order.promoCode) lines.push(`كود الخصم: ${order.promoCode}`);
  lines.push('', `الاسم: ${order.customer.name}`, `الهاتف: ${order.customer.phone}`);
  if (order.fulfilment === 'delivery') {
    lines.push(`المنطقة: ${order.customer.area}`, `العنوان: ${order.customer.address}`);
  } else {
    lines.push('الاستلام: من المحل');
  }
  if (order.customer.notes) lines.push(`ملاحظات: ${order.customer.notes}`);
  lines.push('', `تتبع الطلب: ${trackUrl}`);
  return lines.join('\n');
}

/** One order, live — the customer's tracking page and the staff detail sheet. */
export function useOrder(id: string | null): { order: StoreOrder | null; loading: boolean } {
  const [order, setOrder] = useState<StoreOrder | null>(null);
  const [loading, setLoading] = useState(Boolean(id));
  useEffect(() => {
    if (!id || !isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    return onSnapshot(
      doc(db(), COL.orders, id),
      (snap) => {
        setOrder(snap.exists() ? mapOrder(snap.id, snap.data()) : null);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, [id]);
  return { order, loading };
}

export function useOrders() {
  return useLiveQuery<StoreOrder>(
    () => query(collection(db(), COL.orders), orderBy('createdAt', 'desc'), limit(300)),
    [],
    mapOrder,
  );
}

/** New orders waiting for someone — for badges and the dashboard. */
export function useNewOrderCount(): number {
  const state = useLiveQuery<StoreOrder>(
    () => query(collection(db(), COL.orders), where('status', '==', 'new')),
    [],
    mapOrder,
  );
  return useMemo(() => state.data.length, [state.data]);
}

export async function setOrderStatus(
  order: StoreOrder,
  status: OrderStatus,
  actor: { uid: string; name: string },
  extra: { cancelReason?: string; saleId?: string } = {},
): Promise<void> {
  await settle(
    updateDoc(doc(db(), COL.orders, order.id), {
      status,
      statusAt: serverTimestamp(),
      handledByName: actor.name,
      ...(extra.cancelReason ? { cancelReason: extra.cancelReason } : {}),
      ...(extra.saleId ? { saleId: extra.saleId } : {}),
    }),
  );
  await logActivity(
    actor,
    'store_order',
    `الطلب ${order.number} — ${order.customer.name}: ${ORDER_STATUS_LABEL[status]}` +
      (extra.cancelReason ? ` (${extra.cancelReason})` : ''),
  );
}

/**
 * Hands an order over: records the sale through the normal sale path — stock
 * leaves in the same transaction, the customer joins the customer list — then
 * marks the order delivered with the sale it became. Works offline like any
 * sale; the order is marked once the sale is recorded or queued.
 */
export async function deliverOrder(
  order: StoreOrder,
  products: Product[],
  payment: { status: 'paid' | 'debt'; referralReward: number },
  actor: { uid: string; name: string },
): Promise<{ saleId: string; queued: boolean }> {
  const cart = order.items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    if (!product) throw new AppError(`المنتج "${item.name}" ما موجود في المخزون.`);
    return { product, size: item.size, qty: item.qty, sellPrice: item.price };
  });

  const result = await submitSale(
    {
      cart,
      customerName: order.customer.name,
      customerPhone: order.customer.phone,
      referredByCode: '',
      creditUsed: 0,
      promoCode: order.promoCode,
      // The transaction re-checks the code; the screen does not pre-compute it here.
      promoDiscount: 0,
      paymentStatus: payment.status,
      amountPaid: 0,
      channel: 'website',
      note: `طلب الموقع ${order.number}${order.deliveryFee > 0 ? ` — رسوم توصيل ${order.deliveryFee} ج` : ''}`,
      referralReward: payment.referralReward,
    },
    actor,
  );

  await setOrderStatus(order, 'delivered', actor, { saleId: result.id });
  return { saleId: result.id, queued: result.queued };
}
