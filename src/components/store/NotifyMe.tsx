'use client';

import { useEffect, useState } from 'react';
import { errorMessage } from '@/lib/db/collections';
import { requestRestock } from '@/lib/db/restock';
import type { CatalogItem } from '@/lib/types';
import { StoreSheet } from './StoreSheet';

/** Same key the checkout uses, so a returning customer never types their number twice. */
const DETAILS_KEY = 'mtozero-store-customer-v1';

/**
 * "Tell me when it is back" for a sold-out size. One field that matters — the
 * WhatsApp number — and the name is prefilled from an earlier order.
 */
export function NotifyMe({ item, size, onClose }: { item: CatalogItem; size: string; onClose: () => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(DETAILS_KEY) ?? 'null') as { name?: string; phone?: string } | null;
      if (saved?.name) setName(saved.name);
      if (saved?.phone) setPhone(saved.phone);
    } catch {
      // Nothing saved.
    }
  }, []);

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      await requestRestock({ productId: item.id, productName: item.name, size, name, phone });
      try {
        const saved = JSON.parse(window.localStorage.getItem(DETAILS_KEY) ?? '{}') as Record<string, string>;
        window.localStorage.setItem(DETAILS_KEY, JSON.stringify({ ...saved, name: name || saved.name || '', phone }));
      } catch {
        // Not remembered.
      }
      setDone(true);
    } catch (err) {
      setError(errorMessage(err, 'ما قدرنا نسجّل طلبك.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <StoreSheet title={done ? 'اتسجّل طلبك' : `مقاس ${size} خلص`} onClose={onClose}>
      {done ? (
        <div className="py-2 text-center">
          <span className="stamp animate-stamp border-good text-good">حنرسل ليك</span>
          <p className="mt-4 leading-relaxed text-fg-2">
            أول ما <span className="font-bold text-fg">{item.name}</span> مقاس{' '}
            <span className="tnum font-black text-fg">{size}</span> يرجع، بنرسل ليك واتساب طوالي.
          </p>
          <button type="button" onClick={onClose} className="press mt-6 h-12 w-full rounded-full bg-fg font-display font-black text-page">
            تمام
          </button>
        </div>
      ) : (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p className="mb-4 leading-relaxed text-fg-2">
            خلّي رقمك ونرسل ليك واتساب أول ما <span className="font-bold text-fg">{item.name}</span> مقاس{' '}
            <span className="tnum font-black text-fg">{size}</span> يرجع.
          </p>
          <label className="label" htmlFor="nm-phone">
            رقم واتساب *
          </label>
          <input
            id="nm-phone"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            className="field text-left"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="09xxxxxxxx"
          />
          <label className="label mt-3" htmlFor="nm-name">
            اسمك
          </label>
          <input id="nm-name" autoComplete="name" className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder="اختياري" />
          {error ? <p className="mt-3 text-[0.88rem] font-bold text-bad">{error}</p> : null}
          <button
            type="submit"
            disabled={busy}
            className="press mt-5 h-14 w-full rounded-full bg-fg font-display text-[1.05rem] font-black text-page disabled:opacity-60"
          >
            {busy ? 'بيسجّل…' : 'نبّهني لما يتوفر'}
          </button>
          <p className="mt-2.5 text-center text-[0.76rem] text-fg-3">رقمك بيستعمل للرسالة دي بس.</p>
        </form>
      )}
    </StoreSheet>
  );
}
