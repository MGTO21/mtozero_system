import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { StoreFooter, WhatsAppFloat } from '@/components/store/StoreFooter';
import { StoreHeader } from '@/components/store/StoreHeader';
import { money } from '@/lib/format';
import { deliveryLine } from '@/lib/store/model';
import { fetchCatalog, fetchStoreConfig, STORE_REVALIDATE } from '@/lib/store/server';
import './store.css';

export const revalidate = STORE_REVALIDATE;

export async function generateMetadata(): Promise<Metadata> {
  const config = await fetchStoreConfig();
  // Absolute base for share previews: WhatsApp and Facebook need full image URLs.
  const site =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');
  const banner = config.banners[0];
  return {
    metadataBase: new URL(site),
    title: { default: `${config.shopName} — ${config.heroTitle}`, template: `%s — ${config.shopName}` },
    description: config.heroSubtitle,
    openGraph: {
      siteName: config.shopName,
      locale: 'ar_SD',
      type: 'website',
      ...(banner ? { images: [{ url: `/banner/${banner.id}?v=${banner.imageHash}` }] } : {}),
    },
  };
}

/**
 * Applies the visitor's chosen look before first paint, so a returning visitor
 * who picked the night look never sees a white flash. Must match LOOK_KEY.
 */
function lookScript(defaultLook: string, toggle: boolean) {
  return `(function(){try{var r=document.getElementById('store-root');var l=${JSON.stringify(defaultLook)};${
    toggle ? `var s=localStorage.getItem('mtozero-store-look');if(s==='light'||s==='luxe')l=s;` : ''
  }r.setAttribute('data-look',l);var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute('content',l==='luxe'?'#09090A':'#FAF9F6');}catch(e){}})();`;
}

/** The public website: its own look, header and footer — no staff app shell. */
export default async function StoreLayout({ children }: { children: ReactNode }) {
  const [config, catalog] = await Promise.all([fetchStoreConfig(), fetchCatalog()]);
  const announcements = config.announcements.length > 0 ? config.announcements : [deliveryLine(config, money)];
  // The header's instant search needs names and pictures only — not descriptions.
  const index = catalog.map(({ description: _d, ...rest }) => {
    void _d;
    return rest;
  });

  return (
    <div id="store-root" className="store app-height flex flex-col" data-look={config.look} suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: lookScript(config.look, config.lookToggle) }} />
      <StoreHeader
        announcements={announcements}
        lookToggle={config.lookToggle}
        defaultLook={config.look}
        freeOver={config.freeDeliveryOver}
        items={index}
        hasSale={catalog.some((p) => p.compareAtPrice > p.price)}
      />
      <main className="flex-1">{children}</main>
      <StoreFooter config={config} />
      <WhatsAppFloat number={config.whatsapp} />
    </div>
  );
}
