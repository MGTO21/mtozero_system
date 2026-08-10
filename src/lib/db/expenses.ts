'use client';

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  orderBy,
  query,
  Timestamp,
  where,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/hooks/useFirestore';
import type { Expense } from '@/lib/types';
import { AppError, COL } from './collections';
import { logActivity } from './activity';

export function mapExpense(id: string, raw: Record<string, unknown>): Expense {
  return {
    id,
    title: String(raw.title ?? ''),
    amount: Number(raw.amount ?? 0),
    category: String(raw.category ?? 'أخرى'),
    date: (raw.date as Timestamp) ?? null,
    addedBy: String(raw.addedBy ?? ''),
    addedByName: String(raw.addedByName ?? 'مستخدم'),
  };
}

export function useExpensesBetween(from: Date | null, to: Date | null) {
  return useLiveQuery<Expense>(
    () => {
      if (!from || !to) return null;
      return query(
        collection(db(), COL.expenses),
        where('date', '>=', Timestamp.fromDate(from)),
        where('date', '<=', Timestamp.fromDate(to)),
        orderBy('date', 'desc'),
      );
    },
    [from?.getTime() ?? 0, to?.getTime() ?? 0],
    mapExpense,
  );
}

export async function addExpense(
  input: { title: string; amount: number; category: string; date: Date },
  actor: { uid: string; name: string },
): Promise<void> {
  if (!input.title.trim()) throw new AppError('عنوان المصروف مطلوب.');
  if (input.amount <= 0) throw new AppError('المبلغ يجب أن يكون أكبر من صفر.');

  await addDoc(collection(db(), COL.expenses), {
    title: input.title.trim(),
    amount: input.amount,
    category: input.category,
    date: Timestamp.fromDate(input.date),
    addedBy: actor.uid,
    addedByName: actor.name,
  });

  await logActivity(actor, 'added_expense', `أضاف مصروف "${input.title.trim()}" بمبلغ ${input.amount} ج`);
}

export async function deleteExpense(expense: Expense, actor: { uid: string; name: string }): Promise<void> {
  await deleteDoc(doc(db(), COL.expenses, expense.id));
  await logActivity(actor, 'deleted_expense', `حذف مصروف "${expense.title}" بمبلغ ${expense.amount} ج`);
}
