import Link from 'next/link';
import { ProductTile } from '@/components/store/ProductTile';
import { money } from '@/lib/format';
import { fetchCatalog, fetchOffers, fetchStoreConfig, STORE_REVALIDATE } from '@/lib/store/server';
import { productImagePath } from '@/lib/store/paths';
import { CATEGORY_LABEL, type Category } from '@/lib/types';

export const revalidate = STORE_REVALIDATE;

/**
 * The storefront. Editorial rather than busy: one strong statement, the two
 * departments, what just arrived, what people are buying, and how ordering works
 * — the questions a first-time visitor has, in the order they have them.
 */
export default async function StoreHome() {
  const [catalog, config, offers] = await Promise.all([fetchCatalog(), fetchStoreConfig(), fetchOffers()]);

  const newest = catalog.slice(0, 8);
  const trending = [...catalog].sort((a, b) => b.lastSoldAtMs - a.lastSoldAtMs).filter((p) => p.lastSoldAtMs > 0).slice(0, 8);
  const byCategory = (c: Category) => catalog.filter((p) => p.category === c);
  const cover = (c: Category) => byCategory(c)[0];

  return (
    <>
      {/* Statement */}
      <section className="mx-auto max-w-6xl px-4 pb-10 pt-10 sm:px-6 sm:pt-16">
        <p className="font-display text-[0.8rem] font-black tracking-[0.3em] text-fg-3">{config.tagline}</p>
        <h1 className="mt-3 max-w-3xl text-[2.6rem] leading-[1.05] sm:text-[4.2rem]">{config.heroTitle}</h1>
        <p className="mt-4 max-w-xl text-[1.05rem] leading-relaxed text-fg-2">{config.heroSubtitle}</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link
            href="/shop"
            className="press inline-flex h-14 items-center rounded-card bg-fg px-7 font-display text-[1.05rem] font-black text-page"
          >
            تسوّق الآن
          </Link>
          <Link
            href="/shop?c=shoes"
            className="press inline-flex h-14 items-center rounded-card border-[1.5px] border-fg px-7 font-display text-[1.05rem] font-black"
          >
            الأحذية
          </Link>
        </div>
      </section>

      {/* Departments */}
      <section className="mx-auto grid max-w-6xl grid-cols-2 gap-3 px-4 sm:gap-5 sm:px-6">
        {(['shoes', 'clothing'] as const).map((c) => {
          const item = cover(c);
          return (
            <Link key={c} href={`/shop?c=${c}`} className="group relative block aspect-[3/4] overflow-hidden rounded-card bg-sunken sm:aspect-[4/3]">
              {item ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={productImagePath(item.id, item.thumbHash, item.imageUrl)}
                  alt=""
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
                />
              ) : null}
              <span className="absolute inset-x-0 bottom-0 bg-fg/85 px-4 py-3 text-page">
                <span className="block font-display text-[1.4rem] font-black">{CATEGORY_LABEL[c]}</span>
                <span className="tnum text-[0.82rem] font-bold text-page/75">{byCategory(c).length} منتج متوفر</span>
              </span>
            </Link>
          );
        })}
      </section>

      {offers.length > 0 ? (
        <section className="mx-auto mt-10 max-w-6xl px-4 sm:px-6">
          <div className="scroller sm:mx-0 sm:px-0">
            {offers.map((o) => (
              <div key={o.code} className="w-[17rem] shrink-0 rounded-card border-2 border-dashed border-fg bg-surface p-4">
                <p className="font-bold">{o.name}</p>
                <p className="tnum mt-1 font-display text-[1.5rem] font-black text-brand-500">
                  {o.kind === 'percent' ? `${o.value}% خصم` : `${money(o.value)} خصم`}
                </p>
                <p className="mt-1 text-[0.82rem] font-semibold text-fg-3">
                  بالكود <span dir="ltr" className="font-display font-black text-fg">{o.code}</span>
                  {o.minTotal > 0 ? ` · من ${money(o.minTotal)}` : ''}
                </p>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <Shelf title="وصل جديد" href="/shop" items={newest} />
      {trending.length >= 4 ? <Shelf title="الناس بتطلب" href="/shop?sort=popular" items={trending} /> : null}

      {/* How ordering works */}
      <section className="mx-auto mt-16 max-w-6xl px-4 sm:px-6">
        <p className="ledger-head !text-[1rem]">كيف تطلب</p>
        <ol className="grid gap-3 sm:grid-cols-3">
          {[
            ['اختار', 'اختار المنتج والمقاس وضيفه للسلة.'],
            ['أكّد الطلب', 'اكتب اسمك وعنوانك، والطلب يوصلنا واتساب بكل التفاصيل.'],
            ['استلم وادفع', config.pickupEnabled ? 'نوصلك لحدي الباب أو تستلم من المحل، والدفع عند الاستلام.' : 'نوصلك لحدي الباب، والدفع عند الاستلام.'],
          ].map(([title, body], i) => (
            <li key={title} className="surface flex gap-4 p-5">
              <span className="tnum font-display text-[2.2rem] font-black leading-none text-line-strong">{i + 1}</span>
              <span>
                <span className="block font-display text-[1.1rem] font-black">{title}</span>
                <span className="mt-1 block text-[0.9rem] leading-relaxed text-fg-2">{body}</span>
              </span>
            </li>
          ))}
        </ol>
      </section>

      {catalog.length === 0 ? (
        <p className="mx-auto mt-10 max-w-6xl px-4 text-center text-fg-3">المنتجات بتنزل قريب — تابعنا واتساب.</p>
      ) : null}
    </>
  );
}

function Shelf({ title, href, items }: { title: string; href: string; items: Awaited<ReturnType<typeof fetchCatalog>> }) {
  if (items.length === 0) return null;
  return (
    <section className="mx-auto mt-14 max-w-6xl px-4 sm:px-6">
      <div className="mb-5 flex items-end justify-between gap-3">
        <h2 className="text-[1.6rem] sm:text-[2rem]">{title}</h2>
        <Link href={href} className="shrink-0 text-[0.9rem] font-bold text-fg-2 underline underline-offset-4">
          عرض الكل
        </Link>
      </div>
      <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 sm:gap-x-5">
        {items.map((item, i) => (
          <ProductTile key={item.id} item={item} priority={i < 2} />
        ))}
      </div>
    </section>
  );
}
