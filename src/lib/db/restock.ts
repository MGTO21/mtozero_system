'use client';

import { collection, doc, limit, orderBy, query, serverTimestamp, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/hooks/useFirestore';
import { settle } from '@/lib/offline/write';
import type { RestockRequest } from '@/lib/types';
import { COL } from './collections';
import { logActivity } from './activity';

/**
 * "Tell me when it is back" — sold-out sizes customers are waiting for.
 *
 * Two jobs: the customer gets a WhatsApp message the day the size returns, and
 * the owner sees real demand for sizes that are gone — a buying list made by
 * the customers themselves, next to the sales-speed ranking.
 */

export function mapRestock(id: string, raw: Record<string, unknown>): RestockRequest {
  return {
    id,
    productId: String(raw.productId ?? ''),
    productName: String(raw.productName ?? ''),
    size: String(raw.size ?? ''),
    name: String(raw.name ?? ''),
    phone: String(raw.phone ?? ''),
    status: raw.status === 'notified' ? 'notified' : 'open',
    createdAt: (raw.createdAt as Timestamp) ?? null,
    notifiedAt: (raw.notifiedAt as Timestamp) ?? null,
    notifiedByName: (raw.notifiedByName as string) || undefined,
  };
}

export { requestRestock } from "@/lib/store/order-client";

export function useRestockRequests() {
  return useLiveQuery<RestockRequest>(
    () => query(collection(db(), COL.restockRequests), orderBy('createdAt', 'desc'), limit(500)),
    [],
    mapRestock,
  );
}

/** One product size and everyone waiting for it. */
export interface RestockGroup {
  key: string;
  productId: string;
  productName: string;
  size: string;
  open: RestockRequest[];
  /** Earliest open request — how long the demand has been waiting. */
  sinceMs: number;
}

export function groupRestock(requests: RestockRequest[]): RestockGroup[] {
  const groups = new Map<string, RestockGroup>();
  for (const r of requests) {
    if (r.status !== 'open') continue;
    const key = `${r.productId}::${r.size}`;
    const ms = r.createdAt?.toMillis?.() ?? Date.now();
    const g = groups.get(key);
    // The same number asking twice for one size counts once.
    if (g) {
      if (!g.open.some((x) => x.phone === r.phone)) g.open.push(r);
      g.sinceMs = Math.min(g.sinceMs, ms);
    } else {
      groups.set(key, { key, productId: r.productId, productName: r.productName, size: r.size, open: [r], sinceMs: ms });
    }
  }
  return [...groups.values()].sort((a, b) => b.open.length - a.open.length || a.sinceMs - b.sinceMs);
}

export function restockWhatsappText(r: Pick<RestockRequest, 'name' | 'productName' | 'size'>, productUrl: string): string {
  const first = r.name.trim().split(/\s+/)[0];
  return [
    `${first ? `أهلاً ${first}، ` : 'أهلاً، '}بشارة! ${r.productName} مقاس ${r.size} رجع متوفر عندنا.`,
    'الكمية محدودة — اطلبو من هنا قبل يخلص:',
    productUrl,
  ].join('\n');
}

/** Marks requests as handled (the customer was messaged). */
export async function markRestockNotified(ids: string[], label: string, actor: { uid: string; name: string }): Promise<void> {
  if (ids.length === 0) return;
  const batch = writeBatch(db());
  for (const id of ids.slice(0, 400)) {
    batch.update(doc(db(), COL.restockRequests, id), {
      status: 'notified',
      notifiedAt: serverTimestamp(),
      notifiedByName: actor.name,
    });
  }
  await settle(batch.commit());
  void logActivity(actor, 'store_order', `بلّغ ${ids.length} عميل بتوفّر ${label}`);
}
