'use client';

import { doc, onSnapshot, serverTimestamp, setDoc, type Timestamp } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import { db, isFirebaseConfigured } from '@/lib/firebase';
import { DEFAULT_SETTINGS, type ShopSettings } from '@/lib/types';
import { COL, SETTINGS_DOC } from './collections';
import { logActivity } from './activity';

function mapSettings(raw: Record<string, unknown>): ShopSettings {
  return {
    shopName: String(raw.shopName ?? DEFAULT_SETTINGS.shopName),
    tagline: String(raw.tagline ?? DEFAULT_SETTINGS.tagline),
    phone: String(raw.phone ?? ''),
    address: String(raw.address ?? DEFAULT_SETTINGS.address),
    logoData: (raw.logoData as string) || null,
    invoiceFooter: String(raw.invoiceFooter ?? DEFAULT_SETTINGS.invoiceFooter),
    referralReward: Number(raw.referralReward ?? DEFAULT_SETTINGS.referralReward),
    updatedAt: (raw.updatedAt as Timestamp) ?? null,
  };
}

/**
 * Shop identity, read live everywhere invoices are produced. Falls back to sane
 * defaults so the app is usable before anyone opens the settings screen.
 */
export function useSettings(): { settings: ShopSettings; loading: boolean } {
  const [settings, setSettings] = useState<ShopSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isFirebaseConfigured) {
      setLoading(false);
      return;
    }
    return onSnapshot(
      doc(db(), COL.settings, SETTINGS_DOC),
      (snap) => {
        setSettings(snap.exists() ? mapSettings(snap.data()) : DEFAULT_SETTINGS);
        setLoading(false);
      },
      () => setLoading(false),
    );
  }, []);

  return { settings, loading };
}

export async function saveSettings(
  patch: Partial<ShopSettings>,
  actor: { uid: string; name: string },
): Promise<void> {
  await setDoc(
    doc(db(), COL.settings, SETTINGS_DOC),
    { ...patch, updatedAt: serverTimestamp() },
    { merge: true },
  );
  await logActivity(actor, 'edited_settings', 'حدّث إعدادات المتجر');
}
