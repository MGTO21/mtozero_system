import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { StoreFooter, WhatsAppFloat } from '@/components/store/StoreFooter';
import { StoreHeader } from '@/components/store/StoreHeader';
import { money } from '@/lib/format';
import { deliveryLine } from '@/lib/store/model';
import { fetchCatalog, fetchLogo, fetchStoreConfig, STORE_REVALIDATE } from '@/lib/store/server';
import { jsonLd, storeGraph } from '@/lib/store/seo';
import { siteUrl } from '@/lib/store/site';
import './store.css';

export const revalidate = STORE_REVALIDATE;

export async function generateMetadata(): Promise<Metadata> {
  const [config, logo] = await Promise.all([fetchStoreConfig(), fetchLogo()]);
  // Absolute base for share previews: WhatsApp and Facebook need full image URLs.
  const site = siteUrl();
  // Link previews and search results show the shop logo — the same one as the invoices.
  const image = logo
    ? { url: `/brand/og?v=${logo.hash}`, width: 1200, height: 630, alt: config.shopName }
    : config.banners[0]
      ? { url: `/banner/${config.banners[0].id}?v=${config.banners[0].imageHash}` }
      : null;
  return {
    metadataBase: new URL(site),
    title: { default: `${config.shopName} — ${config.heroTitle}`, template: `%s — ${config.shopName}` },
    description: `${config.heroSubtitle} ${config.address}.`,
    applicationName: config.shopName,
    keywords: [
      config.shopName,
      'أحذية',
      'ملابس',
      'جزم رياضية',
      'سنيكرز',
      'نايكي',
      'اديدس',
      'الأبيض',
      'شمال كردفان',
      'السودان',
      'تسوق أونلاين',
      'الدفع عند الاستلام',
    ],
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 } },
    ...(process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
      ? { verification: { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION } }
      : {}),
    openGraph: {
      siteName: config.shopName,
      locale: 'ar_SD',
      type: 'website',
      ...(image ? { images: [image] } : {}),
    },
    twitter: { card: 'summary_large_image', ...(image ? { images: [image.url] } : {}) },
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
  const [config, catalog, logo] = await Promise.all([fetchStoreConfig(), fetchCatalog(), fetchLogo()]);
  const logoSrc = logo ? `/brand/logo?v=${logo.hash}` : null;
  const site = siteUrl();
  // Who the shop is, for search engines and AI assistants: name, place, how to
  // order and pay, the logo, and site search.
  const ld = jsonLd(storeGraph(config, logo, site));
  const announcements = config.announcements.length > 0 ? config.announcements : [deliveryLine(config, money)];
  // The header's instant search needs names and pictures only — not descriptions.
  const index = catalog.map(({ description: _d, ...rest }) => {
    void _d;
    return rest;
  });

  return (
    <div id="store-root" className="store app-height flex flex-col" data-look={config.look} suppressHydrationWarning>
      <script dangerouslySetInnerHTML={{ __html: lookScript(config.look, config.lookToggle) }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      <StoreHeader
        announcements={announcements}
        lookToggle={config.lookToggle}
        defaultLook={config.look}
        freeOver={config.freeDeliveryOver}
        items={index}
        hasSale={catalog.some((p) => p.compareAtPrice > p.price)}
        logoSrc={logoSrc}
      />
      <main className="flex-1">{children}</main>
      <StoreFooter config={config} logoSrc={logoSrc} />
      <WhatsAppFloat number={config.whatsapp} />
    </div>
  );
}
