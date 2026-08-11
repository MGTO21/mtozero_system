'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { QuickSearch, useQuickSearchHotkey } from '@/components/search/QuickSearch';
import { useAuth } from '@/components/providers/AuthProvider';
import { useTheme } from '@/components/providers/ThemeProvider';
import { InstallBanner } from '@/components/pwa/InstallBanner';
import { Button, IconButton } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Feedback';
import {
  IconChevronDown,
  IconLogout,
  IconMoon,
  IconOffline,
  IconSearch,
  IconSun,
  IconTag,
} from '@/components/ui/Icons';
import { Sheet } from '@/components/ui/Sheet';
import { useOnlineStatus } from '@/lib/hooks/useFirestore';
import { ROLE_LABEL } from '@/lib/types';
import { Brand } from './Brand';
import { MOBILE_TABS, NAV, SECTION_LABEL, SECTION_ORDER, visibleNav } from './nav';

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, loading, firebaseUser, profileError, isOwner, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const online = useOnlineStatus();
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

  useQuickSearchHotkey(useCallback(() => setSearchOpen(true), []));

  useEffect(() => {
    if (!loading && !firebaseUser) router.replace('/login');
  }, [loading, firebaseUser, router]);

  // Employees are redirected out of owner-only routes even by direct URL.
  useEffect(() => {
    if (loading || !profile) return;
    const item = NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
    if (item?.ownerOnly && !isOwner) router.replace('/dashboard');
  }, [loading, profile, pathname, isOwner, router]);

  useEffect(() => setMoreOpen(false), [pathname]);

  if (loading) {
    return (
      <div className="app-height flex items-center justify-center">
        <LoadingBlock label="جاري تحميل النظام…" />
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="app-height flex flex-col items-center justify-center gap-5 px-6 text-center">
        <Brand />
        <p className="max-w-sm text-sm font-semibold leading-relaxed text-bad">{profileError}</p>
        <Button variant="secondary" icon={<IconLogout className="h-4 w-4" />} onClick={() => void signOut()}>
          تسجيل الخروج
        </Button>
      </div>
    );
  }

  if (!profile) return null;

  const items = visibleNav(isOwner);
  const tabs = items.filter((i) => (MOBILE_TABS as readonly string[]).includes(i.href));
  const overflow = items.filter((i) => !(MOBILE_TABS as readonly string[]).includes(i.href) && i.href !== '/sell');
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <div className="app-height lg:flex">
      {/* Desktop rail — sits on the right because the layout is RTL. */}
      <aside className="sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-l border-ink-200 bg-white px-3 py-4 dark:border-ink-850 dark:bg-ink-900 lg:flex">
        <div className="px-2 pb-5">
          <Brand />
        </div>

        <Link
          href="/sell"
          className={`mb-3 flex h-12 items-center justify-center gap-2 rounded-card font-display text-base font-extrabold transition
            ${isActive('/sell')
              ? 'bg-brand-500 text-white shadow-glow'
              : 'bg-brand-500 text-white hover:bg-brand-600'}`}
        >
          <IconTag className="h-5 w-5" />
          تسجيل بيع
        </Link>

        <nav className="flex-1 overflow-y-auto">
          {SECTION_ORDER.map((section) => {
            const sectionItems = items.filter((i) => i.section === section && i.href !== '/sell');
            if (sectionItems.length === 0) return null;
            return (
              <div key={section} className="mb-3">
                <p className="px-3 pb-1.5 text-[0.66rem] font-bold uppercase tracking-[0.14em] text-ink-400 dark:text-ink-600">
                  {SECTION_LABEL[section]}
                </p>
                <div className="space-y-0.5">
                  {sectionItems.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        className={`flex items-center gap-2.5 rounded-card px-3 py-2.5 text-[0.92rem] font-bold transition-colors
                          ${active
                            ? 'bg-brand-500/12 text-brand-500'
                            : 'text-ink-500 hover:bg-ink-100 hover:text-ink-800 dark:text-ink-400 dark:hover:bg-ink-850 dark:hover:text-ink-50'}`}
                      >
                        <item.icon className="h-[1.15rem] w-[1.15rem]" />
                        {item.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </nav>

        <div className="mt-3 border-t border-ink-200 pt-3 dark:border-ink-850">
          <UserBadge />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onSearch={() => setSearchOpen(true)} />

        {!online ? (
          <div className="flex items-center justify-center gap-2 bg-warn/15 px-4 py-2 text-[0.8rem] font-bold text-warn">
            <IconOffline className="h-4 w-4" />
            لا يوجد اتصال — تعرض آخر بيانات محفوظة، وأي عملية ستُرسل عند عودة الشبكة
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:pb-10">
          <InstallBanner />
          {children}
        </main>
      </div>

      {/* Mobile bottom bar. The sell button is deliberately the largest target. */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-ink-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md dark:border-ink-850 dark:bg-ink-900/95 lg:hidden">
        <div className="mx-auto flex max-w-lg items-stretch">
          {tabs.slice(0, 2).map((item) => (
            <TabLink key={item.href} item={item} active={isActive(item.href)} />
          ))}

          <div className="flex w-20 shrink-0 items-start justify-center">
            <Link
              href="/sell"
              aria-label="تسجيل بيع سريع"
              className={`-mt-5 flex h-16 w-16 flex-col items-center justify-center gap-0.5 rounded-2xl bg-brand-500 text-white transition active:scale-95
                ${isActive('/sell') ? 'shadow-glow ring-2 ring-brand-300/50' : 'shadow-lift'}`}
            >
              <IconTag className="h-6 w-6" />
              <span className="font-display text-[0.62rem] font-extrabold">بيع</span>
            </Link>
          </div>

          {tabs.slice(2).map((item) => (
            <TabLink key={item.href} item={item} active={isActive(item.href)} />
          ))}

          <button
            onClick={() => setMoreOpen(true)}
            className="flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.66rem] font-bold text-ink-500 dark:text-ink-400"
          >
            <IconChevronDown className="h-[1.35rem] w-[1.35rem] rotate-180" />
            المزيد
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="المزيد">
        <div className="space-y-1">
          {overflow.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="flex items-center gap-3 rounded-card px-3 py-3 text-[0.95rem] font-bold text-ink-700 hover:bg-ink-100 dark:text-ink-100 dark:hover:bg-ink-800"
            >
              <item.icon className="h-5 w-5 text-ink-400" />
              {item.label}
            </Link>
          ))}
        </div>
        <div className="mt-4 border-t border-ink-200 pt-4 dark:border-ink-800">
          <UserBadge />
        </div>
      </Sheet>

      <QuickSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function TabLink({ item, active }: { item: { href: string; label: string; icon: React.ComponentType<React.SVGProps<SVGSVGElement>> }; active: boolean }) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`relative flex flex-1 flex-col items-center gap-1 py-2.5 text-[0.66rem] font-bold transition-colors
        ${active ? 'text-brand-500' : 'text-ink-500 dark:text-ink-400'}`}
    >
      {/* A bar, not just a colour: the active tab has to be identifiable without
          relying on hue alone. */}
      {active ? (
        <span className="absolute inset-x-[22%] top-0 h-0.5 rounded-b-full bg-brand-500" aria-hidden="true" />
      ) : null}
      <item.icon className="h-[1.35rem] w-[1.35rem]" />
      {item.label}
    </Link>
  );
}

function TopBar({ onSearch }: { onSearch: () => void }) {
  const { theme, toggle } = useTheme();
  const pathname = usePathname();
  const current = NAV.find((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));

  return (
    <header className="sticky top-0 z-40 flex h-14 items-center gap-3 border-b border-ink-200 bg-white/90 px-4 backdrop-blur-md dark:border-ink-850 dark:bg-ink-950/85 sm:px-6">
      <div className="lg:hidden">
        <Brand compact />
      </div>
      <h1 className="hidden truncate text-lg lg:block">{current?.label ?? 'Mtozero Shop'}</h1>
      <span className="flex-1" />

      {/* Reads as a search field on desktop, collapses to an icon on phones. */}
      <button
        onClick={onSearch}
        aria-label="بحث سريع"
        className="inline-flex h-9 items-center gap-2 rounded-card border border-ink-200 px-2.5 text-ink-400 transition-colors hover:border-brand-500 hover:text-brand-500 dark:border-ink-700 sm:w-56"
      >
        <IconSearch className="h-[1.05rem] w-[1.05rem] shrink-0" />
        <span className="hidden flex-1 text-right text-[0.82rem] font-semibold sm:block">بحث…</span>
        <kbd className="hidden shrink-0 rounded border border-ink-200 px-1 py-0.5 text-[0.62rem] font-bold dark:border-ink-700 sm:block">
          Ctrl K
        </kbd>
      </button>

      <IconButton label={theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'} onClick={toggle}>
        {theme === 'dark' ? <IconSun className="h-5 w-5" /> : <IconMoon className="h-5 w-5" />}
      </IconButton>
    </header>
  );
}

function UserBadge() {
  const { profile, signOut } = useAuth();
  if (!profile) return null;
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-500/15 font-display text-sm font-black text-brand-500">
        {profile.name.trim().charAt(0) || '؟'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.85rem] font-bold">{profile.name}</p>
        <p className="text-[0.72rem] font-semibold text-ink-400 dark:text-ink-500">{ROLE_LABEL[profile.role]}</p>
      </div>
      <IconButton label="تسجيل الخروج" onClick={() => void signOut()}>
        <IconLogout className="h-[1.15rem] w-[1.15rem]" />
      </IconButton>
    </div>
  );
}
