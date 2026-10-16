'use client';

import { useMemo, useState } from 'react';
import { useActor } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/DateRange';
import { EmptyState, ErrorBlock, SkeletonRows, Stamp } from '@/components/ui/Feedback';
import { IconCheck, IconHourglass, IconWhatsApp } from '@/components/ui/Icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { errorMessage } from '@/lib/db/collections';
import { productImage, useProducts } from '@/lib/db/products';
import { groupRestock, markRestockNotified, restockWhatsappText, useRestockRequests, type RestockGroup } from '@/lib/db/restock';
import { num, relativeTime } from '@/lib/format';
import type { Product } from '@/lib/types';

type Filter = 'back' | 'waiting' | 'all';

/**
 * Customers waiting for a sold-out size, grouped by product and size.
 *
 * Read two ways: when a size comes back, the people waiting for it are at the
 * top with a WhatsApp button each; and before buying, the list is the demand
 * the shop cannot see in its sales — a 42 that five people asked for this week
 * never shows up as a sale, because there was none to sell.
 */
export default function WaitingPage() {
  const { data: requests, loading, error } = useRestockRequests();
  const { data: products } = useProducts();
  const actor = useActor();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('back');
  const [busy, setBusy] = useState<string | null>(null);

  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const groups = useMemo(() => groupRestock(requests), [requests]);

  const stockOf = (g: RestockGroup) => byId.get(g.productId)?.sizes.find((s) => s.size === g.size)?.qty ?? 0;
  const isBack = (g: RestockGroup) => stockOf(g) > 0;

  const visible = groups.filter((g) => (filter === 'back' ? isBack(g) : filter === 'waiting' ? !isBack(g) : true));
  const backCount = groups.filter(isBack).length;
  const people = groups.reduce((n, g) => n + g.open.length, 0);

  const site = typeof window === 'undefined' ? '' : window.location.origin;

  async function notify(g: RestockGroup, ids: string[]) {
    setBusy(g.key);
    try {
      await markRestockNotified(ids, `${g.productName} مقاس ${g.size}`, actor);
    } catch (err) {
      toast.error(errorMessage(err, 'ما قدرنا نحدّث القائمة.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <>
      <PageHeader
        title="منتظرين التوفير"
        subtitle={
          people > 0
            ? `${num(people)} عميل منتظر ${num(groups.length)} مقاس — من زرار «نبّهني» في الموقع`
            : 'العملاء اللي طلبوا يتبلّغوا لمن مقاس خلصان يرجع'
        }
      />

      {groups.length > 0 ? (
        <div className="scroller mb-4 sm:mx-0 sm:px-0">
          <Pill active={filter === 'back'} onClick={() => setFilter('back')} count={backCount}>
            رجع — بلّغهم
          </Pill>
          <Pill active={filter === 'waiting'} onClick={() => setFilter('waiting')} count={groups.length - backCount}>
            لسه خلصان
          </Pill>
          <Pill active={filter === 'all'} onClick={() => setFilter('all')} count={groups.length}>
            الكل
          </Pill>
        </div>
      ) : null}

      {error ? <ErrorBlock message={error} /> : null}

      {loading ? (
        <SkeletonRows count={3} />
      ) : visible.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={<IconHourglass />}
            title={
              groups.length === 0
                ? 'ما في زول منتظر'
                : filter === 'back'
                  ? 'ولا مقاس من المنتظرة رجع لسه'
                  : 'كل المقاسات المنتظرة رجعت'
            }
            hint={
              groups.length === 0
                ? 'لمن زبون يدوس على مقاس خلصان في الموقع ويخلي رقمو، بيظهر هنا.'
                : filter === 'back'
                  ? 'لمن تستلم شحنة فيها المقاسات دي، بتظهر هنا مع زرار واتساب لكل عميل.'
                  : undefined
            }
          />
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((g) => (
            <GroupCard
              key={g.key}
              group={g}
              product={byId.get(g.productId)}
              stock={stockOf(g)}
              site={site}
              busy={busy === g.key}
              onNotified={(ids) => void notify(g, ids)}
            />
          ))}
        </ul>
      )}

      {groups.length > 0 ? (
        <p className="mt-4 text-[0.8rem] leading-relaxed text-fg-3">
          الترتيب حسب عدد المنتظرين. قبل ما تطلب بضاعة، شوف «لسه خلصان» — دا طلب حقيقي ما بيظهر في المبيعات لأنو ما كان في حاجة تتباع.
        </p>
      ) : null}
    </>
  );
}

function GroupCard({
  group,
  product,
  stock,
  site,
  busy,
  onNotified,
}: {
  group: RestockGroup;
  product: Product | undefined;
  stock: number;
  site: string;
  busy: boolean;
  onNotified: (ids: string[]) => void;
}) {
  const back = stock > 0;
  const image = product ? productImage(product) : null;
  const url = `${site}/p/${group.productId}`;

  return (
    <li className={`surface overflow-hidden ${back ? '!border-good' : ''}`}>
      <div className="flex items-center gap-3 p-3.5">
        <div className="h-14 w-14 shrink-0 overflow-hidden rounded-card bg-sunken">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate font-bold">{product?.name ?? group.productName}</p>
          <p className="text-[0.84rem] text-fg-2">
            مقاس <span className="tnum font-display font-black text-fg">{group.size}</span>
            <span className="text-fg-3"> · أول طلب {relativeTime(new Date(group.sinceMs))}</span>
          </p>
        </div>
        <div className="shrink-0 text-left">
          <p className="tnum font-display text-num font-black leading-none">{num(group.open.length)}</p>
          <p className="text-[0.7rem] font-bold text-fg-3">منتظر</p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-line bg-sunken px-3.5 py-2">
        {back ? (
          <Stamp tone="good">رجع — {num(stock)} في المخزون</Stamp>
        ) : (
          <Stamp tone="muted">لسه خلصان</Stamp>
        )}
        {back && group.open.length > 1 ? (
          <Button variant="ghost" size="sm" loading={busy} icon={<IconCheck className="h-4 w-4" />} onClick={() => onNotified(group.open.map((r) => r.id))}>
            اتبلّغوا كلهم
          </Button>
        ) : null}
      </div>

      {back ? (
        <ul className="rows">
          {group.open.map((r) => (
            <li key={r.id} className="flex items-center gap-3 px-3.5 py-2.5">
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold">{r.name || 'بدون اسم'}</p>
                <p dir="ltr" className="tnum text-right text-[0.8rem] text-fg-3">
                  +{r.phone}
                </p>
              </div>
              {/* Opening WhatsApp counts as telling them; the row leaves the list. */}
              <a
                href={`https://wa.me/${r.phone}?text=${encodeURIComponent(restockWhatsappText(r, url))}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => onNotified([r.id])}
                className="press inline-flex h-11 shrink-0 items-center gap-2 rounded-card bg-good px-3.5 font-display text-[0.9rem] font-extrabold text-white"
              >
                <IconWhatsApp className="h-4 w-4" />
                بلّغو
              </a>
            </li>
          ))}
        </ul>
      ) : null}
    </li>
  );
}
