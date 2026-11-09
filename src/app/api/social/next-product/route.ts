import { adminConfigured } from '@/lib/social/admin';
import { authorized, nextProduct } from '@/lib/social/feed';

/**
 * GET /api/social/next-product — what the Facebook page posts today.
 *
 * Called by the Make.com scenario at 20:00 Khartoum. Read-only: asking twice
 * returns the same product until /api/social/posted records it. 204 means every
 * candidate went out recently and the day is skipped.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  if (!authorized(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!adminConfigured()) return Response.json({ error: 'FIREBASE_SERVICE_ACCOUNT is not set' }, { status: 503 });
  try {
    const next = await nextProduct();
    if (!next) return new Response(null, { status: 204 });
    return Response.json(next, { headers: { 'Cache-Control': 'no-store' } });
  } catch (err) {
    console.error('social/next-product', err);
    return Response.json({ error: 'failed to choose a product' }, { status: 502 });
  }
}
