'use client';

import { useMemo, useState } from 'react';
import { useActor } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { IconCheck, IconChevronDown, IconDebt, IconDownload, IconWhatsApp } from '@/components/ui/Icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { Sheet } from '@/components/ui/Sheet';
import { debtorRows, type DebtorRow } from '@/lib/analytics';
import { downloadCsv, stamp } from '@/lib/csv';
import { errorMessage } from '@/lib/db/collections';
import { recordPayment, saleDue, saleTotal, useOpenDebts } from '@/lib/db/sales';
import { formatDate, money, num, whatsappNumber } from '@/lib/format';
import { debtReminderText } from '@/lib/invoice';
import type { Sale } from '@/lib/types';

export default function DebtsPage() {
  const { data: sales, loading, error } = useOpenDebts();
  const toast = useToast();
  const [expanded, setExpanded] = useState<string | null>(null);
  const [paying, setPaying] = useState<Sale | null>(null);

  const debtors = useMemo(() => debtorRows(sales), [sales]);
  const totalDue = debtors.reduce((sum, d) => sum + d.due, 0);

  function exportCsv() {
    const headers = ['العميل', 'الهاتف', 'عدد العمليات', 'إجمالي المتبقي', 'أقدم عملية'];
    const rows = debtors.map((d) => [
      d.customerName,
      d.customerPhone ?? '',
      d.sales.length,
      d.due,
      formatDate(d.sales[d.sales.length - 1]?.createdAt),
    ]);
    downloadCsv(`mtozero-debts-${stamp()}`, headers, rows);
    toast.success('تم تصدير قائمة الديون');
  }

  return (
    <>
      <PageHeader
        title="الديون المفتوحة"
        subtitle={loading ? undefined : `${num(debtors.length)} عميل · إجمالي ${money(totalDue)}`}
        action={
          debtors.length > 0 ? (
            <Button variant="secondary" icon={<IconDownload className="h-4 w-4" />} onClick={exportCsv}>
              تصدير
            </Button>
          ) : null
        }
      />

      {error ? <ErrorBlock message={error} /> : null}

      {loading ? (
        <SkeletonRows count={3} />
      ) : debtors.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={<IconCheck className="h-7 w-7" />}
            title="لا توجد ديون مفتوحة"
            hint="كل المبيعات مسدّدة بالكامل. أي بيع بدين أو دفع جزئي سيظهر هنا تلقائياً."
          />
        </div>
      ) : (
        <>
          <div className="surface mb-3 flex items-center justify-between px-4 py-3.5">
            <span className="text-[0.82rem] font-bold text-ink-500 dark:text-ink-400">إجمالي المستحق لك</span>
            <span className="tnum font-display text-num-lg font-black text-warn">{money(totalDue)}</span>
          </div>

          <ul className="space-y-2">
            {debtors.map((debtor) => (
              <DebtorCard
                key={`${debtor.customerName}-${debtor.customerPhone ?? ''}`}
                debtor={debtor}
                open={expanded === `${debtor.customerName}-${debtor.customerPhone ?? ''}`}
                onToggle={() =>
                  setExpanded((cur) =>
                    cur === `${debtor.customerName}-${debtor.customerPhone ?? ''}`
                      ? null
                      : `${debtor.customerName}-${debtor.customerPhone ?? ''}`,
                  )
                }
                onPay={setPaying}
              />
            ))}
          </ul>
        </>
      )}

      <PaymentSheet sale={paying} onClose={() => setPaying(null)} />
    </>
  );
}

function DebtorCard({
  debtor,
  open,
  onToggle,
  onPay,
}: {
  debtor: DebtorRow;
  open: boolean;
  onToggle: () => void;
  onPay: (s: Sale) => void;
}) {
  const wa = whatsappNumber(debtor.customerPhone);

  return (
    <li className="surface overflow-hidden">
      <button onClick={onToggle} className="flex w-full items-center gap-3 p-3.5 text-right">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-warn/15 font-display text-base font-black text-warn">
          {debtor.customerName.trim().charAt(0)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[0.98rem] font-bold">{debtor.customerName}</span>
          <span className="tnum block text-[0.76rem] font-semibold text-ink-400 dark:text-ink-500">
            {debtor.customerPhone ? `${debtor.customerPhone} · ` : ''}
            {num(debtor.sales.length)} عملية
          </span>
        </span>
        <span className="tnum shrink-0 font-display text-num font-black text-warn">{money(debtor.due)}</span>
        <IconChevronDown
          className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open ? (
        <div className="border-t border-ink-200 dark:border-ink-800">
          <ul className="divide-y divide-ink-200 dark:divide-ink-800">
            {debtor.sales.map((s) => (
              <li key={s.id} className="flex items-center gap-3 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.88rem] font-bold">
                    {s.productName} — مقاس {s.size}
                  </p>
                  <p className="tnum text-[0.74rem] font-semibold text-ink-400 dark:text-ink-500">
                    {formatDate(s.createdAt)} · الإجمالي {money(saleTotal(s))} · دفع {money(s.amountPaid)}
                  </p>
                </div>
                <span className="tnum shrink-0 text-[0.88rem] font-black text-warn">{money(saleDue(s))}</span>
                <Button size="sm" onClick={() => onPay(s)}>
                  تسديد
                </Button>
              </li>
            ))}
          </ul>

          {wa ? (
            <a
              href={`https://wa.me/${wa}?text=${encodeURIComponent(debtReminderText(debtor.customerName, debtor.due))}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center gap-2 border-t border-ink-200 py-2.5 text-[0.82rem] font-bold text-good dark:border-ink-800"
            >
              <IconWhatsApp className="h-4 w-4" />
              تذكير عبر واتساب
            </a>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function PaymentSheet({ sale, onClose }: { sale: Sale | null; onClose: () => void }) {
  const actor = useActor();
  const toast = useToast();
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const due = sale ? saleDue(sale) : 0;

  // Reset the field whenever a different sale is opened.
  const key = sale?.id ?? '';
  const [lastKey, setLastKey] = useState('');
  if (key !== lastKey) {
    setLastKey(key);
    setAmount(due);
  }

  if (!sale) return null;

  async function submit() {
    if (!sale) return;
    setBusy(true);
    try {
      await recordPayment(sale.id, amount, actor);
      toast.success('تم تسجيل التسديد');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر تسجيل التسديد.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="تسجيل تسديد"
      subtitle={`${sale.customerName ?? 'عميل'} — ${sale.productName}`}
      footer={
        <Button block size="lg" loading={busy} disabled={amount <= 0 || amount > due} onClick={() => void submit()}>
          تسجيل {money(amount)}
        </Button>
      }
    >
      <div className="space-y-4">
        <div className="surface-sunken flex items-center justify-between px-3.5 py-3">
          <span className="text-[0.82rem] font-bold text-ink-500 dark:text-ink-400">المبلغ المتبقي</span>
          <span className="tnum font-display text-num font-black text-warn">{money(due)}</span>
        </div>

        <div>
          <label className="label" htmlFor="pay-amount">
            المبلغ المستلم الآن
          </label>
          <input
            id="pay-amount"
            type="number"
            inputMode="numeric"
            min={0}
            max={due}
            value={amount || ''}
            onChange={(e) => setAmount(Math.min(due, Math.max(0, Number(e.target.value) || 0)))}
            className="field tnum h-14 text-center font-display text-num-lg font-black"
          />
        </div>

        <div className="grid grid-cols-3 gap-2">
          {[0.25, 0.5, 1].map((f) => (
            <button
              key={f}
              onClick={() => setAmount(Math.round(due * f))}
              className="rounded-card border border-ink-200 py-2 text-[0.8rem] font-bold text-ink-500 transition hover:border-brand-500 hover:text-brand-500 dark:border-ink-700 dark:text-ink-400"
            >
              {f === 1 ? 'المبلغ كامل' : `${f * 100}%`}
            </button>
          ))}
        </div>
      </div>
    </Sheet>
  );
}
