import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ProductBuy } from '@/components/store/ProductBuy';
import { ProductTile } from '@/components/store/ProductTile';
import { money } from '@/lib/format';
import { productImagePath } from '@/lib/store/paths';
import { fetchCatalog, fetchProduct, fetchStoreConfig, STORE_REVALIDATE } from '@/lib/store/server';
import { CATEGORY_LABEL } from '@/lib/types';

export const revalidate = STORE_REVALIDATE;

type Props = { params: { id: string } };

/** Name, price and picture in the link preview when a product is shared. */
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const item = await fetchProduct(params.id);
  if (!item) return { title: 'المنتج غير موجود' };
  const description = `${money(item.price)} · المقاسات: ${item.sizes
    .filter((s) => s.state !== 'out')
    .map((s) => s.size)
    .join('، ')} · الدفع عند الاستلام`;
  const image = productImagePath(item.id, item.thumbHash, item.imageUrl);
  return {
    title: item.name,
    description,
    openGraph: { title: item.name, description, images: [{ url: image }] },
    twitter: { card: 'summary_large_image', title: item.name, description, images: [image] },
  };
}

export default async function ProductPage({ params }: Props) {
  const [item, config, catalog] = await Promise.all([fetchProduct(params.id), fetchStoreConfig(), fetchCatalog()]);
  if (!item || !item.listed) notFound();

  const related = catalog.filter((p) => p.category === item.category && p.id !== item.id).slice(0, 4);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-5 sm:px-6">
      <nav className="mb-4 text-[0.84rem] font-bold text-fg-3">
        <Link href="/shop" className="hover:text-fg">
          المنتجات
        </Link>{' '}
        /{' '}
        <Link href={`/shop?c=${item.category}`} className="hover:text-fg">
          {CATEGORY_LABEL[item.category]}
        </Link>
      </nav>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] md:gap-10">
        <div className="aspect-[4/5] overflow-hidden rounded-card bg-sunken md:sticky md:top-24 md:self-start">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={productImagePath(item.id, item.thumbHash, item.imageUrl)}
            alt={item.name}
            className="h-full w-full object-cover"
          />
        </div>

        <div>
          {item.brand ? <p className="font-bold text-fg-3">{item.brand}</p> : null}
          <h1 className="mt-1 text-[1.9rem] leading-tight sm:text-[2.4rem]">{item.name}</h1>
          <p className="tnum mt-3 font-display text-[2rem] font-black text-brand-500">{money(item.price)}</p>

          <div className="mt-6">
            <ProductBuy item={item} whatsapp={config.whatsapp} />
          </div>

          {item.description ? (
            <div className="mt-7 border-t border-line pt-5">
              <p className="ledger-head">عن المنتج</p>
              <p className="whitespace-pre-line leading-relaxed text-fg-2">{item.description}</p>
            </div>
          ) : null}

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

      {related.length > 0 ? (
        <section className="mt-16">
          <h2 className="mb-5 text-[1.6rem]">ممكن يعجبك</h2>
          <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-4 sm:gap-x-5">
            {related.map((r) => (
              <ProductTile key={r.id} item={r} />
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
