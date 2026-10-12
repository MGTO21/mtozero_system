import { fetchProduct, fetchThumb } from '@/lib/store/server';

/**
 * A product picture as a real image URL — /img/{productId}.
 *
 * Thumbnails live inside Firestore as data URIs (no paid Storage). Turning them
 * into a plain cached image here means the store's product grid lazy-loads
 * pictures like any website, the CDN serves repeats, and WhatsApp / Facebook can
 * show the picture when a product link is shared — none of which works with an
 * inline data URI.
 */
export const revalidate = 300;

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  // Gallery pictures ({productId}_g{photoId}) are always stored here, never on Cloudinary.
  const product = params.id.includes('_g') ? null : await fetchProduct(params.id);
  // A full-size Cloudinary copy is better than the thumbnail when it exists.
  if (product?.imageUrl) return Response.redirect(product.imageUrl, 302);

  const dataUri = await fetchThumb(params.id);
  const match = dataUri?.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!match) return new Response('Not found', { status: 404 });

  const bytes = Buffer.from(match[2]!, 'base64');
  return new Response(bytes, {
    headers: {
      'Content-Type': match[1]!,
      'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
