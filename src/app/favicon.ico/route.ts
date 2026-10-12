import { fetchLogo } from '@/lib/store/server';

/**
 * /favicon.ico — still the first place many crawlers and browsers look.
 * Points at the logo icon (a PNG is accepted under this name everywhere that matters).
 */
export async function GET(req: Request) {
  const logo = await fetchLogo();
  const target = logo ? `/brand/icon/48?v=${logo.hash}` : '/icons/icon-192.png';
  return Response.redirect(new URL(target, req.url), 302);
}
