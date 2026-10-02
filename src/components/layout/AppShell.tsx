'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState, type ComponentType, type ReactNode, type SVGProps } from 'react';
import { QuickSearch, useQuickSearchHotkey } from '@/components/search/QuickSearch';
import { useAuth } from '@/components/providers/AuthProvider';
import { useTheme } from '@/components/providers/ThemeProvider';
import { InstallBanner } from '@/components/pwa/InstallBanner';
import { UPDATE_READY_EVENT } from '@/components/pwa/ServiceWorkerRegistrar';
import { Button, IconButton } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Feedback';
import { IconGrid, IconLogout, IconMoon, IconOffline, IconSearch, IconSun, IconSync, IconTag } from '@/components/ui/Icons';
import { useConfirm } from '@/components/ui/Confirm';
import { Sheet } from '@/components/ui/Sheet';
import { useOnlineStatus } from '@/lib/hooks/useFirestore';
import { ROLE_LABEL } from '@/lib/types';
import { Brand } from './Brand';
import { MOBILE_TABS, NAV, SECTION_LABEL, SECTION_ORDER, navItemFor, visibleNav } from './nav';
import { SyncPill, useQueueSummary, useSyncDriver } from './SyncStatus';

export function AppShell({ children }: { children: ReactNode }) {
  const { profile, loading, firebaseUser, profileError, isOwner, signOut } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const online = useOnlineStatus();
  const [moreOpen, setMoreOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [updateReady, setUpdateReady] = useState(false);
  const queue = useQueueSummary(profile?.uid);

  useQuickSearchHotkey(useCallback(() => setSearchOpen(true), []));
  useSyncDriver(profile?.uid, queue.pending.length);

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

  useEffect(() => {
    const onReady = () => setUpdateReady(true);
    window.addEventListener(UPDATE_READY_EVENT, onReady);
    return () => window.removeEventListener(UPDATE_READY_EVENT, onReady);
  }, []);

  if (loading) {
    return (
      <div className="app-height flex flex-col items-center justify-center gap-3 px-6 text-center">
        <Brand />
        <LoadingBlock label="جاري فتح الدفتر…" />
        {!online ? (
          <p className="max-w-xs text-[0.84rem] font-semibold text-fg-3">
            بدون شبكة: يفتح النظام من بيانات الجهاز إذا سبق تسجيل الدخول عليه.
          </p>
        ) : null}
      </div>
    );
  }

  if (profileError) {
    return (
      <div className="app-height flex flex-col items-center justify-center gap-5 px-6 text-center">
        <Brand />
        <p className="max-w-sm text-sm font-bold leading-relaxed text-bad">{profileError}</p>
        <Button variant="secondary" icon={<IconLogout className="h-4 w-4" />} onClick={() => void signOut()}>
          تسجيل الخروج
        </Button>
      </div>
    );
  }

  if (!profile) return null;

  const items = visibleNav(isOwner);
  const tabs = MOBILE_TABS.map((href) => items.find((i) => i.href === href)).filter(Boolean) as typeof items;
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);
  const current = navItemFor(pathname);

  return (
    <div className="app-height lg:flex">
      {/* Desktop rail — on the right because the layout is RTL. */}
      <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col border-l border-line bg-surface px-3 py-5 lg:flex">
        <div className="px-2 pb-5">
          <Brand />
        </div>

        <Link
          href="/sell"
          className={`press mb-5 flex h-12 items-center justify-center gap-2 rounded-card bg-brand-500 font-display text-[1.05rem] font-black text-white hover:bg-brand-600
            ${isActive('/sell') ? 'ring-2 ring-brand-500/30 ring-offset-2 ring-offset-surface' : ''}`}
        >
          <IconTag className="h-5 w-5" />
          تسجيل بيع
        </Link>

        <nav className="flex-1 space-y-4 overflow-y-auto">
          {SECTION_ORDER.map((section) => {
            const sectionItems = items.filter((i) => i.section === section && i.href !== '/sell');
            if (sectionItems.length === 0) return null;
            return (
              <div key={section}>
                <p className="ledger-head px-2 !mb-1.5 !text-[0.72rem]">{SECTION_LABEL[section]}</p>
                <div className="space-y-0.5">
                  {sectionItems.map((item) => {
                    const active = isActive(item.href);
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        aria-current={active ? 'page' : undefined}
                        className={`relative flex items-center gap-3 rounded-card px-3 py-2.5 text-[0.95rem] font-bold transition-colors
                          ${active ? 'bg-fg text-page' : 'text-fg-2 hover:bg-sunken hover:text-fg'}`}
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

        <div className="mt-3 space-y-3 border-t border-line pt-3">
          <ThemeSwitch />
          <UserBadge pending={queue.pending.length + queue.conflicts.length} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-40 border-b border-line bg-page/95 backdrop-blur-sm">
          <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-4 sm:px-6">
            <div className="min-w-0 flex-1">
              {pathname === '/dashboard' ? (
                <span className="lg:hidden">
                  <Brand compact />
                </span>
              ) : (
                <span className="block truncate font-display text-[1.15rem] font-extrabold lg:hidden">
                  {current?.label ?? 'Mtozero'}
                </span>
              )}
              <span className="hidden truncate font-display text-[1.15rem] font-extrabold lg:block">
                {current?.label ?? 'Mtozero'}
              </span>
            </div>

            <SyncPill summary={queue} />

            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="بحث سريع"
              className="press inline-flex h-10 items-center gap-2 rounded-card border border-line-strong bg-surface px-2.5 text-fg-2 hover:text-fg sm:w-60"
            >
              <IconSearch className="h-[1.1rem] w-[1.1rem] shrink-0" />
              <span className="hidden flex-1 text-right text-[0.86rem] font-semibold sm:block">ابحث عن منتج أو عميل…</span>
              <kbd className="hidden shrink-0 rounded border border-line px-1 py-0.5 text-[0.62rem] font-bold lg:block">Ctrl K</kbd>
            </button>

            <IconButton label="القائمة" onClick={() => setMoreOpen(true)} className="lg:hidden">
              <IconGrid className="h-5 w-5" />
            </IconButton>
          </div>
        </header>

        {updateReady ? (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center justify-center gap-2 bg-fg px-4 py-2 text-[0.82rem] font-bold text-page"
          >
            <IconSync className="h-4 w-4" />
            نسخة جديدة من النظام جاهزة — اضغط للتحديث
          </button>
        ) : null}

        {!online ? (
          <div className="flex items-center justify-center gap-2 border-b border-dashed border-line-strong bg-sunken px-4 py-2 text-center text-[0.8rem] font-bold text-fg-2">
            <IconOffline className="h-4 w-4 shrink-0" />
            بدون شبكة — البيع والتسديد يتسجّلوا على الجهاز ويترسلوا لما الشبكة ترجع
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 sm:px-6 lg:pb-12 lg:pt-6">
          <InstallBanner />
          {children}
        </main>
      </div>

      {/* Phone bottom bar. The sell button is the largest target and sits under the thumb. */}
      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] lg:hidden">
        <div className="mx-auto grid max-w-lg grid-cols-5 items-end">
          {tabs.slice(0, 2).map((item) => (
            <TabLink key={item.href} item={item} active={isActive(item.href)} />
          ))}

          <div className="flex justify-center">
            <Link
              href="/sell"
              aria-label="تسجيل بيع"
              aria-current={isActive('/sell') ? 'page' : undefined}
              className="press -mt-4 mb-1.5 flex h-[3.75rem] w-[3.75rem] flex-col items-center justify-center gap-0.5 rounded-card bg-brand-500 text-white shadow-lift"
            >
              <IconTag className="h-6 w-6" />
              <span className="font-display text-[0.7rem] font-black">بيع</span>
            </Link>
          </div>

          {tabs.slice(2).map((item) => (
            <TabLink key={item.href} item={item} active={isActive(item.href)} />
          ))}
        </div>
      </nav>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title="كل الأقسام" tall>
        <div className="space-y-5">
          {SECTION_ORDER.map((section) => {
            const sectionItems = items.filter(
              (i) => i.section === section && i.href !== '/sell' && !(MOBILE_TABS as readonly string[]).includes(i.href),
            );
            if (sectionItems.length === 0) return null;
            return (
              <div key={section}>
                <p className="ledger-head">{SECTION_LABEL[section]}</p>
                <div className="grid grid-cols-3 gap-2">
                  {sectionItems.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className={`press flex aspect-[1/0.92] flex-col items-center justify-center gap-2 rounded-card border p-2 text-center
                        ${isActive(item.href) ? 'border-fg bg-fg text-page' : 'border-line bg-surface text-fg'}`}
                    >
                      <item.icon className="h-6 w-6" />
                      <span className="text-[0.8rem] font-bold leading-tight">{item.label}</span>
                    </Link>
                  ))}
                </div>
              </div>
            );
          })}

          <div className="space-y-3 border-t border-line pt-4">
            <ThemeSwitch />
            <UserBadge pending={queue.pending.length + queue.conflicts.length} />
          </div>
        </div>
      </Sheet>

      <QuickSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}

function TabLink({
  item,
  active,
}: {
  item: { href: string; label: string; icon: ComponentType<SVGProps<SVGSVGElement>> };
  active: boolean;
}) {
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`relative flex flex-col items-center gap-1 pb-2 pt-2.5 text-[0.7rem] font-bold transition-colors
        ${active ? 'text-fg' : 'text-fg-3'}`}
    >
      {/* A bar, not just a colour: the active tab has to be identifiable without
          relying on hue alone. */}
      {active ? <span className="absolute inset-x-[26%] top-0 h-[3px] bg-fg" aria-hidden="true" /> : null}
      <item.icon className="h-[1.4rem] w-[1.4rem]" />
      {item.label}
    </Link>
  );
}

function ThemeSwitch() {
  const { theme, toggle } = useTheme();
  return (
    <button
      type="button"
      onClick={toggle}
      className="flex w-full items-center gap-3 rounded-card px-2 py-2 text-[0.9rem] font-bold text-fg-2 hover:bg-sunken"
    >
      {theme === 'dark' ? <IconSun className="h-5 w-5" /> : <IconMoon className="h-5 w-5" />}
      {theme === 'dark' ? 'الوضع النهاري' : 'الوضع الليلي'}
    </button>
  );
}

function UserBadge({ pending }: { pending: number }) {
  const { profile, signOut } = useAuth();
  const { confirm, dialog } = useConfirm();
  if (!profile) return null;

  async function leave() {
    // Queued work belongs to this account: the rules only accept records in the
    // signed-in user's own name, so it waits until they sign in here again.
    if (pending > 0) {
      const ok = await confirm({
        title: 'عمليات لم تُرسل بعد',
        message: `عندك ${pending} عملية محفوظة على الجهاز ولسه ما اترسلت. لو خرجت هسي بتفضل محفوظة، وبتترسل لما ترجع تدخل بنفس الحساب على نفس الجهاز.`,
        confirmLabel: 'خروج على كل حال',
        danger: true,
      });
      if (!ok) return;
    }
    await signOut();
  }

  return (
    <div className="flex items-center gap-2.5 px-1">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-card bg-fg font-display text-base font-black text-page">
        {profile.name.trim().charAt(0) || '؟'}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-[0.9rem] font-bold">{profile.name}</p>
        <p className="text-[0.74rem] font-semibold text-fg-3">{ROLE_LABEL[profile.role]}</p>
      </div>
      <IconButton label="تسجيل الخروج" onClick={() => void leave()}>
        <IconLogout className="h-[1.15rem] w-[1.15rem]" />
      </IconButton>
      {dialog}
    </div>
  );
}
