import type { CatalogItem, StoreConfig } from '@/lib/types';
import { compareSizes } from './model';
import { productPictures } from './paths';

/**
 * Structured data (schema.org JSON-LD) for the public store.
 *
 * This is what lets Google show price and stock under a result, and what AI
 * assistants read when someone asks where to buy a product: plain facts in a
 * standard vocabulary, not marketing copy. Everything here is already public
 * on the page — never cost, supplier or quantities.
 */

/** JSON for a <script> tag: "<" escaped so text can never close the tag. */
export function jsonLd(data: unknown): string {
  return JSON.stringify(data).replace(/</g, '\u003c');
}

const abs = (site: string, path: string) => (/^https?:/i.test(path) ? path : `${site}${path}`);

export function storeGraph(config: StoreConfig, logo: { hash: string } | null, site: string) {
  const sameAs = [config.instagram, config.facebook, config.tiktok]
    .map((v) => v.trim())
    .filter((v) => /^https:\/\//i.test(v));
  const store = {
    '@type': 'ShoeStore',
    additionalType: 'https://schema.org/ClothingStore',
    '@id': `${site}/#store`,
    name: config.shopName,
    description: `${config.heroSubtitle} ${config.about}`.trim(),
    url: `${site}/`,
    ...(logo ? { logo: `${site}/brand/icon/512?v=${logo.hash}`, image: `${site}/brand/og?v=${logo.hash}` } : {}),
    ...(config.whatsapp ? { telephone: `+${config.whatsapp}` } : {}),
    address: {
      '@type': 'PostalAddress',
      streetAddress: config.address,
      addressLocality: 'الأبيض',
      addressRegion: 'شمال كردفان',
      addressCountry: 'SD',
    },
    areaServed: { '@type': 'City', name: 'الأبيض' },
    currenciesAccepted: 'SDG',
    paymentAccepted: 'الدفع عند الاستلام (كاش)',
    ...(sameAs.length ? { sameAs } : {}),
  };
  const website = {
    '@type': 'WebSite',
    '@id': `${site}/#website`,
    url: `${site}/`,
    name: config.shopName,
    inLanguage: 'ar',
    publisher: { '@id': `${site}/#store` },
    potentialAction: {
      '@type': 'SearchAction',
      target: { '@type': 'EntryPoint', urlTemplate: `${site}/shop?q={search_term_string}` },
      'query-input': 'required name=search_term_string',
    },
  };
  return { '@context': 'https://schema.org', '@graph': [store, website] };
}

/** A sentence describing the product, for pages that have no written description. */
export function productSummary(item: CatalogItem, config: StoreConfig, categoryName: string): string {
  const sizes = item.sizes
    .filter((s) => s.state !== 'out')
    .map((s) => s.size)
    .sort(compareSizes);
  const parts = [
    `${item.name}${item.brand ? ` من ${item.brand}` : ''} — ${categoryName} في ${config.shopName}، الأبيض.`,
    sizes.length ? `المقاسات المتوفرة: ${sizes.join('، ')}.` : '',
    'الدفع عند الاستلام والتوصيل لحدي الباب.',
  ];
  return parts.filter(Boolean).join(' ');
}

export function productGraph(item: CatalogItem, config: StoreConfig, site: string, categoryName: string) {
  const url = `${site}/p/${item.id}`;
  const inStock = item.sizes.some((s) => s.state !== 'out');
  // A year ahead: prices here change rarely, and Google wants an end date on offers.
  const validUntil = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);

  const offer = {
    '@type': 'Offer',
    url,
    priceCurrency: 'SDG',
    price: item.price,
    priceValidUntil: validUntil,
    availability: inStock ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock',
    itemCondition: 'https://schema.org/NewCondition',
    seller: { '@id': `${site}/#store` },
    shippingDetails: {
      '@type': 'OfferShippingDetails',
      shippingRate: { '@type': 'MonetaryAmount', value: config.deliveryFee, currency: 'SDG' },
      shippingDestination: { '@type': 'DefinedRegion', addressCountry: 'SD' },
    },
    hasMerchantReturnPolicy: {
      '@type': 'MerchantReturnPolicy',
      applicableCountry: 'SD',
      returnPolicyCategory: 'https://schema.org/MerchantReturnFiniteReturnWindow',
      merchantReturnDays: 3,
      returnMethod: 'https://schema.org/ReturnInStore',
      description: config.returnPolicy,
    },
  };

  const product = {
    '@type': 'Product',
    '@id': `${url}#product`,
    name: item.name,
    description: item.description || productSummary(item, config, categoryName),
    image: productPictures(item).map((p) => abs(site, p)),
    url,
    category: categoryName,
    ...(item.brand ? { brand: { '@type': 'Brand', name: item.brand } } : {}),
    size: item.sizes.filter((s) => s.state !== 'out').map((s) => s.size),
    offers: offer,
  };

  const breadcrumb = {
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', position: 1, name: config.shopName, item: `${site}/` },
      { '@type': 'ListItem', position: 2, name: categoryName, item: `${site}/shop?c=${item.category}` },
      { '@type': 'ListItem', position: 3, name: item.name, item: url },
    ],
  };

  return { '@context': 'https://schema.org', '@graph': [product, breadcrumb] };
}

/** The products on a listing page, so a category reads as a list of things for sale. */
export function itemListGraph(items: CatalogItem[], site: string, name: string) {
  return {
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name,
    numberOfItems: items.length,
    itemListElement: items.slice(0, 50).map((p, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${site}/p/${p.id}`,
      name: p.name,
    })),
  };
}
