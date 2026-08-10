'use client';

import { useMemo } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { useDateRange } from '@/components/ui/DateRange';
import { ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { IconDownload, IconHourglass } from '@/components/ui/Icons';
import { PageHeader, SectionTitle } from '@/components/ui/PageHeader';
import { changePercent, staleProducts, sumExpenses, summarize, topProducts } from '@/lib/analytics';
import { downloadCsv, downloadJson, stamp } from '@/lib/csv';
import { useExpensesBetween } from '@/lib/db/expenses';
import { totalStock, useProducts } from '@/lib/db/products';
import { itemCost, itemGross, saleDue, saleTotal, useSalesBetween } from '@/lib/db/sales';
import {
  endOfDay,
  endOfMonth,
  formatDate,
  formatTime,
  money,
  monthLabel,
  num,
  percent,
  startOfMonth,
} from '@/lib/format';
import { CHANNEL_LABEL, PAYMENT_LABEL } from '@/lib/types';

export default function ReportsPage() {
  const { range, picker } = useDateRange('month');
  const toast = useToast();

  const sales = useSalesBetween(range.from, range.to);
  const expenses = useExpensesBetween(range.from, range.to);
  const { data: products } = useProducts();

  // Month-over-month comparison always uses whole calendar months, independent of
  // the range picker above, so the two numbers are genuinely comparable.
  const { thisMonth, prevMonth } = useMemo(() => {
    const now = new Date();
    const prevRef = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return {
      thisMonth: { from: startOfMonth(now), to: endOfDay(now), label: monthLabel(now) },
      prevMonth: { from: startOfMonth(prevRef), to: endOfMonth(prevRef), label: monthLabel(prevRef) },
    };
  }, []);

  const currentSales = useSalesBetween(thisMonth.from, thisMonth.to);
  const previousSales = useSalesBetween(prevMonth.from, prevMonth.to);
  const currentExpenses = useExpensesBetween(thisMonth.from, thisMonth.to);
  const previousExpenses = useExpensesBetween(prevMonth.from, prevMonth.to);

  const totals = useMemo(() => summarize(sales.data), [sales.data]);
  const expenseTotal = sumExpenses(expenses.data);
  const net = totals.grossProfit - expenseTotal;
  const best = useMemo(() => topProducts(sales.data, 10), [sales.data]);
  const stale = useMemo(() => staleProducts(products, 30), [products]);

  const curNet = summarize(currentSales.data).grossProfit - sumExpenses(currentExpenses.data);
  const prevNet = summarize(previousSales.data).grossProfit - sumExpenses(previousExpenses.data);
  const curRevenue = summarize(currentSales.data).revenue;
  const prevRevenue = summarize(previousSales.data).revenue;

  function exportSales() {
    downloadCsv(
      `mtozero-sales-${stamp(range.from)}_${stamp(range.to)}`,
      [
        'رقم الفاتورة',
        'التاريخ',
        'الوقت',
        'المنتج',
        'المقاس',
        'الكمية',
        'المرتجع',
        'سعر القطعة',
        'قيمة الصنف',
        'التكلفة',
        'الربح',
        'إجمالي الفاتورة',
        'حالة الدفع',
        'المدفوع',
        'المتبقي',
        'العميل',
        'الهاتف',
        'القناة',
        'البائع',
      ],
      // One row per product line; invoice columns repeat so the file pivots cleanly.
      sales.data.flatMap((s) =>
        s.items.map((item) => [
          s.id.slice(0, 6).toUpperCase(),
          formatDate(s.createdAt),
          formatTime(s.createdAt),
          item.productName,
          item.size,
          item.qty,
          item.returnedQty,
          item.sellPrice,
          itemGross(item),
          itemCost(item),
          itemGross(item) - itemCost(item),
          saleTotal(s),
          PAYMENT_LABEL[s.paymentStatus],
          s.amountPaid,
          saleDue(s),
          s.customerName ?? '',
          s.customerPhone ?? '',
          CHANNEL_LABEL[s.channel],
          s.soldByName,
        ]),
      ),
    );
    toast.success('تم تصدير تقرير المبيعات');
  }

  function exportProfit() {
    downloadCsv(
      `mtozero-profit-${stamp(range.from)}_${stamp(range.to)}`,
      ['البند', 'القيمة'],
      [
        ['الفترة', range.label],
        ['إجمالي المبيعات', totals.revenue],
        ['تكلفة البضاعة المباعة', totals.cost],
        ['الربح الإجمالي', totals.grossProfit],
        ['المصروفات', expenseTotal],
        ['صافي الربح', net],
        ['عدد القطع المباعة', totals.units],
        ['عدد العمليات', totals.transactions],
        ['المحصّل نقداً', totals.collected],
        ['ديون مفتوحة من الفترة', totals.outstanding],
      ],
    );
    toast.success('تم تصدير تقرير الأرباح');
  }

  function exportBackup() {
    // Manual full-data snapshot. TODO (Phase 2): schedule this weekly via a Cloud
    // Function so a backup exists without anyone remembering to click.
    downloadJson(`mtozero-backup-${stamp()}`, {
      exportedAt: new Date().toISOString(),
      range: { from: range.from.toISOString(), to: range.to.toISOString() },
      products,
      sales: sales.data,
      expenses: expenses.data,
    });
    toast.success('تم تنزيل النسخة الاحتياطية');
  }

  const loading = sales.loading || expenses.loading;

  return (
    <>
      <PageHeader title="التقارير" subtitle={range.label} />

      <div className="mb-3">{picker}</div>

      {sales.error ? <ErrorBlock message={sales.error} /> : null}

      {loading ? (
        <SkeletonRows count={4} />
      ) : (
        <div className="space-y-3">
          {/* Profit waterfall — the one calculation the owner cares about. */}
          <section className="surface p-4">
            <SectionTitle>حساب الربح</SectionTitle>
            <dl className="divide-y divide-ink-200 dark:divide-ink-800">
              <Line label="إجمالي المبيعات" value={money(totals.revenue)} />
              <Line label="− تكلفة البضاعة المباعة" value={money(totals.cost)} tone="muted" />
              <Line label="= الربح الإجمالي" value={money(totals.grossProfit)} tone="good" />
              <Line label="− المصروفات" value={money(expenseTotal)} tone="bad" />
              <Line label="= صافي الربح" value={money(net)} tone={net >= 0 ? 'good' : 'bad'} big />
            </dl>

            <div className="mt-3 grid grid-cols-2 gap-3 border-t border-ink-200 pt-3 sm:grid-cols-4 dark:border-ink-800">
              <Mini label="القطع المباعة" value={num(totals.units)} />
              <Mini label="عدد العمليات" value={num(totals.transactions)} />
              <Mini label="المحصّل نقداً" value={money(totals.collected)} />
              <Mini label="ديون من الفترة" value={money(totals.outstanding)} />
            </div>

            {totals.revenue > 0 ? (
              <p className="tnum mt-3 text-[0.8rem] font-bold text-ink-500 dark:text-ink-400">
                هامش صافي الربح: {percent((net / totals.revenue) * 100, 1)} من المبيعات
              </p>
            ) : null}
          </section>

          {/* month vs month */}
          <section className="surface p-4">
            <SectionTitle>مقارنة الشهر الحالي بالماضي</SectionTitle>
            <div className="grid gap-3 sm:grid-cols-2">
              <Compare
                title="المبيعات"
                currentLabel={thisMonth.label}
                previousLabel={prevMonth.label}
                current={curRevenue}
                previous={prevRevenue}
              />
              <Compare
                title="صافي الربح"
                currentLabel={thisMonth.label}
                previousLabel={prevMonth.label}
                current={curNet}
                previous={prevNet}
              />
            </div>
          </section>

          {/* best sellers */}
          <section className="surface p-4">
            <SectionTitle>الأكثر مبيعاً في الفترة</SectionTitle>
            {best.length === 0 ? (
              <p className="py-6 text-center text-[0.85rem] font-semibold text-ink-400 dark:text-ink-500">
                لا توجد مبيعات في هذه الفترة
              </p>
            ) : (
              <div className="-mx-4 overflow-x-auto px-4">
                <table className="w-full min-w-[30rem] text-right">
                  <thead>
                    <tr className="border-b border-ink-200 text-[0.74rem] font-bold text-ink-400 dark:border-ink-800 dark:text-ink-500">
                      <th className="pb-2 font-bold">المنتج</th>
                      <th className="pb-2 font-bold">القطع</th>
                      <th className="pb-2 font-bold">المبيعات</th>
                      <th className="pb-2 font-bold">الربح</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-ink-200 dark:divide-ink-800">
                    {best.map((p) => (
                      <tr key={p.productId} className="text-[0.86rem]">
                        <td className="max-w-[12rem] truncate py-2 font-bold">{p.productName}</td>
                        <td className="tnum py-2 font-bold">{num(p.units)}</td>
                        <td className="tnum py-2 font-bold text-brand-500">{money(p.revenue)}</td>
                        <td className="tnum py-2 font-bold text-good">{money(p.profit)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {/* stale stock */}
          <section className="surface p-4">
            <SectionTitle>
              <span className="inline-flex items-center gap-2">
                <IconHourglass className="h-[1.1rem] w-[1.1rem] text-ink-400" />
                بضاعة راكدة (أكثر من 30 يوماً)
              </span>
            </SectionTitle>
            {stale.length === 0 ? (
              <p className="py-6 text-center text-[0.85rem] font-semibold text-ink-400 dark:text-ink-500">
                لا توجد بضاعة راكدة — كل المنتجات تتحرك ✓
              </p>
            ) : (
              <ul className="divide-y divide-ink-200 dark:divide-ink-800">
                {stale.map((row) => (
                  <li key={row.product.id} className="flex items-center gap-3 py-2.5">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.9rem] font-bold">{row.product.name}</p>
                      <p className="tnum text-[0.74rem] font-semibold text-ink-400 dark:text-ink-500">
                        {row.lastSold ? `آخر بيع ${formatDate(row.lastSold)}` : 'لم يُبع منه شيء بعد'} ·{' '}
                        {num(totalStock(row.product))} قطعة راكدة
                      </p>
                    </div>
                    <span className="tnum shrink-0 chip bg-warn/15 text-warn">{num(row.idleDays)} يوم</span>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* exports */}
          <section className="surface p-4">
            <SectionTitle>التصدير</SectionTitle>
            <div className="grid gap-2 sm:grid-cols-3">
              <Button variant="secondary" icon={<IconDownload className="h-4 w-4" />} onClick={exportSales}>
                تقرير المبيعات
              </Button>
              <Button variant="secondary" icon={<IconDownload className="h-4 w-4" />} onClick={exportProfit}>
                تقرير الأرباح
              </Button>
              <Button variant="secondary" icon={<IconDownload className="h-4 w-4" />} onClick={exportBackup}>
                نسخة احتياطية (JSON)
              </Button>
            </div>
            <p className="mt-2.5 text-[0.75rem] leading-relaxed text-ink-400 dark:text-ink-500">
              ملفات CSV تفتح مباشرة في Excel بترميز عربي سليم. احتفظ بنسخة احتياطية كل فترة على جهازك
              أو على Google Drive.
            </p>
          </section>
        </div>
      )}
    </>
  );
}

function Line({
  label,
  value,
  tone,
  big,
}: {
  label: string;
  value: string;
  tone?: 'good' | 'bad' | 'muted';
  big?: boolean;
}) {
  const color =
    tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : tone === 'muted' ? 'text-ink-400' : '';
  return (
    <div className="flex items-center justify-between py-2.5">
      <dt className={`text-[0.88rem] font-bold ${big ? '' : 'text-ink-500 dark:text-ink-400'}`}>{label}</dt>
      <dd className={`tnum font-display font-black ${big ? 'text-num-lg' : 'text-num'} ${color}`}>{value}</dd>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[0.72rem] font-bold text-ink-400 dark:text-ink-500">{label}</p>
      <p className="tnum mt-0.5 font-display text-[1.15rem] font-black">{value}</p>
    </div>
  );
}

function Compare({
  title,
  currentLabel,
  previousLabel,
  current,
  previous,
}: {
  title: string;
  currentLabel: string;
  previousLabel: string;
  current: number;
  previous: number;
}) {
  const delta = changePercent(current, previous);
  const up = current >= previous;

  return (
    <div className="surface-sunken px-3.5 py-3">
      <p className="text-[0.78rem] font-bold text-ink-400 dark:text-ink-500">{title}</p>
      <p className="tnum mt-1 font-display text-num-lg font-black">{money(current)}</p>
      <p className="text-[0.72rem] font-semibold text-ink-400 dark:text-ink-500">{currentLabel}</p>

      <div className="mt-2 flex items-center gap-2 border-t border-ink-200 pt-2 dark:border-ink-800">
        <span className="tnum text-[0.8rem] font-bold text-ink-500 dark:text-ink-400">{money(previous)}</span>
        <span className="text-[0.7rem] font-semibold text-ink-400 dark:text-ink-500">{previousLabel}</span>
        <span className="flex-1" />
        {delta === null ? (
          <span className="chip bg-ink-200 text-ink-500 dark:bg-ink-800 dark:text-ink-400">جديد</span>
        ) : (
          <span className={`tnum chip ${up ? 'bg-good/15 text-good' : 'bg-bad/15 text-bad'}`}>
            {up ? '▲' : '▼'} {percent(Math.abs(delta), 1)}
          </span>
        )}
      </div>
    </div>
  );
}
