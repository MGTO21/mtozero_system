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
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {icon ? <div className="mb-3 text-line-strong [&>svg]:h-10 [&>svg]:w-10">{icon}</div> : null}
      <h3 className="text-[1.05rem] text-fg">{title}</h3>
      {hint ? <p className="mt-1.5 max-w-xs text-[0.88rem] leading-relaxed text-fg-3">{hint}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function LoadingBlock({ label = 'جاري التحميل…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-14 text-sm font-bold text-fg-3">
      <Spinner className="h-4 w-4" />
      {label}
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="mx-auto my-8 max-w-md rounded-card border-2 border-bad/50 bg-surface px-4 py-3.5 text-center text-sm font-bold text-bad">
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
      <div className="surface mx-auto my-6 max-w-lg border-warn/50 px-4 py-4 text-center">
        <p className="text-sm font-bold text-warn">هذه الصفحة غير متاحة لحسابك.</p>
        <p className="mt-1.5 text-[0.84rem] text-fg-3">اطلب من المالك تفعيل الصلاحية.</p>
      </div>
    );
  }

  return (
    <div className="surface mx-auto my-6 max-w-xl border-warn/50 px-4 py-4">
      <h3 className="text-base text-warn">تحتاج نشر قواعد الأمان</h3>
      <p className="mt-2 text-[0.88rem] leading-relaxed text-fg-2">
        مجموعة <code className="rounded bg-sunken px-1.5 py-0.5 font-mono text-[0.8rem]">{collection}</code> أُضيفت
        للنظام لكن قواعدها لم تُنشر في Firebase بعد، فيرفض Firestore قراءتها — حتى للمالك. حسابك سليم تماماً.
      </p>
      <ol className="mt-3 space-y-1.5 text-[0.86rem] text-fg-2">
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
    <div className="surface rows overflow-hidden">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-3.5 py-3.5">
          <div className="h-10 w-10 shrink-0 animate-pulse-soft rounded-card bg-sunken" />
          <div className="flex-1 space-y-2">
            <div
              className="h-3 animate-pulse-soft rounded bg-sunken"
              style={{ width: `${55 + ((i * 17) % 35)}%`, animationDelay: `${i * 90}ms` }}
            />
            <div className="h-2.5 w-1/3 animate-pulse-soft rounded bg-sunken" style={{ animationDelay: `${i * 90}ms` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * A figure with its printed label above it — the ledger's way of showing a
 * number. `big` is for the one number a screen is about.
 */
export function Figure({
  label,
  value,
  hint,
  tone,
  big,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: 'brand' | 'good' | 'warn' | 'bad';
  big?: boolean;
}) {
  const color =
    tone === 'brand' ? 'text-brand-500' : tone === 'good' ? 'text-good' : tone === 'warn' ? 'text-warn' : tone === 'bad' ? 'text-bad' : 'text-fg';
  return (
    <div className="min-w-0">
      <p className="text-[0.76rem] font-bold text-fg-3">{label}</p>
      <p className={`tnum mt-0.5 truncate font-display font-black ${big ? 'text-num-xl' : 'text-num'} ${color}`}>{value}</p>
      {hint ? <p className="mt-0.5 truncate text-[0.74rem] font-semibold text-fg-3">{hint}</p> : null}
    </div>
  );
}

/** Small status stamp, e.g. on an invoice line or a queued sale. */
export function Stamp({ tone, children }: { tone: 'good' | 'warn' | 'bad' | 'brand' | 'muted'; children: ReactNode }) {
  const color =
    tone === 'good'
      ? 'border-good text-good'
      : tone === 'warn'
        ? 'border-warn text-warn'
        : tone === 'bad'
          ? 'border-bad text-bad'
          : tone === 'brand'
            ? 'border-brand-500 text-brand-500'
            : 'border-line-strong text-fg-3';
  return <span className={`stamp ${color}`}>{children}</span>;
}
