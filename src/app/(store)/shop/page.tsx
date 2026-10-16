import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ShopBrowser } from '@/components/store/ShopBrowser';
import { itemListGraph, jsonLd } from '@/lib/store/seo';
import { fetchCatalog, fetchStoreConfig, STORE_REVALIDATE } from '@/lib/store/server';
import { siteUrl } from '@/lib/store/site';
import type { Category } from '@/lib/types';

export const revalidate = STORE_REVALIDATE;

type Props = { searchParams: { c?: string; q?: string; sale?: string } };

const TITLES: Record<'all' | Category, { title: string; description: string }> = {
  all: {
    title: 'كل المنتجات — أحذية وملابس',
    description: 'تشكيلة الأحذية الرياضية والملابس في الأبيض: نايكي، اديدس وغيرها، بمقاسات كاملة. الدفع عند الاستلام والتوصيل لحدي الباب.',
  },
  shoes: {
    title: 'أحذية رياضية وسنيكرز في الأبيض',
    description: 'أحذية رياضية وسنيكرز بمقاسات من 36 لحدي 45 — اير فورس، سامبا، باندا وغيرها. اختار مقاسك واطلب، والدفع عند الاستلام.',
  },
  clothing: {
    title: 'ملابس — تيشيرتات وبناطلين جينز',
    description: 'تيشيرتات أوفر سايز وبناطلين جينز بمقاسات S لحدي XXL في الأبيض. الدفع عند الاستلام والتوصيل لحدي الباب.',
  },
};

function categoryOf(c?: string): 'all' | Category {
  return c === 'shoes' || c === 'clothing' ? c : 'all';
}

/** A title per department, so "أحذية رياضية الأبيض" lands on the shoes, not on a generic list. */
export function generateMetadata({ searchParams }: Props): Metadata {
  const c = categoryOf(searchParams.c);
  const { title, description } = searchParams.sale === '1' ? { title: 'تخفيضات', description: TITLES.all.description } : TITLES[c];
  // Search and filter variations are not separate pages; only the departments are.
  const filtered = Boolean(searchParams.q || searchParams.sale);
  return {
    title,
    description,
    alternates: { canonical: c === 'all' ? '/shop' : `/shop?c=${c}` },
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description },
  };
}

export default async function ShopPage({ searchParams }: Props) {
  const [items, config] = await Promise.all([fetchCatalog(), fetchStoreConfig()]);
  const c = categoryOf(searchParams.c);
  const listed = c === 'all' ? items : items.filter((i) => i.category === c);
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(itemListGraph(listed, siteUrl(), TITLES[c].title)) }} />
      <Suspense>
        <ShopBrowser items={items} newDays={config.newDays} />
      </Suspense>
    </>
  );
}
