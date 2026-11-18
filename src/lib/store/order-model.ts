import { whatsappNumber } from '@/lib/format';
import type { CatalogItem, OrderItem, StoreConfig, StoreOrder } from '@/lib/types';

/**
 * The website order, without Firestore: checks and totals shared by the cart
 * (to answer the customer at once) and by /api/orders (which decides).
 */

export const MAX_ORDER_LINES = 30;
export const MAX_LINE_QTY = 20;

export interface OrderRequest {
  /** Chosen by the browser, so a retried request cannot create a second order. */
  id: string;
  items: { productId: string; size: string; qty: number }[];
  fulfilment: 'delivery' | 'pickup';
  promoCode: string;
  customer: StoreOrder['customer'];
}

export class OrderProblem extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OrderProblem';
  }
}

export function deliveryFeeFor(config: StoreConfig, subtotal: number, fulfilment: 'delivery' | 'pickup'): number {
  if (fulfilment === 'pickup') return 0;
  if (config.freeDeliveryOver > 0 && subtotal >= config.freeDeliveryOver) return 0;
  return config.deliveryFee;
}

/** Firestore-style id: 20 letters and digits. */
export function newOrderId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => chars[b % chars.length]).join('');
}

export function isOrderId(id: unknown): id is string {
  return typeof id === 'string' && /^[A-Za-z0-9]{20}$/.test(id);
}

/** The customer's details, cleaned — the same rules the cart shows and the server enforces. */
export function cleanCustomer(raw: Partial<StoreOrder['customer']>, fulfilment: 'delivery' | 'pickup'): StoreOrder['customer'] {
  const text = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const name = text(raw.name, 80);
  if (name.length < 2) throw new OrderProblem('اكتب اسمك.');
  const phone = whatsappNumber(text(raw.phone, 40));
  if (!phone || phone.length < 12 || phone.length > 15) throw new OrderProblem('اكتب رقم هاتف صحيح عشان نتواصل معاك.');
  const address = text(raw.address, 300);
  if (fulfilment === 'delivery' && address.length < 4) throw new OrderProblem('اكتب عنوان التوصيل بالتفصيل.');
  return { name, phone, area: text(raw.area, 80), address, notes: text(raw.notes, 300) };
}

/**
 * Prices and availability come from the live catalog, not from the browser:
 * a cart saved days ago may hold an old price or a size that has since sold.
 */
export function priceItems(lines: OrderRequest['items'], catalog: Map<string, CatalogItem>): OrderItem[] {
  if (!Array.isArray(lines) || lines.length === 0) throw new OrderProblem('السلة فاضية.');
  if (lines.length > MAX_ORDER_LINES) throw new OrderProblem('الطلب فيهو أصناف كتيرة — قسّمو على طلبين.');
  return lines.map((line) => {
    const item = typeof line?.productId === 'string' ? catalog.get(line.productId) : undefined;
    if (!item) throw new OrderProblem('في منتج في السلة ما بقى متوفر في الموقع — شيلو من السلة وجرّب تاني.');
    const size = item.sizes.find((s) => s.size === String(line.size ?? ''));
    if (!size || size.state === 'out') throw new OrderProblem(`${item.name}: مقاس ${line.size} خلص — شيلو من السلة أو اختار مقاس تاني.`);
    const qty = Math.floor(Number(line.qty));
    if (!(qty >= 1 && qty <= MAX_LINE_QTY)) throw new OrderProblem('الكمية غير صحيحة.');
    return { productId: item.id, name: item.name, size: size.size, qty, price: item.price };
  });
}
