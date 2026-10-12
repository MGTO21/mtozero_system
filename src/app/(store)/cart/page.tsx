import { CartCheckout } from '@/components/store/CartCheckout';
import { fetchStoreConfig } from '@/lib/store/server';

export const metadata = { title: 'السلة', robots: { index: false } };
export const revalidate = 60;

export default async function CartPage() {
  const config = await fetchStoreConfig();
  return <CartCheckout config={config} />;
}
