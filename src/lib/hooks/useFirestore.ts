'use client';

import { onSnapshot, type Query } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { isFirebaseConfigured } from '@/lib/firebase';

export interface SnapshotState<T> {
  data: T[];
  loading: boolean;
  error: string | null;
  /**
   * Set when Firestore rejected the read outright. Almost always means the rules
   * for a newly added collection have not been published yet, which is a very
   * different problem from "your account lacks permission" — pages use this to
   * show a fix instead of a dead end.
   */
  denied: boolean;
  /** True while the rows come from the offline cache and not the server. */
  fromCache: boolean;
}

/**
 * Live Firestore subscription. `build` is re-run whenever `deps` change, so
 * callers pass their filter values as deps instead of memoising a Query.
 */
export function useLiveQuery<T>(
  build: () => Query | null,
  deps: unknown[],
  map: (id: string, data: Record<string, unknown>) => T,
): SnapshotState<T> {
  const [state, setState] = useState<SnapshotState<T>>({
    data: [],
    loading: true,
    error: null,
    denied: false,
    fromCache: false,
  });

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setState({ data: [], loading: false, error: 'Firebase غير مُهيّأ.', denied: false, fromCache: false });
      return;
    }
    let q: Query | null = null;
    try {
      q = build();
    } catch {
      setState({ data: [], loading: false, error: 'تعذّر إنشاء الاستعلام.', denied: false, fromCache: false });
      return;
    }
    if (!q) {
      setState({ data: [], loading: false, error: null, denied: false, fromCache: false });
      return;
    }

    const unsub = onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => {
        setState({
          data: snap.docs.map((d) => map(d.id, d.data())),
          loading: false,
          error: null,
          denied: false,
          fromCache: snap.metadata.fromCache,
        });
      },
      (err) => {
        const denied = err.code === 'permission-denied';
        setState({
          data: [],
          loading: false,
          error: denied
            ? 'قواعد الأمان لهذه المجموعة غير منشورة بعد.'
            : 'تعذّر تحميل البيانات. تحقّق من الاتصال.',
          denied,
          fromCache: false,
        });
      },
    );
    return unsub;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return state;
}

/** Browser online/offline state, surfaced as a banner in the app shell. */
export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    update();
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
