'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Brand } from '@/components/layout/Brand';
import { IconBag, IconHeart, IconMoon, IconSearch, IconSun } from '@/components/ui/Icons';
import { cartCount, useCart } from '@/lib/store/cart';
import { applyLook, openPanel, useMounted, useWishlist } from '@/lib/store/prefs';
import type { CatalogItem, StoreLook } from '@/lib/types';
import { CartDrawer } from './CartDrawer';
import { SearchOverlay } from './SearchOverlay';

const LINKS = [
  { href: '/shop', label: 'كل المنتجات' },
  { href: '/shop?c=shoes', label: 'أحذية' },
  { href: '/shop?c=clothing', label: 'ملابس' },
];

/**
 * The store's header: a moving announcement line, the mark, the departments,
 * and the four things a shopper reaches for — search, saved items, the look,
 * the basket. Search and basket open as panels over the page instead of
 * navigating away: on a slow connection every page load is a chance to leave.
 */
export function StoreHeader({
  announcements,
  lookToggle,
  defaultLook,
  freeOver,
  items,
  hasSale,
  logoSrc,
}: {
  announcements: string[];
  lookToggle: boolean;
  defaultLook: StoreLook;
  freeOver: number;
  items: CatalogItem[];
  hasSale: boolean;
  logoSrc: string | null;
}) {
  const cart = useCart();
  const wishlist = useWishlist();
  const mounted = useMounted();
  const pathname = usePathname();
  const count = cartCount(cart);
  const [look, setLook] = useState<StoreLook>(defaultLook);
  const [scrolled, setScrolled] = useState(false);

  // The look was applied before paint by the layout's script; read it back.
  useEffect(() => {
    const current = document.getElementById('store-root')?.getAttribute('data-look');
    if (current === 'light' || current === 'luxe') setLook(current);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const links = hasSale ? [...LINKS, { href: '/shop?sale=1', label: 'تخفيضات' }] : LINKS;

  return (
    <>
      <header className={`sticky top-0 z-40 border-b bg-page transition-colors ${scrolled ? 'border-line' : 'border-transparent'}`}>
        {announcements.length > 0 ? <Ticker messages={announcements} /> : null}

        <div className="mx-auto flex h-16 max-w-7xl items-center gap-1.5 px-4 sm:gap-2 sm:px-6">
          <Link href="/" aria-label="الرئيسية" className="shrink-0">
            <Brand compact src={logoSrc} />
          </Link>

          <nav className="hidden flex-1 items-center justify-center gap-8 md:flex">
            {links.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`relative py-2 font-display text-[0.98rem] font-extrabold transition-colors hover:text-fg ${
                  l.href.includes('sale') ? 'text-brand-500' : pathname === '/shop' && l.href === '/shop' ? 'text-fg' : 'text-fg-2'
                }`}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <span className="flex-1 md:hidden" />

          <HeaderButton label="بحث" onClick={() => openPanel('search')}>
            <IconSearch className="h-5 w-5" />
          </HeaderButton>

          <Link
            href="/wishlist"
            aria-label={`المفضلة${mounted && wishlist.length ? ` — ${wishlist.length}` : ''}`}
            className="press relative inline-flex h-11 w-11 items-center justify-center rounded-full text-fg-2 hover:bg-sunken hover:text-fg"
          >
            <IconHeart className="h-5 w-5" />
            {mounted && wishlist.length > 0 ? (
              <span className="tnum absolute right-1 top-1 flex h-4 min-w-[1rem] items-center justify-center rounded-full bg-brand-500 px-1 text-[0.62rem] font-black text-white">
                {wishlist.length}
              </span>
            ) : null}
          </Link>

          {lookToggle ? (
            <HeaderButton
              label={look === 'luxe' ? 'الشكل الفاتح' : 'الشكل الليلي'}
              onClick={() => {
                const next = look === 'luxe' ? 'light' : 'luxe';
                setLook(next);
                applyLook(next);
              }}
            >
              {look === 'luxe' ? <IconSun className="h-5 w-5" /> : <IconMoon className="h-5 w-5" />}
            </HeaderButton>
          ) : null}

          <button
            type="button"
            onClick={() => openPanel('cart')}
            aria-label={`السلة${mounted && count ? ` — ${count} قطعة` : ''}`}
            className="press relative ms-1 inline-flex h-11 items-center gap-2 rounded-full bg-fg px-4 text-page"
          >
            <IconBag className="h-5 w-5" />
            <span className="hidden font-display text-[0.9rem] font-extrabold sm:inline">السلة</span>
            {mounted && count > 0 ? (
              <span className="tnum flex h-5 min-w-[1.25rem] items-center justify-center rounded-full bg-brand-500 px-1 text-[0.72rem] font-black text-white">
                {count}
              </span>
            ) : null}
          </button>
        </div>

        {/* Phone: the departments as a strip under the mark. */}
        <nav className="scroller !mx-0 px-4 pb-2.5 md:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`shrink-0 rounded-full border px-3.5 py-1.5 text-[0.84rem] font-bold ${
                l.href.includes('sale') ? 'border-brand-500 text-brand-500' : 'border-line-strong text-fg-2'
              }`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
      </header>

      <SearchOverlay items={items} />
      <CartDrawer freeOver={freeOver} />
    </>
  );
}

function HeaderButton({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="press inline-flex h-11 w-11 items-center justify-center rounded-full text-fg-2 hover:bg-sunken hover:text-fg"
    >
      {children}
    </button>
  );
}

/**
 * One message sits still; several run as a slow ticker. Duplicated once so the
 * line loops without a gap.
 */
function Ticker({ messages }: { messages: string[] }) {
  if (messages.length === 1) {
    return <p className="bg-fg px-4 py-2 text-center text-[0.8rem] font-bold text-page">{messages[0]}</p>;
  }
  const line = messages.map((m, i) => (
    <span key={i} className="flex shrink-0 items-center">
      <span className="px-6">{m}</span>
      <span aria-hidden="true" className="h-1 w-1 rounded-full bg-page/50" />
    </span>
  ));
  return (
    <div className="marquee overflow-hidden bg-fg py-2 text-[0.8rem] font-bold text-page" aria-label={messages.join(' — ')} role="marquee">
      <div className="marquee-track" style={{ '--marquee-duration': `${messages.length * 9}s` } as React.CSSProperties} aria-hidden="true">
        {/* Two identical halves (each the messages twice) so a 50% shift loops seamlessly. */}
        {[0, 1, 2, 3].map((k) => (
          <span key={k} className="flex shrink-0">
            {line}
          </span>
        ))}
      </div>
    </div>
  );
}
