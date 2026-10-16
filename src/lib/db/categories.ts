'use client';

import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { settle } from '@/lib/offline/write';
import { mapCategories } from '@/lib/store/model';
import { BUILTIN_CATEGORIES, type CategoryDef } from '@/lib/types';
import { AppError, COL } from './collections';
import { logActivity } from './activity';

/**
 * The product categories, owner-managed. Stored in storefront/categories:
 * the website needs them (menus, departments) and storefront is publicly
 * readable and owner-writable already, so no new rule is needed. The live
 * listener keeps the list on the device for offline use like any other doc.
 */
export function useCategories(): { categories: CategoryDef[]; loading: boolean } {
  const [categories, setCategories] = useState<CategoryDef[]>(BUILTIN_CATEGORIES);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    return onSnapshot(
      doc(db(), COL.storefront, 'categories'),
      (snap) => {
        setCategories(mapCategories(snap.exists() ? snap.data() : null));
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);
  return { categories, loading };
}

export async function saveCategories(list: CategoryDef[], actor: { uid: string; name: string }): Promise<void> {
  const names = new Set<string>();
  for (const c of list) {
    const name = c.name.trim();
    if (!name) throw new AppError('في تصنيف بدون اسم.');
    if (names.has(name)) throw new AppError(`التصنيف «${name}» مكرر.`);
    names.add(name);
  }
  const clean = mapCategories({ list: list.map((c) => ({ ...c, name: c.name.trim() })) });
  await settle(setDoc(doc(db(), COL.storefront, 'categories'), { list: clean, updatedAt: serverTimestamp() }));
  void logActivity(actor, 'edited_settings', `حدّث التصنيفات (${clean.length})`);
}
