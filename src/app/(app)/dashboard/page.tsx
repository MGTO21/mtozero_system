'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { RestockPanel } from '@/components/inventory/RestockPanel';
import { SalesChart } from '@/components/dashboard/SalesChart';
import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { IconAlert, IconHourglass, IconPlus, IconTag } from '@/components/ui/Icons';
import { SectionTitle } from '@/components/ui/PageHeader';
import { dailySeries, lowStockRows, netProfit, staleProducts, summarize, topProducts } from '@/lib/analytics';
import { useExpensesBetween } from '@/lib/db/expenses';
import { useProducts } from '@/lib/db/products';
import { useSalesBetween } from '@/lib/db/sales';
import { endOfDay, lastNDays, money, num, startOfDay, startOfMonth } from '@/lib/format';
import { toDate } from '@/lib/format';

export default function DashboardPage() {
  const { profile, isOwner, canSeeProfit } = useAuth();

  // One window covers today, the last 7 days and the current month.
  const { from, to, todayStart, weekStart, monthStart } = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    const week = lastNDays(7)[0]!;
    const month = startOfMonth(now);
    const earliest = new Date(Math.min(week.getTime(), month.getTime()));
    return { from: earliest, to: endOfDay(now), todayStart: today, weekStart: week, monthStart: month };
  }, []);

  const sales = useSalesBetween(from, to);
  const expenses = useExpensesBetween(monthStart, to);
  const { data: products, loading: productsLoading } = useProducts();

  const todaySales = sales.data.filter((s) => (toDate(s.createdAt)?.getTime() ?? 0) >= todayStart.getTime());
  const weekSales = sales.data.filter((s) => (toDate(s.createdAt)?.getTime() ?? 0) >= weekStart.getTime());
  const monthSales = sales.data.filter((s) => (toDate(s.createdAt)?.getTime() ?? 0) >= monthStart.getTime());

  const today = summarize(todaySales);
  const week = summarize(weekSales);
  const month = summarize(monthSales);
  const monthNet = netProfit(monthSales, expenses.data);

  const series = useMemo(() => dailySeries(sales.data, lastNDays(7)), [sales.data]);
  const alerts = useMemo(() => lowStockRows(products), [products]);
  const stale = useMemo(() => staleProducts(products, 30), [products]);
  const best = useMemo(() => topProducts(monthSales, 5), [monthSales]);

  const loading = sales.loading || productsLoading;
  const noData = !loading && products.length === 0 && sales.data.length === 0;

  return (
    <>
      <div className="mb-4">
        <p className="text-[0.82rem] font-bold text-ink-400 dark:text-ink-500">أهلاً</p>
        <h1 className="text-xl sm:text-2xl">{profile?.name}</h1>
      </div>

      {sales.error ? <ErrorBlock message={sales.error} /> : null}

      {noData ? (
        <div className="surface">
          <EmptyState
            icon={<IconPlus className="h-7 w-7" />}
            title="لنبدأ — النظام جاهز"
            hint="أضف أول منتج بمقاساته وكمياته، وبعدها سجّل أول عملية بيع. كل الأرقام هنا ستمتلئ تلقائياً."
            action={
              <Link href="/inventory">
                <Button size="lg" icon={<IconPlus className="h-5 w-5" />}>
                  إضافة أول منتج
                </Button>
              </Link>
            }
          />
        </div>
      ) : loading ? (
        <SkeletonRows count={3} />
      ) : (
        <>
          {/* Hero: today's number is the one the owner checks most, so it gets the
              only raised surface on the page. */}
          <section className="surface-key mb-3 overflow-hidden">
            <div className="flex flex-wrap items-end justify-between gap-4 p-4">
              <div>
                <p className="text-[0.8rem] font-bold text-ink-400 dark:text-ink-500">مبيعات اليوم</p>
                <p className="tnum mt-1 font-display text-num-xl font-black text-brand-500">
                  {money(today.revenue)}
                </p>
                <p className="tnum mt-1 text-[0.82rem] font-bold text-ink-500 dark:text-ink-400">
                  {num(today.units)} قطعة · {num(today.transactions)} عملية
                </p>
              </div>
              <Link href="/sell">
                <Button size="lg" icon={<IconTag className="h-5 w-5" />}>
                  تسجيل بيع
                </Button>
              </Link>
            </div>

            <div className="border-t border-ink-200 px-4 py-4 dark:border-ink-800">
              <p className="mb-3 text-[0.8rem] font-bold text-ink-400 dark:text-ink-500">آخر 7 أيام</p>
              <SalesChart points={series} />
            </div>
          </section>

          <div className="mb-3 grid gap-3 sm:grid-cols-3">
            <Stat label="مبيعات الأسبوع" value={money(week.revenue)} note={`${num(week.units)} قطعة`} />
            {canSeeProfit ? (
              <Stat
                label="صافي ربح الشهر"
                value={money(monthNet)}
                note={`بعد خصم المصروفات · ربح إجمالي ${money(month.grossProfit)}`}
                tone={monthNet >= 0 ? 'good' : 'bad'}
              />
            ) : (
              <Stat label="مبيعات الشهر" value={money(month.revenue)} note={`${num(month.units)} قطعة`} />
            )}
            <Stat
              label="ديون مفتوحة"
              value={money(month.outstanding)}
              note="من مبيعات هذا الشهر"
              tone={month.outstanding > 0 ? 'warn' : undefined}
              href="/debts"
            />
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            <section className="surface p-4">
              <SectionTitle
                action={
                  alerts.length > 0 ? (
                    <span className="chip bg-warn/15 text-warn">
                      <IconAlert className="h-3.5 w-3.5" />
                      {num(alerts.length)}
                    </span>
                  ) : null
                }
              >
                ماذا تطلب في الشحنة القادمة
              </SectionTitle>
              {/* Ranked by what actually sells, not just by what is low. */}
              <RestockPanel products={products} sales={sales.data} />
            </section>

            <div className="space-y-3">
              <section className="surface p-4">
                <SectionTitle>الأكثر مبيعاً هذا الشهر</SectionTitle>
                {best.length === 0 ? (
                  <p className="py-6 text-center text-[0.85rem] font-semibold text-ink-400 dark:text-ink-500">
                    لا توجد مبيعات هذا الشهر بعد
                  </p>
                ) : (
                  <ol className="space-y-1.5">
                    {best.map((p, i) => (
                      <li key={p.productId} className="flex items-center gap-2.5 rounded-card px-1 py-1.5">
                        <span className="tnum flex h-7 w-7 shrink-0 items-center justify-center rounded-card bg-brand-500/12 font-display text-[0.82rem] font-black text-brand-500">
                          {i + 1}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-[0.88rem] font-bold">{p.productName}</span>
                        <span className="tnum shrink-0 text-[0.8rem] font-bold text-ink-500 dark:text-ink-400">
                          {num(p.units)} قطعة
                        </span>
                        <span className="tnum shrink-0 text-[0.82rem] font-black text-brand-500">
                          {money(p.revenue)}
                        </span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {isOwner && stale.length > 0 ? (
                <section className="surface p-4">
                  <SectionTitle
                    action={<span className="chip bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300">{num(stale.length)}</span>}
                  >
                    <span className="inline-flex items-center gap-2">
                      <IconHourglass className="h-[1.1rem] w-[1.1rem] text-ink-400" />
                      بضاعة راكدة
                    </span>
                  </SectionTitle>
                  <p className="mb-2 text-[0.75rem] text-ink-400 dark:text-ink-500">
                    لم تُبع منها أي قطعة منذ 30 يوماً أو أكثر — فكّر في عرض أو خصم.
                  </p>
                  <ul className="space-y-1.5">
                    {stale.slice(0, 5).map((row) => (
                      <li key={row.product.id} className="flex items-center gap-2.5">
                        <span className="min-w-0 flex-1 truncate text-[0.86rem] font-bold">
                          {row.product.name}
                        </span>
                        <span className="tnum shrink-0 text-[0.78rem] font-bold text-ink-400 dark:text-ink-500">
                          {num(row.idleDays)} يوم
                        </span>
                      </li>
                    ))}
                  </ul>
                  {isOwner ? (
                    <Link href="/reports" className="mt-2.5 block text-[0.8rem] font-bold text-brand-500">
                      التقرير الكامل
                    </Link>
                  ) : null}
                </section>
              ) : null}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Stat({
  label,
  value,
  note,
  tone,
  href,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'good' | 'warn' | 'bad';
  href?: string;
}) {
  const color =
    tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : '';

  const body = (
    <div className="surface h-full px-4 py-3.5">
      <p className="text-[0.78rem] font-bold text-ink-400 dark:text-ink-500">{label}</p>
      <p className={`tnum mt-1 font-display text-num-lg font-black ${color}`}>{value}</p>
      {note ? (
        <p className="mt-1 text-[0.72rem] font-semibold leading-snug text-ink-400 dark:text-ink-500">{note}</p>
      ) : null}
    </div>
  );

  return href ? (
    <Link href={href} className="block transition hover:opacity-90">
      {body}
    </Link>
  ) : (
    body
  );
}
