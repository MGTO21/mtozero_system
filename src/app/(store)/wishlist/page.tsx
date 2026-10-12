import { WishlistGrid } from '@/components/store/WishlistGrid';
import { fetchCatalog, fetchStoreConfig, STORE_REVALIDATE } from '@/lib/store/server';

export const revalidate = STORE_REVALIDATE;
export const metadata = { title: 'المفضلة', robots: { index: false } };

export default async function WishlistPage() {
  const [items, config] = await Promise.all([fetchCatalog(), fetchStoreConfig()]);
  return <WishlistGrid items={items} newDays={config.newDays} whatsapp={config.whatsapp} />;
}
