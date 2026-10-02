'use client';

import { collection, doc, limit, orderBy, query, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/hooks/useFirestore';
import type { ActivityAction, ActivityEntry } from '@/lib/types';
import { COL } from './collections';

export function mapActivity(id: string, raw: Record<string, unknown>): ActivityEntry {
  return {
    id,
    userId: String(raw.userId ?? ''),
    userName: String(raw.userName ?? 'مستخدم'),
    action: (raw.action as ActivityAction) ?? 'edited_product',
    details: String(raw.details ?? ''),
    timestamp: (raw.timestamp as Timestamp) ?? null,
  };
}

/**
 * Fire-and-forget audit trail. A failure here must never roll back the business
 * action the user just completed, so it is caught and swallowed.
 *
 * It also must never be waited on: Firestore only settles a write's promise when
 * the server acknowledges it, so awaiting this offline froze every operation that
 * logs — which is every operation. The entry lands in the local cache now and
 * travels with the rest of the queue.
 */
export async function logActivity(
  actor: { uid: string; name: string },
  action: ActivityAction,
  details: string,
): Promise<void> {
  try {
    void setDoc(doc(collection(db(), COL.activity)), {
      userId: actor.uid,
      userName: actor.name,
      action,
      details,
      timestamp: serverTimestamp(),
    }).catch(() => undefined);
  } catch {
    // Intentionally silent — see comment above.
  }
}

export function useActivityLog(max = 150) {
  return useLiveQuery<ActivityEntry>(
    () => query(collection(db(), COL.activity), orderBy('timestamp', 'desc'), limit(max)),
    [max],
    mapActivity,
  );
}
