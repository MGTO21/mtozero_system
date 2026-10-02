'use client';

import {
  collection,
  doc,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/hooks/useFirestore';
import type { AdjustOp, CountLineOp, CountOp } from '@/lib/offline/outbox';
import { settle } from '@/lib/offline/write';
import type { Product, SizeStock, StockCount, StockCountLine } from '@/lib/types';
import { AppError, COL } from './collections';
import { logActivity } from './activity';
import { applyManualQty, markApplied, normalizeStoredSizes, wasApplied } from './products';

export { sizeAverageCost } from './sale-math';

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

export function varianceValue(draft: { systemQty: number; countedQty: number; costPrice: number }[]): {
  shortage: number;
  surplus: number;
} {
  let shortage = 0;
  let surplus = 0;
  for (const row of draft) {
    const diff = row.countedQty - row.systemQty;
    if (diff < 0) shortage += Math.abs(diff) * row.costPrice;
    else if (diff > 0) surplus += diff * row.costPrice;
  }
  return { shortage, surplus };
}

/** The count as the queue stores it: only the rows that differ, without product snapshots. */
export function countLines(draft: CountDraft[]): CountLineOp[] {
  const changed = variances(draft);
  if (changed.length === 0) throw new AppError('لا يوجد فرق بين الجرد والنظام — لا شيء لتعديله.');
  return changed.map((row) => ({
    productId: row.product.id,
    productName: row.product.name,
    size: row.size,
    systemQty: row.systemQty,
    countedQty: row.countedQty,
    costPrice: row.costPrice,
  }));
}

/**
 * Moves one product's sizes by the given differences inside a transaction.
 *
 * Differences, never totals: between the moment someone counted the shelf and
 * the moment this runs, other sales may have landed — "three missing" is still
 * true afterwards, "eight on the shelf" no longer is. Extra pieces become an
 * unattributed lot at current cost; missing pieces come off the newest lots so
 * the oldest batch stays traceable to its shipment.
 */
async function shiftProduct(
  opId: string,
  productId: string,
  productName: string,
  moves: { size: string; delta: number; cost: number; remove?: boolean }[],
): Promise<boolean> {
  return runTransaction(db(), async (tx) => {
    const ref = doc(db(), COL.products, productId);
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new AppError(`المنتج "${productName}" غير موجود.`);
    const data = snap.data();
    if (wasApplied(data, opId)) return false;

    const fallbackCost = Number(data.costPrice ?? 0);
    // Normalized, not reconciled raw: the untouched sizes of this product are
    // rewritten along with the changed ones, and a pre-lot size row has no
    // `lots` to rebuild its quantity from.
    let next: SizeStock[] = normalizeStoredSizes(data);
    for (const move of moves) {
      const index = next.findIndex((s) => s.size === move.size);
      const current = index === -1 ? { size: move.size, qty: 0, lots: [] } : next[index]!;
      const adjusted = applyManualQty(
        current,
        Math.max(0, current.qty + move.delta),
        move.cost || fallbackCost,
        null,
      );
      if (index === -1) {
        if (!move.remove) next = [...next, adjusted];
      } else if (move.remove && adjusted.qty === 0) {
        next = next.filter((_, i) => i !== index);
      } else {
        next = next.map((s, i) => (i === index ? adjusted : s));
      }
    }

    next.sort((a, b) => {
      const na = Number(a.size);
      const nb = Number(b.size);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.size.localeCompare(b.size, 'ar');
    });

    tx.update(ref, { sizes: next, appliedOps: markApplied(data, opId), updatedAt: serverTimestamp() });
    return true;
  });
}

/**
 * Corrects stock to match a physical count, one product per transaction so a
 * single failure cannot roll back an afternoon of counting. Safe to run again:
 * products already corrected by this count are skipped, and the count record
 * is keyed by the same id.
 */
export async function applyCount(opId: string, op: CountOp, actor: { uid: string; name: string }, at: number) {
  const byProduct = new Map<string, CountLineOp[]>();
  for (const line of op.lines) {
    byProduct.set(line.productId, [...(byProduct.get(line.productId) ?? []), line]);
  }

  let firstError: unknown = null;
  for (const [productId, rows] of byProduct) {
    try {
      await shiftProduct(
        opId,
        productId,
        rows[0]!.productName,
        rows.map((r) => ({ size: r.size, delta: r.countedQty - r.systemQty, cost: r.costPrice })),
      );
    } catch (err) {
      firstError ??= err;
    }
  }
  if (firstError) throw firstError;

  const { shortage, surplus } = varianceValue(op.lines);
  await settle(
    setDoc(doc(db(), COL.stockCounts, opId), {
      note: op.note.trim() || null,
      lines: op.lines,
      shortageValue: shortage,
      surplusValue: surplus,
      countedBy: actor.uid,
      countedByName: actor.name,
      createdAt: Timestamp.fromMillis(at),
    }),
  );

  await logActivity(
    actor,
    'stock_count',
    `جرد ${op.lines.length} مقاس — نقص بقيمة ${Math.round(shortage)} ج وزيادة ${Math.round(surplus)} ج`,
  );
}

/**
 * The quantity half of a product edit. Computed against what the form showed, so
 * the difference stays right even when sales are still waiting in the queue.
 */
export function adjustmentLines(
  previous: Product,
  sizes: { size: string; qty: number }[],
): AdjustOp['lines'] {
  const typed = new Map<string, number>();
  for (const s of sizes) {
    const key = s.size.trim();
    if (key) typed.set(key, Math.max(0, Math.floor(s.qty)));
  }
  const lines: AdjustOp['lines'] = [];
  for (const row of previous.sizes) {
    const target = typed.get(row.size);
    if (target === undefined) lines.push({ size: row.size, delta: -row.qty, remove: true });
    else if (target !== row.qty) lines.push({ size: row.size, delta: target - row.qty, remove: false });
  }
  for (const [size, qty] of typed) {
    if (!previous.sizes.some((s) => s.size === size)) lines.push({ size, delta: qty, remove: false });
  }
  return lines;
}

export async function applyAdjust(opId: string, op: AdjustOp, actor: { uid: string; name: string }) {
  const applied = await shiftProduct(
    opId,
    op.productId,
    op.productName,
    op.lines.map((l) => ({ size: l.size, delta: l.delta, cost: op.costPrice, remove: l.remove })),
  );
  if (applied) {
    const summary = op.lines
      .map((l) => (l.remove ? `حذف مقاس ${l.size}` : `${l.size}: ${l.delta > 0 ? '+' : ''}${l.delta}`))
      .join('، ');
    await logActivity(actor, 'stock_adjusted', `عدّل كميات "${op.productName}" — ${summary}`);
  }
}
