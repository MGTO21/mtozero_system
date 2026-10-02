'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconAlert, IconOffline, IconQueue, IconSync } from '@/components/ui/Icons';
import { useOnlineStatus } from '@/lib/hooks/useFirestore';
import { useOutbox, type OutboxEntry } from '@/lib/offline/outbox';
import { syncOutbox } from '@/lib/offline/operations';

export interface QueueSummary {
  /** This user's operations waiting for a connection. */
  pending: OutboxEntry[];
  /** Refused by the server; someone has to decide. */
  conflicts: OutboxEntry[];
  /** Queued on this device by someone else — sent when they sign in here. */
  others: OutboxEntry[];
}

export function useQueueSummary(uid: string | undefined): QueueSummary {
  const outbox = useOutbox();
  return useMemo(() => {
    const mine = outbox.filter((e) => e.actor.uid === uid);
    return {
      pending: mine.filter((e) => e.state === 'pending'),
      conflicts: mine.filter((e) => e.state === 'conflict'),
      others: outbox.filter((e) => e.actor.uid !== uid),
    };
  }, [outbox, uid]);
}

/**
 * Drains the queue whenever there is a reason to think it can: on start, when
 * the phone reports a connection, when the app comes back to the foreground, and
 * on a slow timer while anything is waiting — `navigator.onLine` is optimistic,
 * a phone on a weak tower says "online" and still cannot reach anything.
 */
export function useSyncDriver(uid: string | undefined, pendingCount: number) {
  useEffect(() => {
    if (!uid) return;
    const kick = () => void syncOutbox(uid);
    kick();
    const onVisible = () => {
      if (document.visibilityState === 'visible') kick();
    };
    window.addEventListener('online', kick);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('online', kick);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [uid]);

  useEffect(() => {
    if (!uid || pendingCount === 0) return;
    const timer = window.setInterval(() => void syncOutbox(uid), 20000);
    return () => window.clearInterval(timer);
  }, [uid, pendingCount]);
}

/**
 * The one honest line about the connection. Silent when everything is sent;
 * otherwise says exactly what is waiting and links to the queue.
 */
export function SyncPill({ summary }: { summary: QueueSummary }) {
  const online = useOnlineStatus();
  const [showSent, setShowSent] = useState(false);
  const waiting = summary.pending.length;
  const conflicts = summary.conflicts.length;

  // A brief "sent" acknowledgement after the queue drains, so the seller sees
  // the offline sales actually went.
  const previous = useRef(waiting);
  useEffect(() => {
    const was = previous.current;
    previous.current = waiting;
    if (was > 0 && waiting === 0 && conflicts === 0) {
      setShowSent(true);
      const t = window.setTimeout(() => setShowSent(false), 3000);
      return () => window.clearTimeout(t);
    }
    return undefined;
  }, [waiting, conflicts]);

  const base = 'press inline-flex h-8 items-center gap-1.5 rounded-card border px-2 text-[0.76rem] font-extrabold';

  if (conflicts > 0) {
    return (
      <Link href="/sync" className={`${base} border-bad bg-bad text-white`}>
        <IconAlert className="h-4 w-4" />
        <span className="tnum">{conflicts}</span> تحتاج مراجعة
      </Link>
    );
  }
  if (waiting > 0) {
    return (
      <Link href="/sync" className={`${base} border-warn text-warn`}>
        {online ? <IconSync className="h-4 w-4 animate-spin [animation-duration:2.4s]" /> : <IconQueue className="h-4 w-4" />}
        <span className="tnum">{waiting}</span>
        {online ? 'يُرسل' : 'في الانتظار'}
      </Link>
    );
  }
  if (!online) {
    return (
      <Link href="/sync" className={`${base} border-line-strong text-fg-2`}>
        <IconOffline className="h-4 w-4" />
        بدون شبكة
      </Link>
    );
  }
  if (showSent) {
    return <span className={`${base} animate-fade-in border-good text-good`}>تم الإرسال</span>;
  }
  return null;
}
