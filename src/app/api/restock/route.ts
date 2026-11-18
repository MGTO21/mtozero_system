import { createHash } from 'node:crypto';
import { whatsappNumber } from '@/lib/format';
import { adminConfigured, createDocument } from '@/lib/social/admin';
import { fetchProduct } from '@/lib/store/server';

/**
 * POST /api/restock — "tell me when it is back" from the website.
 * Body: { productId, size, name, phone }.
 *
 * Same reason as /api/orders: a write from the visitor's browser stalls on a
 * weak connection. The document id is derived from product, size, phone and
 * day, so tapping twice (or a retried request) never makes a second request.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: Request) {
  if (!adminConfigured()) return json({ error: 'ما قدرنا نسجّل طلبك هسع — كلمنا واتساب.' }, 503);
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return json({ error: 'الطلب ما وصل كامل — جرّب تاني.' }, 400);
  }
  const productId = typeof body.productId === 'string' ? body.productId : '';
  const size = typeof body.size === 'string' ? body.size.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim().slice(0, 60) : '';
  const phone = whatsappNumber(typeof body.phone === 'string' ? body.phone.slice(0, 40) : '');
  if (!phone || phone.length < 12 || phone.length > 15) return json({ error: 'اكتب رقم واتساب صحيح عشان نرسل ليك.' }, 422);

  try {
    const product = await fetchProduct(productId, true);
    const known = product?.sizes.some((s) => s.size === size);
    if (!product || !known) return json({ error: 'المنتج ده ما بقى في الموقع.' }, 422);

    const day = new Date(Date.now() + 2 * 3600 * 1000).toISOString().slice(0, 10);
    const id = createHash('sha1').update(`${product.id}|${size}|${phone}|${day}`).digest('hex').slice(0, 20);
    await createDocument('restockRequests', id, {
      productId: product.id,
      productName: product.name.slice(0, 120),
      size: size.slice(0, 12),
      name,
      phone,
      status: 'open',
      createdAt: new Date(),
    });
    return json({ ok: true });
  } catch (err) {
    console.error('restock: failed', productId, err);
    return json({ error: 'حصلت مشكلة وما اتسجّل طلبك — جرّب تاني.' }, 502);
  }
}
