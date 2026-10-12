import { fetchBannerImage } from '@/lib/store/server';

/**
 * A home-page banner picture — /banner/{bannerId}?v={hash}.
 *
 * Like product pictures, banners are stored as data URIs in Firestore (no paid
 * Storage) and turned into a plain cacheable image here. The hash in the query
 * changes with the picture, so a replaced banner is never served stale.
 */
export const revalidate = 300;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  const dataUri = await fetchBannerImage(params.id);
  const match = dataUri?.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!match) return new Response('Not found', { status: 404 });

  return new Response(Buffer.from(match[2]!, 'base64'), {
    headers: {
      'Content-Type': match[1]!,
      'Cache-Control': 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
