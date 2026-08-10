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
  SaleItem,
  SizeStock,
} from '@/lib/types';
import { AppError, COL } from './collections';
import { logActivity } from './activity';
import { reconcileSize } from './products';

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
 * Picks `qty` units from the newest end of a line's lots, skipping units already
 * returned. Returns come off the most recently consumed batch first — the mirror
 * image of FIFO consumption.
 */
export function takeNewest(lots: ConsumedLot[], alreadyReturned: number, qty: number): ConsumedLot[] {
  const available = lotsAfterReturns(lots, alreadyReturned);
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
 * The lots still with the customer after `returned` units went back, oldest first.
 * Returns give back the most recently taken units, mirroring consumption.
 */
export function lotsAfterReturns(lots: ConsumedLot[], returned: number): ConsumedLot[] {
  let toDrop = returned;
  const out = [...lots];
  for (let i = out.length - 1; i >= 0 && toDrop > 0; i--) {
    const take = Math.min(out[i]!.qty, toDrop);
    out[i] = { ...out[i]!, qty: out[i]!.qty - take };
    toDrop -= take;
  }
  return out.filter((l) => l.qty > 0);
}

/** The lots a line still holds after its own returns. */
export function keptLots(item: SaleItem): ConsumedLot[] {
  return lotsAfterReturns(item.lots, item.returnedQty);
}

/* ---------- derived money helpers (single source of truth) ---------- */

/** Units of one line the customer actually kept. */
export function itemNetQty(item: SaleItem): number {
  return Math.max(0, item.qty - item.returnedQty);
}

/** Value of one line after its returns, before any invoice-level credit. */
export function itemGross(item: SaleItem): number {
  return item.sellPrice * itemNetQty(item);
}

/** Real supplier cost of the units this line still holds. */
export function itemCost(item: SaleItem): number {
  return lotsCost(keptLots(item));
}

/** Units kept across the whole invoice. */
export function netQty(sale: Sale): number {
  return sale.items.reduce((sum, i) => sum + itemNetQty(i), 0);
}

/** Distinct lines still on the invoice. */
export function lineCount(sale: Sale): number {
  return sale.items.filter((i) => itemNetQty(i) > 0).length;
}

/** Ticket value before referral credit — used when showing the discount line. */
export function saleGross(sale: Sale): number {
  return sale.items.reduce((sum, i) => sum + itemGross(i), 0);
}

/** What the customer actually owes: kept lines less any referral credit applied. */
export function saleTotal(sale: Sale): number {
  return Math.max(0, saleGross(sale) - sale.creditUsed);
}

export function saleDue(sale: Sale): number {
  return Math.max(0, saleTotal(sale) - sale.amountPaid);
}

/** Cost of goods across the invoice, from the batches actually consumed. */
export function saleCost(sale: Sale): number {
  return sale.items.reduce((sum, i) => sum + itemCost(i), 0);
}

/** Profit recomputed from current state; credit is a cost the shop absorbs. */
export function saleProfit(sale: Sale): number {
  return saleGross(sale) - sale.creditUsed - saleCost(sale);
}

/** One-line description for lists: the first product, plus a count of the rest. */
export function saleLabel(sale: Sale): string {
  const live = sale.items.filter((i) => itemNetQty(i) > 0);
  const shown = live.length > 0 ? live : sale.items;
  const first = shown[0];
  if (!first) return 'فاتورة فارغة';
  if (shown.length === 1) return `${first.productName} — مقاس ${first.size}`;
  return `${first.productName} و${shown.length - 1} صنف آخر`;
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

/** One line the seller has put in the cart. */
export interface CartLine {
  product: Product;
  size: string;
  qty: number;
  /** Unit price actually charged; may be discounted below the product default. */
  sellPrice: number;
}

export interface SaleInput {
  lines: CartLine[];
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

/** Stock left of a size after the sale, keyed `productId|size`. */
export type RemainingStock = Record<string, number>;

/** Rebuilds a stored size row into lot form, upgrading pre-lot documents. */
function normalizeSizes(data: Record<string, unknown>): SizeStock[] {
  const rawSizes: SizeStock[] = Array.isArray(data.sizes) ? (data.sizes as SizeStock[]) : [];
  const fallbackCost = Number(data.costPrice ?? 0);
  const createdMillis = (data.createdAt as Timestamp)?.toMillis?.() ?? 0;

  return rawSizes.map((s) => {
    const onHand = Math.max(0, Number(s.qty ?? 0));
    const lots =
      Array.isArray(s.lots) && s.lots.length > 0
        ? s.lots
        : onHand > 0
          ? [{ shipmentId: null, qty: onHand, costPrice: fallbackCost, receivedAt: createdMillis }]
          : [];
    return reconcileSize({ size: String(s.size), qty: onHand, lots });
  });
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
 *  - referral credit is spent in the same transaction, so it cannot leak.
 */
export async function recordSale(
  input: SaleInput,
  actor: { uid: string; name: string },
): Promise<{ saleId: string; remaining: RemainingStock }> {
  const lines = input.lines.map((l) => ({ ...l, qty: Math.floor(l.qty) }));
  if (lines.length === 0) throw new AppError('السلة فارغة — أضف صنفاً واحداً على الأقل.');
  for (const line of lines) {
    if (line.qty <= 0) throw new AppError('الكمية يجب أن تكون قطعة واحدة على الأقل.');
    if (line.sellPrice <= 0) throw new AppError(`سعر البيع غير صحيح لـ "${line.product.name}".`);
  }

  const gross = lines.reduce((sum, l) => sum + l.sellPrice * l.qty, 0);
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

  // Group by product so each document is read and written exactly once.
  const byProduct = new Map<string, CartLine[]>();
  for (const line of lines) {
    byProduct.set(line.product.id, [...(byProduct.get(line.product.id) ?? []), line]);
  }

  const productIds = [...byProduct.keys()];
  const saleRef = doc(collection(db(), COL.sales));
  const customerRef = input.customerId ? doc(db(), COL.customers, input.customerId) : null;

  const remaining = await runTransaction(db(), async (tx) => {
    // Every read must precede every write in a Firestore transaction.
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
    const updates: { ref: ReturnType<typeof doc>; sizes: SizeStock[] }[] = [];

    productSnaps.forEach((snap, i) => {
      const productId = productIds[i]!;
      const productLines = byProduct.get(productId)!;
      if (!snap.exists()) throw new AppError(`المنتج "${productLines[0]!.product.name}" غير موجود.`);

      const data = snap.data();
      const productName = String(data.name ?? productLines[0]!.product.name);
      let sizes = normalizeSizes(data);

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
      createdAt: serverTimestamp(),
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

    return left;
  });

  const units = lines.reduce((sum, l) => sum + l.qty, 0);
  const summary =
    lines.length === 1
      ? `${lines[0]!.qty} × "${lines[0]!.product.name}" مقاس ${lines[0]!.size}`
      : `${units} قطعة في ${lines.length} أصناف`;

  await logActivity(
    actor,
    'sold_product',
    `باع ${summary} بـ ${total} ج` +
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
  /** Which line of the invoice is coming back. */
  itemIndex: number,
  qty: number,
  reason: string,
  actor: { uid: string; name: string },
): Promise<void> {
  const returnQty = Math.floor(qty);
  if (returnQty <= 0) throw new AppError('عدد القطع المرتجعة يجب أن يكون 1 على الأقل.');

  const target = sale.items[itemIndex];
  if (!target) throw new AppError('الصنف غير موجود في هذه الفاتورة.');
  if (returnQty > itemNetQty(target))
    throw new AppError(`لا يمكن إرجاع أكثر من ${itemNetQty(target)} قطعة.`);

  const saleRef = doc(db(), COL.sales, sale.id);
  const productRef = doc(db(), COL.products, target.productId);
  const returnRef = doc(collection(db(), COL.returns));
  const refundAmount = target.sellPrice * returnQty;

  await runTransaction(db(), async (tx) => {
    const saleSnap = await tx.get(saleRef);
    if (!saleSnap.exists()) throw new AppError('عملية البيع غير موجودة.');
    const productSnap = await tx.get(productRef);

    const fresh = mapSale(saleSnap.id, saleSnap.data());
    const line = fresh.items[itemIndex];
    if (!line) throw new AppError('الصنف غير موجود في هذه الفاتورة.');
    if (returnQty > itemNetQty(line))
      throw new AppError(`لا يمكن إرجاع أكثر من ${itemNetQty(line)} قطعة.`);

    // Units go back to the exact batch they left, so shipment stock stays honest
    // and a return never silently re-prices inventory.
    const returning = takeNewest(line.lots, line.returnedQty, returnQty);

    if (productSnap.exists()) {
      const rawSizes: SizeStock[] = Array.isArray(productSnap.data().sizes)
        ? (productSnap.data().sizes as SizeStock[])
        : [];
      const sizes = rawSizes.map((s) =>
        reconcileSize({ size: String(s.size), qty: Number(s.qty ?? 0), lots: s.lots ?? [] }),
      );

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
      reason: reason.trim() || 'بدون سبب محدد',
      createdBy: actor.uid,
      createdByName: actor.name,
      createdAt: serverTimestamp(),
    });
  });

  await logActivity(
    actor,
    'returned_item',
    `أرجع ${returnQty} × "${target.productName}" مقاس ${target.size} بقيمة ${refundAmount} ج`,
  );
}
