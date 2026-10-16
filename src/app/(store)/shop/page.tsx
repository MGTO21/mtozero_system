import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ShopBrowser } from '@/components/store/ShopBrowser';
import { itemListGraph, jsonLd } from '@/lib/store/seo';
import { siteUrl } from '@/lib/store/site';
import { fetchCatalog, fetchCategories, fetchStoreConfig, STORE_REVALIDATE } from '@/lib/store/server';
import type { CategoryDef } from '@/lib/types';

export const revalidate = STORE_REVALIDATE;

type Props = { searchParams: { c?: string; q?: string; sale?: string } };

/** Hand-written titles for the departments the shop started with; others get one from their name. */
const TITLES: Record<string, { title: string; description: string }> = {
  shoes: {
    title: 'أحذية رياضية وسنيكرز في الأبيض',
    description: 'أحذية رياضية وسنيكرز بمقاسات من 36 لحدي 45 — اير فورس، سامبا، باندا وغيرها. اختار مقاسك واطلب، والدفع عند الاستلام.',
  },
  clothing: {
    title: 'ملابس — تيشيرتات وبناطلين جينز',
    description: 'تيشيرتات أوفر سايز وبناطلين جينز بمقاسات S لحدي XXL في الأبيض. الدفع عند الاستلام والتوصيل لحدي الباب.',
  },
};

const ALL = {
  title: 'كل المنتجات — أحذية وملابس',
  description: 'تشكيلة الأحذية الرياضية والملابس في الأبيض: نايكي، اديدس وغيرها، بمقاسات كاملة. الدفع عند الاستلام والتوصيل لحدي الباب.',
};

function categoryOf(categories: CategoryDef[], c?: string): CategoryDef | null {
  return categories.find((x) => x.id === c) ?? null;
}

function titleFor(category: CategoryDef | null): { title: string; description: string } {
  if (!category) return ALL;
  return (
    TITLES[category.id] ?? {
      title: `${category.name} في الأبيض`,
      description: `${category.name} — تشكيلة مختارة في الأبيض، شمال كردفان. اطلب من الموقع، والدفع عند الاستلام والتوصيل لحدي الباب.`,
    }
  );
}

/** A title per department, so "أحذية رياضية الأبيض" lands on the shoes, not on a generic list. */
export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const c = categoryOf(await fetchCategories(), searchParams.c);
  const { title, description } = searchParams.sale === '1' ? { title: 'تخفيضات', description: ALL.description } : titleFor(c);
  // Search and filter variations are not separate pages; only the departments are.
  const filtered = Boolean(searchParams.q || searchParams.sale);
  return {
    title,
    description,
    alternates: { canonical: c ? `/shop?c=${c.id}` : '/shop' },
    ...(filtered ? { robots: { index: false, follow: true } } : {}),
    openGraph: { title, description },
  };
}

export default async function ShopPage({ searchParams }: Props) {
  const [items, config, categories] = await Promise.all([fetchCatalog(), fetchStoreConfig(), fetchCategories()]);
  const c = categoryOf(categories, searchParams.c);
  const listed = c ? items.filter((i) => i.category === c.id) : items;
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(itemListGraph(listed, siteUrl(), titleFor(c).title)) }} />
      <Suspense>
        <ShopBrowser items={items} newDays={config.newDays} categories={categories} />
      </Suspense>
    </>
  );
}
