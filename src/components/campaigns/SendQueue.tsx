'use client';

import { useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { IconCheck, IconChevronLeft, IconWhatsApp } from '@/components/ui/Icons';
import { markSent } from '@/lib/db/campaigns';
import { personalise, sendLink } from '@/lib/campaign';
import { money, num } from '@/lib/format';
import type { Customer, ShopSettings } from '@/lib/types';

interface Props {
  campaignId: string;
  recipients: Customer[];
  message: string;
  settings: ShopSettings;
  /** Ids already sent, so a resumed campaign starts where it stopped. */
  sentIds: string[];
  onDone: () => void;
}

/**
 * Walks the owner through the list one chat at a time.
 *
 * Not automatic — WhatsApp forbids that, and tools that fake it get numbers
 * banned. What it removes is the actual work: finding each customer, retyping
 * the message, and remembering who is already done. Forty customers becomes
 * forty taps instead of twenty minutes.
 */
export function SendQueue({ campaignId, recipients, message, settings, sentIds, onDone }: Props) {
  const toast = useToast();
  const [sent, setSent] = useState<Set<string>>(new Set(sentIds));

  const pending = recipients.filter((c) => !sent.has(c.id));
  const current = pending[0] ?? null;
  const done = recipients.length - pending.length;
  const progress = recipients.length === 0 ? 0 : (done / recipients.length) * 100;

  async function openAndAdvance(customer: Customer) {
    const body = personalise(message, customer, settings);
    const link = sendLink(customer, body);
    if (!link) {
      toast.error('رقم هذا العميل غير صالح.');
      return;
    }

    // Opened before the await so the click is still trusted — browsers block a
    // window opened after an async gap.
    window.open(link, '_blank', 'noopener');

    setSent((prev) => new Set(prev).add(customer.id));
    try {
      await markSent(campaignId, customer.id);
    } catch {
      // Progress is kept locally regardless; the log is a convenience, not the
      // source of truth for a message the owner can see they sent.
    }
  }

  if (!current) {
    return (
      <div className="surface p-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-good/15 text-good">
          <IconCheck className="h-7 w-7" />
        </div>
        <h3 className="text-lg">انتهت الحملة</h3>
        <p className="mt-1.5 text-[0.88rem] text-ink-500 dark:text-ink-400">
          أُرسلت لـ {num(done)} عميل. محفوظة في سجل الحملات.
        </p>
        <Button className="mt-5" onClick={onDone}>
          إغلاق
        </Button>
      </div>
    );
  }

  return (
    <div className="surface-key overflow-hidden">
      <div className="border-b border-ink-200 px-4 py-3 dark:border-ink-800">
        <div className="flex items-center justify-between text-[0.82rem] font-bold">
          <span>التقدّم</span>
          <span className="tnum text-ink-500 dark:text-ink-400">
            {num(done)} من {num(recipients.length)}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
          <div
            className="h-full rounded-full bg-good transition-all"
            style={{ width: `${progress}%` }}
            role="progressbar"
            aria-valuenow={done}
            aria-valuemin={0}
            aria-valuemax={recipients.length}
          />
        </div>
      </div>

      <div className="p-4">
        <p className="text-[0.78rem] font-bold text-ink-400 dark:text-ink-500">العميل التالي</p>
        <h3 className="mt-1 text-xl">{current.name}</h3>
        <p dir="ltr" className="tnum mt-0.5 text-right text-[0.85rem] font-bold text-ink-500 dark:text-ink-400">
          {current.phone}
        </p>
        <p className="tnum mt-1 text-[0.78rem] font-semibold text-ink-400 dark:text-ink-500">
          {num(current.totalOrders)} عملية · أنفق {money(current.totalSpent)}
        </p>

        <div className="surface-sunken mt-3 max-h-40 overflow-y-auto p-3">
          <pre className="whitespace-pre-wrap break-words font-sans text-[0.84rem] leading-relaxed text-ink-700 dark:text-ink-200">
            {personalise(message, current, settings)}
          </pre>
        </div>

        <div className="mt-4 flex gap-2">
          <Button
            block
            size="lg"
            className="bg-good text-ink-950 hover:brightness-110"
            icon={<IconWhatsApp className="h-5 w-5" />}
            onClick={() => void openAndAdvance(current)}
          >
            افتح واتساب وأرسل
          </Button>
          <Button
            variant="secondary"
            size="lg"
            aria-label="تخطي هذا العميل"
            title="تخطي"
            onClick={() => setSent((prev) => new Set(prev).add(current.id))}
          >
            <IconChevronLeft className="h-5 w-5" />
          </Button>
        </div>

        <p className="mt-2.5 text-center text-[0.75rem] leading-relaxed text-ink-400 dark:text-ink-500">
          يفتح محادثة العميل والرسالة جاهزة بداخلها — تضغط إرسال في واتساب، ثم ترجع هنا للتالي.
        </p>
      </div>
    </div>
  );
}
