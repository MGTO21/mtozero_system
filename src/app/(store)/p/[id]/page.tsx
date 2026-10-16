import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductBuy } from '@/components/store/ProductBuy';
import { ProductGallery } from '@/components/store/ProductGallery';
import { PersonalShelf } from '@/components/store/PersonalShelf';
import { Shelf } from '@/components/store/Shelf';
import { money } from '@/lib/format';
import { isNewArrival, salePercent } from '@/lib/store/model';
import { jsonLd, productGraph, productSummary } from '@/lib/store/seo';
import { siteUrl } from '@/lib/store/site';
import { productHdPath, productPictures } from '@/lib/store/paths';
import { fetchCatalog, fetchProduct, fetchStoreConfig, STORE_REVALIDATE } from '@/lib/store/server';
import { CATEGORY_LABEL } from '@/lib/types';

export const revalidate = STORE_REVALIDATE;

type Props = { params: { id: string } };

/** Name, price and picture in the link preview when a product is shared. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const [item, config] = await Promise.all([fetchProduct(params.id), fetchStoreConfig()]);
  if (!item || !item.listed) return { title: 'المنتج غير موجود', robots: { index: false } };
  // Price first: it is what people search with ("سعر اير فورس").
  const description = `${money(item.price)} — ${item.description?.slice(0, 120) || productSummary(item, config)}`;
  const image = productHdPath(item);
  const images = productPictures(item).slice(0, 4).map((url) => ({ url }));
  return {
    // "Nike Air Force — أحذية" reads as an answer in a result list.
    title: `${item.name}${item.brand ? ` ${item.brand}` : ''} — ${CATEGORY_LABEL[item.category]}`,
    description,
    alternates: { canonical: `/p/${item.id}` },
    openGraph: { title: item.name, description, images },
    twitter: { card: 'summary_large_image', title: item.name, description, images: [image] },
  };
}

export default async function ProductPage({ params }: Props) {
  const [item, config, catalog] = await Promise.all([fetchProduct(params.id), fetchStoreConfig(), fetchCatalog()]);
  if (!item || !item.listed) notFound();

  // Same department, closest in price first: "ممكن يعجبك" should be affordable alternatives.
  const related = catalog
    .filter((p) => p.category === item.category && p.id !== item.id)
    .sort((a, b) => Math.abs(a.price - item.price) - Math.abs(b.price - item.price))
    .slice(0, 8);
  const off = salePercent(item);
  const fresh = isNewArrival(item, config.newDays);

  return (
    <div className="mx-auto max-w-7xl px-4 pt-5 sm:px-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(productGraph(item, config, siteUrl())) }} />
      <nav aria-label="مسار الصفحة" className="mb-4 text-[0.84rem] font-bold text-fg-3">
        <Link href="/shop" className="hover:text-fg">
          المنتجات
        </Link>{' '}
        /{' '}
        <Link href={`/shop?c=${item.category}`} className="hover:text-fg">
          {CATEGORY_LABEL[item.category]}
        </Link>
      </nav>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-10">
        <ProductGallery pictures={productPictures(item)} alt={item.name}>
          <div className="pointer-events-none absolute right-3 top-3 flex flex-col items-start gap-1.5">
            {off > 0 ? (
              <span className="tnum rounded-[3px] bg-brand-500 px-2.5 py-1 font-display text-[0.86rem] font-black text-white">-{off}%</span>
            ) : null}
            {item.badge ? (
              <span className="rounded-[3px] bg-spot px-2.5 py-1 font-display text-[0.86rem] font-black text-on-spot">{item.badge}</span>
            ) : null}
            {fresh ? (
              <span className="rounded-[3px] bg-surface px-2.5 py-1 font-display text-[0.86rem] font-black">وصل جديد</span>
            ) : null}
          </div>
        </ProductGallery>

        <div>
          {item.brand ? <p className="store-kicker !tracking-[0.18em]">{item.brand}</p> : null}
          <h1 className="store-title mt-2 !text-[clamp(1.8rem,4vw,2.8rem)]">{item.name}</h1>
          <p className="mt-4 flex flex-wrap items-baseline gap-x-3">
            <span className="tnum font-display text-[2.2rem] font-black leading-none text-brand-500">{money(item.price)}</span>
            {off > 0 ? (
              <>
                <span className="tnum text-[1.1rem] font-bold text-fg-3 line-through">{money(item.compareAtPrice)}</span>
                <span className="tnum text-[0.9rem] font-black text-good">وفّرت {money(item.compareAtPrice - item.price)}</span>
              </>
            ) : null}
          </p>

          <div className="mt-6">
            <ProductBuy
              item={item}
              whatsapp={config.whatsapp}
              sizeGuide={item.category === 'shoes' ? config.sizeGuideShoes : config.sizeGuideClothing}
            />
          </div>

          {/* Always a few words about the product: the owner's description, or one
              written from the facts — a page with only a name and a price gives
              customers and search engines nothing to go on. */}
          <div className="mt-7 border-t border-line pt-5">
            <h2 className="ledger-head !text-[0.82rem]">عن المنتج</h2>
            <p className="whitespace-pre-line leading-relaxed text-fg-2">{item.description || productSummary(item, config)}</p>
          </div>

          <ul className="mt-7 space-y-2.5 border-t border-line pt-5 text-[0.92rem] text-fg-2">
            <li>
              <span className="font-bold text-fg">التوصيل:</span>{' '}
              {config.deliveryFee > 0 ? `${money(config.deliveryFee)}` : 'مجاني'}
              {config.freeDeliveryOver > 0 ? ` — مجاني للطلبات فوق ${money(config.freeDeliveryOver)}` : ''}
            </li>
            {config.pickupEnabled ? (
              <li>
                <span className="font-bold text-fg">الاستلام من المحل:</span> مجاني — {config.address}
              </li>
            ) : null}
            <li>
              <span className="font-bold text-fg">الدفع:</span> عند الاستلام
            </li>
            <li>
              <span className="font-bold text-fg">الاستبدال:</span> {config.returnPolicy}
            </li>
          </ul>
        </div>
      </div>

      <div className="-mx-4 sm:-mx-6">
        <Shelf title="ممكن يعجبك" items={related} newDays={config.newDays} href={`/shop?c=${item.category}`} />
        <PersonalShelf kind="recent" title="شاهدتها مؤخراً" items={catalog.filter((p) => p.id !== item.id)} newDays={config.newDays} />
      </div>
    </div>
  );
}
