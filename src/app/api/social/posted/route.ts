import { adminConfigured, recordPost } from '@/lib/social/admin';
import { CAPTION_BANK } from '@/lib/social/caption-bank';
import { isKnownTemplate, type CaptionMeta } from '@/lib/social/compose';
import { authorized, captionFor, liveCatalog, loadHistory } from '@/lib/social/feed';
import { familyKey, inStockSizes, SOCIAL_KINDS, type SocialKind } from '@/lib/social/pick';
import { fetchCategories, fetchProduct } from '@/lib/store/server';

/**
 * POST /api/social/posted — records a post that went out.
 * Body: { productId, kind, fbPostId, captionMeta? }.
 *
 * captionMeta is what next-product returned. When Make does not send it back,
 * the same deterministic choice is recomputed here from the same history and day,
 * so Make only has to report what it posted.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function readMeta(raw: unknown): CaptionMeta | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const templateId = typeof m.templateId === 'string' ? m.templateId : '';
  const questionIndex = Number.isInteger(m.questionIndex) ? (m.questionIndex as number) : NaN;
  const hashtagIndex = Number.isInteger(m.hashtagIndex) ? (m.hashtagIndex as number) : NaN;
  if (!isKnownTemplate(templateId)) return null;
  if (!(questionIndex >= -1 && questionIndex < CAPTION_BANK.questions.length)) return null;
  if (!(hashtagIndex >= -1 && hashtagIndex < CAPTION_BANK.hashtags.length)) return null;
  return { templateId, questionIndex, hashtagIndex };
}

export async function POST(req: Request) {
  if (!authorized(req)) return Response.json({ error: 'unauthorized' }, { status: 401 });
  if (!adminConfigured()) return Response.json({ error: 'FIREBASE_SERVICE_ACCOUNT is not set' }, { status: 503 });

  let body: { productId?: unknown; kind?: unknown; fbPostId?: unknown; captionMeta?: unknown };
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
    const [catalog, posts, categories] = await Promise.all([liveCatalog(), loadHistory(), fetchCategories()]);
    // The live listing drops a product the moment its last size sells; it still went out.
    const item = catalog.find((c) => c.id === productId) ?? (await fetchProduct(productId, true));
    if (!item) return Response.json({ error: 'unknown product' }, { status: 404 });
    const meta = readMeta(body.captionMeta) ?? captionFor({ item, kind, sizes: inStockSizes(item) }, posts, categories).meta;
    const id = await recordPost({ productId, kind, fbPostId, ...meta, family: familyKey(item.name) });
    return Response.json({ ok: true, id, captionMeta: meta });
  } catch (err) {
    console.error('social/posted', err);
    return Response.json({ error: 'failed to record the post' }, { status: 502 });
  }
}
