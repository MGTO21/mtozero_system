'use client';

import { useEffect, useRef, useState } from 'react';
import { useActor } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { BrandMark } from '@/components/layout/Brand';
import { Button } from '@/components/ui/Button';
import { IconImage, IconX } from '@/components/ui/Icons';
import { PageHeader, SectionTitle } from '@/components/ui/PageHeader';
import { errorMessage } from '@/lib/db/collections';
import { saveSettings, useSettings } from '@/lib/db/settings';
import { formatBytes, makeThumbnail } from '@/lib/image';
import { money } from '@/lib/format';

export default function SettingsPage() {
  const { settings, loading } = useSettings();
  const actor = useActor();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);

  const [form, setForm] = useState(settings);
  const [logoBytes, setLogoBytes] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading) setForm(settings);
  }, [loading, settings]);

  const patch = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  async function pickLogo(file: File) {
    try {
      const thumb = await makeThumbnail(file);
      patch({ logoData: thumb.dataUrl });
      setLogoBytes(thumb.bytes);
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر معالجة الصورة.'));
    }
  }

  async function save() {
    setBusy(true);
    try {
      await saveSettings(form, actor);
      toast.success('تم حفظ إعدادات المتجر');
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر الحفظ.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="إعدادات المتجر" subtitle="تظهر هذه البيانات على كل فاتورة" />

      <div className="space-y-3">
        <section className="surface p-4">
          <SectionTitle>الهوية</SectionTitle>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex h-24 w-24 shrink-0 items-center justify-center overflow-hidden rounded-card border border-dashed border-ink-300 bg-ink-100 text-ink-400 transition hover:border-brand-500 hover:text-brand-500 dark:border-ink-700 dark:bg-ink-900"
            >
              {form.logoData ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={form.logoData} alt="" className="h-full w-full object-contain" />
              ) : (
                <span className="flex flex-col items-center gap-1 text-[0.68rem] font-bold">
                  <IconImage className="h-6 w-6" />
                  لوغو
                </span>
              )}
            </button>

            <div className="min-w-0 flex-1">
              <p className="text-[0.85rem] font-bold">لوغو الفاتورة</p>
              <p className="mt-0.5 text-[0.75rem] leading-relaxed text-ink-500 dark:text-ink-400">
                {logoBytes !== null
                  ? `مضغوط إلى ${formatBytes(logoBytes)} — يُرسم على كل فاتورة.`
                  : 'ارفع لوغو المتجر ليظهر أعلى الفواتير. بدونه تُستخدم العلامة الافتراضية.'}
              </p>
              {form.logoData ? (
                <button
                  type="button"
                  onClick={() => {
                    patch({ logoData: null });
                    setLogoBytes(null);
                  }}
                  className="mt-1.5 inline-flex items-center gap-1 text-[0.75rem] font-bold text-bad"
                >
                  <IconX className="h-3.5 w-3.5" />
                  إزالة
                </button>
              ) : null}
            </div>

            <div className="hidden shrink-0 sm:block">
              <BrandMark className="h-14 w-14" />
            </div>
          </div>

          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void pickLogo(file);
            }}
          />

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <div>
              <label className="label" htmlFor="s-name">
                اسم المتجر
              </label>
              <input id="s-name" className="field" value={form.shopName} onChange={(e) => patch({ shopName: e.target.value })} />
            </div>
            <div>
              <label className="label" htmlFor="s-tagline">
                الشعار النصي
              </label>
              <input
                id="s-tagline"
                className="field"
                value={form.tagline}
                onChange={(e) => patch({ tagline: e.target.value })}
              />
            </div>
            <div>
              <label className="label" htmlFor="s-phone">
                رقم الهاتف
              </label>
              <input
                id="s-phone"
                className="field text-left"
                dir="ltr"
                inputMode="tel"
                value={form.phone}
                onChange={(e) => patch({ phone: e.target.value })}
                placeholder="09xxxxxxxx"
              />
            </div>
            <div>
              <label className="label" htmlFor="s-address">
                العنوان
              </label>
              <input
                id="s-address"
                className="field"
                value={form.address}
                onChange={(e) => patch({ address: e.target.value })}
              />
            </div>
            <div className="sm:col-span-2">
              <label className="label" htmlFor="s-footer">
                عبارة أسفل الفاتورة
              </label>
              <input
                id="s-footer"
                className="field"
                value={form.invoiceFooter}
                onChange={(e) => patch({ invoiceFooter: e.target.value })}
              />
            </div>
          </div>
        </section>

        <section className="surface p-4">
          <SectionTitle>نظام الإحالة</SectionTitle>
          <label className="label" htmlFor="s-reward">
            رصيد الخصم لكل إحالة ناجحة
          </label>
          <input
            id="s-reward"
            type="number"
            inputMode="numeric"
            min={0}
            className="field tnum h-14 max-w-xs text-center font-display text-num-lg font-black text-good"
            value={form.referralReward || ''}
            onChange={(e) => patch({ referralReward: Number(e.target.value) || 0 })}
          />
          <p className="mt-2 text-[0.78rem] leading-relaxed text-ink-500 dark:text-ink-400">
            يُضاف {money(form.referralReward)} لرصيد العميل عند أول عملية شراء يقوم بها من أحاله بكوده.
            الرصيد يُخصم من فواتيره القادمة، ويُحتسب ضمن تكلفة العملية في التقارير — فالربح المعروض
            يبقى صحيحاً.
          </p>
        </section>

        <Button size="lg" loading={busy} onClick={() => void save()}>
          حفظ الإعدادات
        </Button>
      </div>
    </>
  );
}
