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

type Pictured = { id: string; thumbHash: string; imageUrl: string | null; hdHash: string };

/**
 * The main picture at full store quality: Cloudinary when there is one, else the
 * sharp copy (catalogThumbs/{id}_hd), else the small thumbnail for products
 * photographed before sharp copies existed.
 */
export function productHdPath(item: Pictured): string {
  if (item.imageUrl) return item.imageUrl;
  if (item.hdHash) return `/img/${item.id}_hd?v=${item.hdHash}`;
  return productImagePath(item.id, item.thumbHash, null);
}

/**
 * srcSet for a grid tile: the thumbnail where it is enough, the sharp copy on
 * high-density phones. Undefined when there is only one size.
 */
export function productSrcSet(item: Pictured): string | undefined {
  if (item.imageUrl || !item.hdHash) return undefined;
  return `${productImagePath(item.id, item.thumbHash, null)} 360w, ${productHdPath(item)} 1100w`;
}

/** Main picture first, then the gallery — what the product page shows. */
export function productPictures(item: Pictured & { gallery: { id: string; hash: string }[] }): string[] {
  return [productHdPath(item), ...item.gallery.map((g) => galleryImagePath(item.id, g))];
}
