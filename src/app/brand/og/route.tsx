import { ImageResponse } from 'next/og';
import { fetchLogo } from '@/lib/store/server';

// Edge: ImageResponse's Node build cannot locate its font on Windows, and the
// edge runtime is the faster path for generated images anyway.
export const runtime = 'edge';

/**
 * The picture shown when a link to the shop is shared on WhatsApp or Facebook,
 * and in search results: the logo, centred on the 1200×630 card those apps
 * expect. Product pages keep their own product picture.
 */
export async function GET(req: Request) {
  const logo = await fetchLogo(true);
  if (!logo) return redirectTo('/icons/icon-512.png', req);

  return new ImageResponse(
    (
      <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#FFFFFF' }}>
        {/* eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text */}
        <img src={logo.data} width={460} height={460} style={{ objectFit: 'contain' }} />
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { 'Cache-Control': 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800' },
    },
  );
}

/** Edge responses from Response.redirect() have locked headers, which Next then fails to adjust. */
function redirectTo(path: string, req: Request): Response {
  return new Response(null, { status: 302, headers: { Location: new URL(path, req.url).toString() } });
}
