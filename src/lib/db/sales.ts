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
import { useEffect, useMemo, useState } from 'react';
import { db } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/hooks/useFirestore';
import { useOutbox } from '@/lib/offline/outbox';
import {
  applyPendingToSales,
  inWindow,
  pendingPayments,
  pendingReturns,
  pendingSales,
} from '@/lib/offline/overlay';
import type {
  Channel,
  ConsumedLot,
  DebtPayment,
  PaymentStatus,
  Product,
  Sale,
  SaleItem,
  SaleReturn,
} from '@/lib/types';
import { AppError, COL } from './collections';
import { logActivity } from './activity';
import { normalizeStoredSizes } from './products';
import {
  averageCost,
  consumeFifo,
  itemNetQty,
  lotsAfterReturns,
  lotsCost,
  reconcileSize,
  saleDue,
  saleTotal,
  statusFor,
  takeNewest,
} from './sale-math';

// The arithmetic is shared with the offline overlay and lives in sale-math.ts;
// it is re-exported so every screen keeps importing it from here.
export {
  averageCost,
  consumeFifo,
  invoiceNumber,
  itemCost,
  itemGross,
  itemNetQty,
  keptLots,
  lineCount,
  lotsAfterReturns,
  lotsCost,
  netQty,
  saleCost,
  saleDue,
  saleGross,
  saleLabel,
  saleProfit,
  saleTotal,
  statusFor,
  takeNewest,
} from './sale-math';

function mapLots(raw: unknown, fallbackQty: number, fallbackCost: number): ConsumedLot[] {
  const lots = Array.isArray(raw) ? (raw as ConsumedLot[]) : [];
  if (lots.length > 0) {
    return lots.map((l) => ({
      shipmentId: l.shipmentId ?? null,
      qty: Number(l.qty ?? 0),
      costPrice: Number(l.costPrice ?? 0),
      receivedAt: Number(l.receivedAt ?? 0),
    }));
  }
  // Sales recorded before lot tracking carry no breakdown; treat them as one
  // unattributed batch so returns and shipment reports still work on them.
  return fallbackQty > 0
    ? [{ shipmentId: null, qty: fallbackQty, costPrice: fallbackCost, receivedAt: 0 }]
    : [];
}

function mapItem(raw: Record<string, unknown>): SaleItem {
  const qty = Number(raw.qty ?? 0);
  const costPrice = Number(raw.costPrice ?? 0);
  return {
    productId: String(raw.productId ?? ''),
    productName: String(raw.productName ?? ''),
    size: String(raw.size ?? ''),
    qty,
    sellPrice: Number(raw.sellPrice ?? 0),
    listPrice: Number(raw.listPrice ?? raw.sellPrice ?? 0),
    costPrice,
    profit: Number(raw.profit ?? 0),
    lots: mapLots(raw.lots, qty, costPrice),
    returnedQty: Number(raw.returnedQty ?? 0),
  };
}

export function mapSale(id: string, raw: Record<string, unknown>): Sale {
  const rawItems = Array.isArray(raw.items) ? (raw.items as Record<string, unknown>[]) : [];

  // Sales written before the cart existed are flat: one product, one size. They
  // are read as a single-line invoice so every screen keeps working unchanged.
  const items =
    rawItems.length > 0
      ? rawItems.map(mapItem)
      : raw.productId
        ? [mapItem(raw)]
        : [];

  return {
    id,
    items,
    profit: Number(raw.profit ?? 0),
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
    createdAt: (raw.createdAt as Timestamp) ?? null,
  };
}

function mapPayment(id: string, raw: Record<string, unknown>): DebtPayment {
  return {
    id,
    saleId: String(raw.saleId ?? ''),
    customerName: String(raw.customerName ?? ''),
    amount: Number(raw.amount ?? 0),
    receivedBy: String(raw.receivedBy ?? ''),
    receivedByName: String(raw.receivedByName ?? 'مستخدم'),
    createdAt: (raw.createdAt as Timestamp) ?? null,
  };
}

export function mapReturn(id: string, raw: Record<string, unknown>): SaleReturn {
  return {
    id,
    saleId: String(raw.saleId ?? ''),
    productId: String(raw.productId ?? ''),
    productName: String(raw.productName ?? ''),
    size: String(raw.size ?? ''),
    qty: Number(raw.qty ?? 0),
    refundAmount: Number(raw.refundAmount ?? 0),
    // Returns written before cash was tracked report nothing rather than guessing:
    // assuming the full value had been paid would invent money out of the drawer.
    cashRefunded: Number(raw.cashRefunded ?? 0),
    reason: String(raw.reason ?? ''),
    createdBy: String(raw.createdBy ?? ''),
    createdByName: String(raw.createdByName ?? 'مستخدم'),
    createdAt: (raw.createdAt as Timestamp) ?? null,
  };
}

const byNewest = <T extends { createdAt: Timestamp | null }>(a: T, b: T) =>
  (b.createdAt?.toMillis() ?? 0) - (a.createdAt?.toMillis() ?? 0);

/**
 * Server rows plus this device's queued rows for the same window. A queued row
 * whose id already came back from the server is the same record mid-handover,
 * so the server copy wins and it is never counted twice.
 */
function mergeById<T extends { id: string; createdAt: Timestamp | null }>(server: T[], local: T[]): T[] {
  if (local.length === 0) return server;
  const seen = new Set(server.map((r) => r.id));
  return [...server, ...local.filter((r) => !seen.has(r.id))].sort(byNewest);
}

/* ---------- queries ---------- */

export function useSalesBetween(from: Date | null, to: Date | null) {
  const state = useLiveQuery<Sale>(
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
  const outbox = useOutbox();
  const fromMs = from?.getTime() ?? null;
  const toMs = to?.getTime() ?? null;
  const data = useMemo(() => {
    const local = pendingSales(outbox.filter((e) => inWindow(e, fromMs, toMs)));
    return applyPendingToSales(mergeById(state.data, local), outbox);
  }, [state.data, outbox, fromMs, toMs]);
  return { ...state, data };
}

/** Every sale still carrying a balance. Sorted client-side to avoid a composite index. */
export function useOpenDebts() {
  const state = useLiveQuery<Sale>(
    () => query(collection(db(), COL.sales), where('paymentStatus', 'in', ['debt', 'partial'])),
    [],
    mapSale,
  );
  const outbox = useOutbox();
  const data = useMemo(
    () =>
      applyPendingToSales(mergeById(state.data, pendingSales(outbox)), outbox)
        .filter((s) => saleDue(s) > 0)
        .sort(byNewest),
    [state.data, outbox],
  );
  return { ...state, data };
}

/**
 * Debt repayments in a window. These are cash that arrived today for goods sold
 * on an earlier day, so a daily close cannot be computed from sales alone.
 */
export function usePaymentsBetween(from: Date | null, to: Date | null) {
  const state = useLiveQuery<DebtPayment>(
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
    mapPayment,
  );
  const outbox = useOutbox();
  const fromMs = from?.getTime() ?? null;
  const toMs = to?.getTime() ?? null;
  const data = useMemo(
    () => mergeById(state.data, pendingPayments(outbox.filter((e) => inWindow(e, fromMs, toMs)))),
    [state.data, outbox, fromMs, toMs],
  );
  return { ...state, data };
}

/**
 * Returns recorded in a window. The daily close needs these because a refund is
 * cash leaving the drawer today against goods that may have been sold weeks ago —
 * invisible in both the day's sales and its debt repayments.
 */
export function useReturnsBetween(from: Date | null, to: Date | null) {
  const state = useLiveQuery<SaleReturn>(
    () => {
      if (!from || !to) return null;
      return query(
        collection(db(), COL.returns),
        where('createdAt', '>=', Timestamp.fromDate(from)),
        where('createdAt', '<=', Timestamp.fromDate(to)),
        orderBy('createdAt', 'desc'),
      );
    },
    [from?.getTime() ?? 0, to?.getTime() ?? 0],
    mapReturn,
  );
  const outbox = useOutbox();
  const fromMs = from?.getTime() ?? null;
  const toMs = to?.getTime() ?? null;
  const data = useMemo(
    () => mergeById(state.data, pendingReturns(outbox.filter((e) => inWindow(e, fromMs, toMs)))),
    [state.data, outbox, fromMs, toMs],
  );
  return { ...state, data };
}

/**
 * Single sale, live — used by the invoice and return sheets. A sale still in the
 * offline queue is served from the queue, so its invoice can be shared at once.
 */
export function useSale(saleId: string | null) {
  const [server, setServer] = useState<Sale | null>(null);
  const outbox = useOutbox();

  useEffect(() => {
    if (!saleId) {
      setServer(null);
      return;
    }
    return onSnapshot(
      doc(db(), COL.sales, saleId),
      (snap) => setServer(snap.exists() ? mapSale(snap.id, snap.data()) : null),
      () => setServer(null),
    );
  }, [saleId]);

  return useMemo(() => {
    if (!saleId) return null;
    const base = server ?? pendingSales(outbox).find((s) => s.id === saleId) ?? null;
    return base ? (applyPendingToSales([base], outbox)[0] ?? null) : null;
  }, [saleId, server, outbox]);
}

/* ---------- the write path ---------- */

/** One line the seller has put in the cart. */
export interface CartLine {
  product: Product;
  size: string;
  qty: number;
  /** Unit price actually charged; may be discounted below the product default. */
  sellPrice: number;
}

/** What the transaction needs of a cart line — no product snapshot, no image. */
export interface SaleLine {
  productId: string;
  productName: string;
  size: string;
  qty: number;
  sellPrice: number;
}

export interface SaleInput {
  lines: SaleLine[];
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
 * How a write is being made. `id` fixes the document so a replay can tell it
 * already happened; `at` is when the seller actually did it, which is what the
 * day's figures must count — not when the phone found a signal.
 */
export interface ReplayOptions {
  id: string;
  at: number;
  /** True when draining the offline queue rather than serving a live tap. */
  replay: boolean;
}

/** Stock left of a size after the sale, keyed `productId|size`. */
export type RemainingStock = Record<string, number>;

/** Turns cart lines into the shape the transaction and the queue store. */
export function toSaleLines(lines: CartLine[]): SaleLine[] {
  return lines.map((l) => ({
    productId: l.product.id,
    productName: l.product.name,
    size: l.size,
    qty: Math.floor(l.qty),
    sellPrice: l.sellPrice,
  }));
}

/** What the customer pays now, from the chosen payment mode. Shared by both paths. */
export function effectivePaid(status: PaymentStatus, total: number, typed: number | undefined): number {
  if (status === 'paid') return total;
  if (status === 'debt') return 0;
  return Math.min(Math.max(0, typed ?? 0), total);
}

export function validateSale(input: SaleInput): { gross: number; credit: number; total: number; paid: number } {
  if (input.lines.length === 0) throw new AppError('السلة فارغة — أضف صنفاً واحداً على الأقل.');
  for (const line of input.lines) {
    if (line.qty <= 0) throw new AppError('الكمية يجب أن تكون قطعة واحدة على الأقل.');
    if (line.sellPrice <= 0) throw new AppError(`سعر البيع غير صحيح لـ "${line.productName}".`);
  }
  const gross = input.lines.reduce((sum, l) => sum + l.sellPrice * l.qty, 0);
  // Referral credit is applied before payment: it lowers what the customer owes,
  // so a fully-credited sale is 'paid' with no cash at all.
  const credit = Math.min(Math.max(0, input.creditUsed ?? 0), gross);
  const total = gross - credit;
  const paid = effectivePaid(input.paymentStatus, total, input.amountPaid);
  if (input.paymentStatus === 'partial' && paid <= 0)
    throw new AppError('أدخل المبلغ المدفوع، أو اختر "دين كامل".');
  return { gross, credit, total, paid };
}

/**
 * Records a whole invoice and decrements stock for every line in ONE transaction.
 *
 * The all-or-nothing scope is the point: a customer buying three items must never
 * end up with two of them deducted and the third rejected. Lines are grouped by
 * product first, so two sizes of the same shoe touch a single document — which is
 * also what keeps the read set small enough to stay contention-free.
 *
 * Critical guarantees, covered by tests in docs/TESTING.md:
 *  - selling the last unit leaves the size at exactly 0, never negative;
 *  - a size emptied by another device mid-sale fails the WHOLE invoice, writing
 *    nothing at all;
 *  - referral credit is spent in the same transaction, so it cannot leak;
 *  - running it twice with the same id is a no-op the second time, which is what
 *    lets the offline queue retry after a dropped acknowledgement.
 */
export async function recordSale(
  input: SaleInput,
  actor: { uid: string; name: string },
  options: ReplayOptions,
): Promise<{ saleId: string; remaining: RemainingStock; alreadyApplied: boolean }> {
  const lines = input.lines.map((l) => ({ ...l, qty: Math.floor(l.qty) }));
  const { credit, total, paid } = validateSale({ ...input, lines });

  // Group by product so each document is read and written exactly once.
  const byProduct = new Map<string, SaleLine[]>();
  for (const line of lines) {
    byProduct.set(line.productId, [...(byProduct.get(line.productId) ?? []), line]);
  }

  const productIds = [...byProduct.keys()];
  const saleRef = doc(db(), COL.sales, options.id);
  const customerRef = input.customerId ? doc(db(), COL.customers, input.customerId) : null;

  const result = await runTransaction(db(), async (tx) => {
    // Every read must precede every write in a Firestore transaction.
    const existing = await tx.get(saleRef);
    if (existing.exists()) return { left: {} as RemainingStock, alreadyApplied: true };

    const productSnaps = await Promise.all(
      productIds.map((id) => tx.get(doc(db(), COL.products, id))),
    );
    const customerSnap = customerRef ? await tx.get(customerRef) : null;

    // Credit is validated inside the same transaction as the stock move, so a
    // failed sale can never leave a customer's balance reduced.
    if (credit > 0) {
      if (!customerSnap?.exists()) throw new AppError('لا يمكن استخدام الرصيد بدون عميل مسجّل.');
      const balance = Number(customerSnap.data().creditBalance ?? 0);
      if (credit > balance) throw new AppError(`رصيد العميل ${balance} ج فقط.`);
    }

    const items: SaleItem[] = [];
    const left: RemainingStock = {};
    const updates: { ref: ReturnType<typeof doc>; sizes: ReturnType<typeof normalizeStoredSizes> }[] = [];

    productSnaps.forEach((snap, i) => {
      const productId = productIds[i]!;
      const productLines = byProduct.get(productId)!;
      if (!snap.exists()) throw new AppError(`المنتج "${productLines[0]!.productName}" غير موجود.`);

      const data = snap.data();
      const productName = String(data.name ?? productLines[0]!.productName);
      let sizes = normalizeStoredSizes(data);

      for (const line of productLines) {
        const index = sizes.findIndex((s) => s.size === line.size);
        if (index === -1) throw new AppError(`المقاس ${line.size} غير موجود في "${productName}".`);

        const current = sizes[index]!.qty;
        if (current === 0) throw new AppError(`المقاس ${line.size} من "${productName}" غير متوفر.`);
        if (current < line.qty)
          throw new AppError(`المتوفر من مقاس ${line.size} في "${productName}" هو ${current} فقط.`);

        // Cost comes from the batches actually consumed, read inside the
        // transaction, so a later price edit cannot distort recorded profit.
        const { lots, taken } = consumeFifo(sizes[index]!, line.qty);
        sizes = sizes.map((s, j) => (j === index ? reconcileSize({ ...s, lots }) : s));

        items.push({
          productId,
          productName,
          size: line.size,
          qty: line.qty,
          sellPrice: line.sellPrice,
          // Read inside the transaction, like the cost: the list price as it
          // stood when the customer paid, not after a later price change.
          listPrice: Math.max(line.sellPrice, Number(data.sellPrice ?? line.sellPrice)),
          costPrice: averageCost(taken),
          profit: line.sellPrice * line.qty - lotsCost(taken),
          lots: taken,
          returnedQty: 0,
        });
        left[`${productId}|${line.size}`] = current - line.qty;
      }

      updates.push({ ref: snap.ref, sizes });
    });

    for (const update of updates) {
      tx.update(update.ref, {
        sizes: update.sizes,
        lastSoldAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }

    tx.set(saleRef, {
      items,
      // Credit spent is a real cost to the shop, so it comes out of profit too.
      profit: items.reduce((sum, it) => sum + it.profit, 0) - credit,
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
      // A replayed sale is dated when it happened on the shop floor; the sync
      // time is kept beside it for the audit trail.
      createdAt: options.replay ? Timestamp.fromMillis(options.at) : serverTimestamp(),
      ...(options.replay ? { syncedAt: serverTimestamp(), recordedOffline: true } : {}),
    });

    if (customerRef && customerSnap?.exists()) {
      const customer = customerSnap.data();
      tx.update(customerRef, {
        creditBalance: Math.max(0, Number(customer.creditBalance ?? 0) - credit),
        totalSpent: Number(customer.totalSpent ?? 0) + total,
        totalOrders: Number(customer.totalOrders ?? 0) + 1,
        lastPurchaseAt: serverTimestamp(),
      });
    }

    return { left, alreadyApplied: false };
  });

  if (!result.alreadyApplied) {
    const units = lines.reduce((sum, l) => sum + l.qty, 0);
    const summary =
      lines.length === 1
        ? `${lines[0]!.qty} × "${lines[0]!.productName}" مقاس ${lines[0]!.size}`
        : `${units} قطعة في ${lines.length} أصناف`;

    await logActivity(
      actor,
      'sold_product',
      `باع ${summary} بـ ${total} ج` +
        (input.paymentStatus === 'paid' ? '' : ` (${input.paymentStatus === 'debt' ? 'دين' : 'دفع جزئي'})`) +
        (options.replay ? ' — سُجّلت بدون شبكة' : ''),
    );
  }

  return { saleId: saleRef.id, remaining: result.left, alreadyApplied: result.alreadyApplied };
}

/** Records a repayment against a debt sale and re-derives its payment status. */
export async function recordPayment(
  saleId: string,
  amount: number,
  actor: { uid: string; name: string },
  options: ReplayOptions,
): Promise<void> {
  if (amount <= 0) throw new AppError('أدخل مبلغاً أكبر من صفر.');
  const saleRef = doc(db(), COL.sales, saleId);
  const paymentRef = doc(db(), COL.payments, options.id);

  const info = await runTransaction(db(), async (tx) => {
    const done = await tx.get(paymentRef);
    if (done.exists()) return null;

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
      createdAt: options.replay ? Timestamp.fromMillis(options.at) : serverTimestamp(),
    });
    return { customer: sale.customerName ?? 'عميل', remaining: due - amount };
  });

  if (info) {
    await logActivity(
      actor,
      'recorded_payment',
      `سجّل تسديد ${amount} ج من ${info.customer}` +
        (info.remaining > 0 ? ` (متبقٍ ${info.remaining} ج)` : ' — سُدّد كاملاً'),
    );
  }
}

/**
 * Partially or fully reverses one line of a sale: stock goes back to the size, the
 * sale keeps existing with a `returnedQty`, and profit/paid amounts are re-derived
 * so the reports stay correct. Sales are never deleted.
 *
 * Everything is read inside the transaction, by sale id, so a return queued
 * offline is validated against the invoice as it stands when it finally runs.
 */
export async function recordReturn(
  saleId: string,
  /** Which line of the invoice is coming back. */
  itemIndex: number,
  qty: number,
  reason: string,
  actor: { uid: string; name: string },
  options: ReplayOptions,
): Promise<void> {
  const returnQty = Math.floor(qty);
  if (returnQty <= 0) throw new AppError('عدد القطع المرتجعة يجب أن يكون 1 على الأقل.');

  const saleRef = doc(db(), COL.sales, saleId);
  const returnRef = doc(db(), COL.returns, options.id);

  const outcome = await runTransaction(db(), async (tx) => {
    const done = await tx.get(returnRef);
    if (done.exists()) return null;

    const saleSnap = await tx.get(saleRef);
    if (!saleSnap.exists()) throw new AppError('عملية البيع غير موجودة.');
    const fresh = mapSale(saleSnap.id, saleSnap.data());
    const line = fresh.items[itemIndex];
    if (!line) throw new AppError('الصنف غير موجود في هذه الفاتورة.');
    if (returnQty > itemNetQty(line))
      throw new AppError(`لا يمكن إرجاع أكثر من ${itemNetQty(line)} قطعة.`);

    const productRef = doc(db(), COL.products, line.productId);
    const productSnap = await tx.get(productRef);

    // Units go back to the exact batch they left, so shipment stock stays honest
    // and a return never silently re-prices inventory.
    const returning = takeNewest(line.lots, line.returnedQty, returnQty);

    if (productSnap.exists()) {
      // Normalized, not reconciled raw: a pre-lot size row has no `lots`, and
      // rebuilding its qty from an empty list would wipe stock on sizes this
      // return never touched.
      const sizes = normalizeStoredSizes(productSnap.data());

      const index = sizes.findIndex((s) => s.size === line.size);
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
            [...sizes, reconcileSize({ size: line.size, qty: 0, lots: restored })]
          : sizes.map((s, i) => (i === index ? reconcileSize({ ...s, lots: [...s.lots, ...restored] }) : s));

      tx.update(productRef, { sizes: nextSizes, updatedAt: serverTimestamp() });
    }

    // Only the affected line changes; the rest of the invoice stands.
    const nextItems = fresh.items.map((it, i) => {
      if (i !== itemIndex) return it;
      const nextReturned = it.returnedQty + returnQty;
      const keptQty = Math.max(0, it.qty - nextReturned);
      const remainingLots = lotsAfterReturns(it.lots, nextReturned);
      return {
        ...it,
        returnedQty: nextReturned,
        costPrice: averageCost(remainingLots),
        profit: it.sellPrice * keptQty - lotsCost(remainingLots),
      };
    });

    const nextSale: Sale = { ...fresh, items: nextItems };
    const nextTotal = saleTotal(nextSale);
    // Cash handed back reduces what the customer has effectively paid.
    const nextPaid = Math.max(0, Math.min(fresh.amountPaid, nextTotal));
    // The drop in what was paid IS the money that left the drawer. A return on an
    // unpaid sale moves no cash at all — it just cancels part of the debt.
    const cashRefunded = Math.max(0, fresh.amountPaid - nextPaid);
    const refundAmount = line.sellPrice * returnQty;

    tx.update(saleRef, {
      items: nextItems,
      profit: nextItems.reduce((sum, it) => sum + it.profit, 0) - fresh.creditUsed,
      amountPaid: nextPaid,
      paymentStatus: statusFor(nextTotal, nextPaid),
    });

    tx.set(returnRef, {
      saleId: fresh.id,
      productId: line.productId,
      productName: line.productName,
      size: line.size,
      qty: returnQty,
      refundAmount,
      cashRefunded,
      reason: reason.trim() || 'بدون سبب محدد',
      createdBy: actor.uid,
      createdByName: actor.name,
      createdAt: options.replay ? Timestamp.fromMillis(options.at) : serverTimestamp(),
    });

    return { line, refundAmount, cashRefunded };
  });

  if (outcome) {
    await logActivity(
      actor,
      'returned_item',
      `أرجع ${returnQty} × "${outcome.line.productName}" مقاس ${outcome.line.size} بقيمة ${outcome.refundAmount} ج` +
        (outcome.cashRefunded > 0
          ? ` — رُدّ نقداً ${outcome.cashRefunded} ج`
          : ' — بدون نقد مرجّع (خُصم من الدين)'),
    );
  }
}
