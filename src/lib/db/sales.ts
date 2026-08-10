'use client';

import {
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  Timestamp,
  where,
} from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/hooks/useFirestore';
import type {
  Channel,
  ConsumedLot,
  DebtPayment,
  PaymentStatus,
  Product,
  Sale,
  SizeStock,
} from '@/lib/types';
import { AppError, COL } from './collections';
import { logActivity } from './activity';
import { reconcileSize } from './products';

export function mapSale(id: string, raw: Record<string, unknown>): Sale {
  const qty = Number(raw.qty ?? 0);
  const costPrice = Number(raw.costPrice ?? 0);
  const rawLots = Array.isArray(raw.lots) ? (raw.lots as ConsumedLot[]) : [];

  return {
    id,
    productId: String(raw.productId ?? ''),
    productName: String(raw.productName ?? ''),
    size: String(raw.size ?? ''),
    qty,
    sellPrice: Number(raw.sellPrice ?? 0),
    costPrice,
    profit: Number(raw.profit ?? 0),
    // Sales recorded before lot tracking carry no breakdown; treat them as one
    // unattributed batch so returns and shipment reports still work on them.
    lots:
      rawLots.length > 0
        ? rawLots.map((l) => ({
            shipmentId: l.shipmentId ?? null,
            qty: Number(l.qty ?? 0),
            costPrice: Number(l.costPrice ?? 0),
            receivedAt: Number(l.receivedAt ?? 0),
          }))
        : qty > 0
          ? [{ shipmentId: null, qty, costPrice, receivedAt: 0 }]
          : [],
    customerName: (raw.customerName as string) || undefined,
    customerPhone: (raw.customerPhone as string) || undefined,
    customerId: (raw.customerId as string) ?? null,
    creditUsed: Number(raw.creditUsed ?? 0),
    paymentStatus: (raw.paymentStatus as PaymentStatus) ?? 'paid',
    amountPaid: Number(raw.amountPaid ?? 0),
    soldBy: String(raw.soldBy ?? ''),
    soldByName: String(raw.soldByName ?? 'مستخدم'),
    channel: (raw.channel as Channel) ?? 'in_person',
    note: (raw.note as string) || undefined,
    returnedQty: Number(raw.returnedQty ?? 0),
    createdAt: (raw.createdAt as Timestamp) ?? null,
  };
}

/* ---------- lot arithmetic ---------- */

/**
 * Takes `qty` units out of a size, oldest batch first.
 *
 * FIFO matters for money, not tidiness: the January shipment and the March
 * shipment cost different amounts, and the profit on a sale has to reflect which
 * one actually left the shelf.
 */
export function consumeFifo(size: SizeStock, qty: number): { lots: SizeStock['lots']; taken: ConsumedLot[] } {
  const lots = [...(size.lots ?? [])].sort((a, b) => a.receivedAt - b.receivedAt);
  const taken: ConsumedLot[] = [];
  let remaining = qty;

  for (let i = 0; i < lots.length && remaining > 0; i++) {
    const lot = lots[i]!;
    const take = Math.min(lot.qty, remaining);
    if (take <= 0) continue;
    lots[i] = { ...lot, qty: lot.qty - take };
    taken.push({
      shipmentId: lot.shipmentId,
      qty: take,
      costPrice: lot.costPrice,
      receivedAt: lot.receivedAt,
    });
    remaining -= take;
  }

  if (remaining > 0) throw new AppError('الكمية المطلوبة أكبر من المتوفر في الدفعات.');
  return { lots, taken };
}

/**
 * Picks `qty` units from the newest end of a sale's lots, skipping units already
 * returned. Returns come off the most recently consumed batch first — the mirror
 * image of FIFO consumption.
 */
export function takeNewest(lots: ConsumedLot[], alreadyReturned: number, qty: number): ConsumedLot[] {
  const available = keptLots({ lots, returnedQty: alreadyReturned } as Sale);
  const picked: ConsumedLot[] = [];
  let remaining = qty;

  for (let i = available.length - 1; i >= 0 && remaining > 0; i--) {
    const take = Math.min(available[i]!.qty, remaining);
    picked.push({ ...available[i]!, qty: take });
    remaining -= take;
  }
  return picked;
}

/** Total money paid to suppliers for the units in these lots. */
export function lotsCost(lots: ConsumedLot[]): number {
  return lots.reduce((sum, l) => sum + l.qty * l.costPrice, 0);
}

/** Weighted average unit cost, used wherever a single cost figure is displayed. */
export function averageCost(lots: ConsumedLot[]): number {
  const units = lots.reduce((sum, l) => sum + l.qty, 0);
  return units === 0 ? 0 : lotsCost(lots) / units;
}

/**
 * The lots still with the customer after any returns, oldest first. Returns give
 * back the most recently taken units, mirroring how consumption happened.
 */
export function keptLots(sale: Sale): ConsumedLot[] {
  let toDrop = sale.returnedQty;
  const lots = [...sale.lots];
  for (let i = lots.length - 1; i >= 0 && toDrop > 0; i--) {
    const take = Math.min(lots[i]!.qty, toDrop);
    lots[i] = { ...lots[i]!, qty: lots[i]!.qty - take };
    toDrop -= take;
  }
  return lots.filter((l) => l.qty > 0);
}

/* ---------- derived money helpers (single source of truth) ---------- */

/** Units the customer actually kept. */
export function netQty(sale: Sale): number {
  return Math.max(0, sale.qty - sale.returnedQty);
}

/** What the customer actually owes: kept units less any referral credit applied. */
export function saleTotal(sale: Sale): number {
  return Math.max(0, sale.sellPrice * netQty(sale) - sale.creditUsed);
}

/** Ticket value before referral credit — used when showing the discount line. */
export function saleGross(sale: Sale): number {
  return sale.sellPrice * netQty(sale);
}

export function saleDue(sale: Sale): number {
  return Math.max(0, saleTotal(sale) - sale.amountPaid);
}

export function statusFor(total: number, paid: number): PaymentStatus {
  if (paid >= total) return 'paid';
  if (paid <= 0) return 'debt';
  return 'partial';
}

/* ---------- queries ---------- */

export function useSalesBetween(from: Date | null, to: Date | null) {
  return useLiveQuery<Sale>(
    () => {
      if (!from || !to) return null;
      return query(
        collection(db(), COL.sales),
        where('createdAt', '>=', Timestamp.fromDate(from)),
        where('createdAt', '<=', Timestamp.fromDate(to)),
        orderBy('createdAt', 'desc'),
      );
    },
    [from?.getTime() ?? 0, to?.getTime() ?? 0],
    mapSale,
  );
}

/** Every sale still carrying a balance. Sorted client-side to avoid a composite index. */
export function useOpenDebts() {
  const state = useLiveQuery<Sale>(
    () => query(collection(db(), COL.sales), where('paymentStatus', 'in', ['debt', 'partial'])),
    [],
    mapSale,
  );
  const data = [...state.data]
    .filter((s) => saleDue(s) > 0)
    .sort((a, b) => (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0));
  return { ...state, data };
}

/**
 * Debt repayments in a window. These are cash that arrived today for goods sold
 * on an earlier day, so a daily close cannot be computed from sales alone.
 */
export function usePaymentsBetween(from: Date | null, to: Date | null) {
  return useLiveQuery<DebtPayment>(
    () => {
      if (!from || !to) return null;
      return query(
        collection(db(), COL.payments),
        where('createdAt', '>=', Timestamp.fromDate(from)),
        where('createdAt', '<=', Timestamp.fromDate(to)),
        orderBy('createdAt', 'desc'),
      );
    },
    [from?.getTime() ?? 0, to?.getTime() ?? 0],
    (id, raw) => ({
      id,
      saleId: String(raw.saleId ?? ''),
      customerName: String(raw.customerName ?? ''),
      amount: Number(raw.amount ?? 0),
      receivedBy: String(raw.receivedBy ?? ''),
      receivedByName: String(raw.receivedByName ?? 'مستخدم'),
      createdAt: (raw.createdAt as Timestamp) ?? null,
    }),
  );
}

/** Single sale, live — used by the invoice/return sheets. */
export function useSale(saleId: string | null) {
  const [sale, setSale] = useState<Sale | null>(null);
  useEffect(() => {
    if (!saleId) {
      setSale(null);
      return;
    }
    return onSnapshot(doc(db(), COL.sales, saleId), (snap) => {
      setSale(snap.exists() ? mapSale(snap.id, snap.data()) : null);
    });
  }, [saleId]);
  return sale;
}

/* ---------- the write path ---------- */

export interface SaleInput {
  product: Product;
  size: string;
  qty: number;
  /** Unit price actually charged; may be discounted below the product default. */
  sellPrice: number;
  customerName?: string;
  customerPhone?: string;
  /** Existing customer record, when the buyer was matched or created up front. */
  customerId?: string | null;
  /** Referral credit the customer is spending on this purchase. */
  creditUsed?: number;
  paymentStatus: PaymentStatus;
  /** Cash collected now. Ignored for 'paid' (full) and 'debt' (zero). */
  amountPaid?: number;
  channel: Channel;
  note?: string;
}

/**
 * Records a sale and decrements stock in ONE Firestore transaction.
 *
 * Critical guarantees, both covered by tests in docs/TESTING.md:
 *  - selling the last unit leaves the size at exactly 0, never negative;
 *  - selling a size that is out of stock (or was just emptied by another device)
 *    fails with a clear message and writes nothing.
 */
export async function recordSale(
  input: SaleInput,
  actor: { uid: string; name: string },
): Promise<{ saleId: string; remaining: number }> {
  const qty = Math.floor(input.qty);
  if (qty <= 0) throw new AppError('الكمية يجب أن تكون قطعة واحدة على الأقل.');
  if (input.sellPrice <= 0) throw new AppError('سعر البيع غير صحيح.');

  const gross = input.sellPrice * qty;
  // Referral credit is applied before payment: it lowers what the customer owes,
  // so a fully-credited sale is 'paid' with no cash at all.
  const credit = Math.min(Math.max(0, input.creditUsed ?? 0), gross);
  const total = gross - credit;
  const paid =
    input.paymentStatus === 'paid'
      ? total
      : input.paymentStatus === 'debt'
        ? 0
        : Math.min(Math.max(0, input.amountPaid ?? 0), total);

  if (input.paymentStatus === 'partial' && paid <= 0)
    throw new AppError('أدخل المبلغ المدفوع، أو اختر "دين كامل".');

  const productRef = doc(db(), COL.products, input.product.id);
  const saleRef = doc(collection(db(), COL.sales));
  const customerRef = input.customerId ? doc(db(), COL.customers, input.customerId) : null;

  const remaining = await runTransaction(db(), async (tx) => {
    // All reads must happen before any write in a Firestore transaction.
    const snap = await tx.get(productRef);
    const customerSnap = customerRef ? await tx.get(customerRef) : null;

    if (!snap.exists()) throw new AppError('المنتج غير موجود — ربما حُذف.');

    // Credit is validated and spent inside the same transaction as the stock move,
    // so a failed sale can never leave a customer's balance reduced.
    if (credit > 0) {
      if (!customerSnap?.exists()) throw new AppError('لا يمكن استخدام الرصيد بدون عميل مسجّل.');
      const balance = Number(customerSnap.data().creditBalance ?? 0);
      if (credit > balance) throw new AppError(`رصيد العميل ${balance} ج فقط.`);
    }

    const data = snap.data();
    const rawSizes: SizeStock[] = Array.isArray(data.sizes) ? (data.sizes as SizeStock[]) : [];
    const fallbackCost = Number(data.costPrice ?? 0);
    const createdMillis = (data.createdAt as Timestamp)?.toMillis?.() ?? 0;

    // Normalize inside the transaction so a document written before lot tracking
    // is upgraded on its first sale instead of failing.
    const sizes = rawSizes.map((s) => {
      const onHand = Math.max(0, Number(s.qty ?? 0));
      const lots =
        Array.isArray(s.lots) && s.lots.length > 0
          ? s.lots
          : onHand > 0
            ? [{ shipmentId: null, qty: onHand, costPrice: fallbackCost, receivedAt: createdMillis }]
            : [];
      return reconcileSize({ size: String(s.size), qty: onHand, lots });
    });

    const index = sizes.findIndex((s) => s.size === input.size);
    if (index === -1) throw new AppError(`المقاس ${input.size} غير موجود في هذا المنتج.`);

    const current = sizes[index]!.qty;
    if (current === 0) throw new AppError(`المقاس ${input.size} غير متوفر حالياً.`);
    if (current < qty) throw new AppError(`المتوفر من المقاس ${input.size} هو ${current} فقط.`);

    // Cost comes from the batches actually consumed, read inside the transaction,
    // so neither a later price edit nor a concurrent sale can distort the profit.
    const { lots, taken } = consumeFifo(sizes[index]!, qty);
    const nextSizes = sizes.map((s, i) => (i === index ? reconcileSize({ ...s, lots }) : s));

    tx.update(productRef, {
      sizes: nextSizes,
      lastSoldAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });

    tx.set(saleRef, {
      productId: input.product.id,
      productName: String(data.name ?? input.product.name),
      size: input.size,
      qty,
      sellPrice: input.sellPrice,
      costPrice: averageCost(taken),
      // Credit spent is a real cost to the shop, so it comes out of profit too.
      profit: input.sellPrice * qty - credit - lotsCost(taken),
      lots: taken,
      customerName: input.customerName?.trim() || null,
      customerPhone: input.customerPhone?.trim() || null,
      customerId: input.customerId ?? null,
      creditUsed: credit,
      paymentStatus: input.paymentStatus,
      amountPaid: paid,
      soldBy: actor.uid,
      soldByName: actor.name,
      channel: input.channel,
      note: input.note?.trim() || null,
      returnedQty: 0,
      createdAt: serverTimestamp(),
    });

    if (customerRef && customerSnap?.exists()) {
      const data = customerSnap.data();
      tx.update(customerRef, {
        creditBalance: Math.max(0, Number(data.creditBalance ?? 0) - credit),
        totalSpent: Number(data.totalSpent ?? 0) + total,
        totalOrders: Number(data.totalOrders ?? 0) + 1,
        lastPurchaseAt: serverTimestamp(),
      });
    }

    return current - qty;
  });

  await logActivity(
    actor,
    'sold_product',
    `باع ${qty} × "${input.product.name}" مقاس ${input.size} بـ ${input.sellPrice * qty} ج` +
      (input.paymentStatus === 'paid' ? '' : ` (${input.paymentStatus === 'debt' ? 'دين' : 'دفع جزئي'})`),
  );

  return { saleId: saleRef.id, remaining };
}

/** Records a repayment against a debt sale and re-derives its payment status. */
export async function recordPayment(
  saleId: string,
  amount: number,
  actor: { uid: string; name: string },
): Promise<void> {
  if (amount <= 0) throw new AppError('أدخل مبلغاً أكبر من صفر.');
  const saleRef = doc(db(), COL.sales, saleId);
  const paymentRef = doc(collection(db(), COL.payments));

  const info = await runTransaction(db(), async (tx) => {
    const snap = await tx.get(saleRef);
    if (!snap.exists()) throw new AppError('عملية البيع غير موجودة.');
    const sale = mapSale(snap.id, snap.data());
    const due = saleDue(sale);
    if (due <= 0) throw new AppError('لا يوجد مبلغ متبقٍ على هذه العملية.');
    if (amount > due) throw new AppError(`المتبقي ${due} ج فقط — أدخل مبلغاً أقل أو مساوياً.`);

    const nextPaid = sale.amountPaid + amount;
    tx.update(saleRef, {
      amountPaid: nextPaid,
      paymentStatus: statusFor(saleTotal(sale), nextPaid),
    });
    tx.set(paymentRef, {
      saleId,
      customerName: sale.customerName ?? '',
      amount,
      receivedBy: actor.uid,
      receivedByName: actor.name,
      createdAt: serverTimestamp(),
    });
    return { customer: sale.customerName ?? 'عميل', remaining: due - amount };
  });

  await logActivity(
    actor,
    'recorded_payment',
    `سجّل تسديد ${amount} ج من ${info.customer}` +
      (info.remaining > 0 ? ` (متبقٍ ${info.remaining} ج)` : ' — سُدّد كاملاً'),
  );
}

/**
 * Partially or fully reverses a sale: stock goes back to the size, the sale keeps
 * existing with a `returnedQty`, and profit/paid amounts are re-derived so the
 * reports stay correct. Sales are never deleted.
 */
export async function recordReturn(
  sale: Sale,
  qty: number,
  reason: string,
  actor: { uid: string; name: string },
): Promise<void> {
  const returnQty = Math.floor(qty);
  if (returnQty <= 0) throw new AppError('عدد القطع المرتجعة يجب أن يكون 1 على الأقل.');
  const alreadyKept = netQty(sale);
  if (returnQty > alreadyKept) throw new AppError(`لا يمكن إرجاع أكثر من ${alreadyKept} قطعة.`);

  const saleRef = doc(db(), COL.sales, sale.id);
  const productRef = doc(db(), COL.products, sale.productId);
  const returnRef = doc(collection(db(), COL.returns));
  const refundAmount = sale.sellPrice * returnQty;

  await runTransaction(db(), async (tx) => {
    const saleSnap = await tx.get(saleRef);
    if (!saleSnap.exists()) throw new AppError('عملية البيع غير موجودة.');
    const fresh = mapSale(saleSnap.id, saleSnap.data());
    if (returnQty > netQty(fresh)) throw new AppError(`لا يمكن إرجاع أكثر من ${netQty(fresh)} قطعة.`);

    // Units go back to the exact batch they left, so shipment stock stays honest
    // and a return never silently re-prices inventory.
    const returning = takeNewest(fresh.lots, fresh.returnedQty, returnQty);

    const productSnap = await tx.get(productRef);
    if (productSnap.exists()) {
      const rawSizes: SizeStock[] = Array.isArray(productSnap.data().sizes)
        ? (productSnap.data().sizes as SizeStock[])
        : [];
      const sizes = rawSizes.map((s) =>
        reconcileSize({ size: String(s.size), qty: Number(s.qty ?? 0), lots: s.lots ?? [] }),
      );

      const index = sizes.findIndex((s) => s.size === fresh.size);
      const restored = returning.map((l) => ({
        shipmentId: l.shipmentId,
        qty: l.qty,
        costPrice: l.costPrice,
        // Reuse the original arrival time so the batch keeps its place in FIFO.
        receivedAt: l.receivedAt,
      }));

      const nextSizes =
        index === -1
          ? // The size row was removed from the product after the sale — recreate it.
            [...sizes, reconcileSize({ size: fresh.size, qty: 0, lots: restored })]
          : sizes.map((s, i) => (i === index ? reconcileSize({ ...s, lots: [...s.lots, ...restored] }) : s));

      tx.update(productRef, { sizes: nextSizes, updatedAt: serverTimestamp() });
    }

    const nextReturned = fresh.returnedQty + returnQty;
    const keptQty = Math.max(0, fresh.qty - nextReturned);
    const remainingLots = keptLots({ ...fresh, returnedQty: nextReturned });
    const nextTotal = Math.max(0, fresh.sellPrice * keptQty - fresh.creditUsed);
    // Cash handed back reduces what the customer has effectively paid.
    const nextPaid = Math.max(0, Math.min(fresh.amountPaid, nextTotal));

    tx.update(saleRef, {
      returnedQty: nextReturned,
      profit: fresh.sellPrice * keptQty - fresh.creditUsed - lotsCost(remainingLots),
      costPrice: averageCost(remainingLots),
      amountPaid: nextPaid,
      paymentStatus: statusFor(nextTotal, nextPaid),
    });

    tx.set(returnRef, {
      saleId: fresh.id,
      productId: fresh.productId,
      productName: fresh.productName,
      size: fresh.size,
      qty: returnQty,
      refundAmount,
      reason: reason.trim() || 'بدون سبب محدد',
      createdBy: actor.uid,
      createdByName: actor.name,
      createdAt: serverTimestamp(),
    });
  });

  await logActivity(
    actor,
    'returned_item',
    `أرجع ${returnQty} × "${sale.productName}" مقاس ${sale.size} بقيمة ${refundAmount} ج`,
  );
}
