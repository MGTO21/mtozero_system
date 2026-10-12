import { Suspense } from 'react';
import { ShopBrowser } from '@/components/store/ShopBrowser';
import { fetchCatalog, fetchStoreConfig, STORE_REVALIDATE } from '@/lib/store/server';

export const revalidate = STORE_REVALIDATE;
export const metadata = { title: 'كل المنتجات' };

export default async function ShopPage() {
  const [items, config] = await Promise.all([fetchCatalog(), fetchStoreConfig()]);
  return (
    <Suspense>
      <ShopBrowser items={items} newDays={config.newDays} />
    </Suspense>
  );
}
