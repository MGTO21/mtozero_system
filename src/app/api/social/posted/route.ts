import { adminConfigured, recordPost } from '@/lib/social/admin';
import { nextTemplateIndex } from '@/lib/social/captions';
import { authorized, loadHistory } from '@/lib/social/feed';
import { familyKey, SOCIAL_KINDS, type SocialKind } from '@/lib/social/pick';
import { fetchProduct } from '@/lib/store/server';

/**
 * POST /api/social/posted — records a post that went out.
 * Body: { productId, kind, fbPostId }.
 *
 * The caption template and the product's family are worked out here from the
 * same history next-product used, so Make only reports what it posted.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!adminConfigured()) return Response.json({ error: 'FIREBASE_SERVICE_ACCOUNT is not set' }, { status: 503 });

  let body: { productId?: unknown; kind?: unknown; fbPostId?: unknown };
  try {
    body = await req.json();
  } catch {
    return Response.json({ error: 'body must be JSON' }, { status: 400 });
  }
  const productId = typeof body.productId === 'string' ? body.productId.trim() : '';
  const kind = body.kind as SocialKind;
  const fbPostId = typeof body.fbPostId === 'string' ? body.fbPostId.trim().slice(0, 120) : '';
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(productId) || !SOCIAL_KINDS.includes(kind)) {
    return Response.json({ error: 'productId and kind (new | last | spotlight) are required' }, { status: 400 });
  }

  try {
    const [product, posts] = await Promise.all([fetchProduct(productId, true), loadHistory()]);
    if (!product) return Response.json({ error: 'unknown product' }, { status: 404 });
    const id = await recordPost({
      productId,
      kind,
      fbPostId,
      templateIndex: nextTemplateIndex(kind, posts),
      family: familyKey(product.name),
    });
    return Response.json({ ok: true, id });
  } catch (err) {
    console.error('social/posted', err);
    return Response.json({ error: 'failed to record the post' }, { status: 502 });
  }
}
