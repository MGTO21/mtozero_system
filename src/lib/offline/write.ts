'use client';

import { AppError } from '@/lib/db/collections';

/**
 * Firestore applies a write to the local cache the instant it is issued, but the
 * promise it returns only settles when the SERVER acknowledges it. With no
 * connection that is never — so `await setDoc(...)` left every save button
 * spinning forever offline, even though the data was already safe on the device.
 *
 * `settle` waits a short while for the acknowledgement and then lets the caller
 * move on. The write keeps travelling in Firestore's own queue; if the server
 * later rejects it, the failure is announced so the shell can show it.
 */
export async function settle(write: Promise<unknown>, waitMs = 3500): Promise<'saved' | 'queued'> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // Set once the caller has moved on; a rejection after that point has nobody
  // waiting for it, so it is announced to the shell instead.
  let handedBack = false;

  const late = new Promise<'queued'>((resolve) => {
    timer = setTimeout(() => {
      handedBack = true;
      resolve('queued');
    }, waitMs);
  });

  const acked = write.then(
    () => 'saved' as const,
    (err: unknown) => {
      // A network stall is the normal offline path: the write is already in the
      // local queue, so it reads as queued, not failed.
      if (isNetworkError(err)) return 'queued' as const;
      if (handedBack) announceWriteFailure(err);
      throw err;
    },
  );
  acked.catch(() => undefined);

  try {
    // A rejection that arrives in time is a real error the caller shows itself —
    // permission denied, a broken rule.
    return await Promise.race([acked, late]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Fires a write and never waits for the server — for the audit trail. */
export function fireAndForget(write: Promise<unknown>): void {
  write.catch((err: unknown) => {
    if (!isNetworkError(err)) announceWriteFailure(err);
  });
}

export const WRITE_FAILED_EVENT = 'mtozero:write-failed';

function announceWriteFailure(err: unknown) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(WRITE_FAILED_EVENT, { detail: err }));
}

/** Raised by `withTimeout` so a stalled request is classed as a network problem. */
export class TimeoutError extends Error {
  constructor() {
    super('timeout');
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError()), ms);
  });
  return Promise.race([work, timeout]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

/**
 * "Try again later" versus "this will never work".
 *
 * A network failure leaves the operation queued for the next attempt. Anything
 * else — not enough stock, a sale that no longer exists, a permission rule — is
 * a business answer that retrying will not change, and goes to the review list.
 */
export function isNetworkError(err: unknown): boolean {
  if (err instanceof AppError) return false;
  if (err instanceof TimeoutError) return true;
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  const code = (err as { code?: string })?.code ?? '';
  if (
    code === 'unavailable' ||
    code === 'deadline-exceeded' ||
    code === 'aborted' ||
    code === 'cancelled' ||
    code === 'resource-exhausted' ||
    code === 'auth/network-request-failed'
  )
    return true;
  const message = err instanceof Error ? err.message.toLowerCase() : '';
  return message.includes('offline') || message.includes('network') || message.includes('failed to fetch');
}

/** Best guess at "can we reach the server right now", without a request. */
export function probablyOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine !== false;
}
