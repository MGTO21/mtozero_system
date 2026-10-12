'use client';

import { useEffect, useState } from 'react';
import { useActor } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { SectionTitle } from '@/components/ui/PageHeader';
import { errorMessage } from '@/lib/db/collections';
import { saveStoreConfig, useStoreConfig } from '@/lib/db/store';
import type { StoreConfig } from '@/lib/types';

/** What customers see on the website and how orders reach the shop. */
export function StoreSettings() {
  const { config, loading } = useStoreConfig();
  const actor = useActor();
  const toast = useToast();
  const [form, setForm] = useState<StoreConfig>(config);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading) setForm(config);
  }, [loading, config]);

  const patch = (p: Partial<StoreConfig>) => setForm((f) => ({ ...f, ...p }));

  async function save() {
    setBusy(true);
    try {
      await saveStoreConfig(form, actor);
      toast.success('اتحفظت إعدادات المتجر — بتظهر في الموقع خلال دقيقة');
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر الحفظ.'));
    } finally {
      setBusy(false);
    }
  }

  const site = typeof window === 'undefined' ? '' : window.location.origin;

  return (
    <section className="surface p-4">
      <SectionTitle>المتجر الإلكتروني</SectionTitle>
      <p className="mb-4 text-[0.88rem] text-fg-2">
        رابط المتجر:{' '}
        <a href="/" target="_blank" rel="noopener noreferrer" dir="ltr" className="font-bold text-fg underline">
          {site.replace(/^https?:\/\//, '')}
        </a>
        . المنتجات بتظهر براها لما يكون عندها صورة وكمية.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="st-wa">
            رقم واتساب الطلبات *
          </label>
          <input
            id="st-wa"
            dir="ltr"
            inputMode="tel"
            className="field text-left"
            value={form.whatsapp}
            onChange={(e) => patch({ whatsapp: e.target.value })}
            placeholder="09xxxxxxxx"
          />
        </div>
        <div>
          <label className="label" htmlFor="st-addr">
            عنوان المحل
          </label>
          <input id="st-addr" className="field" value={form.address} onChange={(e) => patch({ address: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor="st-fee">
            رسوم التوصيل
          </label>
          <input
            id="st-fee"
            type="number"
            inputMode="numeric"
            min={0}
            className="field tnum"
            value={form.deliveryFee || ''}
            placeholder="0 = مجاني"
            onChange={(e) => patch({ deliveryFee: Number(e.target.value) || 0 })}
          />
        </div>
        <div>
          <label className="label" htmlFor="st-free">
            توصيل مجاني للطلبات فوق
          </label>
          <input
            id="st-free"
            type="number"
            inputMode="numeric"
            min={0}
            className="field tnum"
            value={form.freeDeliveryOver || ''}
            placeholder="0 = ما في"
            onChange={(e) => patch({ freeDeliveryOver: Number(e.target.value) || 0 })}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="st-hero">
            العنوان الكبير في الصفحة الرئيسية
          </label>
          <input id="st-hero" className="field" value={form.heroTitle} onChange={(e) => patch({ heroTitle: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="st-sub">
            الوصف تحتو
          </label>
          <textarea
            id="st-sub"
            rows={2}
            className="field resize-none"
            value={form.heroSubtitle}
            onChange={(e) => patch({ heroSubtitle: e.target.value })}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="st-about">
            عن المتجر (في أسفل الموقع)
          </label>
          <textarea id="st-about" rows={2} className="field resize-none" value={form.about} onChange={(e) => patch({ about: e.target.value })} />
        </div>
        <div className="sm:col-span-2">
          <label className="label" htmlFor="st-policy">
            سياسة الاستبدال
          </label>
          <input id="st-policy" className="field" value={form.returnPolicy} onChange={(e) => patch({ returnPolicy: e.target.value })} />
        </div>
      </div>

      <div className="surface-sunken mt-4 divide-y divide-line">
        <label className="flex cursor-pointer items-center gap-3 px-3.5 py-3">
          <span className="min-w-0 flex-1">
            <span className="block font-bold">استلام من المحل</span>
            <span className="block text-[0.78rem] text-fg-3">العميل يختار يستلم بنفسو بدون رسوم</span>
          </span>
          <input
            type="checkbox"
            checked={form.pickupEnabled}
            onChange={(e) => patch({ pickupEnabled: e.target.checked })}
            className="h-6 w-6 accent-[rgb(var(--fg))]"
          />
        </label>
        <label className="flex cursor-pointer items-center gap-3 px-3.5 py-3">
          <span className="min-w-0 flex-1">
            <span className="block font-bold">استقبال الطلبات</span>
            <span className="block text-[0.78rem] text-fg-3">اقفله في العطلات أو أيام الجرد — الموقع يفضل شغّال للعرض</span>
          </span>
          <input
            type="checkbox"
            checked={form.acceptingOrders}
            onChange={(e) => patch({ acceptingOrders: e.target.checked })}
            className="h-6 w-6 accent-[rgb(var(--fg))]"
          />
        </label>
      </div>

      <Button className="mt-4" variant="ink" block loading={busy} onClick={() => void save()}>
        حفظ إعدادات المتجر
      </Button>
    </section>
  );
}
