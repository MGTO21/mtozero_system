import type { MetadataRoute } from 'next';
import { fetchCatalog } from '@/lib/store/server';
import { siteUrl } from '@/lib/store/site';

export const revalidate = 3600;

/**
 * Every page a customer might land on: the storefront, the departments and
 * each product in stock.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const site = siteUrl();
  const catalog = await fetchCatalog();
  const newest = catalog.reduce((m, p) => Math.max(m, p.createdAtMs, p.lastSoldAtMs), 0);
  const updated = newest ? new Date(newest) : new Date();

  return [
    { url: `${site}/`, lastModified: updated, changeFrequency: 'daily', priority: 1 },
    { url: `${site}/shop`, lastModified: updated, changeFrequency: 'daily', priority: 0.9 },
    { url: `${site}/shop?c=shoes`, lastModified: updated, changeFrequency: 'daily', priority: 0.8 },
    { url: `${site}/shop?c=clothing`, lastModified: updated, changeFrequency: 'daily', priority: 0.8 },
    // Product pictures reach search through each page's structured data and
    // Open Graph tags; Next 14 does not write image entries into the sitemap.
    ...catalog.map((p) => ({
      url: `${site}/p/${p.id}`,
      lastModified: new Date(Math.max(p.createdAtMs, p.lastSoldAtMs) || Date.now()),
      changeFrequency: 'weekly' as const,
      priority: 0.7,
    })),
  ];
}
