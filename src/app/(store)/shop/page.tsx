import { Suspense } from 'react';
import { ShopBrowser } from '@/components/store/ShopBrowser';
import { fetchCatalog, STORE_REVALIDATE } from '@/lib/store/server';

export const revalidate = STORE_REVALIDATE;
export const metadata = { title: 'كل المنتجات' };

export default async function ShopPage() {
  const items = await fetchCatalog();
  return (
    <Suspense>
      <ShopBrowser items={items} />
    </Suspense>
  );
}
