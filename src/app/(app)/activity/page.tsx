'use client';

import { useMemo, useState } from 'react';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { IconHistory } from '@/components/ui/Icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { useActivityLog } from '@/lib/db/activity';
import { formatDate, formatTime, relativeTime } from '@/lib/format';
import { ACTION_LABEL, type ActivityAction } from '@/lib/types';

/** Actions are grouped into three tones so scanning the log is fast. */
const TONE: Record<ActivityAction, string> = {
  sold_product: 'bg-brand-500/15 text-brand-500',
  recorded_payment: 'bg-good/15 text-good',
  returned_item: 'bg-bad/15 text-bad',
  added_product: 'bg-good/15 text-good',
  edited_product: 'bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  archived_product: 'bg-warn/15 text-warn',
  restored_product: 'bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  added_expense: 'bg-warn/15 text-warn',
  deleted_expense: 'bg-bad/15 text-bad',
  added_user: 'bg-good/15 text-good',
  edited_user: 'bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  added_shipment: 'bg-accent-500/15 text-accent-500',
  received_stock: 'bg-accent-500/15 text-accent-500',
  grouped_shipments: 'bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
  awarded_referral: 'bg-good/15 text-good',
  edited_settings: 'bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300',
};

export default function ActivityPage() {
  const { data: entries, loading, error } = useActivityLog(200);
  const [user, setUser] = useState<string>('all');

  const users = useMemo(() => {
    const map = new Map<string, string>();
    for (const e of entries) map.set(e.userId, e.userName);
    return [...map.entries()];
  }, [entries]);

  const visible = user === 'all' ? entries : entries.filter((e) => e.userId === user);

  return (
    <>
      <PageHeader title="سجل النشاط" subtitle="كل عملية ومن قام بها — آخر 200 عملية" />

      {users.length > 1 ? (
        <div className="mb-3 flex flex-wrap gap-1.5">
          <button
            onClick={() => setUser('all')}
            className={`rounded-card border px-3 py-1.5 text-[0.8rem] font-bold transition
              ${user === 'all'
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-400'}`}
          >
            الجميع
          </button>
          {users.map(([uid, name]) => (
            <button
              key={uid}
              onClick={() => setUser(uid)}
              className={`rounded-card border px-3 py-1.5 text-[0.8rem] font-bold transition
                ${user === uid
                  ? 'border-brand-500 bg-brand-500 text-white'
                  : 'border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-400'}`}
            >
              {name}
            </button>
          ))}
        </div>
      ) : null}

      {error ? <ErrorBlock message={error} /> : null}

      {loading ? (
        <SkeletonRows count={6} />
      ) : visible.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={<IconHistory className="h-7 w-7" />}
            title="السجل فارغ"
            hint="كل عملية بيع أو تعديل أو حذف ستُسجَّل هنا باسم من قام بها ووقتها."
          />
        </div>
      ) : (
        <ul className="surface divide-y divide-ink-200 dark:divide-ink-800">
          {visible.map((e) => (
            <li key={e.id} className="flex items-start gap-3 p-3.5">
              <span className={`chip shrink-0 ${TONE[e.action] ?? TONE.edited_product}`}>
                {ACTION_LABEL[e.action] ?? e.action}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[0.9rem] font-semibold leading-snug">{e.details}</p>
                <p className="mt-0.5 text-[0.74rem] font-bold text-ink-400 dark:text-ink-500">
                  {e.userName} · {relativeTime(e.timestamp)}
                </p>
              </div>
              <span className="tnum shrink-0 text-[0.72rem] font-semibold text-ink-400 dark:text-ink-500">
                {formatDate(e.timestamp)}
                <br />
                {formatTime(e.timestamp)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
