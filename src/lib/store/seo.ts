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

const pounds = (n: number) => `${Math.round(n).toLocaleString('en-US')} جنيه`;

/**
 * The questions people actually ask before buying here, answered from the
 * store settings and the live catalog — never invented. Shown on the home page
 * and sent as FAQPage data: it is what search engines quote and what AI
 * assistants repeat when someone asks "where can I buy sneakers in El Obeid?".
 */
export function storeFaq(config: StoreConfig, catalog: CatalogItem[]): { q: string; a: string }[] {
  const shoeSizes = catalog
    .filter((p) => p.category === 'shoes')
    .flatMap((p) => p.sizes.filter((s) => s.state !== 'out').map((s) => Number(s.size)))
    .filter((n) => Number.isFinite(n) && n > 20 && n < 60);
  // "اديدس" and "أديداس" are one brand typed two ways: count them together and
  // show the spelling used most.
  const fold = (s: string) => s.toLowerCase().replace(/[أإآ]/g, 'ا').replace(/ا/g, '').replace(/\s+/g, '');
  const brandCount = new Map<string, { n: number; spellings: Map<string, number> }>();
  for (const p of catalog) {
    const name = p.brand?.trim();
    if (!name) continue;
    const entry = brandCount.get(fold(name)) ?? { n: 0, spellings: new Map<string, number>() };
    entry.n++;
    entry.spellings.set(name, (entry.spellings.get(name) ?? 0) + 1);
    brandCount.set(fold(name), entry);
  }
  const brands = [...brandCount.values()]
    .sort((a, b) => b.n - a.n)
    .map((e) => [...e.spellings.entries()].sort((a, b) => b[1] - a[1])[0]![0])
    .slice(0, 6);

  const delivery =
    config.deliveryFee > 0
      ? `بنوصّل داخل الأبيض بـ ${pounds(config.deliveryFee)}${config.freeDeliveryOver > 0 ? `، والتوصيل مجاني للطلبات فوق ${pounds(config.freeDeliveryOver)}` : ''}.`
      : 'بنوصّل داخل الأبيض مجاناً.';

  const faq = [
    {
      q: `وين محل ${config.shopName}؟`,
      a: `${config.shopName} محل أحذية وملابس في ${config.address}، السودان.${config.pickupEnabled ? ' تقدر تستلم طلبك من المحل مجاناً.' : ''}`,
    },
    { q: 'بتوصلوا لحدي البيت؟ وبكم؟', a: `${delivery} الطلب بيوصلك لحدي الباب.` },
    { q: 'الدفع كيف؟', a: 'الدفع عند الاستلام كاش — ما بتدفع إلا لمن تشوف القطعة وتتأكد منها.' },
    {
      q: 'كيف أطلب؟',
      a: `اختار المنتج والمقاس من ${config.shopName} أونلاين وأكّد الطلب، وبيوصلنا واتساب بكل التفاصيل.${config.whatsapp ? ` أو كلمنا واتساب مباشرة على +${config.whatsapp}.` : ''}`,
    },
    { q: 'لو المقاس ما جا مظبوط، ممكن أستبدل؟', a: config.returnPolicy },
  ];
  if (shoeSizes.length) {
    faq.push({
      q: 'الأحذية مقاساتها كم؟',
      a: `المقاسات المتوفرة هسع من ${Math.min(...shoeSizes)} لحدي ${Math.max(...shoeSizes)} — وكل منتج مكتوب فيهو مقاساته المتوفرة بالظبط.`,
    });
  }
  if (brands.length) {
    faq.push({ q: 'شنو الماركات الموجودة عندكم؟', a: `من الماركات المتوفرة: ${brands.join('، ')}.` });
  }
  return faq;
}

export function faqGraph(faq: { q: string; a: string }[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: faq.map((f) => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })),
  };
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
