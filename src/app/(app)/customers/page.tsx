'use client';

import { useMemo, useState } from 'react';
import { useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorBlock, PermissionNotice, SkeletonRows } from '@/components/ui/Feedback';
import {
  IconCopy,
  IconDownload,
  IconSearch,
  IconShare,
  IconUserCircle,
  IconWhatsApp,
} from '@/components/ui/Icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { Sheet } from '@/components/ui/Sheet';
import { downloadCsv, stamp } from '@/lib/csv';
import { useCustomers, useReferrals } from '@/lib/db/customers';
import { useSettings } from '@/lib/db/settings';
import { formatDate, money, num, whatsappNumber } from '@/lib/format';
import { copyText } from '@/lib/invoice';
import type { Customer } from '@/lib/types';

type Sort = 'recent' | 'spent' | 'credit';

export default function CustomersPage() {
  const { data: customers, loading, error, denied } = useCustomers();
  const referrals = useReferrals();
  const { settings } = useSettings();
  const { isOwner } = useAuth();
  const toast = useToast();

  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<Sort>('recent');
  const [broadcast, setBroadcast] = useState(false);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? customers.filter((c) => `${c.name} ${c.phone} ${c.referralCode}`.toLowerCase().includes(q))
      : customers;
    return [...filtered].sort((a, b) => {
      if (sort === 'spent') return b.totalSpent - a.totalSpent;
      if (sort === 'credit') return b.creditBalance - a.creditBalance;
      return (b.lastPurchaseAt?.toMillis() ?? 0) - (a.lastPurchaseAt?.toMillis() ?? 0);
    });
  }, [customers, search, sort]);

  const totalCredit = customers.reduce((sum, c) => sum + c.creditBalance, 0);

  function exportCsv() {
    downloadCsv(
      `mtozero-customers-${stamp()}`,
      ['الاسم', 'الهاتف', 'عدد العمليات', 'إجمالي الشراء', 'رصيد الإحالة', 'كود الإحالة', 'أحاله', 'آخر شراء'],
      visible.map((c) => [
        c.name,
        c.phone,
        c.totalOrders,
        c.totalSpent,
        c.creditBalance,
        c.referralCode,
        c.referredByName ?? '',
        formatDate(c.lastPurchaseAt),
      ]),
    );
    toast.success('تم تصدير قائمة العملاء');
  }

  return (
    <>
      <PageHeader
        title="العملاء"
        subtitle={loading ? undefined : `${num(customers.length)} عميل · رصيد إحالات ${money(totalCredit)}`}
        action={
          customers.length > 0 ? (
            <div className="flex gap-2">
              <Button variant="secondary" icon={<IconWhatsApp className="h-4 w-4" />} onClick={() => setBroadcast(true)}>
                عرض جديد
              </Button>
              <Button variant="secondary" icon={<IconDownload className="h-4 w-4" />} onClick={exportCsv}>
                تصدير
              </Button>
            </div>
          ) : null
        }
      />

      <div className="mb-3 space-y-2.5">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute right-3 top-1/2 h-[1.1rem] w-[1.1rem] -translate-y-1/2 text-ink-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="field pr-10"
            placeholder="ابحث بالاسم أو الرقم أو كود الإحالة…"
            type="search"
          />
        </div>
        <div className="flex gap-1.5">
          {(
            [
              ['recent', 'الأحدث شراءً'],
              ['spent', 'الأكثر إنفاقاً'],
              ['credit', 'أصحاب رصيد'],
            ] as [Sort, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSort(key)}
              className={`rounded-card border px-3 py-1.5 text-[0.8rem] font-bold transition
                ${sort === key
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-400'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {denied ? (
        <PermissionNotice collection="customers" isOwner={isOwner} />
      ) : error ? (
        <ErrorBlock message={error} />
      ) : loading ? (
        <SkeletonRows count={4} />
      ) : customers.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={<IconUserCircle className="h-7 w-7" />}
            title="لا يوجد عملاء بعد"
            hint="أدخل رقم هاتف العميل عند تسجيل البيع، وسيُحفظ هنا تلقائياً — بدون أي خطوة إضافية."
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="surface">
          <EmptyState title="لا توجد نتائج" hint="جرّب اسماً أو رقماً آخر." />
        </div>
      ) : (
        <ul className="space-y-2">
          {visible.map((c) => (
            <CustomerRow key={c.id} customer={c} reward={settings.referralReward} />
          ))}
        </ul>
      )}

      {referrals.data.length > 0 ? (
        <section className="surface mt-4 p-4">
          <h2 className="mb-2.5 flex items-center gap-2 text-[1.05rem]">
            <IconShare className="h-[1.1rem] w-[1.1rem] text-ink-400" />
            آخر الإحالات
          </h2>
          <ul className="divide-y divide-ink-200 dark:divide-ink-800">
            {referrals.data.slice(0, 8).map((r) => (
              <li key={r.id} className="flex items-center gap-3 py-2.5">
                <span className="min-w-0 flex-1 text-[0.86rem] font-semibold">
                  <span className="font-bold">{r.referrerName}</span> جلب{' '}
                  <span className="font-bold">{r.referredName}</span>
                </span>
                <span className="tnum shrink-0 text-[0.8rem] font-black text-good">+{money(r.reward)}</span>
                <span className="tnum shrink-0 text-[0.72rem] font-semibold text-ink-400 dark:text-ink-500">
                  {formatDate(r.createdAt)}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <BroadcastSheet open={broadcast} onClose={() => setBroadcast(false)} customers={visible} />
    </>
  );
}

function CustomerRow({ customer, reward }: { customer: Customer; reward: number }) {
  const toast = useToast();
  const wa = whatsappNumber(customer.phone);
  const inviteText = `السلام عليكم 🌸\nاستخدم كودي ${customer.referralCode} عند الشراء من MTOZERO وتحصل أنت وأنا على مكافأة.\nكل إحالة ناجحة = ${money(reward)} رصيد خصم.`;

  return (
    <li className="surface p-3.5">
      <div className="flex items-center gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-accent-500/15 font-display text-base font-black text-accent-500">
          {customer.name.trim().charAt(0)}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[0.98rem] font-bold">{customer.name}</p>
          <p dir="ltr" className="tnum truncate text-right text-[0.76rem] font-semibold text-ink-400 dark:text-ink-500">
            {customer.phone}
          </p>
        </div>
        <div className="shrink-0 text-left">
          <p className="tnum font-display text-num font-black text-brand-500">{money(customer.totalSpent)}</p>
          <p className="tnum text-[0.72rem] font-bold text-ink-400 dark:text-ink-500">
            {num(customer.totalOrders)} عملية
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-ink-200 pt-2.5 dark:border-ink-800">
        <span className="tnum chip bg-accent-500/15 text-accent-500">كود {customer.referralCode}</span>
        {customer.creditBalance > 0 ? (
          <span className="tnum chip bg-good/15 text-good">رصيد {money(customer.creditBalance)}</span>
        ) : null}
        {customer.referralCount > 0 ? (
          <span className="tnum chip bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300">
            أحال {num(customer.referralCount)}
          </span>
        ) : null}
        {customer.referredByName ? (
          <span className="chip bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300">
            جاء عبر {customer.referredByName}
          </span>
        ) : null}

        <span className="flex-1" />

        <button
          onClick={async () => {
            const ok = await copyText(inviteText);
            toast[ok ? 'success' : 'error'](ok ? 'تم نسخ رسالة الإحالة' : 'تعذّر النسخ');
          }}
          className="inline-flex items-center gap-1.5 rounded-card px-2.5 py-1.5 text-[0.76rem] font-bold text-ink-500 transition hover:bg-ink-100 dark:text-ink-400 dark:hover:bg-ink-800"
        >
          <IconCopy className="h-4 w-4" />
          رسالة الإحالة
        </button>
        {wa ? (
          <a
            href={`https://wa.me/${wa}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-card px-2.5 py-1.5 text-[0.76rem] font-bold text-good transition hover:bg-good/10"
          >
            <IconWhatsApp className="h-4 w-4" />
            محادثة
          </a>
        ) : null}
      </div>
    </li>
  );
}

/**
 * WhatsApp has no bulk-send API for personal accounts, so this composes the message
 * once and opens each chat in turn — honest about the manual step instead of
 * pretending to blast messages.
 */
function BroadcastSheet({
  open,
  onClose,
  customers,
}: {
  open: boolean;
  onClose: () => void;
  customers: Customer[];
}) {
  const toast = useToast();
  const [message, setMessage] = useState(
    'وصلنا جديد في MTOZERO 🔥\nمقاسات كاملة وأسعار مميزة.\nتواصل معنا للحجز قبل النفاد.',
  );

  const reachable = customers.filter((c) => whatsappNumber(c.phone));

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="إرسال عرض عبر واتساب"
      subtitle={`${num(reachable.length)} عميل لديه رقم صالح`}
      footer={
        <Button
          block
          size="lg"
          icon={<IconCopy className="h-4 w-4" />}
          onClick={async () => {
            const ok = await copyText(message);
            toast[ok ? 'success' : 'error'](ok ? 'تم نسخ الرسالة' : 'تعذّر النسخ');
          }}
        >
          نسخ الرسالة
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="bc-msg">
            نص العرض
          </label>
          <textarea
            id="bc-msg"
            rows={5}
            className="field resize-none leading-relaxed"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
        </div>

        <p className="rounded-card border border-warn/40 bg-warn/8 px-3 py-2.5 text-[0.78rem] leading-relaxed text-warn">
          واتساب لا يسمح بالإرسال الجماعي من الحسابات العادية. انسخ الرسالة، ثم افتح محادثة كل عميل
          من القائمة أدناه والصقها. الإرسال لأعداد كبيرة دفعة واحدة قد يعرّض رقمك للحظر.
        </p>

        <ul className="max-h-64 space-y-1 overflow-y-auto">
          {reachable.map((c) => (
            <li key={c.id}>
              <a
                href={`https://wa.me/${whatsappNumber(c.phone)}?text=${encodeURIComponent(message)}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 rounded-card px-2.5 py-2 transition hover:bg-ink-100 dark:hover:bg-ink-800"
              >
                <IconWhatsApp className="h-4 w-4 shrink-0 text-good" />
                <span className="min-w-0 flex-1 truncate text-[0.85rem] font-bold">{c.name}</span>
                <span dir="ltr" className="tnum shrink-0 text-[0.74rem] font-semibold text-ink-400">
                  {c.phone}
                </span>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </Sheet>
  );
}
