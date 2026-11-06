import { fetchLogo } from '@/lib/store/server';

/**
 * /favicon.ico — still the first place many crawlers and browsers look.
 * Serves the logo icon itself (a PNG is accepted under this name everywhere that
 * matters) rather than redirecting to it: Google's favicon fetcher reads this
 * path directly, and a redirect here can leave search results on the generic globe.
 */
export async function GET(req: Request) {
  const logo = await fetchLogo();
  const target = logo ? `/brand/icon/48?v=${logo.hash}` : '/icons/icon-192.png';
  const icon = await fetch(new URL(target, req.url));
  if (!icon.ok) return new Response('Not found', { status: 404 });
  return new Response(icon.body, {
    headers: {
      'Content-Type': 'image/png',
      'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
