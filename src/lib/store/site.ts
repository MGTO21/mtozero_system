/**
 * The public address of the website, for anything that must be absolute:
 * sitemap, canonical links, structured data, share previews. Set
 * NEXT_PUBLIC_SITE_URL once a custom domain is connected; until then Vercel's
 * production domain is used.
 */
export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');
  return raw.replace(/\/+$/, '');
}

/** Staff-only screens. Kept out of search engines and AI crawlers. */
export const PRIVATE_PATHS = [
  '/dashboard',
  '/sell',
  '/sales',
  '/orders',
  '/debts',
  '/close',
  '/customers',
  '/campaigns',
  '/offers',
  '/storefront',
  '/inventory',
  '/shipments',
  '/stocktake',
  '/waiting',
  '/expenses',
  '/reports',
  '/activity',
  '/team',
  '/settings',
  '/sync',
  '/migrate',
  '/login',
  '/invoice',
  '/order',
  '/cart',
  '/wishlist',
  '/card',
  '/offline',
];
