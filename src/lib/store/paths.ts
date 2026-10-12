/**
 * URL of a product picture on the store. Shared by server pages and client
 * components alike, so it lives outside any 'use client' module. The hash in
 * the query busts caches when the picture changes.
 */
export function productImagePath(id: string, thumbHash: string, imageUrl: string | null): string {
  return imageUrl ?? `/img/${id}?v=${thumbHash}`;
}
