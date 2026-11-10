'use client';

import { useEffect } from 'react';

/**
 * Catches crashes outside a more specific boundary — including the store's own
 * header and footer — so nobody, Google included, sees Next.js's English
 * "Application error" page.
 */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main dir="rtl" className="flex min-h-[70vh] flex-col items-center justify-center bg-page px-4 text-center text-fg">
      <h1 className="font-display text-[1.6rem] font-black">الصفحة ما فتحت كويس</h1>
      <p className="mt-3 max-w-md text-fg-2">حصلت مشكلة وقت التحميل. جرّب تاني.</p>
      <div className="mt-7 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={reset} className="press inline-flex h-12 items-center rounded-card bg-fg px-6 font-display font-black text-page">
          جرّب تاني
        </button>
        <a href="/" className="press inline-flex h-12 items-center rounded-card border border-line-strong px-6 font-display font-extrabold">
          الرئيسية
        </a>
      </div>
    </main>
  );
}
