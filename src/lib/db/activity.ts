'use client';

import { addDoc, collection, limit, orderBy, query, serverTimestamp, type Timestamp } from 'firebase/firestore';
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
 */
export async function logActivity(
  actor: { uid: string; name: string },
  action: ActivityAction,
  details: string,
): Promise<void> {
  try {
    await addDoc(collection(db(), COL.activity), {
      userId: actor.uid,
      userName: actor.name,
      action,
      details,
      timestamp: serverTimestamp(),
    });
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
