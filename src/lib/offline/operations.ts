'use client';

import { waitForPendingWrites } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logActivity } from '@/lib/db/activity';
import { AppError, COL, errorMessage } from '@/lib/db/collections';
import { awardReferralIfDue, ensureCustomer } from '@/lib/db/customers';
import {
  consumeFifo,
  averageCost,
  lotsCost,
  reconcileSize,
  saleTotal,
} from '@/lib/db/sale-math';
import {
  recordPayment,
  recordReturn,
  recordSale,
  toSaleLines,
  validateSale,
  type CartLine,
  type RemainingStock,
  type SaleInput,
} from '@/lib/db/sales';
import { applyReceive, prepareReceiveLines, type ReceiveLine } from '@/lib/db/shipments';
import { adjustmentLines, applyAdjust, applyCount, countLines, type CountDraft } from '@/lib/db/stocktake';
import type { Product, Sale, SaleItem, Shipment } from '@/lib/types';
import {
  enqueue,
  newDocId,
  outboxEntries,
  removeEntry,
  updateEntry,
  type OutboxEntry,
  type OutboxOp,
  type SaleOp,
} from './outbox';
import { isNetworkError, probablyOnline, withTimeout } from './write';

type Actor = { uid: string; name: string };

/** What every submit tells the screen: did it reach the server, or is it waiting. */
export interface Submitted {
  id: string;
  queued: boolean;
}

/* ---------- running one operation ---------- */

/**
 * Executes a queued operation against the server. Every branch is idempotent by
 * the entry id, so this is safe to call again for an entry that may already have
 * landed.
 */
async function execute(entry: OutboxEntry, replay: boolean): Promise<RemainingStock | void> {
  const options = { id: entry.id, at: entry.at, replay };
  const op = entry.op;

  switch (op.kind) {
    case 'sale': {
      // The customer is resolved here, at the moment the sale actually lands,
      // so a customer typed in offline is matched or created against the server.
      const customer = op.customerPhone.trim()
        ? await ensureCustomer(
            { name: op.customerName, phone: op.customerPhone, referredByCode: op.referredByCode },
            entry.actor,
          )
        : null;

      const input: SaleInput = {
        lines: op.lines,
        customerName: op.customerName,
        customerPhone: op.customerPhone,
        customerId: customer?.id ?? null,
        creditUsed: op.creditUsed,
        paymentStatus: op.paymentStatus,
        amountPaid: op.amountPaid,
        channel: op.channel,
        note: op.note,
      };
      const result = await recordSale(input, entry.actor, options);

      // Best-effort and itself idempotent: a missing reward can be re-granted,
      // a failed sale cannot.
      if (customer) {
        void awardReferralIfDue(customer.id, entry.id, op.referralReward, entry.actor).catch(() => undefined);
      }
      return result.remaining;
    }
    case 'payment':
      return recordPayment(op.saleId, op.amount, entry.actor, options);
    case 'return':
      return recordReturn(op.saleId, op.itemIndex, op.qty, op.reason, entry.actor, options);
    case 'receive':
      await applyReceive(entry.id, op, entry.actor);
      return;
    case 'count':
      return applyCount(entry.id, op, entry.actor, entry.at);
    case 'adjust':
      return applyAdjust(entry.id, op, entry.actor);
  }
}

/**
 * Tries the operation right now; if the network is not there, queues it.
 *
 * A business refusal while online (not enough stock, amount above the debt) is
 * thrown straight back so the seller sees it at the counter exactly as before —
 * nothing is queued. Only a missing or stalled connection queues.
 */
async function submit(
  op: OutboxOp,
  id: string,
  actor: Actor,
): Promise<Submitted & { remaining?: RemainingStock }> {
  const entry: OutboxEntry = { id, at: Date.now(), actor, op, state: 'pending', attempts: 0 };

  if (!probablyOnline()) {
    enqueue(entry);
    return { id, queued: true };
  }

  try {
    const remaining = await withTimeout(execute(entry, false), 12000);
    return { id, queued: false, remaining: remaining ?? undefined };
  } catch (err) {
    if (!isNetworkError(err)) throw err;
    // The attempt may still land server-side after we gave up on it; the
    // replay will then find the document and do nothing.
    enqueue(entry);
    void syncOutbox(actor.uid);
    return { id, queued: true };
  }
}

/* ---------- what the screens call ---------- */

export interface SaleSubmission {
  cart: CartLine[];
  customerName: string;
  customerPhone: string;
  referredByCode: string;
  creditUsed: number;
  paymentStatus: SaleOp['paymentStatus'];
  amountPaid: number;
  channel: SaleOp['channel'];
  note?: string;
  referralReward: number;
}

/**
 * The lines as this device sees them, lots included, for the invoice shown
 * before the server confirms. Uses the same FIFO rule the transaction will.
 */
function previewItems(cart: CartLine[]): SaleItem[] {
  const sizes = new Map<string, ReturnType<typeof reconcileSize>>();
  return cart.map((line) => {
    const key = `${line.product.id}|${line.size}`;
    const row =
      sizes.get(key) ??
      reconcileSize(line.product.sizes.find((s) => s.size === line.size) ?? { size: line.size, qty: 0, lots: [] });
    const take = Math.min(line.qty, row.qty);
    const { lots, taken } = take > 0 ? consumeFifo(row, take) : { lots: row.lots, taken: [] };
    sizes.set(key, reconcileSize({ ...row, lots }));
    return {
      productId: line.product.id,
      productName: line.product.name,
      size: line.size,
      qty: line.qty,
      sellPrice: line.sellPrice,
      costPrice: averageCost(taken),
      profit: line.sellPrice * line.qty - lotsCost(taken),
      lots: taken,
      returnedQty: 0,
    };
  });
}

export async function submitSale(input: SaleSubmission, actor: Actor) {
  const lines = toSaleLines(input.cart);
  const { credit, paid } = validateSale({
    lines,
    creditUsed: input.creditUsed,
    paymentStatus: input.paymentStatus,
    amountPaid: input.amountPaid,
    channel: input.channel,
  });
  if (input.paymentStatus !== 'paid' && !input.customerName.trim())
    throw new AppError('أدخل اسم العميل لتسجيل الدين.');

  const op: SaleOp = {
    kind: 'sale',
    lines,
    customerName: input.customerName.trim(),
    customerPhone: input.customerPhone.trim(),
    referredByCode: input.referredByCode.trim(),
    creditUsed: credit,
    paymentStatus: input.paymentStatus,
    amountPaid: paid,
    channel: input.channel,
    note: input.note,
    referralReward: input.referralReward,
    preview: previewItems(input.cart),
  };
  return submit(op, newDocId(COL.sales), actor);
}

export function submitPayment(sale: Sale, amount: number, actor: Actor) {
  return submit(
    { kind: 'payment', saleId: sale.id, amount, customerName: sale.customerName ?? '' },
    newDocId(COL.payments),
    actor,
  );
}

export function submitReturn(sale: Sale, itemIndex: number, qty: number, reason: string, actor: Actor) {
  const item = sale.items[itemIndex];
  if (!item) throw new AppError('الصنف غير موجود في هذه الفاتورة.');
  // What the drawer will lose, by the same rule the transaction applies.
  const after: Sale = {
    ...sale,
    items: sale.items.map((it, i) => (i === itemIndex ? { ...it, returnedQty: it.returnedQty + qty } : it)),
  };
  const cashRefunded = Math.max(0, sale.amountPaid - Math.min(sale.amountPaid, saleTotal(after)));
  return submit(
    {
      kind: 'return',
      saleId: sale.id,
      itemIndex,
      qty,
      reason,
      productId: item.productId,
      productName: item.productName,
      size: item.size,
      sellPrice: item.sellPrice,
      cashRefunded,
    },
    newDocId(COL.returns),
    actor,
  );
}

export function submitReceive(shipment: Shipment, lines: ReceiveLine[], actor: Actor) {
  return submit(
    {
      kind: 'receive',
      shipmentId: shipment.id,
      shipmentName: shipment.name,
      shipmentCode: shipment.code,
      receivedAt: shipment.arrivedAt?.toMillis() ?? Date.now(),
      lines: prepareReceiveLines(lines),
    },
    newDocId(COL.shipments),
    actor,
  );
}

export function submitCount(draft: CountDraft[], note: string, actor: Actor) {
  return submit({ kind: 'count', note, lines: countLines(draft) }, newDocId(COL.stockCounts), actor);
}

/**
 * Quantity changes from the product form. Returns null when nothing changed, so
 * a plain rename never enters the queue.
 */
export function submitStockAdjust(
  previous: Product,
  sizes: { size: string; qty: number }[],
  costPrice: number,
  actor: Actor,
) {
  const lines = adjustmentLines(previous, sizes);
  if (lines.length === 0) return Promise.resolve(null);
  return submit(
    { kind: 'adjust', productId: previous.id, productName: previous.name, costPrice, lines },
    newDocId(COL.products),
    actor,
  );
}

/* ---------- draining the queue ---------- */

let draining: Promise<void> | null = null;

/**
 * Sends everything this user queued, oldest first. Stops at the first network
 * failure — the rest would fail the same way — but steps past business
 * refusals, which are parked for review so they never block the sales behind them.
 */
export function syncOutbox(uid: string): Promise<void> {
  if (draining) return draining;
  draining = (async () => {
    try {
      if (!probablyOnline()) return;
      // Plain writes made offline (a new product, a customer) must reach the
      // server before the operations that reference them.
      await withTimeout(waitForPendingWrites(db()), 15000).catch(() => undefined);

      for (const entry of outboxEntries()) {
        // The rules only let a user write records in their own name, so another
        // person's queued work waits for them to sign in on this device.
        if (entry.state !== 'pending' || entry.actor.uid !== uid) continue;
        try {
          await withTimeout(execute(entry, true), 25000);
          removeEntry(entry.id);
        } catch (err) {
          if (isNetworkError(err)) {
            updateEntry(entry.id, { attempts: entry.attempts + 1 });
            break;
          }
          const message = errorMessage(err, 'رفض الخادم العملية.');
          updateEntry(entry.id, { state: 'conflict', error: message, attempts: entry.attempts + 1 });
          // The owner reads the activity log on their own phone; this is how a
          // problem on the seller's device reaches them.
          await logActivity(entry.actor, 'sync_conflict', `${describe(entry)} — ${message}`);
        }
      }
    } finally {
      draining = null;
    }
  })();
  return draining;
}

/** Puts a parked operation back in line, for after the cause was fixed. */
export function retryEntry(id: string, uid: string) {
  updateEntry(id, { state: 'pending', error: undefined });
  return syncOutbox(uid);
}

/** Drops a parked operation for good. Recorded, because goods or cash may have moved. */
export async function discardEntry(entry: OutboxEntry, actor: Actor) {
  removeEntry(entry.id);
  await logActivity(actor, 'sync_discarded', `ألغى عملية معلّقة: ${describe(entry)}`);
}

/** One line of Arabic describing a queued operation, for lists and the log. */
export function describe(entry: OutboxEntry): string {
  const op = entry.op;
  switch (op.kind) {
    case 'sale': {
      const units = op.lines.reduce((sum, l) => sum + l.qty, 0);
      const first = op.lines[0];
      const what =
        op.lines.length === 1 && first
          ? `${first.qty} × ${first.productName} مقاس ${first.size}`
          : `${units} قطعة في ${op.lines.length} أصناف`;
      return `بيع ${what}${op.customerName ? ` لـ ${op.customerName}` : ''}`;
    }
    case 'payment':
      return `تسديد ${op.amount} ج من ${op.customerName || 'عميل'}`;
    case 'return':
      return `إرجاع ${op.qty} × ${op.productName} مقاس ${op.size}`;
    case 'receive':
      return `استلام ${op.lines.reduce((s, l) => s + l.qty, 0)} قطعة — ${op.shipmentName}`;
    case 'count':
      return `جرد ${op.lines.length} مقاس`;
    case 'adjust':
      return `تعديل كميات ${op.productName}`;
  }
}
