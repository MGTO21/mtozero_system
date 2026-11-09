'use client';

import { collection, limit, orderBy, query, type Timestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/hooks/useFirestore';
import type { SocialKind } from '@/lib/social/pick';
import { COL } from './collections';

/**
 * The daily Facebook posts, as recorded by /api/social/posted. Read-only here:
 * firestore.rules let staff read socialPosts and nobody but the server write it.
 */

export interface SocialPostRow {
  id: string;
  productId: string;
  kind: SocialKind;
  fbPostId: string;
  postedAt: Date | null;
}

export const SOCIAL_KIND_LABEL: Record<SocialKind, string> = {
  new: 'وصل جديد',
  last: 'آخر مقاس',
  spotlight: 'من المحل',
};

function mapPost(id: string, raw: Record<string, unknown>): SocialPostRow {
  const kind = raw.kind === 'new' || raw.kind === 'last' ? raw.kind : 'spotlight';
  return {
    id,
    productId: String(raw.productId ?? ''),
    kind,
    fbPostId: String(raw.fbPostId ?? ''),
    postedAt: (raw.postedAt as Timestamp | undefined)?.toDate?.() ?? null,
  };
}

/** The last 30 posts, newest first — about a month at one post a day. */
export function useSocialPosts(enabled = true) {
  return useLiveQuery<SocialPostRow>(
    () => (enabled ? query(collection(db(), COL.socialPosts), orderBy('postedAt', 'desc'), limit(30)) : null),
    [enabled],
    mapPost,
  );
}

/** Link to a Facebook post from the id the Graph API returns ("{pageId}_{postId}"). */
export function facebookPostUrl(fbPostId: string): string | null {
  return /^[0-9]+(_[0-9]+)?$/.test(fbPostId) ? `https://www.facebook.com/${fbPostId}` : null;
}
