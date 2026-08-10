'use client';

import type { ReactNode } from 'react';
import { Spinner } from './Button';

/** Clean first-run state: never fake data, always a next action. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon?: ReactNode;
  title: string;
  hint?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon ? (
        <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-card border border-dashed border-ink-300 text-ink-400 dark:border-ink-700 dark:text-ink-500">
          {icon}
        </div>
      ) : null}
      <h3 className="text-base text-ink-700 dark:text-ink-100">{title}</h3>
      {hint ? <p className="mt-1.5 max-w-xs text-[0.86rem] leading-relaxed text-ink-500 dark:text-ink-400">{hint}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function LoadingBlock({ label = 'جاري التحميل…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-14 text-sm font-semibold text-ink-500 dark:text-ink-400">
      <Spinner className="h-4 w-4" />
      {label}
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="mx-auto my-8 max-w-md rounded-card border border-bad/40 bg-bad/10 px-4 py-3.5 text-center text-sm font-semibold text-bad">
      {message}
    </div>
  );
}

/**
 * Shown when Firestore rejects a read. For an owner this is never really about
 * their account — it means the rules for a newly added collection were never
 * published — so the panel says exactly that and gives the fix.
 */
export function PermissionNotice({ collection, isOwner }: { collection: string; isOwner: boolean }) {
  if (!isOwner) {
    return (
      <div className="surface mx-auto my-6 max-w-lg border-warn/40 bg-warn/8 px-4 py-4 text-center">
        <p className="text-sm font-bold text-warn">هذه الصفحة غير متاحة لحسابك.</p>
        <p className="mt-1.5 text-[0.82rem] text-ink-500 dark:text-ink-400">اطلب من المالك تفعيل الصلاحية.</p>
      </div>
    );
  }

  return (
    <div className="surface mx-auto my-6 max-w-xl border-warn/40 px-4 py-4">
      <h3 className="text-base text-warn">تحتاج نشر قواعد الأمان</h3>
      <p className="mt-2 text-[0.86rem] leading-relaxed text-ink-600 dark:text-ink-300">
        مجموعة <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[0.78rem] dark:bg-ink-800">{collection}</code>{' '}
        أُضيفت للنظام لكن قواعدها لم تُنشر في Firebase بعد، فيرفض Firestore قراءتها — حتى للمالك.
        حسابك سليم تماماً.
      </p>
      <ol className="mt-3 space-y-1.5 text-[0.84rem] text-ink-600 dark:text-ink-300">
        <li>1. افتح Firebase Console ← <span className="font-bold">Firestore Database</span></li>
        <li>2. تبويب <span className="font-bold">Rules</span></li>
        <li>3. امسح الموجود والصق محتوى ملف <span className="font-bold">firestore.rules</span></li>
        <li>4. اضغط <span className="font-bold">Publish</span> ثم حدّث هذه الصفحة</li>
      </ol>
    </div>
  );
}

/** Skeleton rows — width varies so it doesn't read as a fake table. */
export function SkeletonRows({ count = 4 }: { count?: number }) {
  return (
    <div className="space-y-2">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="h-16 animate-pulse-soft rounded-card bg-ink-100 dark:bg-ink-850"
          style={{ animationDelay: `${i * 90}ms` }}
        />
      ))}
    </div>
  );
}
