import { fetchProduct, fetchThumb } from '@/lib/store/server';
import { watermark } from '@/lib/store/watermark';

/**
 * A product picture as a real image URL — /img/{productId}.
 *
 * Thumbnails live inside Firestore as data URIs (no paid Storage). Turning them
 * into a plain cached image here means the store's product grid lazy-loads
 * pictures like any website, the CDN serves repeats, and WhatsApp / Facebook can
 * show the picture when a product link is shared — none of which works with an
 * inline data URI.
 *
 * Every picture leaves with the shop's mark (lib/store/watermark.ts). `?dl=1`
 * serves it as a download, for the product page's «حفظ الصورة».
 */
export const revalidate = 300;
// Skia is a native module: Node runtime only.
export const runtime = 'nodejs';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  // Gallery pictures ({productId}_g{photoId}) and sharp copies ({productId}_hd)
  // are always stored here, never on Cloudinary. Product ids never contain "_".
  const product = params.id.includes('_') ? null : await fetchProduct(params.id);
  // A full-size Cloudinary copy is better than the thumbnail when it exists.
  if (product?.imageUrl) return Response.redirect(product.imageUrl, 302);

  const dataUri = await fetchThumb(params.id);
  const match = dataUri?.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!match) return new Response('Not found', { status: 404 });

  const original = Buffer.from(match[2]!, 'base64');
  let body: Buffer = original;
  let type = match[1]!;
  try {
    body = await watermark(original);
    type = 'image/jpeg';
  } catch (err) {
    // A picture without the mark beats a broken picture.
    console.error('watermark failed', params.id, err);
  }

  const headers: Record<string, string> = {
    'Content-Type': type,
    'Cache-Control': 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
  };
  if (new URL(req.url).searchParams.get('dl') === '1') {
    headers['Content-Disposition'] = `attachment; filename="mtozero-${params.id.split('_')[0]}.jpg"`;
  }
  return new Response(new Uint8Array(body), { headers });
}
