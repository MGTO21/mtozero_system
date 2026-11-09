import { renderCard } from '@/lib/social/card';
import { cardVersion } from '@/lib/social/feed';
import { inStockSizes, SOCIAL_KINDS, type SocialKind } from '@/lib/social/pick';
import { fetchProduct } from '@/lib/store/server';

/**
 * GET /api/social/card/[id]?kind=…&v=… — the post image, 1080×1350 PNG.
 *
 * Public on purpose: Make and Facebook fetch it by URL, and it shows only what
 * the store already shows. Drawn from the live catalog; `v` changes with the
 * price, sizes, picture or label, so the CDN may keep each version for good.
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const url = new URL(req.url);
  const kindParam = url.searchParams.get('kind') as SocialKind | null;
  const kind: SocialKind = kindParam && SOCIAL_KINDS.includes(kindParam) ? kindParam : 'spotlight';

  const item = await fetchProduct(params.id, true);
  const sizes = item ? inStockSizes(item) : [];
  if (!item || !item.listed || sizes.length === 0) return new Response('Not found', { status: 404 });

  const png = await renderCard(item, kind, sizes);
  // An outdated `v` still renders today's truth, but must not be pinned under the old key.
  const current = url.searchParams.get('v') === cardVersion(item, kind, sizes);
  return new Response(new Uint8Array(png), {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': current ? 'public, max-age=86400, s-maxage=31536000, immutable' : 'no-store',
    },
  });
}
