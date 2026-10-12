import { fetchLogo } from '@/lib/store/server';

/**
 * The shop logo as a plain image — the same picture drawn on invoices.
 * Linked with ?v={hash}, so a changed logo gets a new URL and caches stay right.
 */
export async function GET() {
  const logo = await fetchLogo(true);
  const match = logo?.data.match(/^data:(image\/[a-z+]+);base64,(.+)$/);
  if (!match) return new Response('Not found', { status: 404 });
  return new Response(Buffer.from(match[2]!, 'base64'), {
    headers: {
      'Content-Type': match[1]!,
      'Cache-Control': 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800',
    },
  });
}
