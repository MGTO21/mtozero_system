import { ImageResponse } from 'next/og';
import { fetchLogo } from '@/lib/store/server';

// Edge: ImageResponse's Node build cannot locate its font on Windows, and the
// edge runtime is the faster path for generated images anyway.
export const runtime = 'edge';

/** The sizes browsers, phones and search engines ask for. */
const SIZES = new Set([32, 48, 96, 180, 192, 512]);

/**
 * The logo as a square PNG icon: browser tab, home-screen icon, search result.
 * Drawn on white with breathing room; `?maskable=1` adds the wider safe zone
 * Android crops into a circle. Without an uploaded logo, the built-in icons are
 * used instead.
 */
export async function GET(req: Request, { params }: { params: { size: string } }) {
  const size = Number(params.size);
  if (!SIZES.has(size)) return new Response('Not found', { status: 404 });

  const logo = await fetchLogo(true);
  if (!logo) return redirectTo(size > 192 ? '/icons/icon-512.png' : '/icons/icon-192.png', req);

  const maskable = new URL(req.url).searchParams.get('maskable') === '1';
  const inner = Math.round(size * (maskable ? 0.62 : 0.86));

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF' }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={logo.data} width={inner} height={inner} style={{ objectFit: 'contain' }} />
      </div>
    ),
    {
      width: size,
      height: size,
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
    },
  );
}

/** Edge responses from Response.redirect() have locked headers, which Next then fails to adjust. */
function redirectTo(path: string, req: Request): Response {
  return new Response(null, { status: 302, headers: { Location: new URL(path, req.url).toString() } });
}
