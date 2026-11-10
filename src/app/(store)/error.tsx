'use client';

import Link from 'next/link';
import { useEffect } from 'react';

/**
 * Shown inside the store header and footer when a page crashes in the browser.
 * Without it Next.js prints "Application error: a client-side exception…", and
 * Google once indexed that sentence as the home page's title.
 */
export default function StoreError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <section className="mx-auto flex max-w-xl flex-col items-center px-4 py-20 text-center">
      <h1 className="font-display text-[1.6rem] font-black">الصفحة ما فتحت كويس</h1>
      <p className="mt-3 text-fg-2">حصلت مشكلة وقت تحميل الصفحة. جرّب تاني، ولو ما اشتغلت ارجع للمنتجات.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="press inline-flex h-12 items-center rounded-card bg-fg px-6 font-display font-black text-page">
          جرّب تاني
        </button>
        <Link href="/shop" className="press inline-flex h-12 items-center rounded-card border border-line-strong px-6 font-display font-extrabold">
          كل المنتجات
        </Link>
      </div>
    </section>
  );
}
