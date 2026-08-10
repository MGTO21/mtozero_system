'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Feedback';
import { IconCopy, IconDownload, IconWhatsApp } from '@/components/ui/Icons';
import { PageHeader, SectionTitle } from '@/components/ui/PageHeader';
import { summarize, sumExpenses } from '@/lib/analytics';
import { useExpensesBetween } from '@/lib/db/expenses';
import { netQty, saleDue, saleTotal, usePaymentsBetween, useSalesBetween } from '@/lib/db/sales';
import {
  addDays,
  dateKey,
  endOfDay,
  formatDate,
  money,
  num,
  parseDateKey,
  startOfDay,
} from '@/lib/format';
import { copyText } from '@/lib/invoice';
import { CHANNEL_LABEL, type Channel } from '@/lib/types';

/**
 * End-of-day close.
 *
 * The dashboard answers "how are we doing"; this answers a different and more
 * concrete question the owner asks every single evening: how much cash should be
 * in the drawer right now, and what did we give away on credit. Sales revenue
 * alone cannot answer it — money collected today includes repayments of older
 * debts, and excludes today's sales that went out unpaid.
 */
export default function DailyClosePage() {
  const { canSeeProfit } = useAuth();
  const toast = useToast();
  const [day, setDay] = useState(dateKey(new Date()));

  const { from, to } = useMemo(() => {
    const d = parseDateKey(day) ?? new Date();
    return { from: startOfDay(d), to: endOfDay(d) };
  }, [day]);

  const sales = useSalesBetween(from, to);
  const payments = usePaymentsBetween(from, to);
  const expenses = useExpensesBetween(from, to);

  const totals = useMemo(() => summarize(sales.data), [sales.data]);
  const repaid = payments.data.reduce((sum, p) => sum + p.amount, 0);
  const expenseTotal = sumExpenses(expenses.data);

  // Cash that physically changed hands today, whenever the goods were sold.
  const cashFromSales = sales.data.reduce((sum, s) => sum + Math.min(s.amountPaid, saleTotal(s)), 0);
  const cashIn = cashFromSales + repaid;
  const newDebt = sales.data.reduce((sum, s) => sum + saleDue(s), 0);
  const drawer = cashIn - expenseTotal;

  const byChannel = useMemo(() => {
    const map = new Map<Channel, { count: number; revenue: number }>();
    for (const s of sales.data) {
      if (netQty(s) <= 0) continue;
      const entry = map.get(s.channel) ?? { count: 0, revenue: 0 };
      entry.count += 1;
      entry.revenue += saleTotal(s);
      map.set(s.channel, entry);
    }
    return [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  }, [sales.data]);

  const bySeller = useMemo(() => {
    const map = new Map<string, { count: number; revenue: number }>();
    for (const s of sales.data) {
      if (netQty(s) <= 0) continue;
      const entry = map.get(s.soldByName) ?? { count: 0, revenue: 0 };
      entry.count += 1;
      entry.revenue += saleTotal(s);
      map.set(s.soldByName, entry);
    }
    return [...map.entries()].sort((a, b) => b[1].revenue - a[1].revenue);
  }, [sales.data]);

  const isToday = day === dateKey(new Date());
  const loading = sales.loading || payments.loading || expenses.loading;

  /** Plain-text summary, sized to paste into WhatsApp without wrapping badly. */
  function summaryText(): string {
    const lines = [
      `📋 تقفيل ${formatDate(from)}`,
      '',
      `المبيعات: ${money(totals.revenue)} (${num(totals.transactions)} عملية · ${num(totals.units)} قطعة)`,
      `النقد المستلم: ${money(cashIn)}`,
      `  • من مبيعات اليوم: ${money(cashFromSales)}`,
      `  • تسديد ديون سابقة: ${money(repaid)}`,
      `ديون جديدة: ${money(newDebt)}`,
      `المصروفات: ${money(expenseTotal)}`,
      '',
      `صافي الصندوق: ${money(drawer)}`,
    ];
    if (canSeeProfit) lines.push(`الربح الإجمالي: ${money(totals.grossProfit)}`);
    return lines.join('\n');
  }

  return (
    <>
      <PageHeader
        title="تقفيل اليوم"
        subtitle={isToday ? 'اليوم' : formatDate(from)}
        action={
          <input
            type="date"
            value={day}
            max={dateKey(new Date())}
            onChange={(e) => setDay(e.target.value)}
            className="field tnum w-auto"
            aria-label="اختر اليوم"
          />
        }
      />

      <div className="mb-3 flex gap-1.5">
        <button
          onClick={() => setDay(dateKey(new Date()))}
          className={`rounded-card border px-3 py-1.5 text-[0.8rem] font-bold transition
            ${isToday ? 'border-brand-500 bg-brand-500 text-white' : 'border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-400'}`}
        >
          اليوم
        </button>
        <button
          onClick={() => setDay(dateKey(addDays(new Date(), -1)))}
          className={`rounded-card border px-3 py-1.5 text-[0.8rem] font-bold transition
            ${day === dateKey(addDays(new Date(), -1))
              ? 'border-brand-500 bg-brand-500 text-white'
              : 'border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-400'}`}
        >
          أمس
        </button>
      </div>

      {loading ? (
        <LoadingBlock label="جاري حساب اليوم…" />
      ) : (
        <div className="space-y-3">
          {/* The drawer figure is what gets counted against physical cash. */}
          <section className="surface overflow-hidden">
            <div className="border-b border-ink-200 px-4 py-4 dark:border-ink-800">
              <p className="text-[0.8rem] font-bold text-ink-400 dark:text-ink-500">
                المفروض في الصندوق آخر اليوم
              </p>
              <p
                className={`tnum mt-1 font-display text-num-xl font-black ${
                  drawer >= 0 ? 'text-brand-500' : 'text-bad'
                }`}
              >
                {money(drawer)}
              </p>
              <p className="mt-1 text-[0.78rem] font-semibold text-ink-500 dark:text-ink-400">
                النقد المستلم ناقص المصروفات — قارنه بما في يدك فعلاً
              </p>
            </div>

            <dl className="divide-y divide-ink-200 dark:divide-ink-800">
              <Row label="مبيعات اليوم" value={money(totals.revenue)} hint={`${num(totals.transactions)} عملية · ${num(totals.units)} قطعة`} />
              <Row label="+ نقد من مبيعات اليوم" value={money(cashFromSales)} tone="good" />
              <Row label="+ تسديد ديون سابقة" value={money(repaid)} tone="good" hint={payments.data.length ? `${num(payments.data.length)} تسديد` : 'لا يوجد'} />
              <Row label="− مصروفات" value={money(expenseTotal)} tone="bad" hint={expenses.data.length ? `${num(expenses.data.length)} مصروف` : 'لا يوجد'} />
              <Row label="= صافي الصندوق" value={money(drawer)} big />
            </dl>
          </section>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="surface px-4 py-3.5">
              <p className="text-[0.78rem] font-bold text-ink-400 dark:text-ink-500">ديون جديدة اليوم</p>
              <p className={`tnum mt-1 font-display text-num-lg font-black ${newDebt > 0 ? 'text-warn' : ''}`}>
                {money(newDebt)}
              </p>
              <p className="mt-1 text-[0.72rem] font-semibold text-ink-400 dark:text-ink-500">
                بضاعة خرجت ولم يُدفع ثمنها بعد
              </p>
            </div>

            {canSeeProfit ? (
              <div className="surface px-4 py-3.5">
                <p className="text-[0.78rem] font-bold text-ink-400 dark:text-ink-500">ربح اليوم الإجمالي</p>
                <p className="tnum mt-1 font-display text-num-lg font-black text-good">
                  {money(totals.grossProfit)}
                </p>
                <p className="mt-1 text-[0.72rem] font-semibold text-ink-400 dark:text-ink-500">
                  قبل خصم المصروفات — صافي اليوم {money(totals.grossProfit - expenseTotal)}
                </p>
              </div>
            ) : null}
          </div>

          {byChannel.length > 0 ? (
            <section className="surface p-4">
              <SectionTitle>من أين جاءت المبيعات</SectionTitle>
              <ul className="space-y-2">
                {byChannel.map(([channel, stat]) => {
                  const share = totals.revenue > 0 ? (stat.revenue / totals.revenue) * 100 : 0;
                  return (
                    <li key={channel}>
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[0.86rem] font-bold">{CHANNEL_LABEL[channel]}</span>
                        <span className="tnum text-[0.82rem] font-bold text-ink-500 dark:text-ink-400">
                          {num(stat.count)} عملية
                        </span>
                        <span className="tnum text-[0.9rem] font-black text-brand-500">
                          {money(stat.revenue)}
                        </span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${share}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}

          {bySeller.length > 1 ? (
            <section className="surface p-4">
              <SectionTitle>من باع اليوم</SectionTitle>
              <ul className="divide-y divide-ink-200 dark:divide-ink-800">
                {bySeller.map(([name, stat]) => (
                  <li key={name} className="flex items-center justify-between py-2">
                    <span className="text-[0.88rem] font-bold">{name}</span>
                    <span className="tnum text-[0.8rem] font-semibold text-ink-500 dark:text-ink-400">
                      {num(stat.count)} عملية
                    </span>
                    <span className="tnum text-[0.88rem] font-black text-brand-500">{money(stat.revenue)}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}

          <section className="surface p-4">
            <SectionTitle>تسليم الوردية</SectionTitle>
            <pre className="max-h-52 overflow-y-auto whitespace-pre-wrap break-words rounded-card bg-ink-100/70 p-3 font-sans text-[0.82rem] leading-relaxed text-ink-700 dark:bg-ink-900 dark:text-ink-200">
              {summaryText()}
            </pre>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button
                variant="secondary"
                icon={<IconCopy className="h-4 w-4" />}
                onClick={async () => {
                  const ok = await copyText(summaryText());
                  toast[ok ? 'success' : 'error'](ok ? 'تم نسخ الملخص' : 'تعذّر النسخ');
                }}
              >
                نسخ الملخص
              </Button>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(summaryText())}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-card bg-good font-bold text-ink-950 transition hover:brightness-110"
              >
                <IconWhatsApp className="h-4 w-4" />
                إرسال واتساب
              </a>
            </div>
          </section>
        </div>
      )}
    </>
  );
}

function Row({
  label,
  value,
  hint,
  tone,
  big,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: 'good' | 'bad';
  big?: boolean;
}) {
  const color = tone === 'good' ? 'text-good' : tone === 'bad' ? 'text-bad' : '';
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5">
      <div className="min-w-0">
        <dt className={`text-[0.88rem] font-bold ${big ? '' : 'text-ink-500 dark:text-ink-400'}`}>{label}</dt>
        {hint ? <p className="text-[0.72rem] font-semibold text-ink-400 dark:text-ink-500">{hint}</p> : null}
      </div>
      <dd className={`tnum shrink-0 font-display font-black ${big ? 'text-num-lg' : 'text-num'} ${color}`}>
        {value}
      </dd>
    </div>
  );
}
