'use client';

import {
  addDoc,
  collection,
  doc,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/hooks/useFirestore';
import type { Shipment, ShipmentGroup, StockLot } from '@/lib/types';
import { AppError, COL } from './collections';
import { logActivity } from './activity';
import { normalizeStoredSizes, reconcileSize } from './products';

export function mapShipment(id: string, raw: Record<string, unknown>): Shipment {
  return {
    id,
    code: String(raw.code ?? ''),
    name: String(raw.name ?? ''),
    supplier: (raw.supplier as string) || undefined,
    extraCost: Number(raw.extraCost ?? 0),
    arrivedAt: (raw.arrivedAt as Timestamp) ?? null,
    note: (raw.note as string) || undefined,
    groupId: (raw.groupId as string) ?? null,
    createdBy: String(raw.createdBy ?? ''),
    createdByName: String(raw.createdByName ?? ''),
    createdAt: (raw.createdAt as Timestamp) ?? null,
  };
}

export function mapShipmentGroup(id: string, raw: Record<string, unknown>): ShipmentGroup {
  return {
    id,
    name: String(raw.name ?? ''),
    note: (raw.note as string) || undefined,
    createdAt: (raw.createdAt as Timestamp) ?? null,
  };
}

export function useShipments() {
  return useLiveQuery<Shipment>(
    () => query(collection(db(), COL.shipments), orderBy('arrivedAt', 'desc')),
    [],
    mapShipment,
  );
}

export function useShipmentGroups() {
  return useLiveQuery<ShipmentGroup>(
    () => query(collection(db(), COL.shipmentGroups), orderBy('name')),
    [],
    mapShipmentGroup,
  );
}

/**
 * SH-2026-07 style code, unique enough for a single shop.
 *
 * Takes the highest number already used in that year rather than counting the rows:
 * a count repeats a code as soon as the list it is given is incomplete — and it is,
 * since the shipments query orders by `arrivedAt` and so omits any document missing
 * that field.
 */
function nextCode(existing: Shipment[], arrivedAt: Date): string {
  const year = arrivedAt.getFullYear();
  const prefix = `SH-${year}-`;
  const highest = existing
    .filter((s) => s.code.startsWith(prefix))
    .reduce((max, s) => Math.max(max, Number(s.code.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(highest + 1).padStart(2, '0')}`;
}

export async function createShipment(
  input: { name: string; supplier?: string; extraCost: number; arrivedAt: Date; note?: string },
  existing: Shipment[],
  actor: { uid: string; name: string },
): Promise<string> {
  if (!input.name.trim()) throw new AppError('اسم الشحنة مطلوب.');
  if (input.extraCost < 0) throw new AppError('تكاليف الشحن لا يمكن أن تكون سالبة.');

  const code = nextCode(existing, input.arrivedAt);
  const created = await addDoc(collection(db(), COL.shipments), {
    code,
    name: input.name.trim(),
    supplier: input.supplier?.trim() || null,
    extraCost: input.extraCost,
    arrivedAt: Timestamp.fromDate(input.arrivedAt),
    note: input.note?.trim() || null,
    groupId: null,
    createdBy: actor.uid,
    createdByName: actor.name,
    createdAt: serverTimestamp(),
  });

  await logActivity(actor, 'added_shipment', `أضاف الشحنة "${input.name.trim()}" (${code})`);
  return created.id;
}

export async function updateShipment(
  shipment: Shipment,
  patch: { name: string; supplier?: string; extraCost: number; note?: string },
  actor: { uid: string; name: string },
): Promise<void> {
  // Same guards as creating: an edit must not be able to leave a shipment nameless
  // or with negative freight, which it could before.
  if (!patch.name.trim()) throw new AppError('اسم الشحنة مطلوب.');
  if (patch.extraCost < 0) throw new AppError('تكاليف الشحن لا يمكن أن تكون سالبة.');

  await updateDoc(doc(db(), COL.shipments, shipment.id), {
    name: patch.name.trim(),
    // Blank becomes null, matching what createShipment writes, so the two paths
    // cannot leave the same field as '' in one document and null in another.
    supplier: patch.supplier?.trim() || null,
    extraCost: patch.extraCost,
    note: patch.note?.trim() || null,
  });
  await logActivity(actor, 'added_shipment', `عدّل بيانات الشحنة "${patch.name.trim()}"`);
}

/**
 * Merges shipments under one name for combined reporting. Members keep their own
 * code and their own lots, so "how much came from SH-2026-03" is still answerable
 * after the merge — that is the whole point of grouping instead of rewriting.
 */
export async function groupShipments(
  name: string,
  shipmentIds: string[],
  actor: { uid: string; name: string },
): Promise<void> {
  if (!name.trim()) throw new AppError('اسم المجموعة مطلوب.');
  if (shipmentIds.length < 2) throw new AppError('اختر شحنتين على الأقل للدمج.');

  const group = await addDoc(collection(db(), COL.shipmentGroups), {
    name: name.trim(),
    createdAt: serverTimestamp(),
  });

  const batch = writeBatch(db());
  for (const id of shipmentIds) {
    batch.update(doc(db(), COL.shipments, id), { groupId: group.id });
  }
  await batch.commit();

  await logActivity(actor, 'grouped_shipments', `دمج ${shipmentIds.length} شحنات في "${name.trim()}"`);
}

export async function ungroupShipment(shipment: Shipment, actor: { uid: string; name: string }): Promise<void> {
  await updateDoc(doc(db(), COL.shipments, shipment.id), { groupId: null });
  await logActivity(actor, 'grouped_shipments', `أخرج الشحنة "${shipment.name}" من مجموعتها`);
}

export interface ReceiveLine {
  productId: string;
  productName: string;
  size: string;
  qty: number;
  /** Unit cost for this shipment, which may differ from previous batches. */
  costPrice: number;
}

/**
 * Books goods from a shipment into stock as new lots.
 *
 * Each product is updated in its own transaction: a receiving run touches many
 * products, and Firestore transactions are per-document-set — keeping them small
 * means one bad row cannot roll back the whole delivery.
 */
export async function receiveStock(
  shipment: Shipment,
  lines: ReceiveLine[],
  actor: { uid: string; name: string },
): Promise<{ received: number; failed: string[] }> {
  // A line with no size would be dropped silently and the delivery would look
  // smaller than what arrived, so it is an error rather than a filter.
  const missingSize = lines.filter((l) => l.qty > 0 && !l.size.trim());
  if (missingSize.length > 0)
    throw new AppError(
      `أدخل المقاس لـ "${missingSize[0]!.productName}" — السطر بدون مقاس لا يُحفظ.`,
    );

  const valid = lines.filter((l) => l.qty > 0 && l.size.trim());
  if (valid.length === 0) throw new AppError('أضف صنفاً واحداً بكمية أكبر من صفر.');

  const receivedAt = shipment.arrivedAt?.toMillis() ?? Date.now();

  // The same product and size entered twice becomes one lot when the cost matches,
  // so the shipment reads as one batch instead of a pile of fragments.
  const merged = new Map<string, ReceiveLine>();
  for (const line of valid) {
    const size = line.size.trim();
    const key = `${line.productId}|${size}|${line.costPrice}`;
    const existing = merged.get(key);
    merged.set(
      key,
      existing
        ? { ...existing, qty: existing.qty + Math.floor(line.qty) }
        : { ...line, size, qty: Math.floor(line.qty) },
    );
  }

  const byProduct = new Map<string, ReceiveLine[]>();
  for (const line of merged.values()) {
    byProduct.set(line.productId, [...(byProduct.get(line.productId) ?? []), line]);
  }

  const failed: string[] = [];
  let received = 0;

  for (const [productId, productLines] of byProduct) {
    try {
      await runTransaction(db(), async (tx) => {
        const ref = doc(db(), COL.products, productId);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new AppError('المنتج غير موجود.');

        // Normalized rather than raw: a size stored before lot tracking has no
        // `lots`, and reconciling it from an empty list would zero its stock —
        // including the sizes this delivery does not touch, since the whole
        // `sizes` array is rewritten below.
        const next = normalizeStoredSizes(snap.data());

        for (const line of productLines) {
          const index = next.findIndex((s) => s.size === line.size);
          const lot: StockLot = {
            shipmentId: shipment.id,
            qty: line.qty,
            costPrice: line.costPrice,
            receivedAt,
          };
          if (index === -1) {
            next.push(reconcileSize({ size: line.size, qty: 0, lots: [lot] }));
          } else {
            next[index] = reconcileSize({ ...next[index]!, lots: [...next[index]!.lots, lot] });
          }
        }

        tx.update(ref, { sizes: next, updatedAt: serverTimestamp() });
      });

      // Counted outside the transaction body: Firestore retries that body on
      // contention, which would otherwise count the same pieces twice.
      received += productLines.reduce((sum, l) => sum + l.qty, 0);
    } catch {
      failed.push(productLines[0]?.productName ?? productId);
    }
  }

  if (received > 0) {
    await logActivity(
      actor,
      'received_stock',
      `استلم ${received} قطعة من الشحنة "${shipment.name}" (${shipment.code})`,
    );
  }

  return { received, failed };
}
