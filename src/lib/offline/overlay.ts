'use client';

import { Timestamp } from 'firebase/firestore';
import type { DebtPayment, Product, Sale, SaleReturn, SizeStock, StockLot } from '@/lib/types';
import {
  applyManualQty,
  consumeFifo,
  reconcileSize,
  saleTotal,
  sizeAverageCost,
  statusFor,
} from '@/lib/db/sale-math';
import { isOp, type OutboxEntry } from './outbox';

/**
 * Shows the shop as it really is on this device: server data with everything
 * still sitting in the offline queue applied on top.
 *
 * Nothing here is ever written anywhere. The server recomputes every figure
 * inside its own transaction when the queue drains; this only keeps the screen
 * honest in the meantime — a size sold offline reads as sold, a cash repayment
 * taken offline shows in today's close.
 */

type Mutable = Map<string, Product>;

function cloneProduct(p: Product): Product {
  return { ...p, sizes: p.sizes.map((s) => ({ ...s, lots: [...s.lots] })) };
}

function withSize(map: Mutable, productId: string, size: string, edit: (row: SizeStock | null) => SizeStock | null) {
  const product = map.get(productId);
  if (!product) return;
  const index = product.sizes.findIndex((s) => s.size === size);
  const next = edit(index === -1 ? null : product.sizes[index]!);
  if (index === -1) {
    if (next) product.sizes = [...product.sizes, next];
  } else if (next) {
    product.sizes = product.sizes.map((s, i) => (i === index ? next : s));
  } else {
    product.sizes = product.sizes.filter((_, i) => i !== index);
  }
}

function addLot(map: Mutable, productId: string, size: string, lot: StockLot) {
  withSize(map, productId, size, (row) =>
    reconcileSize({ size, qty: 0, lots: [...(row?.lots ?? []), lot] }),
  );
}

function adjust(map: Mutable, productId: string, size: string, delta: number, cost: number) {
  withSize(map, productId, size, (row) => {
    const current = row ?? { size, qty: 0, lots: [] };
    return applyManualQty(current, Math.max(0, current.qty + delta), cost, null);
  });
}

export function applyPendingToProducts(products: Product[], entries: OutboxEntry[]): Product[] {
  if (entries.length === 0 || products.length === 0) return products;

  const touched = new Set<string>();
  for (const e of entries) {
    const op = e.op;
    if (op.kind === 'sale') op.lines.forEach((l) => touched.add(l.productId));
    else if (op.kind === 'return' || op.kind === 'adjust') touched.add(op.productId);
    else if (op.kind === 'receive' || op.kind === 'count') op.lines.forEach((l) => touched.add(l.productId));
  }
  if (touched.size === 0) return products;

  // Only the products the queue mentions are copied; the rest keep their identity
  // so memoised screens downstream do not re-render for nothing.
  const map: Mutable = new Map();
  for (const p of products) if (touched.has(p.id)) map.set(p.id, cloneProduct(p));

  for (const e of entries) {
    const op = e.op;
    switch (op.kind) {
      case 'sale':
        for (const line of op.lines) {
          withSize(map, line.productId, line.size, (row) => {
            if (!row) return row;
            // Server stock may already be short (that is what a conflict is);
            // show what is physically left rather than throwing.
            const take = Math.min(line.qty, row.qty);
            if (take <= 0) return row;
            return reconcileSize({ ...row, lots: consumeFifo(row, take).lots });
          });
        }
        break;
      case 'return': {
        const product = map.get(op.productId);
        const row = product?.sizes.find((s) => s.size === op.size);
        const cost = row ? sizeAverageCost(row, product!.costPrice) : (product?.costPrice ?? 0);
        addLot(map, op.productId, op.size, { shipmentId: null, qty: op.qty, costPrice: cost, receivedAt: e.at });
        break;
      }
      case 'receive':
        for (const line of op.lines) {
          addLot(map, line.productId, line.size, {
            shipmentId: op.shipmentId,
            qty: line.qty,
            costPrice: line.costPrice,
            receivedAt: op.receivedAt,
          });
        }
        break;
      case 'count':
        for (const line of op.lines) {
          adjust(map, line.productId, line.size, line.countedQty - line.systemQty, line.costPrice);
        }
        break;
      case 'adjust':
        for (const line of op.lines) {
          adjust(map, op.productId, line.size, line.delta, op.costPrice);
          if (line.remove) {
            withSize(map, op.productId, line.size, (row) => (row && row.qty === 0 ? null : row));
          }
        }
        break;
      default:
        break;
    }
  }

  return products.map((p) => map.get(p.id) ?? p);
}

/** Queued sales rendered as ordinary invoices, flagged so screens can badge them. */
export function pendingSales(entries: OutboxEntry[]): Sale[] {
  const out: Sale[] = [];
  for (const e of entries) {
    if (!isOp(e, 'sale')) continue;
    const op = e.op;
    out.push({
      id: e.id,
      items: op.preview,
      profit: op.preview.reduce((sum, it) => sum + it.profit, 0) - op.creditUsed,
      customerName: op.customerName || undefined,
      customerPhone: op.customerPhone || undefined,
      customerId: null,
      creditUsed: op.creditUsed,
      paymentStatus: op.paymentStatus,
      amountPaid: op.amountPaid,
      soldBy: e.actor.uid,
      soldByName: e.actor.name,
      channel: op.channel,
      note: op.note,
      createdAt: Timestamp.fromMillis(e.at),
      pending: e.state,
    });
  }
  return out;
}

/** Applies queued repayments and returns to the invoices they belong to. */
export function applyPendingToSales(sales: Sale[], entries: OutboxEntry[]): Sale[] {
  const payments = entries.filter((e) => isOp(e, 'payment'));
  const returns = entries.filter((e) => isOp(e, 'return'));
  if (payments.length === 0 && returns.length === 0) return sales;

  return sales.map((sale) => {
    let next = sale;
    for (const e of returns) {
      if (!isOp(e, 'return') || e.op.saleId !== sale.id) continue;
      const op = e.op;
      const items = next.items.map((it, i) =>
        i === op.itemIndex ? { ...it, returnedQty: Math.min(it.qty, it.returnedQty + op.qty) } : it,
      );
      const draft: Sale = { ...next, items };
      const paid = Math.min(next.amountPaid, saleTotal(draft));
      next = { ...draft, amountPaid: paid, paymentStatus: statusFor(saleTotal(draft), paid) };
    }
    for (const e of payments) {
      if (!isOp(e, 'payment') || e.op.saleId !== sale.id) continue;
      const paid = next.amountPaid + e.op.amount;
      next = { ...next, amountPaid: paid, paymentStatus: statusFor(saleTotal(next), paid) };
    }
    return next;
  });
}

export function pendingPayments(entries: OutboxEntry[]): DebtPayment[] {
  const out: DebtPayment[] = [];
  for (const e of entries) {
    if (!isOp(e, 'payment')) continue;
    out.push({
      id: e.id,
      saleId: e.op.saleId,
      customerName: e.op.customerName,
      amount: e.op.amount,
      receivedBy: e.actor.uid,
      receivedByName: e.actor.name,
      createdAt: Timestamp.fromMillis(e.at),
      pending: e.state,
    });
  }
  return out;
}

export function pendingReturns(entries: OutboxEntry[]): SaleReturn[] {
  const out: SaleReturn[] = [];
  for (const e of entries) {
    if (!isOp(e, 'return')) continue;
    const op = e.op;
    out.push({
      id: e.id,
      saleId: op.saleId,
      productId: op.productId,
      productName: op.productName,
      size: op.size,
      qty: op.qty,
      refundAmount: op.sellPrice * op.qty,
      cashRefunded: op.cashRefunded,
      reason: op.reason,
      createdBy: e.actor.uid,
      createdByName: e.actor.name,
      createdAt: Timestamp.fromMillis(e.at),
      pending: e.state,
    });
  }
  return out;
}

/** True when the entry's own date falls in [from, to], both epoch millis. */
export function inWindow(e: OutboxEntry, from: number | null, to: number | null): boolean {
  if (from === null || to === null) return false;
  return e.at >= from && e.at <= to;
}
