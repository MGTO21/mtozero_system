import { invoiceNumber } from '@/lib/db/sale-math';
import { adminConfigured, createDocument } from '@/lib/social/admin';
import { cleanCustomer, deliveryFeeFor, isOrderId, OrderProblem, priceItems, type OrderRequest } from '@/lib/store/order-model';
import { fetchCatalog, fetchStoreConfig } from '@/lib/store/server';

/**
 * POST /api/orders — places a website order.
 *
 * Orders used to be written from the visitor's browser over Firestore's
 * long-lived channel. On a weak connection or inside Facebook's in-app browser
 * that channel often stalls: the page gave up after 15 s and told the customer
 * the order failed, while the write sometimes landed later — so some customers
 * left and others tapped again and sent the same order four times.
 *
 * Here it is one plain HTTPS request. The server checks prices and sizes
 * against the live catalog and writes with the service account. The browser
 * chooses the order id, so retrying the same request never makes a copy.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  if (!adminConfigured()) {
    console.error('orders: FIREBASE_SERVICE_ACCOUNT is not set');
    return json({ error: 'الطلبات ما شغالة من الموقع هسع — أرسل طلبك في واتساب.' }, 503);
  }

  let body: Partial<OrderRequest>;
  try {
    body = (await req.json()) as Partial<OrderRequest>;
  } catch {
    return json({ error: 'الطلب ما وصل كامل — جرّب تاني.' }, 400);
  }
  if (!isOrderId(body.id)) return json({ error: 'الطلب ما وصل كامل — جرّب تاني.' }, 400);
  const fulfilment = body.fulfilment === 'pickup' ? 'pickup' : 'delivery';

  try {
    const [config, catalog] = await Promise.all([fetchStoreConfig(), fetchCatalog(true)]);
    if (!config.acceptingOrders) throw new OrderProblem('الطلبات متوقفة مؤقتاً — تواصل معانا واتساب.');
    if (fulfilment === 'pickup' && !config.pickupEnabled) throw new OrderProblem('الاستلام من المحل متوقف هسع — اختار التوصيل.');

    const items = priceItems(body.items ?? [], new Map(catalog.map((c) => [c.id, c])));
    const customer = cleanCustomer(body.customer ?? {}, fulfilment);
    const subtotal = items.reduce((sum, i) => sum + i.price * i.qty, 0);
    const deliveryFee = deliveryFeeFor(config, subtotal, fulfilment);
    const order = {
      number: invoiceNumber(body.id),
      status: 'new',
      items,
      subtotal,
      deliveryFee,
      total: subtotal + deliveryFee,
      promoCode: typeof body.promoCode === 'string' ? body.promoCode.trim().toUpperCase().slice(0, 40) : '',
      fulfilment,
      customer,
    };

    const result = await createDocument('orders', body.id, { ...order, createdAt: new Date() });
    if (result === 'exists') console.warn('orders: retry of an order already saved', body.id);
    return json({ id: body.id, ...order, createdAtMs: Date.now() }, result === 'created' ? 201 : 200);
  } catch (err) {
    if (err instanceof OrderProblem) return json({ error: err.message }, 422);
    console.error('orders: failed to place', body.id, err);
    return json({ error: 'حصلت مشكلة في السيرفر وما اتحفظ الطلب.' }, 502);
  }
}
