'use client';

import { doc, onSnapshot, serverTimestamp, setDoc } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { restSetDoc, type RestWriteError } from '@/lib/offline/rest';
import { TimeoutError, withTimeout } from '@/lib/offline/write';
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
  // Not `settle`: products are about to be moved into these categories, so the
  // list must be on the server before the screen says "saved".
  //
  // First the normal SDK write. If the server has not acknowledged it within a
  // few seconds, the same document goes straight to Firestore's REST API: the
  // SDK queue on a device can stall behind an earlier stuck write while the
  // connection itself is fine, and the REST answer says exactly why a save fails.
  const data = { list: clean };
  try {
    await withTimeout(setDoc(doc(db(), COL.storefront, 'categories'), { ...data, updatedAt: serverTimestamp() }), 8000);
  } catch (err) {
    const code = (err as { code?: string }).code ?? '';
    if (code === 'permission-denied')
      throw new AppError('السيرفر رفض الحفظ (صلاحية) — اتأكد إنك داخل بحساب المالك.');
    if (!(err instanceof TimeoutError) && code !== 'unavailable')
      throw new AppError(`ما اتحفظت التصنيفات: ${code || (err as Error).message || 'خطأ غير معروف'}`);
    try {
      await restSetDoc('storefront/categories', { ...data, updatedAt: new Date() });
    } catch (restErr) {
      const e = restErr as RestWriteError;
      if (e.serverStatus === 'PERMISSION_DENIED')
        throw new AppError('السيرفر رفض الحفظ (صلاحية) — اتأكد إنك داخل بحساب المالك.');
      if (e.serverStatus === 'RESOURCE_EXHAUSTED' || e.status === 429)
        throw new AppError('حصة الكتابة اليومية المجانية في Firebase خلصت — التعديلات محفوظة في الجهاز وبتتبعت براها بعد الساعة 9 صباحاً بتوقيت السودان.');
      if (e.serverStatus === 'NETWORK')
        throw new AppError('ما قدرنا نوصل السيرفر بأي طريقة — جرّب شبكة تانية، وافتح «فحص الاتصال» في الإعدادات.');
      throw new AppError(`السيرفر رد بخطأ: ${e.serverStatus || e.status} — ${e.message}`);
    }
  }
  void logActivity(actor, 'edited_settings', `حدّث التصنيفات (${clean.length})`);
}
