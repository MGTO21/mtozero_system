/**
 * URL of a product picture on the store. Shared by server pages and client
 * components alike, so it lives outside any 'use client' module. The hash in
 * the query busts caches when the picture changes.
 */
export function productImagePath(id: string, thumbHash: string, imageUrl: string | null): string {
  return imageUrl ?? `/img/${id}?v=${thumbHash}`;
}

/**
 * An extra product picture: catalogThumbs/{productId}_g{photoId}, served by the
 * same /img route. Auto-generated product ids never contain "_", so the suffix
 * cannot collide with a product.
 */
export function galleryImagePath(productId: string, photo: { id: string; hash: string }): string {
  return `/img/${productId}_g${photo.id}?v=${photo.hash}`;
}

/** Main picture first, then the gallery — what the product page shows. */
export function productPictures(item: {
  id: string;
  thumbHash: string;
  imageUrl: string | null;
  gallery: { id: string; hash: string }[];
}): string[] {
  return [productImagePath(item.id, item.thumbHash, item.imageUrl), ...item.gallery.map((g) => galleryImagePath(item.id, g))];
}
