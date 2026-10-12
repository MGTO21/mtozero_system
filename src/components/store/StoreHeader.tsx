'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Brand } from '@/components/layout/Brand';
import { IconBag, IconSearch } from '@/components/ui/Icons';
import { cartCount, useCart } from '@/lib/store/cart';

const LINKS = [
  { href: '/shop', label: 'كل المنتجات' },
  { href: '/shop?c=shoes', label: 'أحذية' },
  { href: '/shop?c=clothing', label: 'ملابس' },
];

export function StoreHeader({ announcement }: { announcement: string | null }) {
  const items = useCart();
  const count = cartCount(items);
  const pathname = usePathname();
  // The count comes from this browser's storage: render it only after mount so
  // the server and the first client paint agree.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-page/95 backdrop-blur-sm">
      {announcement ? (
        <p className="bg-fg px-4 py-1.5 text-center text-[0.8rem] font-bold text-page">{announcement}</p>
      ) : null}
      <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="الرئيسية" className="shrink-0">
          <Brand compact />
        </Link>

        <nav className="hidden flex-1 items-center justify-center gap-7 md:flex">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`font-display text-[0.98rem] font-extrabold transition-colors hover:text-fg ${
                pathname === l.href.split('?')[0] && l.href === '/shop' ? 'text-fg' : 'text-fg-2'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <span className="flex-1 md:hidden" />

        <Link
          href="/shop"
          aria-label="بحث"
          className="press inline-flex h-10 w-10 items-center justify-center rounded-card text-fg-2 hover:bg-sunken hover:text-fg"
        >
          <IconSearch className="h-5 w-5" />
        </Link>
        <Link
          href="/cart"
          aria-label={`السلة${mounted && count ? ` — ${count} قطعة` : ''}`}
          className="press relative inline-flex h-10 items-center gap-2 rounded-card bg-fg px-3 text-page"
        >
          <IconBag className="h-5 w-5" />
          <span className="hidden font-display text-[0.9rem] font-extrabold sm:inline">السلة</span>
          {mounted && count > 0 ? (
            <span className="tnum flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-500 px-1 text-[0.72rem] font-black text-white">
              {count}
            </span>
          ) : null}
        </Link>
      </div>

      {/* Phone: the categories as a scrollable strip under the logo. */}
      <nav className="scroller border-t border-line px-4 py-2 md:hidden">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className="shrink-0 rounded-card border border-line-strong bg-surface px-3 py-1.5 text-[0.84rem] font-bold text-fg-2"
          >
            {l.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}
