import Link from 'next/link';
import type { ReactNode } from 'react';
import { HeroSlider } from '@/components/store/HeroSlider';
import { PersonalShelf } from '@/components/store/PersonalShelf';
import { Reveal } from '@/components/store/Reveal';
import { Shelf } from '@/components/store/Shelf';
import { IconChevronLeft, IconReturn, IconShip, IconWallet, IconWhatsApp } from '@/components/ui/Icons';
import { money } from '@/lib/format';
import { HOME_SECTION_LABEL, type CatalogItem, type Category, type HomeSection, type StoreConfig } from '@/lib/types';
import { salePercent } from '@/lib/store/model';
import { productImagePath } from '@/lib/store/paths';
import { fetchCatalog, fetchOffers, fetchStoreConfig, STORE_REVALIDATE, type PublicOffer } from '@/lib/store/server';
import { CATEGORY_LABEL } from '@/lib/types';

export const revalidate = STORE_REVALIDATE;

/**
 * The storefront, assembled from the blocks the owner arranged in
 * «واجهة المتجر». Every block hides itself when it has nothing to show, so a
 * section switched on with no products never leaves an empty heading.
 */
export default async function StoreHome() {
  const [catalog, config, offers] = await Promise.all([fetchCatalog(), fetchStoreConfig(), fetchOffers()]);
  const ctx: Ctx = { catalog, config, offers };

  return (
    <>
      {config.sections
        .filter((s) => s.enabled)
        .map((s) => (
          <Section key={s.type} section={s} ctx={ctx} />
        ))}

      {catalog.length === 0 ? (
        <p className="mx-auto mt-16 max-w-6xl px-4 text-center text-fg-3">المنتجات بتنزل قريب — تابعنا واتساب.</p>
      ) : null}
    </>
  );
}

type Ctx = { catalog: CatalogItem[]; config: StoreConfig; offers: PublicOffer[] };

function Section({ section, ctx }: { section: HomeSection; ctx: Ctx }): ReactNode {
  const { catalog, config } = ctx;
  const title = section.title || HOME_SECTION_LABEL[section.type].title;
  const nd = config.newDays;

  switch (section.type) {
    case 'hero':
      return config.banners.length > 0 ? <HeroSlider banners={config.banners} /> : <TypeHero config={config} catalog={catalog} />;
    case 'promise':
      return <Guarantees config={config} />;
    case 'categories':
      return <Departments catalog={catalog} />;
    case 'offers':
      return <Offers offers={ctx.offers} title={title} />;
    case 'featured': {
      const picks = catalog.filter((p) => p.featured);
      return <Shelf kicker="EDITOR'S PICKS" title={title} items={picks.slice(0, 8)} newDays={nd} href={picks.length > 8 ? '/shop?featured=1' : undefined} />;
    }
    case 'sale': {
      const sale = catalog.filter((p) => p.compareAtPrice > p.price).sort((a, b) => salePercent(b) - salePercent(a));
      return <Shelf kicker="SALE" title={title} items={sale.slice(0, 8)} newDays={nd} href="/shop?sale=1" />;
    }
    case 'new':
      return <Shelf kicker="NEW IN" title={title} items={catalog.slice(0, 8)} newDays={nd} href="/shop" />;
    case 'trending': {
      const hot = [...catalog].filter((p) => p.lastSoldAtMs > 0).sort((a, b) => b.lastSoldAtMs - a.lastSoldAtMs);
      return hot.length >= 4 ? <Shelf kicker="TRENDING" title={title} items={hot.slice(0, 8)} newDays={nd} href="/shop?sort=popular" /> : null;
    }
    case 'mysize':
      return <PersonalShelf kind="mysize" title={title} items={catalog} newDays={nd} />;
    case 'recent':
      return <PersonalShelf kind="recent" title={title} items={catalog} newDays={nd} />;
    case 'howto':
      return <HowTo config={config} title={title} />;
  }
}

/** Without banners: the statement in huge type beside three real products. */
function TypeHero({ config, catalog }: { config: StoreConfig; catalog: CatalogItem[] }) {
  const pics = [...catalog.filter((p) => p.featured), ...catalog].filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i).slice(0, 3);
  return (
    <section className="mx-auto grid max-w-7xl items-center gap-8 px-4 pb-4 pt-8 sm:px-6 sm:pt-14 lg:grid-cols-[1.1fr_1fr] lg:gap-14">
      <Reveal>
        <p className="store-kicker">{config.tagline}</p>
        <h1 className="store-display mt-4">{config.heroTitle}</h1>
        <p className="mt-5 max-w-lg text-[1.08rem] leading-relaxed text-fg-2">{config.heroSubtitle}</p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href="/shop" className="press inline-flex h-14 items-center gap-2 rounded-full bg-fg px-8 font-display text-[1.05rem] font-black text-page">
            تسوّق الآن
            <IconChevronLeft className="h-4 w-4" />
          </Link>
          <Link href="/shop?c=shoes" className="press inline-flex h-14 items-center rounded-full border-2 border-fg px-7 font-display text-[1.05rem] font-black">
            الأحذية
          </Link>
        </div>
      </Reveal>
      {pics.length > 0 ? (
        <div className="grid grid-cols-[1.3fr_1fr] grid-rows-2 gap-3 sm:gap-4">
          {pics.map((p, i) => (
            <Reveal key={p.id} delay={i * 120} className={i === 0 ? 'row-span-2' : ''}>
              <Link href={`/p/${p.id}`} className="tile group relative block h-full overflow-hidden rounded-card bg-sunken">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={productImagePath(p.id, p.thumbHash, p.imageUrl)}
                  alt={p.name}
                  className={`tile-img w-full object-cover ${i === 0 ? 'aspect-[3/4] h-full' : 'aspect-square'}`}
                />
                <span className="tnum absolute bottom-2 right-2 rounded-full bg-surface px-3 py-1 font-display text-[0.82rem] font-black text-brand-500">
                  {money(p.price)}
                </span>
              </Link>
            </Reveal>
          ))}
        </div>
      ) : null}
    </section>
  );
}

/** The four answers to "can I trust ordering from this site?" */
function Guarantees({ config }: { config: StoreConfig }) {
  const items = [
    { icon: IconWallet, title: 'الدفع عند الاستلام', body: 'ما بتدفع إلا لمن تشوف القطعة' },
    {
      icon: IconShip,
      title: config.freeDeliveryOver > 0 ? `توصيل مجاني فوق ${money(config.freeDeliveryOver)}` : 'توصيل لحدي الباب',
      body: config.deliveryFee > 0 ? `وإلا ${money(config.deliveryFee)} بس` : 'داخل المدينة',
    },
    { icon: IconReturn, title: 'استبدال سهل', body: config.returnPolicy },
    { icon: IconWhatsApp, title: 'نرد عليك واتساب', body: 'اسأل عن أي مقاس قبل ما تطلب' },
  ];
  return (
    <Reveal as="section" className="mx-auto mt-10 max-w-7xl px-4 sm:px-6">
      <ul className="grid grid-cols-2 border-y border-line lg:grid-cols-4">
        {items.map(({ icon: Icon, title, body }, i) => (
          <li key={title} className={`flex items-start gap-3 py-5 ${i % 2 === 0 ? 'pl-3' : 'pr-3'} lg:px-5 ${i > 0 ? 'lg:border-r lg:border-line' : ''}`}>
            <Icon className="mt-0.5 h-6 w-6 shrink-0 text-fg" />
            <span className="min-w-0">
              <span className="block font-display text-[0.95rem] font-black leading-tight">{title}</span>
              <span className="mt-1 line-clamp-2 block text-[0.8rem] leading-snug text-fg-3">{body}</span>
            </span>
          </li>
        ))}
      </ul>
    </Reveal>
  );
}

function Departments({ catalog }: { catalog: CatalogItem[] }) {
  const by = (c: Category) => catalog.filter((p) => p.category === c);
  return (
    <section className="mx-auto mt-14 grid max-w-7xl grid-cols-2 gap-3 px-4 sm:mt-20 sm:gap-5 sm:px-6">
      {(['shoes', 'clothing'] as const).map((c, i) => {
        const list = by(c);
        const cover = list.find((p) => p.featured) ?? list[0];
        return (
          <Reveal key={c} delay={i * 120}>
            <Link href={`/shop?c=${c}`} className="tile group relative block aspect-[3/4] overflow-hidden rounded-card bg-sunken sm:aspect-[4/3]">
              {cover ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={productImagePath(cover.id, cover.thumbHash, cover.imageUrl)} alt="" loading="lazy" className="tile-img h-full w-full object-cover" />
              ) : null}
              <span className="absolute inset-x-3 bottom-3 flex items-center justify-between gap-2 rounded-card bg-surface px-4 py-3 sm:inset-x-5 sm:bottom-5">
                <span>
                  <span className="block font-display text-[1.25rem] font-black leading-tight sm:text-[1.6rem]">{CATEGORY_LABEL[c]}</span>
                  <span className="tnum text-[0.8rem] font-bold text-fg-3">{list.length} منتج</span>
                </span>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-fg text-page transition-transform group-hover:-translate-x-1">
                  <IconChevronLeft className="h-4 w-4" />
                </span>
              </span>
            </Link>
          </Reveal>
        );
      })}
    </section>
  );
}

function Offers({ offers, title }: { offers: PublicOffer[]; title: string }) {
  if (offers.length === 0) return null;
  return (
    <Reveal as="section" className="mx-auto mt-16 max-w-7xl sm:px-6">
      <h2 className="store-title mb-5 px-4 sm:px-0">{title}</h2>
      <div className="rail gap-3 px-4 sm:px-0">
        {offers.map((o) => (
          <div key={o.code} className="w-[17rem] shrink-0 rounded-card border-2 border-dashed border-fg bg-surface p-5">
            <p className="font-bold text-fg-2">{o.name}</p>
            <p className="tnum mt-1 font-display text-[2rem] font-black leading-none text-brand-500">
              {o.kind === 'percent' ? `${o.value}%` : money(o.value)}
              <span className="text-[1rem] text-fg"> خصم</span>
            </p>
            <p className="mt-3 text-[0.84rem] font-semibold text-fg-3">
              اكتب الكود في السلة:{' '}
              <span dir="ltr" className="rounded-[3px] bg-spot px-2 py-0.5 font-display font-black tracking-wider text-on-spot">
                {o.code}
              </span>
            </p>
            {o.minTotal > 0 ? <p className="mt-1.5 text-[0.78rem] text-fg-3">للطلبات من {money(o.minTotal)}</p> : null}
          </div>
        ))}
      </div>
    </Reveal>
  );
}

function HowTo({ config, title }: { config: StoreConfig; title: string }) {
  const steps = [
    ['اختار', 'المنتج والمقاس، وضيفه للسلة.'],
    ['أكّد', 'اسمك وعنوانك — والطلب يوصلنا واتساب بكل التفاصيل.'],
    ['استلم', config.pickupEnabled ? 'نوصلك لحدي الباب أو تستلم من المحل، والدفع عند الاستلام.' : 'نوصلك لحدي الباب، والدفع عند الاستلام.'],
  ];
  return (
    <section className="mx-auto mt-20 max-w-7xl px-4 sm:mt-28 sm:px-6">
      <Reveal>
        <h2 className="store-title">{title}</h2>
      </Reveal>
      <ol className="mt-6 grid gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-3">
        {steps.map(([t, body], i) => (
          <Reveal as="li" key={t} delay={i * 120} className="bg-surface p-6">
            <span className="tnum font-display text-[3.2rem] font-black leading-none text-line-strong">0{i + 1}</span>
            <span className="mt-3 block font-display text-[1.3rem] font-black">{t}</span>
            <span className="mt-1 block text-[0.92rem] leading-relaxed text-fg-2">{body}</span>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
