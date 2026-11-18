import { AppError } from '@/lib/db/collections';
import { invoiceNumber } from '@/lib/db/sale-math';
import { whatsappNumber } from '@/lib/format';
import type { OrderItem, StoreConfig, StoreOrder } from '@/lib/types';
import { cleanCustomer, deliveryFeeFor, newOrderId, type OrderRequest } from './order-model';

/**
 * What the public website sends: orders and "tell me when it is back".
 *
 * Deliberately free of the Firebase SDK. Both go through the server
 * (/api/orders, /api/restock), so the store pages no longer have to download
 * Firestore — the largest script in the app — just to take an order.
 */

export interface OrderInput {
  items: OrderItem[];
  fulfilment: 'delivery' | 'pickup';
  promoCode: string;
  customer: StoreOrder['customer'];
}

/**
 * The order could not reach the server at all (no network, request kept timing
 * out). It carries the order as the customer filled it, so the cart can still
 * hand it to the shop over WhatsApp — a sale is never lost to a weak connection.
 */
export class OrderNotSentError extends AppError {
  constructor(public readonly draft: StoreOrder) {
    super('الشبكة ضعيفة وما قدرنا نحفظ الطلب في الموقع.');
    this.name = 'OrderNotSentError';
  }
}

const ATTEMPT_TIMEOUT_MS = 20000;
const ATTEMPTS = 3;

/**
 * POSTs with retries. A 400/422 is the server's answer about the content (a size
 * sold out, a bad number) — retrying will not change it, so it is thrown as is.
 * Returns null when the server could never be reached or kept failing.
 */
async function postWithRetries(path: string, payload: unknown): Promise<Record<string, unknown> | null> {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ATTEMPT_TIMEOUT_MS);
    try {
      const res = await fetch(path, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      if (res.status === 400 || res.status === 422) throw new AppError(String(body.error ?? 'راجع البيانات.'));
      if (res.ok) return body;
      // 5xx: the server could not save — try again.
    } catch (err) {
      if (err instanceof AppError) throw err;
      // Network error or timeout — try again.
    } finally {
      clearTimeout(timer);
    }
    if (attempt < ATTEMPTS) await new Promise((r) => setTimeout(r, 1500 * attempt));
  }
  return null;
}

function toOrder(id: string, o: Omit<StoreOrder, 'id' | 'createdAt' | 'statusAt'>): StoreOrder {
  return { id, ...o, createdAt: null, statusAt: null };
}

/**
 * Places an order. Checks the form first so the customer hears about a missing
 * name at once, then sends with the same order id on every attempt, so the
 * server never stores it twice. `retryOf` keeps that id across a manual retry.
 */
export async function placeOrder(input: OrderInput, config: StoreConfig, retryOf?: string): Promise<StoreOrder> {
  if (!config.acceptingOrders) throw new AppError('الطلبات متوقفة مؤقتاً — تواصل معنا واتساب.');
  if (input.items.length === 0) throw new AppError('السلة فاضية.');
  let customer: StoreOrder['customer'];
  try {
    customer = cleanCustomer(input.customer, input.fulfilment);
  } catch (err) {
    throw new AppError(err instanceof Error ? err.message : 'راجع بياناتك.');
  }

  const id = retryOf ?? newOrderId();
  const request: OrderRequest = {
    id,
    items: input.items.map((i) => ({ productId: i.productId, size: i.size, qty: i.qty })),
    fulfilment: input.fulfilment,
    promoCode: input.promoCode,
    customer,
  };
  const saved = await postWithRetries('/api/orders', request);
  if (saved) {
    // The server's copy: prices from the live catalog, the phone as stored.
    return toOrder(id, {
      number: String(saved.number ?? invoiceNumber(id)),
      status: 'new',
      items: (saved.items as OrderItem[]) ?? [],
      subtotal: Number(saved.subtotal ?? 0),
      deliveryFee: Number(saved.deliveryFee ?? 0),
      total: Number(saved.total ?? 0),
      promoCode: String(saved.promoCode ?? ''),
      fulfilment: saved.fulfilment === 'pickup' ? 'pickup' : 'delivery',
      customer: (saved.customer as StoreOrder['customer']) ?? customer,
    });
  }

  // Never reached the server: give the cart what it needs to send it over WhatsApp.
  const items = input.items.map((i) => ({ ...i, qty: Math.floor(i.qty) }));
  const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
  const deliveryFee = deliveryFeeFor(config, subtotal, input.fulfilment);
  throw new OrderNotSentError(
    toOrder(id, {
      number: invoiceNumber(id),
      status: 'new',
      items,
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      promoCode: input.promoCode.trim().toUpperCase(),
      fulfilment: input.fulfilment,
      customer,
    }),
  );
}

/** The WhatsApp message the customer sends the shop, with every detail. */
export function orderWhatsappText(order: StoreOrder, trackUrl: string): string {
  const lines = [`طلب جديد من الموقع — رقم ${order.number}`, ''];
  for (const i of order.items) {
    lines.push(`• ${i.name} — مقاس ${i.size} × ${i.qty} = ${(i.price * i.qty).toLocaleString('en-US')} ج`);
  }
  lines.push('', `المجموع: ${order.subtotal.toLocaleString('en-US')} ج`);
  if (order.fulfilment === 'delivery')
    lines.push(`التوصيل: ${order.deliveryFee > 0 ? `${order.deliveryFee.toLocaleString('en-US')} ج` : 'مجاني'}`);
  lines.push(`الإجمالي: ${order.total.toLocaleString('en-US')} ج — الدفع عند الاستلام`);
  if (order.promoCode) lines.push(`كود الخصم: ${order.promoCode}`);
  lines.push('', `الاسم: ${order.customer.name}`, `الهاتف: ${order.customer.phone}`);
  if (order.fulfilment === 'delivery') {
    lines.push(`المنطقة: ${order.customer.area}`, `العنوان: ${order.customer.address}`);
  } else {
    lines.push('الاستلام: من المحل');
  }
  if (order.customer.notes) lines.push(`ملاحظات: ${order.customer.notes}`);
  // No link means the order never reached the site (weak network): the shop
  // reads it here and enters it by hand.
  lines.push('', trackUrl ? `تتبع الطلب: ${trackUrl}` : '(الطلب ما اتحفظ في الموقع بسبب الشبكة — سجّلوه من الرسالة دي)');
  return lines.join('\n');
}

/** "Tell me when it is back", from a visitor who is not signed in. */
export async function requestRestock(input: { productId: string; size: string; name: string; phone: string }): Promise<void> {
  const phone = whatsappNumber(input.phone);
  if (!phone || phone.length < 12) throw new AppError('اكتب رقم واتساب صحيح عشان نرسل ليك.');
  const saved = await postWithRetries('/api/restock', { productId: input.productId, size: input.size, name: input.name, phone });
  if (!saved) throw new AppError('الشبكة ضعيفة وما قدرنا نسجّل طلبك — جرّب تاني أو كلمنا واتساب.');
}
