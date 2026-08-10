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
import type { Shipment, ShipmentGroup, SizeStock, StockLot } from '@/lib/types';
import { AppError, COL } from './collections';
import { logActivity } from './activity';
import { reconcileSize } from './products';

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

/** SH-2026-07 style code, unique enough for a single shop. */
function nextCode(existing: Shipment[], arrivedAt: Date): string {
  const year = arrivedAt.getFullYear();
  const used = existing.filter((s) => s.code.startsWith(`SH-${year}-`)).length;
  return `SH-${year}-${String(used + 1).padStart(2, '0')}`;
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
  patch: Partial<Pick<Shipment, 'name' | 'supplier' | 'extraCost' | 'note'>>,
  actor: { uid: string; name: string },
): Promise<void> {
  await updateDoc(doc(db(), COL.shipments, shipment.id), patch);
  await logActivity(actor, 'added_shipment', `عدّل بيانات الشحنة "${shipment.name}"`);
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
  const valid = lines.filter((l) => l.qty > 0 && l.size.trim());
  if (valid.length === 0) throw new AppError('أضف صنفاً واحداً بكمية أكبر من صفر.');

  const receivedAt = shipment.arrivedAt?.toMillis() ?? Date.now();
  const byProduct = new Map<string, ReceiveLine[]>();
  for (const line of valid) {
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

        const sizes: SizeStock[] = Array.isArray(snap.data().sizes)
          ? (snap.data().sizes as SizeStock[])
          : [];
        const next = [...sizes.map((s) => ({ ...s, lots: [...(s.lots ?? [])] }))];

        for (const line of productLines) {
          const size = line.size.trim();
          const index = next.findIndex((s) => String(s.size) === size);
          const lot: StockLot = {
            shipmentId: shipment.id,
            qty: Math.floor(line.qty),
            costPrice: line.costPrice,
            receivedAt,
          };
          if (index === -1) {
            next.push(reconcileSize({ size, qty: 0, lots: [lot] }));
          } else {
            next[index] = reconcileSize({
              ...next[index]!,
              lots: [...(next[index]!.lots ?? []), lot],
            });
          }
          received += lot.qty;
        }

        tx.update(ref, { sizes: next, updatedAt: serverTimestamp() });
      });
    } catch {
      failed.push(productLines[0]?.productName ?? productId);
    }
  }

  await logActivity(
    actor,
    'received_stock',
    `استلم ${received} قطعة من الشحنة "${shipment.name}" (${shipment.code})`,
  );

  return { received, failed };
}
