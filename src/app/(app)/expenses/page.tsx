'use client';

import { useMemo, useState } from 'react';
import { useActor, useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button, IconButton } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/Confirm';
import { useDateRange } from '@/components/ui/DateRange';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { IconDownload, IconPlus, IconTrash, IconWallet } from '@/components/ui/Icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { Sheet } from '@/components/ui/Sheet';
import { downloadCsv, stamp } from '@/lib/csv';
import { errorMessage } from '@/lib/db/collections';
import { addExpense, deleteExpense, useExpensesBetween } from '@/lib/db/expenses';
import { dateKey, formatDate, money, num, parseDateKey } from '@/lib/format';
import { EXPENSE_CATEGORIES, type Expense } from '@/lib/types';

export default function ExpensesPage() {
  const { range, picker } = useDateRange('month');
  const { data: expenses, loading, error } = useExpensesBetween(range.from, range.to);
  const actor = useActor();
  const { isOwner } = useAuth();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();
  const [open, setOpen] = useState(false);

  const total = expenses.reduce((sum, e) => sum + e.amount, 0);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const e of expenses) map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  async function remove(expense: Expense) {
    await confirm({
      title: 'حذف المصروف',
      message: `سيُحذف "${expense.title}" بمبلغ ${money(expense.amount)} نهائياً من السجل، وسيتغيّر صافي الربح في التقارير.`,
      confirmLabel: 'حذف',
      danger: true,
      // The only hard delete in the system — the dialog waits for it to land.
      action: async () => {
        try {
          await deleteExpense(expense, actor);
          toast.success('تم حذف المصروف');
        } catch (err) {
          toast.error(errorMessage(err));
        }
      },
    });
  }

  return (
    <>
      <PageHeader
        title="المصروفات"
        subtitle={range.label}
        action={
          <Button icon={<IconPlus className="h-4 w-4" />} onClick={() => setOpen(true)}>
            مصروف
          </Button>
        }
      />

      <div className="mb-3">{picker}</div>

      {error ? <ErrorBlock message={error} /> : null}

      {loading ? (
        <SkeletonRows count={4} />
      ) : expenses.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={<IconWallet className="h-7 w-7" />}
            title="لا توجد مصروفات في هذه الفترة"
            hint="سجّل الإيجار والنقل والتغليف وغيرها — تُخصم تلقائياً من صافي الربح في التقارير."
            action={
              <Button size="lg" icon={<IconPlus className="h-5 w-5" />} onClick={() => setOpen(true)}>
                إضافة مصروف
              </Button>
            }
          />
        </div>
      ) : (
        <>
          <div className="surface mb-3 px-4 py-3.5">
            <div className="flex items-center justify-between">
              <span className="text-[0.82rem] font-bold text-ink-500 dark:text-ink-400">
                إجمالي المصروفات ({num(expenses.length)})
              </span>
              <span className="tnum font-display text-num-lg font-black text-bad">{money(total)}</span>
            </div>
            {byCategory.length > 1 ? (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {byCategory.map(([cat, amount]) => (
                  <span
                    key={cat}
                    className="tnum chip border border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-400"
                  >
                    {cat} · {money(amount)}
                  </span>
                ))}
              </div>
            ) : null}
            <button
              onClick={() => {
                downloadCsv(
                  `mtozero-expenses-${stamp(range.from)}_${stamp(range.to)}`,
                  ['التاريخ', 'العنوان', 'الفئة', 'المبلغ', 'أضافه'],
                  expenses.map((e) => [formatDate(e.date), e.title, e.category, e.amount, e.addedByName]),
                );
                toast.success('تم تصدير المصروفات');
              }}
              className="mt-3 inline-flex items-center gap-1.5 text-[0.8rem] font-bold text-brand-500"
            >
              <IconDownload className="h-4 w-4" />
              تصدير Excel/CSV
            </button>
          </div>

          <ul className="space-y-2">
            {expenses.map((e) => (
              <li key={e.id} className="surface flex items-center gap-3 p-3.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.95rem] font-bold">{e.title}</p>
                  <p className="tnum text-[0.75rem] font-semibold text-ink-400 dark:text-ink-500">
                    {formatDate(e.date)} · {e.category} · {e.addedByName}
                  </p>
                </div>
                <span className="tnum shrink-0 font-display text-num font-black text-bad">
                  {money(e.amount)}
                </span>
                {/* Deleting an expense changes reported profit, so it stays with the owner. */}
                {isOwner ? (
                  <IconButton label="حذف" onClick={() => void remove(e)}>
                    <IconTrash className="h-[1.05rem] w-[1.05rem]" />
                  </IconButton>
                ) : null}
              </li>
            ))}
          </ul>
        </>
      )}

      <ExpenseForm open={open} onClose={() => setOpen(false)} />
      {dialog}
    </>
  );
}

function ExpenseForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const actor = useActor();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState(0);
  const [category, setCategory] = useState<string>(EXPENSE_CATEGORIES[0]);
  const [date, setDate] = useState(dateKey(new Date()));
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    try {
      await addExpense({ title, amount, category, date: parseDateKey(date) ?? new Date() }, actor);
      toast.success('تم تسجيل المصروف');
      setTitle('');
      setAmount(0);
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر حفظ المصروف.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="مصروف جديد"
      footer={
        <Button block size="lg" loading={busy} onClick={() => void save()}>
          حفظ المصروف
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="e-title">
            العنوان *
          </label>
          <input
            id="e-title"
            className="field"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="إيجار المحل لشهر…"
          />
        </div>

        <div>
          <label className="label" htmlFor="e-amount">
            المبلغ *
          </label>
          <input
            id="e-amount"
            type="number"
            inputMode="numeric"
            min={0}
            className="field tnum h-14 text-center font-display text-num-lg font-black text-bad"
            value={amount || ''}
            onChange={(e) => setAmount(Number(e.target.value) || 0)}
            placeholder="0"
          />
        </div>

        <div>
          <label className="label">الفئة</label>
          <div className="flex flex-wrap gap-1.5">
            {EXPENSE_CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setCategory(c)}
                className={`rounded-card border px-3 py-1.5 text-[0.8rem] font-bold transition
                  ${category === c
                    ? 'border-brand-500 bg-brand-500/12 text-brand-500'
                    : 'border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-400'}`}
              >
                {c}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="label" htmlFor="e-date">
            التاريخ
          </label>
          <input
            id="e-date"
            type="date"
            className="field tnum"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>
    </Sheet>
  );
}
