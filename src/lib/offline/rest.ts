'use client';

import { auth } from '@/lib/firebase';

/**
 * A direct write to Firestore's REST API, signed with the user's own login —
 * the same security rules apply as for the SDK.
 *
 * Why it exists: the SDK sends writes one after another from a queue kept on
 * the device. If one write in that queue gets stuck, every later write waits
 * behind it, invisibly, while reads keep working from the cache. For the few
 * owner settings that must reach the server now (categories), this path skips
 * the queue and reports the server's own answer.
 */

const PROJECT = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '';
const BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/(default)/documents`;

type RestValue = Record<string, unknown>;

function encode(value: unknown): RestValue {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === 'string') return { stringValue: value };
  if (value instanceof Date) return { timestampValue: value.toISOString() };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encode) } };
  if (typeof value === 'object') return { mapValue: { fields: encodeFields(value as Record<string, unknown>) } };
  return { stringValue: String(value) };
}

function encodeFields(data: Record<string, unknown>): Record<string, RestValue> {
  return Object.fromEntries(Object.entries(data).map(([k, v]) => [k, encode(v)]));
}

export class RestWriteError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly serverStatus: string,
  ) {
    super(message);
    this.name = 'RestWriteError';
  }
}

/** Replaces the document at `path` (e.g. "storefront/categories") with `data`. */
export async function restSetDoc(path: string, data: Record<string, unknown>, timeoutMs = 15000): Promise<void> {
  const user = auth().currentUser;
  if (!user) throw new RestWriteError('لازم تكون داخل بحسابك.', 401, 'UNAUTHENTICATED');
  const token = await user.getIdToken();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/${path}`, {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: encodeFields(data) }),
      signal: controller.signal,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: { message?: string; status?: string } };
      throw new RestWriteError(body.error?.message ?? res.statusText, res.status, body.error?.status ?? '');
    }
  } catch (err) {
    if (err instanceof RestWriteError) throw err;
    throw new RestWriteError((err as Error).name === 'AbortError' ? 'timeout' : (err as Error).message, 0, 'NETWORK');
  } finally {
    clearTimeout(timer);
  }
}

/** Reads a document straight from the server, bypassing the device cache. */
export async function restGetDoc(path: string, timeoutMs = 15000): Promise<{ ok: boolean; status: number; ms: number }> {
  const user = auth().currentUser;
  const token = user ? await user.getIdToken() : null;
  const started = performance.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE}/${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      signal: controller.signal,
    });
    return { ok: res.ok, status: res.status, ms: Math.round(performance.now() - started) };
  } catch {
    return { ok: false, status: 0, ms: Math.round(performance.now() - started) };
  } finally {
    clearTimeout(timer);
  }
}
