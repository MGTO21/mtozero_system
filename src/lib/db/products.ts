'use client';

import {
  collection,
  doc,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';
import { useMemo } from 'react';
import { db } from '@/lib/firebase';
import { cloudinaryEnabled, uploadFullImage } from '@/lib/cloudinary';
import { makeThumbnail } from '@/lib/image';
import type { Product, SizeInput, SizeStock } from '@/lib/types';
import { useLiveQuery } from '@/lib/hooks/useFirestore';
import { useOutbox } from '@/lib/offline/outbox';
import { applyPendingToProducts } from '@/lib/offline/overlay';
import { probablyOnline, settle, withTimeout } from '@/lib/offline/write';
import { AppError, COL } from './collections';
import { logActivity } from './activity';
import { applyManualQty, reconcileSize } from './sale-math';

// The lot arithmetic lives in sale-math.ts so the offline overlay can share it;
// it is re-exported here because this is where stock code has always looked.
export { applyManualQty, reconcileSize, sizeAverageCost } from './sale-math';

/**
 * Turns a stored product document's `sizes` into guaranteed lot form.
 *
 * Products created before lot tracking carry a bare `qty` with no `lots`. Passing
 * such a row straight to `reconcileSize` rebuilds `qty` from an empty lot list and
 * so silently deletes the stock. Every path that reads `sizes` out of Firestore and
 * writes them back — selling, returning, receiving a shipment, a stock-take — must
 * come through here first, including for the sizes it is not touching, because the
 * whole array is rewritten on every update.
 */
export function normalizeStoredSizes(raw: Record<string, unknown>): SizeStock[] {
  const sizes = Array.isArray(raw.sizes) ? (raw.sizes as SizeStock[]) : [];
  const fallbackCost = Math.max(0, Number(raw.costPrice ?? 0));
  const createdMillis = (raw.createdAt as Timestamp)?.toMillis?.() ?? 0;

  return sizes
    .filter((s) => s && typeof s.size === 'string')
    .map((s) => {
      const qty = Math.max(0, Math.floor(Number(s.qty ?? 0)));
      // No lots recorded: treat the whole on-hand count as one unattributed batch
      // so the stock survives the round trip and stays sellable.
      const lots =
        Array.isArray(s.lots) && s.lots.length > 0
          ? s.lots
          : qty > 0
            ? [{ shipmentId: null, qty, costPrice: fallbackCost, receivedAt: createdMillis }]
            : [];
      return reconcileSize({ size: String(s.size), qty, lots });
    });
}

/**
 * Receiving, stock-takes and quantity edits append to a product rather than
 * creating a document of their own, so they cannot use "does the record exist"
 * to detect a repeat. Instead each product remembers the last few operation ids
 * applied to it. A replay from the offline queue that finds its id here has
 * already landed and is skipped — without this, a retry after a lost
 * acknowledgement would add the same delivery twice.
 */
const APPLIED_LIMIT = 40;

export function wasApplied(raw: Record<string, unknown>, opId: string): boolean {
  return Array.isArray(raw.appliedOps) && (raw.appliedOps as unknown[]).includes(opId);
}

export function markApplied(raw: Record<string, unknown>, opId: string): string[] {
  const previous = Array.isArray(raw.appliedOps) ? (raw.appliedOps as string[]) : [];
  return [...previous.filter((id) => id !== opId), opId].slice(-APPLIED_LIMIT);
}

export function mapProduct(id: string, raw: Record<string, unknown>): Product {
  const fallbackCost = Number(raw.costPrice ?? 0);

  return {
    id,
    name: String(raw.name ?? ''),
    category: raw.category === 'clothing' ? 'clothing' : 'shoes',
    brand: (raw.brand as string) || undefined,
    costPrice: fallbackCost,
    sellPrice: Number(raw.sellPrice ?? 0),
    sizes: normalizeStoredSizes(raw),
    thumbData: (raw.thumbData as string) || undefined,
    imageUrl: (raw.imageUrl as string) || undefined,
    imagePublicId: (raw.imagePublicId as string) || undefined,
    sku: (raw.sku as string) || undefined,
    supplier: (raw.supplier as string) || undefined,
    lowStockThreshold: Number(raw.lowStockThreshold ?? 2),
    createdAt: (raw.createdAt as Timestamp) ?? null,
    updatedAt: (raw.updatedAt as Timestamp) ?? null,
    isArchived: raw.isArchived === true,
    lastSoldAt: (raw.lastSoldAt as Timestamp) ?? null,
  };
}

/**
 * The catalogue of a single shop is small (hundreds of rows at most), so we keep
 * the whole collection live in memory. Search, size filtering and the low-stock
 * scan then run instantly and keep working with no connection.
 *
 * Stock shown here already accounts for work queued on this device and not yet
 * sent — a size sold offline reads as sold, so the same last piece cannot be
 * sold twice from one phone while the network is down.
 */
export function useProducts() {
  const state = useLiveQuery<Product>(
    () => query(collection(db(), COL.products), orderBy('name')),
    [],
    mapProduct,
  );
  const outbox = useOutbox();
  const data = useMemo(() => applyPendingToProducts(state.data, outbox), [state.data, outbox]);
  return { ...state, data };
}

/** The server's view only, for code that must not count queued work twice. */
export function useServerProducts() {
  return useLiveQuery<Product>(
    () => query(collection(db(), COL.products), orderBy('name')),
    [],
    mapProduct,
  );
}

export function totalStock(p: Product): number {
  return p.sizes.reduce((sum, s) => sum + s.qty, 0);
}

export function availableSizes(p: Product): SizeStock[] {
  return p.sizes.filter((s) => s.qty > 0);
}

/** Size rows at or below the alert threshold — including the ones already at zero. */
export function lowSizes(p: Product): SizeStock[] {
  return p.sizes.filter((s) => s.qty <= p.lowStockThreshold);
}

export interface ProductInput {
  name: string;
  category: Product['category'];
  brand?: string;
  costPrice: number;
  sellPrice: number;
  sizes: SizeInput[];
  sku?: string;
  supplier?: string;
  lowStockThreshold: number;
  /** Shipment the opening stock came from; only used when creating. */
  shipmentId?: string | null;
}

function validate(input: ProductInput) {
  if (!input.name.trim()) throw new AppError('اسم المنتج مطلوب.');
  if (input.sellPrice <= 0) throw new AppError('سعر البيع يجب أن يكون أكبر من صفر.');
  if (input.costPrice < 0) throw new AppError('سعر التكلفة غير صحيح.');
  if (input.sellPrice < input.costPrice)
    throw new AppError('سعر البيع أقل من التكلفة — تأكد من الأسعار.');
  const cleaned = input.sizes.filter((s) => s.size.trim());
  if (cleaned.length === 0) throw new AppError('أضف مقاساً واحداً على الأقل.');
  const seen = new Set<string>();
  for (const s of cleaned) {
    const key = s.size.trim();
    if (seen.has(key)) throw new AppError(`المقاس ${key} مُكرَّر.`);
    seen.add(key);
    if (s.qty < 0) throw new AppError('الكمية لا يمكن أن تكون سالبة.');
  }
}

function normalizeSizes(
  sizes: SizeInput[],
  costPrice: number,
  previous: SizeStock[] = [],
  shipmentId: string | null = null,
): SizeStock[] {
  const before = new Map(previous.map((s) => [s.size, s]));
  return sizes
    .filter((s) => s.size.trim())
    .map((s) => {
      const size = s.size.trim();
      const existing = before.get(size) ?? { size, qty: 0, lots: [] };
      return applyManualQty({ ...existing, size }, s.qty, costPrice, shipmentId);
    })
    // Numeric sizes sort numerically (40, 41, 42), letter sizes alphabetically.
    .sort((a, b) => {
      const na = Number(a.size);
      const nb = Number(b.size);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.size.localeCompare(b.size, 'ar');
    });
}

/**
 * Result of handling a picked image. `warning` is set when the thumbnail saved
 * fine but the full-resolution upload did not — the product is still complete.
 */
export interface ImageOutcome {
  thumbData: string | null;
  imageUrl: string | null;
  imagePublicId: string | null;
  warning: string | null;
}

/**
 * The thumbnail is generated locally and always succeeds offline. The Cloudinary
 * copy is best-effort: losing it must never block saving a product.
 */
async function processImage(file: File, productId: string): Promise<ImageOutcome> {
  const thumb = await makeThumbnail(file);
  const outcome: ImageOutcome = {
    thumbData: thumb.dataUrl,
    imageUrl: null,
    imagePublicId: null,
    warning: null,
  };

  if (!cloudinaryEnabled || !probablyOnline()) {
    if (cloudinaryEnabled) outcome.warning = 'حُفظت الصورة المصغّرة — النسخة الكاملة تحتاج اتصال، ارفعها لاحقاً من تعديل المنتج.';
    return outcome;
  }

  try {
    // A weak connection must not hold the save hostage: the thumbnail is
    // already enough to sell with.
    const uploaded = await withTimeout(uploadFullImage(file, productId), 15000);
    outcome.imageUrl = uploaded.url;
    outcome.imagePublicId = uploaded.publicId;
  } catch {
    outcome.warning = 'حُفظت الصورة المصغّرة، لكن رفع النسخة الكاملة فشل (تحقّق من الاتصال).';
  }

  return outcome;
}

export async function createProduct(
  input: ProductInput,
  image: File | null,
  actor: { uid: string; name: string },
): Promise<{ id: string; warning: string | null }> {
  validate(input);
  const payload = {
    name: input.name.trim(),
    category: input.category,
    brand: input.brand?.trim() || null,
    costPrice: input.costPrice,
    sellPrice: input.sellPrice,
    // Opening stock is attributed to the shipment it arrived with, if one was picked.
    sizes: normalizeSizes(input.sizes, input.costPrice, [], input.shipmentId ?? null),
    sku: input.sku?.trim() || null,
    supplier: input.supplier?.trim() || null,
    lowStockThreshold: Math.max(0, Math.floor(input.lowStockThreshold)),
    thumbData: null as string | null,
    imageUrl: null as string | null,
    imagePublicId: null as string | null,
    isArchived: false,
    lastSoldAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  // The id is chosen on the device so the image can be processed first and the
  // product written once — one write that lands in the local cache instantly,
  // with or without a connection.
  const ref = doc(collection(db(), COL.products));

  let warning: string | null = null;
  if (image) {
    const outcome = await processImage(image, ref.id);
    warning = outcome.warning;
    payload.thumbData = outcome.thumbData;
    payload.imageUrl = outcome.imageUrl;
    payload.imagePublicId = outcome.imagePublicId;
  }

  await settle(setDoc(ref, payload));
  await logActivity(actor, 'added_product', `أضاف المنتج "${payload.name}"`);
  return { id: ref.id, warning };
}

/**
 * Saves a product's description, prices and picture.
 *
 * Quantities are deliberately NOT written here. Writing the whole `sizes` array
 * from what the form shows was a lost-update race even online — a sale on
 * another phone between opening the form and saving was silently undone — and
 * offline it is worse, because the form shows stock already reduced by sales
 * still waiting in the queue, so the sync would deduct them a second time.
 * Quantity changes go through `submitStockAdjust` instead, which applies them as
 * differences inside a transaction against the server's current stock.
 */
export async function updateProduct(
  id: string,
  input: ProductInput,
  image: File | null,
  /** True when the user cleared an existing picture without choosing a new one. */
  removeExistingImage: boolean,
  actor: { uid: string; name: string },
): Promise<{ warning: string | null }> {
  validate(input);
  const ref = doc(db(), COL.products, id);
  const patch: Record<string, unknown> = {
    name: input.name.trim(),
    category: input.category,
    brand: input.brand?.trim() || null,
    costPrice: input.costPrice,
    sellPrice: input.sellPrice,
    sku: input.sku?.trim() || null,
    supplier: input.supplier?.trim() || null,
    lowStockThreshold: Math.max(0, Math.floor(input.lowStockThreshold)),
    updatedAt: serverTimestamp(),
  };

  let warning: string | null = null;
  if (image) {
    const outcome = await processImage(image, id);
    warning = outcome.warning;
    patch.thumbData = outcome.thumbData;
    patch.imageUrl = outcome.imageUrl;
    patch.imagePublicId = outcome.imagePublicId;
  } else if (removeExistingImage) {
    patch.thumbData = null;
    patch.imageUrl = null;
    patch.imagePublicId = null;
  }

  await settle(updateDoc(ref, patch));
  await logActivity(actor, 'edited_product', `عدّل المنتج "${input.name.trim()}"`);
  return { warning };
}

/** Archiving keeps the product out of the way while preserving its sales history. */
export async function setArchived(
  product: Product,
  archived: boolean,
  actor: { uid: string; name: string },
): Promise<void> {
  await settle(
    updateDoc(doc(db(), COL.products, product.id), {
      isArchived: archived,
      updatedAt: serverTimestamp(),
    }),
  );
  await logActivity(
    actor,
    archived ? 'archived_product' : 'restored_product',
    `${archived ? 'أرشف' : 'استرجع'} المنتج "${product.name}"`,
  );
}

/** What every screen should render for a product, thumbnail first. */
export function productImage(p: Product): string | null {
  return p.thumbData ?? p.imageUrl ?? null;
}
