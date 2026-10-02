'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useActor, useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { useQueueSummary } from '@/components/layout/SyncStatus';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/Confirm';
import { EmptyState, Stamp } from '@/components/ui/Feedback';
import { IconAlert, IconCheck, IconQueue, IconSync } from '@/components/ui/Icons';
import { PageHeader, SectionTitle } from '@/components/ui/PageHeader';
import { formatDateTime, money } from '@/lib/format';
import { useOnlineStatus } from '@/lib/hooks/useFirestore';
import type { OutboxEntry } from '@/lib/offline/outbox';
import { describe, discardEntry, retryEntry, syncOutbox } from '@/lib/offline/operations';

/**
 * Everything this phone recorded without a connection.
 *
 * Most of it needs nothing from anyone — it goes on its own when the signal
 * returns. The page exists for the rare refusal: two phones sold the same last
 * pair offline, and only one sale can take it. That decision belongs to a
 * person, so it waits here instead of being guessed.
 */
export default function SyncPage() {
  const { profile } = useAuth();
  const actor = useActor();
  const toast = useToast();
  const online = useOnlineStatus();
  const queue = useQueueSummary(profile?.uid);
  const { confirm, dialog } = useConfirm();
  const [sending, setSending] = useState(false);

  async function sendNow() {
    if (!profile) return;
    setSending(true);
    try {
      await syncOutbox(profile.uid);
    } finally {
      setSending(false);
    }
  }

  async function discard(entry: OutboxEntry) {
    await confirm({
      title: 'إلغاء العملية نهائياً',
      message: `${describe(entry)}. الإلغاء يعني إنها ما تتسجّل أبداً في النظام. لو البضاعة طلعت فعلاً أو القروش اتسلّمت، الأحسن تصحّح السبب (مثلاً أضف الكمية الناقصة من المخزون) وبعدين «أعد المحاولة».`,
      confirmLabel: 'إلغاء العملية',
      danger: true,
      action: async () => {
        await discardEntry(entry, actor);
        toast.info('أُلغيت العملية وسُجّل ذلك في سجل النشاط');
      },
    });
  }

  const total = queue.pending.length + queue.conflicts.length + queue.others.length;

  return (
    <>
      <PageHeader
        title="عمليات بدون شبكة"
        subtitle={online ? 'متصل — العمليات تُرسل تلقائياً' : 'بدون شبكة — كل شيء محفوظ على هذا الجهاز'}
        action={
          queue.pending.length > 0 ? (
            <Button
              variant="ink"
              size="sm"
              loading={sending}
              disabled={!online}
              icon={<IconSync className="h-4 w-4" />}
              onClick={() => void sendNow()}
            >
              أرسل الآن
            </Button>
          ) : undefined
        }
      />

      {total === 0 ? (
        <div className="surface">
          <EmptyState
            icon={<IconCheck />}
            title="كل شيء مُرسل"
            hint="لا توجد عمليات معلّقة على هذا الجهاز. لو انقطعت الشبكة، استمر في البيع عادي — الفواتير تتحفظ هنا وتترسل براها."
            action={
              <Link href="/sell">
                <Button>تسجيل بيع</Button>
              </Link>
            }
          />
        </div>
      ) : null}

      {queue.conflicts.length > 0 ? (
        <section className="mb-6">
          <SectionTitle>تحتاج قرارك</SectionTitle>
          <ul className="space-y-2">
            {queue.conflicts.map((entry) => (
              <li key={entry.id} className="surface border-bad/60 p-3.5">
                <div className="flex items-start gap-3">
                  <IconAlert className="mt-0.5 h-5 w-5 shrink-0 text-bad" />
                  <div className="min-w-0 flex-1">
                    <p className="font-bold">{describe(entry)}</p>
                    <p className="tnum mt-0.5 text-[0.8rem] font-semibold text-fg-3">
                      {formatDateTime(new Date(entry.at))} · {entry.actor.name}
                    </p>
                    <p className="mt-2 rounded-card bg-bad/10 px-2.5 py-1.5 text-[0.84rem] font-bold text-bad">
                      {entry.error}
                    </p>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <Button
                    variant="ink"
                    size="sm"
                    disabled={!online}
                    onClick={() => profile && void retryEntry(entry.id, profile.uid)}
                  >
                    أعد المحاولة
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => void discard(entry)}>
                    إلغاء العملية
                  </Button>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.8rem] leading-relaxed text-fg-3">
            أشهر سبب: جهازين باعوا آخر قطعة من نفس المقاس وهم بدون شبكة. صحّح الكمية من المخزون أو استلم
            البضاعة، وبعدها «أعد المحاولة».
          </p>
        </section>
      ) : null}

      {queue.pending.length > 0 ? (
        <section className="mb-6">
          <SectionTitle>في الانتظار</SectionTitle>
          <EntryList entries={queue.pending} />
        </section>
      ) : null}

      {queue.others.length > 0 ? (
        <section className="mb-6">
          <SectionTitle>لمستخدمين آخرين على هذا الجهاز</SectionTitle>
          <EntryList entries={queue.others} />
          <p className="mt-2 text-[0.8rem] leading-relaxed text-fg-3">
            تُرسل عندما يدخل صاحبها بحسابه على هذا الجهاز — النظام يقبل العملية باسم من سجّلها فقط.
          </p>
        </section>
      ) : null}

      <section className="surface-sunken mt-2 p-4 text-[0.86rem] leading-relaxed text-fg-2">
        <p className="mb-1.5 font-extrabold text-fg">كيف يعمل النظام بدون شبكة</p>
        <ul className="list-inside list-disc space-y-1">
          <li>البيع والتسديد والإرجاع واستلام البضاعة والجرد: تتسجّل فوراً على الجهاز وتطلع فاتورتها.</li>
          <li>المخزون على الشاشة ينقص مباشرة، فما تبيع نفس القطعة مرتين من نفس الجهاز.</li>
          <li>أول ما ترجع الشبكة، كل عملية تُرسل بترتيبها وبتاريخها الحقيقي.</li>
          <li>ما تمسح بيانات المتصفح ولا تخرج من الحساب وفي عمليات في الانتظار.</li>
        </ul>
      </section>

      {dialog}
    </>
  );
}

function EntryList({ entries }: { entries: OutboxEntry[] }) {
  return (
    <ul className="surface perf-rows overflow-hidden">
      {entries.map((entry) => (
        <li key={entry.id} className="flex items-center gap-3 px-3.5 py-3">
          <IconQueue className="h-5 w-5 shrink-0 text-warn" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-[0.92rem] font-bold">{describe(entry)}</p>
            <p className="tnum text-[0.78rem] font-semibold text-fg-3">
              {formatDateTime(new Date(entry.at))} · {entry.actor.name}
              {entry.attempts > 0 ? ` · ${entry.attempts} محاولة` : ''}
            </p>
          </div>
          {entry.op.kind === 'sale' ? (
            <span className="tnum shrink-0 font-display font-black text-brand-500">
              {money(entry.op.lines.reduce((s, l) => s + l.qty * l.sellPrice, 0) - entry.op.creditUsed)}
            </span>
          ) : (
            <Stamp tone="warn">معلّق</Stamp>
          )}
        </li>
      ))}
    </ul>
  );
}
