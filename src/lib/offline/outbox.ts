'use client';

import { collection, doc } from 'firebase/firestore';
import { useSyncExternalStore } from 'react';
import { db } from '@/lib/firebase';
import type { Channel, PaymentStatus, SaleItem } from '@/lib/types';

/**
 * The device-side queue of operations that move money or stock.
 *
 * Those operations run as Firestore transactions, and a transaction needs the
 * server — there is no offline transaction. So the shop does what any cash
 * register does: the operation is recorded on the device the moment the seller
 * confirms, and the very same transaction is replayed when the connection is
 * back. Stock is still only ever deducted inside that transaction; it is just
 * deducted later.
 *
 * Each entry carries its own document id, chosen up front. Replaying an entry
 * whose document already exists is a no-op, which is what makes a retry after a
 * half-finished attempt safe — the server may have committed even though the
 * acknowledgement never reached the phone.
 */

export interface SaleLineOp {
  productId: string;
  productName: string;
  size: string;
  qty: number;
  sellPrice: number;
}

export interface SaleOp {
  kind: 'sale';
  lines: SaleLineOp[];
  customerName: string;
  customerPhone: string;
  referredByCode: string;
  creditUsed: number;
  paymentStatus: PaymentStatus;
  amountPaid: number;
  channel: Channel;
  note?: string;
  /** Credit granted to whoever referred this customer, if this is their first order. */
  referralReward: number;
  /**
   * Lines as the device worked them out, lots included, so the invoice and the
   * day's totals are right before the server confirms. The server recomputes all
   * of it inside the transaction; this copy is display-only.
   */
  preview: SaleItem[];
}

export interface PaymentOp {
  kind: 'payment';
  saleId: string;
  amount: number;
  customerName: string;
}

export interface ReturnOp {
  kind: 'return';
  saleId: string;
  itemIndex: number;
  qty: number;
  reason: string;
  productId: string;
  productName: string;
  size: string;
  sellPrice: number;
  /** Device-side estimate; the transaction records the real figure. */
  cashRefunded: number;
}

export interface ReceiveLineOp {
  productId: string;
  productName: string;
  size: string;
  qty: number;
  costPrice: number;
}

export interface ReceiveOp {
  kind: 'receive';
  shipmentId: string;
  shipmentName: string;
  shipmentCode: string;
  /** Lot arrival time — the shipment's date, which fixes its place in FIFO. */
  receivedAt: number;
  lines: ReceiveLineOp[];
}

export interface CountLineOp {
  productId: string;
  productName: string;
  size: string;
  systemQty: number;
  countedQty: number;
  costPrice: number;
}

export interface CountOp {
  kind: 'count';
  note: string;
  lines: CountLineOp[];
}

/**
 * A hand edit of quantities from the product form. Stored as differences, not
 * totals: by the time it reaches the server other sales may have happened, and
 * "two more of size 42" is still true then while "five of size 42" is not.
 */
export interface AdjustOp {
  kind: 'adjust';
  productId: string;
  productName: string;
  /** Unit cost for added pieces — the product's cost at the time of the edit. */
  costPrice: number;
  lines: { size: string; delta: number; remove: boolean }[];
}

export type OutboxOp = SaleOp | PaymentOp | ReturnOp | ReceiveOp | CountOp | AdjustOp;

export type OutboxState = 'pending' | 'conflict';

export interface OutboxEntry<T extends OutboxOp = OutboxOp> {
  /** Document id the replay writes to — the idempotency key. */
  id: string;
  /** When the seller did it, epoch millis. Becomes the record's date. */
  at: number;
  actor: { uid: string; name: string };
  op: T;
  state: OutboxState;
  /** Why the server refused it; set only on conflicts. */
  error?: string;
  attempts: number;
}

const KEY = 'mtozero.outbox.v1';
const listeners = new Set<() => void>();
let cache: OutboxEntry[] | null = null;
const EMPTY: OutboxEntry[] = [];

function load(): OutboxEntry[] {
  if (typeof window === 'undefined') return EMPTY;
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as OutboxEntry[]) : [];
    cache = Array.isArray(parsed) ? parsed : [];
  } catch {
    cache = [];
  }
  return cache;
}

function save(next: OutboxEntry[]) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Storage full or blocked. The in-memory copy still syncs this session;
    // there is nothing better to do than keep going.
  }
  listeners.forEach((fn) => fn());
}

if (typeof window !== 'undefined') {
  // Another tab of the app changed the queue — re-read it.
  window.addEventListener('storage', (event) => {
    if (event.key !== KEY) return;
    cache = null;
    listeners.forEach((fn) => fn());
  });
}

export function outboxEntries(): OutboxEntry[] {
  return load();
}

export function enqueue<T extends OutboxOp>(entry: Omit<OutboxEntry<T>, 'state' | 'attempts'>): OutboxEntry<T> {
  const full: OutboxEntry<T> = { ...entry, state: 'pending', attempts: 0 };
  save([...load(), full as OutboxEntry]);
  return full;
}

export function updateEntry(id: string, patch: Partial<OutboxEntry>) {
  save(load().map((e) => (e.id === id ? { ...e, ...patch } : e)));
}

export function removeEntry(id: string) {
  save(load().filter((e) => e.id !== id));
}

export function findEntry(id: string): OutboxEntry | undefined {
  return load().find((e) => e.id === id);
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Live view of the queue for any screen that has to account for unsent work. */
export function useOutbox(): OutboxEntry[] {
  return useSyncExternalStore(subscribe, load, () => EMPTY);
}

/** A Firestore-shaped id in the target collection, generated with no network. */
export function newDocId(collectionName: string): string {
  return doc(collection(db(), collectionName)).id;
}

export function isOp<K extends OutboxOp['kind']>(
  entry: OutboxEntry,
  kind: K,
): entry is OutboxEntry<Extract<OutboxOp, { kind: K }>> {
  return entry.op.kind === kind;
}
