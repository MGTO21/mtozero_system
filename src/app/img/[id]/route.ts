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

/** Widths a tile may ask for with ?w= (see productSrcSet). */
const WIDTHS = [640];

export async function GET(req: Request, { params }: { params: { id: string } }) {
  // Gallery pictures ({productId}_g{photoId}) and sharp copies ({productId}_hd)
  // are always stored here, never on Cloudinary. Product ids never contain "_".
  const product = params.id.includes('_') ? null : await fetchProduct(params.id);
  // A full-size Cloudinary copy is better than the thumbnail when it exists.
  if (product?.imageUrl) return Response.redirect(product.imageUrl, 302);

  const dataUri = await fetchThumb(params.id);
  const match = dataUri?.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!match) return new Response('Not found', { status: 404 });

  const url = new URL(req.url);
  const download = url.searchParams.get('dl') === '1';
  // Only a few widths, so the CDN keeps a handful of copies per picture.
  const width = Number(url.searchParams.get('w'));
  const maxWidth = WIDTHS.includes(width) ? width : undefined;
  // WebP is about a third lighter; a saved picture stays JPEG so every phone and WhatsApp opens it.
  const webp = !download && (req.headers.get('accept') ?? '').includes('image/webp');

  const original = Buffer.from(match[2]!, 'base64');
  let body: Buffer = original;
  let type = match[1]!;
  try {
    body = await watermark(original, { maxWidth, format: webp ? 'webp' : 'jpeg' });
    type = webp ? 'image/webp' : 'image/jpeg';
  } catch (err) {
    // A picture without the mark beats a broken picture.
    console.error('watermark failed', params.id, err);
  }

  // The URL carries the picture's hash (?v=), so a changed picture gets a new
  // URL: the browser may keep this one for a long time instead of re-downloading
  // every product picture on each visit.
  const versioned = url.searchParams.has('v');
  const headers: Record<string, string> = {
    'Content-Type': type,
    'Cache-Control': versioned
      ? 'public, max-age=2592000, s-maxage=31536000, immutable'
      : 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400',
    Vary: 'Accept',
  };
  if (download) headers['Content-Disposition'] = `attachment; filename="mtozero-${params.id.split('_')[0]}.jpg"`;
  return new Response(new Uint8Array(body), { headers });
}
