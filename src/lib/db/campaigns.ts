'use client';

import {
  addDoc,
  arrayUnion,
  collection,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/hooks/useFirestore';
import { toDate } from '@/lib/format';
import type { Campaign } from '@/lib/types';
import { AppError, COL } from './collections';
import { logActivity } from './activity';

export function mapCampaign(id: string, raw: Record<string, unknown>): Campaign {
  return {
    id,
    title: String(raw.title ?? ''),
    message: String(raw.message ?? ''),
    segment: String(raw.segment ?? ''),
    sentTo: Array.isArray(raw.sentTo) ? (raw.sentTo as string[]) : [],
    recipientCount: Number(raw.recipientCount ?? 0),
    createdBy: String(raw.createdBy ?? ''),
    createdByName: String(raw.createdByName ?? ''),
    createdAt: (raw.createdAt as Timestamp) ?? null,
  };
}

export function useCampaigns(max = 30) {
  return useLiveQuery<Campaign>(
    () => query(collection(db(), COL.campaigns), orderBy('createdAt', 'desc'), limit(max)),
    [max],
    mapCampaign,
  );
}

export async function createCampaign(
  input: { title: string; message: string; segment: string; recipientCount: number },
  actor: { uid: string; name: string },
): Promise<string> {
  if (!input.message.trim()) throw new AppError('اكتب نص الرسالة أولاً.');

  const created = await addDoc(collection(db(), COL.campaigns), {
    title: input.title.trim() || 'حملة بدون عنوان',
    message: input.message.trim(),
    segment: input.segment,
    sentTo: [],
    recipientCount: input.recipientCount,
    createdBy: actor.uid,
    createdByName: actor.name,
    createdAt: serverTimestamp(),
  });

  await logActivity(
    actor,
    'sent_campaign',
    `بدأ حملة "${input.title.trim() || 'بدون عنوان'}" لـ ${input.recipientCount} عميل`,
  );
  return created.id;
}

/**
 * Marks one recipient done. Uses arrayUnion so the same customer cannot be
 * recorded twice, and so two devices working the same queue do not overwrite
 * each other's progress.
 */
export async function markSent(campaignId: string, customerId: string): Promise<void> {
  await updateDoc(doc(db(), COL.campaigns, campaignId), { sentTo: arrayUnion(customerId) });
}

/**
 * Customers who already received any campaign within `days`.
 *
 * Meta caps marketing at roughly two messages per user per day across all
 * businesses, and a shop that blasts weekly gets muted. This is what powers the
 * "recently contacted" warning.
 */
export function recentlyContacted(campaigns: Campaign[], days = 7): Set<string> {
  const cutoff = Date.now() - days * 86_400_000;
  const ids = new Set<string>();
  for (const campaign of campaigns) {
    const at = toDate(campaign.createdAt)?.getTime() ?? 0;
    if (at < cutoff) continue;
    for (const id of campaign.sentTo) ids.add(id);
  }
  return ids;
}
