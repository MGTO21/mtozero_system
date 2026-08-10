'use client';

import {
  addDoc,
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
  where,
  type Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/hooks/useFirestore';
import { whatsappNumber } from '@/lib/format';
import type { Customer, Referral } from '@/lib/types';
import { AppError, COL } from './collections';
import { logActivity } from './activity';

export function mapCustomer(id: string, raw: Record<string, unknown>): Customer {
  return {
    id,
    name: String(raw.name ?? 'عميل'),
    phone: String(raw.phone ?? ''),
    note: (raw.note as string) || undefined,
    totalSpent: Number(raw.totalSpent ?? 0),
    totalOrders: Number(raw.totalOrders ?? 0),
    lastPurchaseAt: (raw.lastPurchaseAt as Timestamp) ?? null,
    referralCode: String(raw.referralCode ?? ''),
    referredBy: (raw.referredBy as string) ?? null,
    referredByName: (raw.referredByName as string) ?? null,
    creditBalance: Number(raw.creditBalance ?? 0),
    creditEarned: Number(raw.creditEarned ?? 0),
    referralCount: Number(raw.referralCount ?? 0),
    createdAt: (raw.createdAt as Timestamp) ?? null,
  };
}

export function useCustomers() {
  return useLiveQuery<Customer>(
    () => query(collection(db(), COL.customers), orderBy('lastPurchaseAt', 'desc')),
    [],
    mapCustomer,
  );
}

export function mapReferral(id: string, raw: Record<string, unknown>): Referral {
  return {
    id,
    referrerId: String(raw.referrerId ?? ''),
    referrerName: String(raw.referrerName ?? ''),
    referredId: String(raw.referredId ?? ''),
    referredName: String(raw.referredName ?? ''),
    saleId: String(raw.saleId ?? ''),
    reward: Number(raw.reward ?? 0),
    createdAt: (raw.createdAt as Timestamp) ?? null,
  };
}

export function useReferrals() {
  return useLiveQuery<Referral>(
    () => query(collection(db(), COL.referrals), orderBy('createdAt', 'desc')),
    [],
    mapReferral,
  );
}

/**
 * Short, speakable code the customer can pass to a friend. Built from the name so
 * it is recognisable, with digits from the phone so it stays unique per person.
 */
export function makeReferralCode(name: string, phone: string): string {
  const letters =
    name
      .replace(/[^\p{L}\p{N}]/gu, '')
      .slice(0, 4)
      .toUpperCase() || 'MTO';
  const digits = phone.replace(/\D/g, '').slice(-4) || String(Math.floor(1000 + Math.random() * 9000));
  return `${letters}${digits}`;
}

/** Phone is the identity key — one person, one record, however they were typed in. */
export async function findCustomerByPhone(phone: string): Promise<Customer | null> {
  const normalized = whatsappNumber(phone);
  if (!normalized) return null;
  const snap = await getDocs(
    query(collection(db(), COL.customers), where('phone', '==', normalized), limit(1)),
  );
  const first = snap.docs[0];
  return first ? mapCustomer(first.id, first.data()) : null;
}

export async function findCustomerByCode(code: string): Promise<Customer | null> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return null;
  const snap = await getDocs(
    query(collection(db(), COL.customers), where('referralCode', '==', trimmed), limit(1)),
  );
  const first = snap.docs[0];
  return first ? mapCustomer(first.id, first.data()) : null;
}

/**
 * Finds or creates the customer record for a sale. Called before recordSale so the
 * sale can deduct referral credit atomically against a document that exists.
 */
export async function ensureCustomer(
  input: { name: string; phone: string; referredByCode?: string },
  actor: { uid: string; name: string },
): Promise<Customer | null> {
  const normalized = whatsappNumber(input.phone);
  if (!normalized) return null;

  const existing = await findCustomerByPhone(normalized);
  if (existing) {
    // Keep the newest spelling of the name without touching money fields.
    if (input.name.trim() && input.name.trim() !== existing.name) {
      await updateDoc(doc(db(), COL.customers, existing.id), { name: input.name.trim() });
      return { ...existing, name: input.name.trim() };
    }
    return existing;
  }

  const name = input.name.trim() || 'عميل';
  let referredBy: Customer | null = null;
  if (input.referredByCode?.trim()) {
    referredBy = await findCustomerByCode(input.referredByCode);
    if (!referredBy) throw new AppError('كود الإحالة غير صحيح.');
  }

  const created = await addDoc(collection(db(), COL.customers), {
    name,
    phone: normalized,
    note: null,
    totalSpent: 0,
    totalOrders: 0,
    lastPurchaseAt: null,
    referralCode: makeReferralCode(name, normalized),
    referredBy: referredBy?.id ?? null,
    referredByName: referredBy?.name ?? null,
    creditBalance: 0,
    creditEarned: 0,
    referralCount: 0,
    createdAt: serverTimestamp(),
  });

  await logActivity(actor, 'edited_user', `أضاف العميل "${name}" (${normalized})`);
  return mapCustomer(created.id, {
    name,
    phone: normalized,
    referralCode: makeReferralCode(name, normalized),
    referredBy: referredBy?.id ?? null,
    referredByName: referredBy?.name ?? null,
  });
}

export async function updateCustomer(
  customer: Customer,
  patch: Partial<Pick<Customer, 'name' | 'note'>>,
  actor: { uid: string; name: string },
): Promise<void> {
  await updateDoc(doc(db(), COL.customers, customer.id), patch);
  await logActivity(actor, 'edited_user', `عدّل بيانات العميل "${customer.name}"`);
}

/**
 * Grants the referrer their credit once the referred customer has actually bought.
 *
 * Deliberately outside the sale transaction: a failure here costs a reward that can
 * be re-granted, whereas pulling a third document into the sale would widen the
 * window in which a stock deduction can fail.
 */
export async function awardReferralIfDue(
  customerId: string,
  saleId: string,
  reward: number,
  actor: { uid: string; name: string },
): Promise<void> {
  if (reward <= 0) return;

  const result = await runTransaction(db(), async (tx) => {
    const customerRef = doc(db(), COL.customers, customerId);
    const snap = await tx.get(customerRef);
    if (!snap.exists()) return null;

    const customer = mapCustomer(snap.id, snap.data());
    if (!customer.referredBy) return null;
    // The reward is for bringing someone in, so it is paid once — on their first order.
    if (customer.totalOrders > 1) return null;

    const referrerRef = doc(db(), COL.customers, customer.referredBy);
    const referrerSnap = await tx.get(referrerRef);
    if (!referrerSnap.exists()) return null;
    const referrer = mapCustomer(referrerSnap.id, referrerSnap.data());

    tx.update(referrerRef, {
      creditBalance: referrer.creditBalance + reward,
      creditEarned: referrer.creditEarned + reward,
      referralCount: referrer.referralCount + 1,
    });

    tx.set(doc(collection(db(), COL.referrals)), {
      referrerId: referrer.id,
      referrerName: referrer.name,
      referredId: customer.id,
      referredName: customer.name,
      saleId,
      reward,
      createdAt: serverTimestamp(),
    });

    return { referrer: referrer.name, referred: customer.name };
  });

  if (result) {
    await logActivity(
      actor,
      'awarded_referral',
      `منح ${result.referrer} رصيد ${reward} ج لإحالته ${result.referred}`,
    );
  }
}
