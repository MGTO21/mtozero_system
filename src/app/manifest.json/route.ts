import { fetchLogo } from '@/lib/store/server';
import base from './base.json';

/**
 * The PWA manifest, served at the same /manifest.json the service worker
 * caches. Icons follow the shop logo when one is uploaded, so the installed
 * app carries the same mark as the invoices and the website.
 */
export const revalidate = 300;

export async function GET() {
  const logo = await fetchLogo();
  const v = logo ? `?v=${logo.hash}` : '';
  const icons = logo
    ? [
        { src: `/brand/icon/192${v}`, sizes: '192x192', type: 'image/png', purpose: 'any' },
        { src: `/brand/icon/512${v}`, sizes: '512x512', type: 'image/png', purpose: 'any' },
        { src: `/brand/icon/512${v}&maskable=1`, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      ]
    : base.icons;
  const shortcutIcon = logo ? [{ src: `/brand/icon/192${v}`, sizes: '192x192' }] : undefined;

  const manifest = {
    ...base,
    icons,
    shortcuts: base.shortcuts.map((s) => (shortcutIcon ? { ...s, icons: shortcutIcon } : s)),
  };
  return Response.json(manifest, {
    headers: { 'Content-Type': 'application/manifest+json', 'Cache-Control': 'public, max-age=300' },
  });
}
