import type { Expense, Product, Sale } from '@/lib/types';
import { keptLots, netQty, saleDue, saleTotal } from '@/lib/db/sales';
import { dateKey, toDate } from '@/lib/format';
import { totalStock } from '@/lib/db/products';

export interface SalesSummary {
  revenue: number;
  cost: number;
  grossProfit: number;
  units: number;
  transactions: number;
  outstanding: number;
  collected: number;
}

export function summarize(sales: Sale[]): SalesSummary {
  let revenue = 0;
  let cost = 0;
  let units = 0;
  let outstanding = 0;
  let collected = 0;

  for (const s of sales) {
    const kept = netQty(s);
    revenue += saleTotal(s);
    cost += s.costPrice * kept;
    units += kept;
    outstanding += saleDue(s);
    collected += Math.min(s.amountPaid, saleTotal(s));
  }

  return {
    revenue,
    cost,
    grossProfit: revenue - cost,
    units,
    transactions: sales.filter((s) => netQty(s) > 0).length,
    outstanding,
    collected,
  };
}

export function sumExpenses(expenses: Expense[]): number {
  return expenses.reduce((sum, e) => sum + e.amount, 0);
}

/** Net profit is what the owner actually keeps: gross margin minus running costs. */
export function netProfit(sales: Sale[], expenses: Expense[]): number {
  return summarize(sales).grossProfit - sumExpenses(expenses);
}

export interface DailyPoint {
  date: Date;
  key: string;
  revenue: number;
  profit: number;
  units: number;
}

/** Buckets sales into the given days (zero-filled, so the chart has no gaps). */
export function dailySeries(sales: Sale[], days: Date[]): DailyPoint[] {
  const buckets = new Map<string, DailyPoint>();
  for (const d of days) {
    buckets.set(dateKey(d), { date: d, key: dateKey(d), revenue: 0, profit: 0, units: 0 });
  }
  for (const s of sales) {
    const d = toDate(s.createdAt);
    if (!d) continue;
    const bucket = buckets.get(dateKey(d));
    if (!bucket) continue;
    bucket.revenue += saleTotal(s);
    bucket.profit += s.profit;
    bucket.units += netQty(s);
  }
  return days.map((d) => buckets.get(dateKey(d))!);
}

export interface ProductRank {
  productId: string;
  productName: string;
  units: number;
  revenue: number;
  profit: number;
}

export function topProducts(sales: Sale[], limit = 5): ProductRank[] {
  const map = new Map<string, ProductRank>();
  for (const s of sales) {
    const kept = netQty(s);
    if (kept <= 0) continue;
    const entry =
      map.get(s.productId) ??
      { productId: s.productId, productName: s.productName, units: 0, revenue: 0, profit: 0 };
    entry.units += kept;
    entry.revenue += saleTotal(s);
    entry.profit += s.profit;
    map.set(s.productId, entry);
  }
  return [...map.values()].sort((a, b) => b.units - a.units || b.revenue - a.revenue).slice(0, limit);
}

export interface LowStockRow {
  product: Product;
  size: string;
  qty: number;
}

/**
 * Per-size alerts, not per-product: the owner needs to know that size 42 is gone,
 * not that "this shoe is low". Zero-quantity sizes come first.
 */
export function lowStockRows(products: Product[]): LowStockRow[] {
  const rows: LowStockRow[] = [];
  for (const p of products) {
    if (p.isArchived) continue;
    for (const s of p.sizes) {
      if (s.qty <= p.lowStockThreshold) rows.push({ product: p, size: s.size, qty: s.qty });
    }
  }
  return rows.sort((a, b) => a.qty - b.qty || a.product.name.localeCompare(b.product.name, 'ar'));
}

/** Products with stock on hand that have not sold in `days` days. */
export function staleProducts(products: Product[], days = 30): { product: Product; lastSold: Date | null; idleDays: number }[] {
  const now = Date.now();
  const cutoff = now - days * 86400_000;
  const rows: { product: Product; lastSold: Date | null; idleDays: number }[] = [];

  for (const p of products) {
    if (p.isArchived || totalStock(p) === 0) continue;
    const lastSold = toDate(p.lastSoldAt);
    const created = toDate(p.createdAt);
    // Never-sold products count from when they were added, so a product added
    // yesterday is not flagged as stale.
    const reference = lastSold ?? created;
    if (!reference) continue;
    if (reference.getTime() > cutoff) continue;
    rows.push({ product: p, lastSold, idleDays: Math.floor((now - reference.getTime()) / 86400_000) });
  }
  return rows.sort((a, b) => b.idleDays - a.idleDays);
}

export interface RestockRow {
  product: Product;
  size: string;
  qty: number;
  /** Units of this exact product+size sold in the window. */
  sold: number;
  /** Whole days of stock left at the current rate; Infinity when nothing sells. */
  daysOfCover: number;
  /** Suggested order quantity to cover the same window again. */
  suggested: number;
}

/**
 * What to actually buy in the next shipment.
 *
 * A flat low-stock list is not an order sheet: a size sitting at zero that sells
 * eight a month matters far more than one that sells none. This crosses the stock
 * level with real sales velocity so the scarce sizes that move rise to the top.
 */
export function restockPriority(products: Product[], sales: Sale[], days = 30): RestockRow[] {
  const since = Date.now() - days * 86400_000;

  // Units sold per product+size inside the window.
  const sold = new Map<string, number>();
  for (const s of sales) {
    const at = toDate(s.createdAt)?.getTime() ?? 0;
    if (at < since) continue;
    const key = `${s.productId}|${s.size}`;
    sold.set(key, (sold.get(key) ?? 0) + netQty(s));
  }

  const rows: RestockRow[] = [];
  for (const p of products) {
    if (p.isArchived) continue;
    for (const size of p.sizes) {
      if (size.qty > p.lowStockThreshold) continue;
      const units = sold.get(`${p.id}|${size.size}`) ?? 0;
      const perDay = units / days;
      rows.push({
        product: p,
        size: size.size,
        qty: size.qty,
        sold: units,
        daysOfCover: perDay > 0 ? Math.floor(size.qty / perDay) : Infinity,
        // Order enough to last another full window, rounded up to a whole unit.
        suggested: Math.max(1, Math.ceil(units - size.qty)),
      });
    }
  }

  // Fast movers first; among equals, the emptiest shelf wins.
  return rows.sort((a, b) => b.sold - a.sold || a.qty - b.qty);
}

export interface DebtorRow {
  customerName: string;
  customerPhone?: string;
  due: number;
  sales: Sale[];
}

/** Groups open balances by customer so the owner sees one line per person. */
export function debtorRows(sales: Sale[]): DebtorRow[] {
  const map = new Map<string, DebtorRow>();
  for (const s of sales) {
    const due = saleDue(s);
    if (due <= 0) continue;
    const name = s.customerName?.trim() || 'عميل بدون اسم';
    const key = `${name}|${s.customerPhone ?? ''}`;
    const entry = map.get(key) ?? { customerName: name, customerPhone: s.customerPhone, due: 0, sales: [] };
    entry.due += due;
    entry.sales.push(s);
    map.set(key, entry);
  }
  return [...map.values()].sort((a, b) => b.due - a.due);
}

export interface ShipmentStats {
  shipmentId: string;
  /** Units still on the shelf that came from this shipment. */
  remainingUnits: number;
  /** Money still tied up in unsold goods from this shipment. */
  remainingCost: number;
  soldUnits: number;
  soldRevenue: number;
  soldCost: number;
  profit: number;
}

function emptyStats(shipmentId: string): ShipmentStats {
  return {
    shipmentId,
    remainingUnits: 0,
    remainingCost: 0,
    soldUnits: 0,
    soldRevenue: 0,
    soldCost: 0,
    profit: 0,
  };
}

/**
 * Per-shipment performance, derived from lots rather than stored separately.
 *
 * Remaining stock comes from the lots still sitting in products; sold figures come
 * from the lots each sale consumed. Because both sides reference the same lot data,
 * the numbers cannot drift out of sync with actual stock.
 */
export function shipmentStats(products: Product[], sales: Sale[]): Map<string, ShipmentStats> {
  const map = new Map<string, ShipmentStats>();
  const bucket = (id: string | null) => {
    const key = id ?? UNASSIGNED;
    const entry = map.get(key) ?? emptyStats(key);
    map.set(key, entry);
    return entry;
  };

  for (const product of products) {
    for (const size of product.sizes) {
      for (const lot of size.lots) {
        const entry = bucket(lot.shipmentId);
        entry.remainingUnits += lot.qty;
        entry.remainingCost += lot.qty * lot.costPrice;
      }
    }
  }

  for (const sale of sales) {
    const kept = keptLots(sale);
    const units = kept.reduce((sum, l) => sum + l.qty, 0);
    if (units === 0) continue;
    // Revenue is split across lots in proportion to the units drawn from each.
    const perUnitRevenue = saleTotal(sale) / units;
    for (const lot of kept) {
      const entry = bucket(lot.shipmentId);
      entry.soldUnits += lot.qty;
      entry.soldRevenue += perUnitRevenue * lot.qty;
      entry.soldCost += lot.costPrice * lot.qty;
      entry.profit += perUnitRevenue * lot.qty - lot.costPrice * lot.qty;
    }
  }

  return map;
}

/** Key used for stock that was added without naming a shipment. */
export const UNASSIGNED = '__unassigned__';

/** Adds several shipments' figures together, for a merged group view. */
export function sumStats(entries: ShipmentStats[]): ShipmentStats {
  return entries.reduce((acc, s) => ({
    shipmentId: 'group',
    remainingUnits: acc.remainingUnits + s.remainingUnits,
    remainingCost: acc.remainingCost + s.remainingCost,
    soldUnits: acc.soldUnits + s.soldUnits,
    soldRevenue: acc.soldRevenue + s.soldRevenue,
    soldCost: acc.soldCost + s.soldCost,
    profit: acc.profit + s.profit,
  }), emptyStats('group'));
}

/** Percent change between two periods; null when there is no baseline. */
export function changePercent(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}
