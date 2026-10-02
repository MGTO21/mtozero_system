'use client';

import Link from 'next/link';
import { useMemo, type ComponentType, type SVGProps } from 'react';
import { RestockPanel } from '@/components/inventory/RestockPanel';
import { ValuePanel } from '@/components/inventory/ValuePanel';
import { SalesChart } from '@/components/dashboard/SalesChart';
import { useQueueSummary } from '@/components/layout/SyncStatus';
import { useAuth } from '@/components/providers/AuthProvider';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorBlock, Figure, SkeletonRows } from '@/components/ui/Feedback';
import {
  IconAlert,
  IconCashRegister,
  IconChevronLeft,
  IconDebt,
  IconHourglass,
  IconPlus,
  IconQueue,
  IconShip,
  IconTag,
  IconWallet,
} from '@/components/ui/Icons';
import { SectionTitle } from '@/components/ui/PageHeader';
import { changePercent, dailySeries, netProfit, restockPriority, staleProducts, summarize, topProducts } from '@/lib/analytics';
import { useExpensesBetween } from '@/lib/db/expenses';
import { useProducts } from '@/lib/db/products';
import { saleDue, useOpenDebts, useSalesBetween } from '@/lib/db/sales';
import { addDays, endOfDay, lastNDays, money, num, startOfDay, startOfMonth, toDate } from '@/lib/format';

const LONG_DATE = new Intl.DateTimeFormat('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', numberingSystem: 'latn' });

/**
 * Today's page of the ledger. Answers, in order: how much came in today, what
 * needs me right now, and how the week and month are going — so the owner
 * opening the app at the counter knows what to do before scrolling.
 */
export default function DashboardPage() {
  const { profile, isOwner, canSeeProfit } = useAuth();
  const queue = useQueueSummary(profile?.uid);

  // One window covers today, yesterday, the last 7 days and the current month.
  const { from, to, todayStart, yesterdayStart, weekStart, monthStart } = useMemo(() => {
    const now = new Date();
    const today = startOfDay(now);
    const week = lastNDays(7)[0]!;
    const month = startOfMonth(now);
    const earliest = new Date(Math.min(week.getTime(), month.getTime()));
    return {
      from: earliest,
      to: endOfDay(now),
      todayStart: today,
      yesterdayStart: addDays(today, -1),
      weekStart: week,
      monthStart: month,
    };
  }, []);

  const sales = useSalesBetween(from, to);
  const debts = useOpenDebts();
  const expenses = useExpensesBetween(monthStart, to);
  const { data: products, loading: productsLoading } = useProducts();

  const at = (s: { createdAt: Parameters<typeof toDate>[0] }) => toDate(s.createdAt)?.getTime() ?? 0;
  const todaySales = sales.data.filter((s) => at(s) >= todayStart.getTime());
  const yesterdaySales = sales.data.filter((s) => at(s) >= yesterdayStart.getTime() && at(s) < todayStart.getTime());
  const weekSales = sales.data.filter((s) => at(s) >= weekStart.getTime());
  const monthSales = sales.data.filter((s) => at(s) >= monthStart.getTime());

  const today = summarize(todaySales);
  const yesterday = summarize(yesterdaySales);
  const week = summarize(weekSales);
  const month = summarize(monthSales);
  const monthNet = netProfit(monthSales, expenses.data);
  const vsYesterday = changePercent(today.revenue, yesterday.revenue);

  const series = useMemo(() => dailySeries(sales.data, lastNDays(7)), [sales.data]);
  const restock = useMemo(() => restockPriority(products, sales.data, 30).filter((r) => r.sold > 0), [products, sales.data]);
  const stale = useMemo(() => staleProducts(products, 30), [products]);
  const best = useMemo(() => topProducts(monthSales, 5), [monthSales]);
  const owed = debts.data.reduce((sum, s) => sum + saleDue(s), 0);
  const debtors = new Set(debts.data.map((s) => s.customerPhone || s.customerName)).size;

  const loading = sales.loading || productsLoading;
  const noData = !loading && products.length === 0 && sales.data.length === 0;

  // What needs a person today, most urgent first. Empty means a quiet day.
  const attention: { key: string; href: string; icon: ComponentType<SVGProps<SVGSVGElement>>; tone: string; title: string; note: string }[] = [];
  if (queue.conflicts.length > 0)
    attention.push({ key: 'conflict', href: '/sync', icon: IconAlert, tone: 'text-bad', title: `${num(queue.conflicts.length)} عملية رفضها النظام`, note: 'محتاجة قرارك — غالباً قطعة اتباعت من جهازين' });
  if (queue.pending.length > 0)
    attention.push({ key: 'queue', href: '/sync', icon: IconQueue, tone: 'text-warn', title: `${num(queue.pending.length)} عملية على الجهاز`, note: 'تُرسل تلقائياً لما ترجع الشبكة' });
  const urgentRestock = restock.filter((r) => r.qty === 0);
  if (urgentRestock.length > 0)
    attention.push({
      key: 'restock',
      href: '/inventory',
      icon: IconAlert,
      tone: 'text-warn',
      title: `${num(urgentRestock.length)} مقاس نفد وهو بيتباع`,
      note: urgentRestock
        .slice(0, 3)
        .map((r) => `${r.product.name} ${r.size}`)
        .join('، '),
    });
  if (owed > 0)
    attention.push({ key: 'debts', href: '/debts', icon: IconDebt, tone: 'text-warn', title: `${money(owed)} ديون عند ${num(debtors)} عميل`, note: 'ذكّرهم من صفحة الديون برسالة واتساب جاهزة' });

  return (
    <>
      <div className="mb-4 flex items-end justify-between gap-3">
        <div>
          <p className="text-[0.86rem] font-bold text-fg-3">{LONG_DATE.format(new Date())}</p>
          <h1 className="text-[1.6rem] leading-tight">أهلاً {profile?.name?.split(' ')[0]}</h1>
        </div>
      </div>

      {sales.error ? <ErrorBlock message={sales.error} /> : null}

      {noData ? (
        <div className="surface">
          <EmptyState
            icon={<IconPlus />}
            title="لنبدأ — النظام جاهز"
            hint="أضف أول منتج بمقاساته وكمياته، وبعدها سجّل أول عملية بيع. كل الأرقام هنا ستمتلئ تلقائياً."
            action={
              <Link href="/inventory">
                <Button variant="ink" size="lg" icon={<IconPlus className="h-5 w-5" />}>
                  إضافة أول منتج
                </Button>
              </Link>
            }
          />
        </div>
      ) : loading ? (
        <SkeletonRows count={4} />
      ) : (
        <>
          {/* Today: the number the owner checks most, as the day's ticket. */}
          <section className="ticket mb-4 rounded-card border border-line-strong px-5 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-[0.84rem] font-bold text-fg-3">مبيعات اليوم</p>
                <p className="tnum font-display text-num-xl font-black text-brand-500">{money(today.revenue)}</p>
                <p className="tnum mt-1 text-[0.84rem] font-bold text-fg-2">
                  {num(today.transactions)} فاتورة · {num(today.units)} قطعة
                  {vsYesterday !== null ? (
                    <span className={vsYesterday >= 0 ? 'text-good' : 'text-bad'}>
                      {' '}
                      · {vsYesterday >= 0 ? '▲' : '▼'} {Math.abs(Math.round(vsYesterday))}% عن أمس
                    </span>
                  ) : null}
                </p>
              </div>
              <Link href="/close" className="press shrink-0 rounded-card border border-line-strong px-3 py-2 text-center">
                <IconCashRegister className="mx-auto h-5 w-5" />
                <span className="mt-0.5 block text-[0.72rem] font-bold">التقفيل</span>
              </Link>
            </div>
          </section>

          {/* The four things done most often, a thumb away. */}
          <div className="mb-5 grid grid-cols-4 gap-2">
            <Quick href="/sell" icon={IconTag} label="بيع" primary />
            <Quick href="/debts" icon={IconDebt} label="تسديد" />
            <Quick href="/expenses" icon={IconWallet} label="مصروف" />
            <Quick href="/shipments" icon={IconShip} label="استلام" />
          </div>

          {attention.length > 0 ? (
            <section className="mb-5">
              <SectionTitle>محتاج انتباهك</SectionTitle>
              <ul className="surface rows overflow-hidden">
                {attention.map((a) => (
                  <li key={a.key}>
                    <Link href={a.href} className="flex items-center gap-3 px-3.5 py-3 transition-colors hover:bg-sunken">
                      <a.icon className={`h-5 w-5 shrink-0 ${a.tone}`} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-bold">{a.title}</span>
                        <span className="block truncate text-[0.8rem] font-semibold text-fg-3">{a.note}</span>
                      </span>
                      <IconChevronLeft className="h-4 w-4 shrink-0 text-fg-3" />
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="surface mb-5 p-4">
            <SectionTitle>آخر 7 أيام</SectionTitle>
            <SalesChart points={series} />
            <div className="mt-4 grid grid-cols-2 gap-4 border-t border-line pt-4 sm:grid-cols-3">
              <Figure label="مبيعات الأسبوع" value={money(week.revenue)} hint={`${num(week.units)} قطعة`} />
              <Figure label="مبيعات الشهر" value={money(month.revenue)} hint={`${num(month.transactions)} فاتورة`} />
              {canSeeProfit ? (
                <Figure
                  label="صافي ربح الشهر"
                  value={money(monthNet)}
                  hint="بعد المصروفات"
                  tone={monthNet >= 0 ? 'good' : 'bad'}
                />
              ) : null}
            </div>
          </section>

          <div className="grid gap-5 lg:grid-cols-2">
            <section>
              <SectionTitle>ماذا تطلب في الشحنة القادمة</SectionTitle>
              <div className="surface p-3">
                {/* Ranked by what actually sells, not just by what is low. */}
                <RestockPanel products={products} sales={sales.data} />
              </div>
            </section>

            <div className="space-y-5">
              <section>
                <SectionTitle>الأكثر مبيعاً هذا الشهر</SectionTitle>
                {best.length === 0 ? (
                  <p className="surface py-6 text-center text-[0.86rem] font-semibold text-fg-3">لا توجد مبيعات هذا الشهر بعد</p>
                ) : (
                  <ol className="surface rows overflow-hidden">
                    {best.map((p, i) => (
                      <li key={p.productId} className="flex items-center gap-3 px-3.5 py-2.5">
                        <span className="tnum w-5 shrink-0 text-center font-display text-lg font-black text-fg-3">{i + 1}</span>
                        <span className="min-w-0 flex-1 truncate font-bold">{p.productName}</span>
                        <span className="tnum shrink-0 text-[0.82rem] font-bold text-fg-3">{num(p.units)} قطعة</span>
                        <span className="tnum shrink-0 font-display font-black">{money(p.revenue)}</span>
                      </li>
                    ))}
                  </ol>
                )}
              </section>

              {/* Cost is visible here, so it follows the same gate as profit. */}
              {canSeeProfit ? (
                <section>
                  <SectionTitle
                    action={
                      <Link href="/inventory" className="text-[0.8rem] font-bold text-fg-2 underline">
                        التفصيل
                      </Link>
                    }
                  >
                    قيمة المخزون
                  </SectionTitle>
                  <div className="surface p-4">
                    <ValuePanel products={products} compact />
                  </div>
                </section>
              ) : null}

              {isOwner && stale.length > 0 ? (
                <section>
                  <SectionTitle
                    action={
                      <Link href="/reports" className="text-[0.8rem] font-bold text-fg-2 underline">
                        التقرير
                      </Link>
                    }
                  >
                    بضاعة راكدة
                  </SectionTitle>
                  <ul className="surface rows overflow-hidden">
                    {stale.slice(0, 5).map((row) => (
                      <li key={row.product.id} className="flex items-center gap-3 px-3.5 py-2.5">
                        <IconHourglass className="h-4 w-4 shrink-0 text-fg-3" />
                        <span className="min-w-0 flex-1 truncate font-bold">{row.product.name}</span>
                        <span className="tnum shrink-0 text-[0.8rem] font-bold text-fg-3">{num(row.idleDays)} يوم</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-1.5 text-[0.78rem] text-fg-3">ما اتباع منها شيء من 30 يوم أو أكثر — فكّر في عرض أو حملة واتساب.</p>
                </section>
              ) : null}
            </div>
          </div>
        </>
      )}
    </>
  );
}

function Quick({
  href,
  icon: Icon,
  label,
  primary,
}: {
  href: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  label: string;
  primary?: boolean;
}) {
  return (
    <Link
      href={href}
      className={`press flex flex-col items-center justify-center gap-1.5 rounded-card border py-3
        ${primary ? 'border-brand-500 bg-brand-500 text-white' : 'border-line bg-surface text-fg'}`}
    >
      <Icon className="h-6 w-6" />
      <span className="text-[0.8rem] font-bold">{label}</span>
    </Link>
  );
}
