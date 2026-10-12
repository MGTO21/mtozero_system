/**
 * Pure stock and money arithmetic — no Firestore, no React.
 *
 * Kept apart from the data modules so the offline layer can apply the very same
 * rules to work that has not reached the server yet. `db/products.ts` and
 * `db/sales.ts` re-export everything here, so callers keep importing from there.
 */
import type { ConsumedLot, PaymentStatus, Promo, Sale, SaleItem, SizeStock } from '@/lib/types';
import { AppError } from './collections';

/* ---------- size rows and lots ---------- */

/**
 * Forces the invariant `qty === sum(lots.qty)`, drops empty lots and keeps them in
 * FIFO order. Every write path must pass its size rows through here — it is the
 * only guard against stock and lots drifting apart.
 */
export function reconcileSize(size: SizeStock): SizeStock {
  const lots = (size.lots ?? [])
    .map((l) => ({
      shipmentId: l.shipmentId ?? null,
      qty: Math.max(0, Math.floor(Number(l.qty ?? 0))),
      costPrice: Math.max(0, Number(l.costPrice ?? 0)),
      receivedAt: Number(l.receivedAt ?? 0),
    }))
    .filter((l) => l.qty > 0)
    .sort((a, b) => a.receivedAt - b.receivedAt);

  return {
    size: String(size.size),
    qty: lots.reduce((sum, l) => sum + l.qty, 0),
    lots,
  };
}

/**
 * Applies a hand-typed quantity to a size while preserving lot history.
 *
 * Increases become a new unattributed lot at the product's current cost;
 * decreases are taken from the newest lots first, so the oldest (and usually
 * cheapest) batch stays traceable for as long as possible.
 */
export function applyManualQty(
  current: SizeStock,
  targetQty: number,
  costPrice: number,
  shipmentId: string | null,
): SizeStock {
  const target = Math.max(0, Math.floor(targetQty));
  const lots = [...(current.lots ?? [])].sort((a, b) => a.receivedAt - b.receivedAt);
  const onHand = lots.reduce((sum, l) => sum + l.qty, 0);

  if (target === onHand) return reconcileSize({ ...current, lots });

  if (target > onHand) {
    lots.push({
      shipmentId,
      qty: target - onHand,
      costPrice,
      receivedAt: Date.now(),
    });
    return reconcileSize({ ...current, lots });
  }

  let toRemove = onHand - target;
  for (let i = lots.length - 1; i >= 0 && toRemove > 0; i--) {
    const take = Math.min(lots[i]!.qty, toRemove);
    lots[i] = { ...lots[i]!, qty: lots[i]!.qty - take };
    toRemove -= take;
  }
  return reconcileSize({ ...current, lots });
}

/** Average unit cost of what is currently in a size, from its lots. */
export function sizeAverageCost(size: SizeStock, fallback: number): number {
  const units = size.lots.reduce((sum, l) => sum + l.qty, 0);
  if (units === 0) return fallback;
  return size.lots.reduce((sum, l) => sum + l.qty * l.costPrice, 0) / units;
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

/** What the customer actually owes: kept lines less the code's discount and wallet credit. */
export function saleTotal(sale: Sale): number {
  return Math.max(0, saleGross(sale) - sale.promoDiscount - sale.creditUsed);
}

export function saleDue(sale: Sale): number {
  return Math.max(0, saleTotal(sale) - sale.amountPaid);
}

/** Cost of goods across the invoice, from the batches actually consumed. */
export function saleCost(sale: Sale): number {
  return sale.items.reduce((sum, i) => sum + itemCost(i), 0);
}

/** Profit recomputed from current state; credit and discounts are costs the shop absorbs. */
export function saleProfit(sale: Sale): number {
  return saleGross(sale) - sale.promoDiscount - sale.creditUsed - saleCost(sale);
}

/* ---------- discount codes ---------- */

/** Normalizes a typed code: case and spaces never make two codes differ. */
export function normalizeCode(code: string): string {
  return code.trim().toUpperCase().replace(/\s+/g, '');
}

/**
 * How much a code takes off an invoice of `gross`, or the reason it cannot be
 * used — thrown as an AppError so the seller reads it as is.
 *
 * One function for both sides: the sell screen calls it on the cached code to
 * show the discount before confirming, and the sale transaction calls it again
 * on the code as the server holds it, which is the answer that counts.
 */
export function evaluatePromo(promo: Promo, gross: number, phone: string | null, nowMs: number): number {
  if (!promo.active) throw new AppError(`الكود ${promo.code} موقوف.`);
  const expires = promo.expiresAt?.toMillis?.() ?? null;
  if (expires !== null && nowMs > expires) throw new AppError(`انتهت صلاحية الكود ${promo.code}.`);
  if (promo.maxUses > 0 && promo.uses >= promo.maxUses)
    throw new AppError(`الكود ${promo.code} استُخدم بالعدد المسموح.`);
  if (promo.oncePerCustomer) {
    if (!phone) throw new AppError(`الكود ${promo.code} يحتاج رقم هاتف العميل.`);
    if (promo.usedBy.includes(phone)) throw new AppError('العميل استخدم الكود دا قبل كدا.');
  }
  if (promo.minTotal > 0 && gross < promo.minTotal)
    throw new AppError(`الكود ${promo.code} يحتاج فاتورة ${promo.minTotal.toLocaleString('en-US')} ج أو أكثر.`);

  let discount: number;
  if (promo.kind === 'percent') {
    discount = Math.floor((gross * Math.min(100, Math.max(0, promo.value))) / 100);
    if (promo.maxDiscount > 0) discount = Math.min(discount, promo.maxDiscount);
  } else if (promo.kind === 'fixed') {
    discount = Math.min(promo.value, gross);
  } else {
    if (promo.balance <= 0) throw new AppError(`رصيد القسيمة ${promo.code} خلص.`);
    discount = Math.min(promo.balance, gross);
  }
  return Math.max(0, Math.floor(discount));
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

/**
 * Short invoice number people can read out over the phone. Derived from the
 * document id so it is identical on the device that queued the sale and on every
 * device that later sees it synced.
 */
export function invoiceNumber(saleId: string): string {
  return saleId.slice(0, 6).toUpperCase();
}
