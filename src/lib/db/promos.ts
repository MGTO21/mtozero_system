'use client';

import {
  collection,
  doc,
  getDoc,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { money } from '@/lib/format';
import { useLiveQuery } from '@/lib/hooks/useFirestore';
import { settle } from '@/lib/offline/write';
import type { CreditGrant, Customer, CustomerCard, Promo, PromoKind } from '@/lib/types';
import { AppError, COL } from './collections';
import { logActivity } from './activity';
import { normalizeCode } from './sale-math';

export { evaluatePromo, normalizeCode } from './sale-math';

export function mapPromo(id: string, raw: Record<string, unknown>): Promo {
  return {
    code: String(raw.code ?? id),
    name: String(raw.name ?? id),
    kind: (raw.kind as PromoKind) ?? 'fixed',
    value: Number(raw.value ?? 0),
    balance: Number(raw.balance ?? 0),
    minTotal: Number(raw.minTotal ?? 0),
    maxDiscount: Number(raw.maxDiscount ?? 0),
    maxUses: Number(raw.maxUses ?? 0),
    uses: Number(raw.uses ?? 0),
    oncePerCustomer: raw.oncePerCustomer === true,
    usedBy: Array.isArray(raw.usedBy) ? (raw.usedBy as string[]) : [],
    expiresAt: (raw.expiresAt as Timestamp) ?? null,
    active: raw.active !== false,
    public: raw.public === true,
    note: (raw.note as string) || undefined,
    createdBy: String(raw.createdBy ?? ''),
    createdByName: String(raw.createdByName ?? ''),
    createdAt: (raw.createdAt as Timestamp) ?? null,
  };
}

/**
 * Every code. Held live so the sell screen can check a typed code instantly and
 * with no connection — the transaction checks it again against the server.
 */
export function usePromos() {
  return useLiveQuery<Promo>(() => query(collection(db(), COL.promos), orderBy('createdAt', 'desc')), [], mapPromo);
}

/**
 * Offers the shop chose to advertise. Readable without signing in — the query
 * must name `public == true`, because that is exactly what the rules allow.
 */
export function usePublicPromos() {
  return useLiveQuery<Promo>(
    () => query(collection(db(), COL.promos), where('public', '==', true), where('active', '==', true)),
    [],
    mapPromo,
  );
}

/** "15% خصم" / "5,000 ج خصم" / "قسيمة 20,000 ج" — how a code is described to people. */
export function promoValueText(p: Pick<Promo, 'kind' | 'value' | 'maxDiscount'>): string {
  if (p.kind === 'percent') return `${p.value}% خصم${p.maxDiscount > 0 ? ` (حتى ${money(p.maxDiscount)})` : ''}`;
  if (p.kind === 'fixed') return `${money(p.value)} خصم`;
  return `قسيمة ${money(p.value)}`;
}

/** A short code that reads well aloud: no 0/O or 1/I confusion. */
export function generateCode(prefix = ''): string {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = '';
  for (let i = 0; i < 6; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return normalizeCode(`${prefix}${out}`);
}

export interface PromoInput {
  code: string;
  name: string;
  kind: PromoKind;
  value: number;
  minTotal: number;
  maxDiscount: number;
  maxUses: number;
  oncePerCustomer: boolean;
  expiresAt: Date | null;
  active: boolean;
  public: boolean;
  note?: string;
}

function validatePromo(input: PromoInput) {
  const code = normalizeCode(input.code);
  if (!/^[A-Z0-9؀-ۿ-]{3,20}$/.test(code)) throw new AppError('الكود من 3 إلى 20 حرف أو رقم، بدون مسافات.');
  if (!input.name.trim()) throw new AppError('اكتب اسماً للعرض — يظهر للعميل وفي التقارير.');
  if (input.value <= 0) throw new AppError('القيمة يجب أن تكون أكبر من صفر.');
  if (input.kind === 'percent' && input.value > 100) throw new AppError('النسبة لا تتجاوز 100%.');
  if (input.minTotal < 0 || input.maxUses < 0 || input.maxDiscount < 0) throw new AppError('الأرقام لا تكون سالبة.');
  return code;
}

/**
 * Creates a code. Inside a transaction so two people creating the same code at
 * once cannot silently overwrite each other — the second one is told it exists.
 */
export async function createPromo(input: PromoInput, actor: { uid: string; name: string }): Promise<string> {
  const code = validatePromo(input);
  const ref = doc(db(), COL.promos, code);
  await runTransaction(db(), async (tx) => {
    if ((await tx.get(ref)).exists()) throw new AppError(`الكود ${code} موجود أصلاً — اختر كوداً آخر.`);
    tx.set(ref, {
      code,
      name: input.name.trim(),
      kind: input.kind,
      value: input.value,
      balance: input.kind === 'gift' ? input.value : 0,
      minTotal: input.minTotal,
      maxDiscount: input.kind === 'percent' ? input.maxDiscount : 0,
      maxUses: input.kind === 'gift' ? 0 : input.maxUses,
      uses: 0,
      oncePerCustomer: input.kind === 'gift' ? false : input.oncePerCustomer,
      usedBy: [],
      expiresAt: input.expiresAt ? Timestamp.fromDate(input.expiresAt) : null,
      active: input.active,
      public: input.public,
      note: input.note?.trim() || null,
      createdBy: actor.uid,
      createdByName: actor.name,
      createdAt: serverTimestamp(),
    });
  });
  await logActivity(actor, 'saved_promo', `أنشأ الكود ${code} — ${input.name.trim()}`);
  return code;
}

/** Turns a code on or off, or changes whether customers see it. Value and kind stay fixed once used. */
export async function setPromoFlags(
  promo: Promo,
  flags: Partial<Pick<Promo, 'active' | 'public'>> & { expiresAt?: Date | null },
  actor: { uid: string; name: string },
): Promise<void> {
  const patch: Record<string, unknown> = {};
  if (flags.active !== undefined) patch.active = flags.active;
  if (flags.public !== undefined) patch.public = flags.public;
  if (flags.expiresAt !== undefined) patch.expiresAt = flags.expiresAt ? Timestamp.fromDate(flags.expiresAt) : null;
  const batch = writeBatch(db());
  batch.update(doc(db(), COL.promos, promo.code), patch);
  await settle(batch.commit());
  await logActivity(
    actor,
    'saved_promo',
    flags.active === false
      ? `أوقف الكود ${promo.code}`
      : flags.active === true
        ? `فعّل الكود ${promo.code}`
        : `عدّل إعدادات الكود ${promo.code}`,
  );
}

/* ---------- the customer's public card ---------- */

export function mapCard(raw: Record<string, unknown>): CustomerCard {
  return {
    firstName: String(raw.firstName ?? ''),
    code: String(raw.code ?? ''),
    balance: Number(raw.balance ?? 0),
    earned: Number(raw.earned ?? 0),
    referrals: Number(raw.referrals ?? 0),
    updatedAt: (raw.updatedAt as Timestamp) ?? null,
  };
}

/**
 * The fields a customer may see about themselves. First name only — the card
 * is readable by anyone who knows the phone number, so it carries nothing a
 * stranger could misuse: no surname, no phone, no purchases, no debts.
 */
export function cardFields(customer: {
  name: string;
  referralCode: string;
  creditBalance: number;
  creditEarned: number;
  referralCount: number;
}) {
  return {
    firstName: customer.name.trim().split(/\s+/)[0] || 'عميل',
    code: customer.referralCode,
    balance: customer.creditBalance,
    earned: customer.creditEarned,
    referrals: customer.referralCount,
    updatedAt: serverTimestamp(),
  };
}

/**
 * Refreshes a customer's public card. Always best-effort and never inside a
 * business transaction: the card is a convenience copy for the customer, and a
 * failure to write it — rules not yet published, a flaky connection — must
 * never cost the shop a sale, a new customer or a referral reward. A stale card
 * is corrected by the next write or by "publish all cards".
 */
export function publishCard(phone: string, customer: Parameters<typeof cardFields>[0]): void {
  if (!phone) return;
  try {
    void setDoc(doc(db(), COL.cards, phone), cardFields(customer)).catch(() => undefined);
  } catch {
    // Silent on purpose — see above.
  }
}

export async function getCard(phone: string): Promise<CustomerCard | null> {
  const snap = await getDoc(doc(db(), COL.cards, phone));
  return snap.exists() ? mapCard(snap.data()) : null;
}

/**
 * Writes a card for every customer. Cards are kept up to date by each sale,
 * reward and gift; this fills in customers who have not bought since cards
 * were introduced. Batched in chunks under Firestore's 500-write limit.
 */
export async function publishAllCards(customers: Customer[]): Promise<number> {
  const withPhone = customers.filter((c) => c.phone);
  for (let i = 0; i < withPhone.length; i += 400) {
    const batch = writeBatch(db());
    for (const c of withPhone.slice(i, i + 400)) batch.set(doc(db(), COL.cards, c.phone), cardFields(c));
    await settle(batch.commit(), 15000);
  }
  return withPhone.length;
}

/* ---------- gifting wallet credit ---------- */

export function mapGrant(id: string, raw: Record<string, unknown>): CreditGrant {
  return {
    id,
    customerId: String(raw.customerId ?? ''),
    customerName: String(raw.customerName ?? ''),
    amount: Number(raw.amount ?? 0),
    reason: String(raw.reason ?? ''),
    grantedBy: String(raw.grantedBy ?? ''),
    grantedByName: String(raw.grantedByName ?? ''),
    createdAt: (raw.createdAt as Timestamp) ?? null,
  };
}

export function useCreditGrants() {
  return useLiveQuery<CreditGrant>(
    () => query(collection(db(), COL.creditGrants), orderBy('createdAt', 'desc')),
    [],
    mapGrant,
  );
}

/**
 * Adds credit to a customer's wallet — the same balance referral rewards go
 * into, spent the same way at the counter. Every grant is recorded with who gave
 * it and why, because it is money the shop is giving away.
 */
export async function grantCredit(
  customer: Customer,
  amount: number,
  reason: string,
  actor: { uid: string; name: string },
): Promise<void> {
  const value = Math.floor(amount);
  if (value <= 0) throw new AppError('أدخل مبلغاً أكبر من صفر.');
  if (!reason.trim()) throw new AppError('اكتب سبب الهدية — يظهر في السجل.');

  const customerRef = doc(db(), COL.customers, customer.id);
  const grantRef = doc(collection(db(), COL.creditGrants));

  const next = await runTransaction(db(), async (tx) => {
    const snap = await tx.get(customerRef);
    if (!snap.exists()) throw new AppError('العميل غير موجود.');
    const data = snap.data();
    const balance = Number(data.creditBalance ?? 0) + value;
    const earned = Number(data.creditEarned ?? 0) + value;
    tx.update(customerRef, { creditBalance: balance, creditEarned: earned });
    tx.set(grantRef, {
      customerId: customer.id,
      customerName: customer.name,
      amount: value,
      reason: reason.trim(),
      grantedBy: actor.uid,
      grantedByName: actor.name,
      createdAt: serverTimestamp(),
    });
    return {
      balance,
      card: {
        name: String(data.name ?? customer.name),
        referralCode: String(data.referralCode ?? customer.referralCode),
        creditBalance: balance,
        creditEarned: earned,
        referralCount: Number(data.referralCount ?? 0),
      },
    };
  });

  publishCard(customer.phone, next.card);
  await logActivity(actor, 'granted_credit', `أهدى ${customer.name} رصيد ${value} ج — ${reason.trim()} (الرصيد الآن ${next.balance} ج)`);
}
