'use client';

import { createUserWithEmailAndPassword, signOut as signOutSecondary } from 'firebase/auth';
import { collection, doc, orderBy, query, serverTimestamp, setDoc, updateDoc, type Timestamp } from 'firebase/firestore';
import { db, secondaryAuth } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/hooks/useFirestore';
import type { AppUser, Role } from '@/lib/types';
import { AppError, COL } from './collections';
import { logActivity } from './activity';

export function mapUser(id: string, raw: Record<string, unknown>): AppUser {
  return {
    uid: id,
    name: String(raw.name ?? 'مستخدم'),
    email: String(raw.email ?? ''),
    role: (raw.role as Role) === 'owner' ? 'owner' : 'employee',
    phone: (raw.phone as string) || undefined,
    canSeeProfit: raw.canSeeProfit === true || (raw.role as Role) === 'owner',
    isActive: raw.isActive !== false,
    createdAt: (raw.createdAt as Timestamp) ?? null,
  };
}

export function useUsers() {
  return useLiveQuery<AppUser>(() => query(collection(db(), COL.users), orderBy('name')), [], mapUser);
}

/**
 * Creates an employee account without disturbing the owner's session: the sign-up
 * runs on a secondary Firebase app instance which is signed out immediately after.
 */
export async function createEmployee(
  input: { name: string; email: string; password: string; phone?: string; role: Role; canSeeProfit: boolean },
  actor: { uid: string; name: string },
): Promise<void> {
  if (!input.name.trim()) throw new AppError('اسم المستخدم مطلوب.');
  if (!input.email.trim()) throw new AppError('البريد الإلكتروني مطلوب.');
  if (input.password.length < 6) throw new AppError('كلمة المرور يجب أن تكون 6 أحرف على الأقل.');

  const secondary = secondaryAuth();
  const cred = await createUserWithEmailAndPassword(secondary, input.email.trim(), input.password);

  try {
    await setDoc(doc(db(), COL.users, cred.user.uid), {
      uid: cred.user.uid,
      name: input.name.trim(),
      email: input.email.trim(),
      role: input.role,
      phone: input.phone?.trim() || null,
      canSeeProfit: input.role === 'owner' ? true : input.canSeeProfit,
      isActive: true,
      createdAt: serverTimestamp(),
    });
  } finally {
    await signOutSecondary(secondary);
  }

  await logActivity(actor, 'added_user', `أضاف المستخدم "${input.name.trim()}" بدور ${input.role === 'owner' ? 'مالك' : 'موظف'}`);
}

export async function updateUser(
  user: AppUser,
  patch: Partial<Pick<AppUser, 'name' | 'role' | 'phone' | 'canSeeProfit' | 'isActive'>>,
  actor: { uid: string; name: string },
): Promise<void> {
  if (user.uid === actor.uid && patch.role && patch.role !== 'owner')
    throw new AppError('لا يمكنك إزالة دور المالك من حسابك.');
  if (user.uid === actor.uid && patch.isActive === false)
    throw new AppError('لا يمكنك إيقاف حسابك الخاص.');

  await updateDoc(doc(db(), COL.users, user.uid), {
    ...patch,
    ...(patch.role === 'owner' ? { canSeeProfit: true } : {}),
  });
  await logActivity(actor, 'edited_user', `عدّل بيانات المستخدم "${user.name}"`);
}
