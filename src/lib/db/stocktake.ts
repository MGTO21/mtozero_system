'use client';

import {
  addDoc,
  collection,
  doc,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/hooks/useFirestore';
import type { Product, SizeStock, StockCount, StockCountLine } from '@/lib/types';
import { AppError, COL } from './collections';
import { logActivity } from './activity';
import { applyManualQty, normalizeStoredSizes } from './products';

export function mapStockCount(id: string, raw: Record<string, unknown>): StockCount {
  return {
    id,
    note: (raw.note as string) || undefined,
    lines: Array.isArray(raw.lines) ? (raw.lines as StockCountLine[]) : [],
    shortageValue: Number(raw.shortageValue ?? 0),
    surplusValue: Number(raw.surplusValue ?? 0),
    countedBy: String(raw.countedBy ?? ''),
    countedByName: String(raw.countedByName ?? ''),
    createdAt: (raw.createdAt as Timestamp) ?? null,
  };
}

export function useStockCounts(max = 20) {
  return useLiveQuery<StockCount>(
    () => query(collection(db(), COL.stockCounts), orderBy('createdAt', 'desc'), limit(max)),
    [max],
    mapStockCount,
  );
}

/** Average unit cost of what is currently in a size, from its lots. */
export function sizeAverageCost(size: SizeStock, fallback: number): number {
  const units = size.lots.reduce((sum, l) => sum + l.qty, 0);
  if (units === 0) return fallback;
  return size.lots.reduce((sum, l) => sum + l.qty * l.costPrice, 0) / units;
}

export interface CountDraft {
  product: Product;
  size: string;
  systemQty: number;
  countedQty: number;
  costPrice: number;
}

/** Only rows where the count disagrees with the system are worth writing. */
export function variances(draft: CountDraft[]): CountDraft[] {
  return draft.filter((row) => row.countedQty !== row.systemQty);
}

export function varianceValue(draft: CountDraft[]): { shortage: number; surplus: number } {
  let shortage = 0;
  let surplus = 0;
  for (const row of variances(draft)) {
    const diff = row.countedQty - row.systemQty;
    if (diff < 0) shortage += Math.abs(diff) * row.costPrice;
    else surplus += diff * row.costPrice;
  }
  return { shortage, surplus };
}

/**
 * Corrects stock to match a physical count.
 *
 * Each product is adjusted in its own transaction. A count touches many products
 * and Firestore transactions are per-document-set, so keeping them small means a
 * single failing product cannot roll back an afternoon of counting — the rest is
 * still corrected, and the failures are reported back by name.
 *
 * Adjustments reuse the same lot arithmetic as a manual quantity edit: extra
 * pieces become an unattributed lot at current cost, missing pieces come off the
 * newest lots so the oldest batch stays traceable to its shipment.
 */
export async function applyStockCount(
  draft: CountDraft[],
  note: string,
  actor: { uid: string; name: string },
): Promise<{ adjusted: number; failed: string[] }> {
  const changed = variances(draft);
  if (changed.length === 0) throw new AppError('لا يوجد فرق بين الجرد والنظام — لا شيء لتعديله.');

  const byProduct = new Map<string, CountDraft[]>();
  for (const row of changed) {
    byProduct.set(row.product.id, [...(byProduct.get(row.product.id) ?? []), row]);
  }

  const failed: string[] = [];
  const applied: StockCountLine[] = [];

  for (const [productId, rows] of byProduct) {
    try {
      await runTransaction(db(), async (tx) => {
        const ref = doc(db(), COL.products, productId);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new AppError('المنتج غير موجود.');

        const data = snap.data();
        const fallbackCost = Number(data.costPrice ?? 0);
        // Normalized, not reconciled raw: the uncounted sizes of this product are
        // rewritten along with the counted ones, and a pre-lot size row has no
        // `lots` to rebuild its quantity from.
        let next = normalizeStoredSizes(data);
        for (const row of rows) {
          const index = next.findIndex((s) => s.size === row.size);
          if (index === -1) {
            // Counted a size the product no longer lists — recreate it.
            next = [
              ...next,
              applyManualQty({ size: row.size, qty: 0, lots: [] }, row.countedQty, fallbackCost, null),
            ];
          } else {
            next = next.map((s, i) =>
              i === index ? applyManualQty(s, row.countedQty, row.costPrice || fallbackCost, null) : s,
            );
          }
        }

        tx.update(ref, { sizes: next, updatedAt: serverTimestamp() });
      });

      for (const row of rows) {
        applied.push({
          productId,
          productName: row.product.name,
          size: row.size,
          systemQty: row.systemQty,
          countedQty: row.countedQty,
          costPrice: row.costPrice,
        });
      }
    } catch {
      failed.push(rows[0]?.product.name ?? productId);
    }
  }

  const { shortage, surplus } = varianceValue(
    draft.filter((row) => applied.some((a) => a.productId === row.product.id && a.size === row.size)),
  );

  if (applied.length > 0) {
    await addDoc(collection(db(), COL.stockCounts), {
      note: note.trim() || null,
      lines: applied,
      shortageValue: shortage,
      surplusValue: surplus,
      countedBy: actor.uid,
      countedByName: actor.name,
      createdAt: serverTimestamp(),
    });

    await logActivity(
      actor,
      'stock_count',
      `جرد ${applied.length} مقاس — نقص بقيمة ${Math.round(shortage)} ج وزيادة ${Math.round(surplus)} ج`,
    );
  }

  return { adjusted: applied.length, failed };
}
