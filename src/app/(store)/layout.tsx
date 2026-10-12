import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { StoreFooter, WhatsAppFloat } from '@/components/store/StoreFooter';
import { StoreHeader } from '@/components/store/StoreHeader';
import { money } from '@/lib/format';
import { fetchStoreConfig, STORE_REVALIDATE } from '@/lib/store/server';

export const revalidate = STORE_REVALIDATE;

export async function generateMetadata(): Promise<Metadata> {
  const config = await fetchStoreConfig();
  // Absolute base for share previews: WhatsApp and Facebook need full image URLs.
  const site =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');
  return {
    metadataBase: new URL(site),
    title: { default: `${config.shopName} — ${config.heroTitle}`, template: `%s — ${config.shopName}` },
    description: config.heroSubtitle,
    openGraph: { siteName: config.shopName, locale: 'ar_SD', type: 'website' },
  };
}

/** The public website: its own header and footer, no staff app shell. */
export default async function StoreLayout({ children }: { children: ReactNode }) {
  const config = await fetchStoreConfig();
  const announcement =
    config.freeDeliveryOver > 0
      ? `توصيل مجاني للطلبات فوق ${money(config.freeDeliveryOver)} · الدفع عند الاستلام`
      : 'الدفع عند الاستلام';

  return (
    <div className="app-height flex flex-col bg-page">
      <StoreHeader announcement={announcement} />
      <main className="flex-1">{children}</main>
      <StoreFooter config={config} />
      <WhatsAppFloat number={config.whatsapp} />
    </div>
  );
}
