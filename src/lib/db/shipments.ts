'use client';

import {
  collection,
  doc,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/hooks/useFirestore';
import type { Shipment, ShipmentGroup, StockLot } from '@/lib/types';
import { AppError, COL } from './collections';
import { logActivity } from './activity';
import { markApplied, normalizeStoredSizes, reconcileSize, wasApplied } from './products';
import { settle } from '@/lib/offline/write';
import type { ReceiveLineOp, ReceiveOp } from '@/lib/offline/outbox';

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
  const created = doc(collection(db(), COL.shipments));
  await settle(setDoc(created, {
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
  }));

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

  await settle(updateDoc(doc(db(), COL.shipments, shipment.id), {
    name: patch.name.trim(),
    // Blank becomes null, matching what createShipment writes, so the two paths
    // cannot leave the same field as '' in one document and null in another.
    supplier: patch.supplier?.trim() || null,
    extraCost: patch.extraCost,
    note: patch.note?.trim() || null,
  }));
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

  // One batch for the group and its members: the grouping either lands whole or
  // not at all, and it lands in the local cache straight away when offline.
  const group = doc(collection(db(), COL.shipmentGroups));
  const batch = writeBatch(db());
  batch.set(group, { name: name.trim(), createdAt: serverTimestamp() });
  for (const id of shipmentIds) {
    batch.update(doc(db(), COL.shipments, id), { groupId: group.id });
  }
  await settle(batch.commit());

  await logActivity(actor, 'grouped_shipments', `دمج ${shipmentIds.length} شحنات في "${name.trim()}"`);
}

export async function ungroupShipment(shipment: Shipment, actor: { uid: string; name: string }): Promise<void> {
  await settle(updateDoc(doc(db(), COL.shipments, shipment.id), { groupId: null }));
  await logActivity(actor, 'grouped_shipments', `أخرج الشحنة "${shipment.name}" من مجموعتها`);
}

/** A line typed on the receiving screen. Same shape the offline queue stores. */
export type ReceiveLine = ReceiveLineOp;

/**
 * Checks and tidies a delivery before it is queued or applied: no line may lack a
 * size, and the same product, size and cost entered twice becomes one lot so the
 * shipment reads as one batch instead of a pile of fragments.
 */
export function prepareReceiveLines(lines: ReceiveLine[]): ReceiveLine[] {
  // A line with no size would be dropped silently and the delivery would look
  // smaller than what arrived, so it is an error rather than a filter.
  const missingSize = lines.filter((l) => l.qty > 0 && !l.size.trim());
  if (missingSize.length > 0)
    throw new AppError(`أدخل المقاس لـ "${missingSize[0]!.productName}" — السطر بدون مقاس لا يُحفظ.`);

  const merged = new Map<string, ReceiveLine>();
  for (const line of lines) {
    if (line.qty <= 0 || !line.size.trim()) continue;
    const size = line.size.trim();
    const qty = Math.floor(line.qty);
    const key = `${line.productId}|${size}|${line.costPrice}`;
    const existing = merged.get(key);
    merged.set(key, existing ? { ...existing, qty: existing.qty + qty } : { ...line, size, qty });
  }
  const valid = [...merged.values()];
  if (valid.length === 0) throw new AppError('أضف صنفاً واحداً بكمية أكبر من صفر.');
  return valid;
}

/**
 * Books goods from a shipment into stock as new lots.
 *
 * Each product is updated in its own transaction: a receiving run touches many
 * products, and Firestore transactions are per-document-set — keeping them small
 * means one bad row cannot roll back the whole delivery. Each product records
 * the operation id it applied, so running this again after a partial failure
 * only finishes the products that were missed.
 */
export async function applyReceive(
  opId: string,
  op: ReceiveOp,
  actor: { uid: string; name: string },
): Promise<{ received: number }> {
  const byProduct = new Map<string, ReceiveLine[]>();
  for (const line of op.lines) {
    byProduct.set(line.productId, [...(byProduct.get(line.productId) ?? []), line]);
  }

  let received = 0;
  let firstError: unknown = null;

  for (const [productId, productLines] of byProduct) {
    try {
      const applied = await runTransaction(db(), async (tx) => {
        const ref = doc(db(), COL.products, productId);
        const snap = await tx.get(ref);
        if (!snap.exists()) throw new AppError(`المنتج "${productLines[0]!.productName}" غير موجود.`);
        const data = snap.data();
        if (wasApplied(data, opId)) return false;

        // Normalized rather than raw: a size stored before lot tracking has no
        // `lots`, and reconciling it from an empty list would zero its stock —
        // including the sizes this delivery does not touch, since the whole
        // `sizes` array is rewritten below.
        const next = normalizeStoredSizes(data);

        for (const line of productLines) {
          const index = next.findIndex((s) => s.size === line.size);
          const lot: StockLot = {
            shipmentId: op.shipmentId,
            qty: line.qty,
            costPrice: line.costPrice,
            receivedAt: op.receivedAt,
          };
          if (index === -1) {
            next.push(reconcileSize({ size: line.size, qty: 0, lots: [lot] }));
          } else {
            next[index] = reconcileSize({ ...next[index]!, lots: [...next[index]!.lots, lot] });
          }
        }

        tx.update(ref, { sizes: next, appliedOps: markApplied(data, opId), updatedAt: serverTimestamp() });
        return true;
      });

      // Counted outside the transaction body: Firestore retries that body on
      // contention, which would otherwise count the same pieces twice.
      if (applied) received += productLines.reduce((sum, l) => sum + l.qty, 0);
    } catch (err) {
      // Keep going: the other products of the delivery still land, and the
      // operation stays queued so the failed one is retried.
      firstError ??= err;
    }
  }

  if (received > 0) {
    await logActivity(
      actor,
      'received_stock',
      `استلم ${received} قطعة من الشحنة "${op.shipmentName}" (${op.shipmentCode})`,
    );
  }
  if (firstError) throw firstError;
  return { received };
}
