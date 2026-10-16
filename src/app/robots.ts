import type { MetadataRoute } from 'next';
import { PRIVATE_PATHS, siteUrl } from '@/lib/store/site';

/**
 * Search engines and AI assistants are welcome on the store — the products,
 * prices and policies are exactly what a customer asking "where can I buy
 * Air Force in Al-Ubayyid?" should find. The staff app is not for them.
 * AI crawlers are named explicitly: some only crawl where they are invited.
 */
const AI_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'Bingbot',
];

export default function robots(): MetadataRoute.Robots {
  const site = siteUrl();
  const rule = { allow: ['/', '/shop', '/p/', '/img/', '/brand/', '/banner/', '/llms.txt'], disallow: PRIVATE_PATHS };
  return {
    rules: [{ userAgent: '*', ...rule }, ...AI_CRAWLERS.map((userAgent) => ({ userAgent, ...rule }))],
    sitemap: `${site}/sitemap.xml`,
    host: site,
  };
}
