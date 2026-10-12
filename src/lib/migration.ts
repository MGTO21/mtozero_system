'use client';

import { collection, doc, getDocs, GeoPoint, Timestamp, writeBatch } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { COL } from '@/lib/db/collections';

/**
 * Moving the whole shop from one Firebase project to another, through the app.
 *
 * Why through the app: the old project's Google account is out of reach, so
 * neither the console nor an admin export can read it. The owner's own session
 * in the app can — the rules let the owner read every collection — so the
 * export runs in the browser, and the import runs in the browser against the
 * new project. Document ids are kept, so every reference between records
 * (a sale to its products, a payment to its sale, a lot to its shipment)
 * survives the move untouched.
 */

/** Collections carried over, in import order (things referenced come first). */
export const MIGRATED = [
  COL.settings,
  COL.products,
  COL.shipments,
  COL.shipmentGroups,
  COL.customers,
  COL.sales,
  COL.payments,
  COL.returns,
  COL.expenses,
  COL.referrals,
  COL.campaigns,
  COL.stockCounts,
  COL.promos,
  COL.cards,
  COL.creditGrants,
  COL.activity,
] as const;

/**
 * Exported for reference only, never imported: a user document is keyed by the
 * Firebase Auth uid, and accounts cannot be carried between projects — staff
 * get new accounts, made from the Team screen, and new uids.
 */
export const REFERENCE_ONLY = [COL.users] as const;

export interface ShopExport {
  format: 'mtozero-export/1';
  exportedAt: string;
  sourceProject: string;
  collections: Record<string, { id: string; data: unknown }[]>;
  /** Collections that could not be read, with the reason, so a gap is never silent. */
  skipped: Record<string, string>;
}

/* ---------- Firestore values ↔ JSON ---------- */

function encode(value: unknown): unknown {
  if (value instanceof Timestamp) return { __type: 'timestamp', ms: value.toMillis() };
  if (value instanceof GeoPoint) return { __type: 'geopoint', lat: value.latitude, lng: value.longitude };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, encode(v)]));
  }
  return value;
}

function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === 'object') {
    const v = value as Record<string, unknown>;
    if (v.__type === 'timestamp' && typeof v.ms === 'number') return Timestamp.fromMillis(v.ms);
    if (v.__type === 'geopoint') return new GeoPoint(Number(v.lat), Number(v.lng));
    return Object.fromEntries(Object.entries(v).map(([k, inner]) => [k, decode(inner)]));
  }
  return value;
}

/* ---------- export ---------- */

export async function exportShop(onProgress: (label: string) => void): Promise<ShopExport> {
  const out: ShopExport = {
    format: 'mtozero-export/1',
    exportedAt: new Date().toISOString(),
    sourceProject: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '',
    collections: {},
    skipped: {},
  };

  for (const name of [...MIGRATED, ...REFERENCE_ONLY]) {
    onProgress(name);
    try {
      // Straight from the server: an export read from the offline cache could
      // silently miss documents this device never loaded.
      const snap = await getDocs(collection(db(), name));
      out.collections[name] = snap.docs.map((d) => ({ id: d.id, data: encode(d.data()) }));
    } catch (err) {
      out.skipped[name] = err instanceof Error ? err.message : String(err);
    }
  }
  return out;
}

export function summarizeExport(data: ShopExport): { name: string; count: number }[] {
  return Object.entries(data.collections).map(([name, docs]) => ({ name, count: docs.length }));
}

/* ---------- import ---------- */

const CHUNK = 400;

/**
 * Writes an export into the project this app is currently connected to.
 *
 * Idempotent: documents are set by their original id, so running it twice
 * overwrites with the same content rather than duplicating. Needs the
 * temporary import rules (owner may write anything) — the normal rules would
 * rightly refuse a sale "sold by" a user id from the old project.
 */
export async function importShop(
  data: ShopExport,
  onProgress: (label: string, done: number, total: number) => void,
): Promise<{ name: string; count: number }[]> {
  if (data.format !== 'mtozero-export/1') throw new Error('الملف ليس تصدير Mtozero صالح.');
  const target = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? '';
  if (target && target === data.sourceProject)
    throw new Error('النظام متصل بنفس المشروع القديم — بدّل إعدادات Firebase للمشروع الجديد أولاً.');

  const written: { name: string; count: number }[] = [];
  for (const name of MIGRATED) {
    const docs = data.collections[name] ?? [];
    for (let i = 0; i < docs.length; i += CHUNK) {
      onProgress(name, i, docs.length);
      const batch = writeBatch(db());
      for (const item of docs.slice(i, i + CHUNK)) {
        batch.set(doc(db(), name, item.id), decode(item.data) as Record<string, unknown>);
      }
      await batch.commit();
    }
    written.push({ name, count: docs.length });
  }
  return written;
}
