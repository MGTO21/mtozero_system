'use client';

import {
  addDoc,
  collection,
  doc,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { cloudinaryEnabled, uploadFullImage } from '@/lib/cloudinary';
import { makeThumbnail } from '@/lib/image';
import type { Product, SizeInput, SizeStock } from '@/lib/types';
import { useLiveQuery } from '@/lib/hooks/useFirestore';
import { AppError, COL } from './collections';
import { logActivity } from './activity';

/**
 * Forces the invariant `qty === sum(lots.qty)`, drops empty lots and keeps them in
 * FIFO order. Every write path must pass its size rows through here — it is the
 * only guard against stock and lots drifting apart.
 */
export function reconcileSize(size: SizeStock): SizeStock {
  const lots = (size.lots ?? [])
    .map((l) => ({
      shipmentId: l.shipmentId ?? null,
      qty: Math.max(0, Math.floor(Number(l.qty ?? 0))),
      costPrice: Math.max(0, Number(l.costPrice ?? 0)),
      receivedAt: Number(l.receivedAt ?? 0),
    }))
    .filter((l) => l.qty > 0)
    .sort((a, b) => a.receivedAt - b.receivedAt);

  return {
    size: String(size.size),
    qty: lots.reduce((sum, l) => sum + l.qty, 0),
    lots,
  };
}

export function mapProduct(id: string, raw: Record<string, unknown>): Product {
  const sizes = Array.isArray(raw.sizes) ? (raw.sizes as SizeStock[]) : [];
  const fallbackCost = Number(raw.costPrice ?? 0);
  const createdMillis = (raw.createdAt as Timestamp)?.toMillis?.() ?? 0;

  return {
    id,
    name: String(raw.name ?? ''),
    category: raw.category === 'clothing' ? 'clothing' : 'shoes',
    brand: (raw.brand as string) || undefined,
    costPrice: fallbackCost,
    sellPrice: Number(raw.sellPrice ?? 0),
    sizes: sizes
      .filter((s) => s && typeof s.size === 'string')
      .map((s) => {
        const qty = Math.max(0, Number(s.qty ?? 0));
        // Products created before lot tracking have no `lots`; treat their whole
        // stock as one unattributed batch so nothing is lost on read.
        const lots =
          Array.isArray(s.lots) && s.lots.length > 0
            ? s.lots
            : qty > 0
              ? [{ shipmentId: null, qty, costPrice: fallbackCost, receivedAt: createdMillis }]
              : [];
        return reconcileSize({ size: String(s.size), qty, lots });
      }),
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
 */
export function useProducts() {
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

/**
 * Applies a hand-typed quantity to a size while preserving lot history.
 *
 * Increases become a new unattributed lot at the product's current cost;
 * decreases are taken from the newest lots first, so the oldest (and usually
 * cheapest) batch stays traceable for as long as possible.
 */
function applyManualQty(
  current: SizeStock,
  targetQty: number,
  costPrice: number,
  shipmentId: string | null,
): SizeStock {
  const target = Math.max(0, Math.floor(targetQty));
  const lots = [...(current.lots ?? [])].sort((a, b) => a.receivedAt - b.receivedAt);
  const onHand = lots.reduce((sum, l) => sum + l.qty, 0);

  if (target === onHand) return reconcileSize({ ...current, lots });

  if (target > onHand) {
    lots.push({
      shipmentId,
      qty: target - onHand,
      costPrice,
      receivedAt: Date.now(),
    });
    return reconcileSize({ ...current, lots });
  }

  let toRemove = onHand - target;
  for (let i = lots.length - 1; i >= 0 && toRemove > 0; i--) {
    const take = Math.min(lots[i]!.qty, toRemove);
    lots[i] = { ...lots[i]!, qty: lots[i]!.qty - take };
    toRemove -= take;
  }
  return reconcileSize({ ...current, lots });
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

  if (!cloudinaryEnabled) return outcome;

  try {
    const uploaded = await uploadFullImage(file, productId);
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

  const created = await addDoc(collection(db(), COL.products), payload);

  let warning: string | null = null;
  if (image) {
    const outcome = await processImage(image, created.id);
    warning = outcome.warning;
    await updateDoc(created, {
      thumbData: outcome.thumbData,
      imageUrl: outcome.imageUrl,
      imagePublicId: outcome.imagePublicId,
    });
  }

  await logActivity(actor, 'added_product', `أضاف المنتج "${payload.name}"`);
  return { id: created.id, warning };
}

export async function updateProduct(
  id: string,
  input: ProductInput,
  image: File | null,
  /** True when the user cleared an existing picture without choosing a new one. */
  removeExistingImage: boolean,
  /** Current stored state — needed to fold quantity edits into existing lots. */
  previous: Product,
  actor: { uid: string; name: string },
): Promise<{ warning: string | null }> {
  validate(input);
  const previousSizes = previous.sizes;
  const ref = doc(db(), COL.products, id);
  const patch: Record<string, unknown> = {
    name: input.name.trim(),
    category: input.category,
    brand: input.brand?.trim() || null,
    costPrice: input.costPrice,
    sellPrice: input.sellPrice,
    // Manual quantity edits are folded into the existing lots rather than
    // replacing them, so shipment attribution survives an ordinary edit.
    sizes: normalizeSizes(input.sizes, input.costPrice, previousSizes),
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

  await updateDoc(ref, patch);
  await logActivity(actor, 'edited_product', `عدّل المنتج "${input.name.trim()}"`);
  return { warning };
}

/** Archiving keeps the product out of the way while preserving its sales history. */
export async function setArchived(
  product: Product,
  archived: boolean,
  actor: { uid: string; name: string },
): Promise<void> {
  await updateDoc(doc(db(), COL.products, product.id), {
    isArchived: archived,
    updatedAt: serverTimestamp(),
  });
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
