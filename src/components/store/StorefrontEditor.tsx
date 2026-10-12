'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useActor } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { IconChevronDown, IconImage, IconPlus, IconTrash } from '@/components/ui/Icons';
import { PageHeader, SectionTitle } from '@/components/ui/PageHeader';
import { errorMessage } from '@/lib/db/collections';
import { clearBannerImage, saveBannerImage, saveStoreConfig, useStoreConfig } from '@/lib/db/store';
import { bannerImagePath } from '@/lib/store/model';
import { HOME_SECTION_LABEL, type StoreBanner, type StoreConfig, type StoreLook } from '@/lib/types';

type Tab = 'look' | 'banners' | 'sections' | 'news' | 'orders';

const TABS: { id: Tab; label: string }[] = [
  { id: 'look', label: 'الشكل' },
  { id: 'banners', label: 'البانرات' },
  { id: 'sections', label: 'الأقسام' },
  { id: 'news', label: 'الإعلانات' },
  { id: 'orders', label: 'الطلبات' },
];

/** Where a banner can lead, without typing a URL. */
const LINK_PRESETS = [
  { href: '/shop', label: 'كل المنتجات' },
  { href: '/shop?c=shoes', label: 'الأحذية' },
  { href: '/shop?c=clothing', label: 'الملابس' },
  { href: '/shop?sale=1', label: 'التخفيضات' },
  { href: '/shop?featured=1', label: 'مختارات المحل' },
  { href: '/shop?sort=popular', label: 'الأكثر طلباً' },
];

function newId(): string {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

/**
 * «واجهة المتجر»: everything a visitor sees on the website, editable by the
 * owner without a developer. One document, one save — the tabs only split a
 * long form. Pictures are the exception: a banner picture is stored as soon as
 * it is chosen (it is big, and the preview must be the real compressed image).
 */
export function StorefrontEditor() {
  const { config, loading } = useStoreConfig();
  const actor = useActor();
  const toast = useToast();
  const [form, setForm] = useState<StoreConfig>(config);
  const [tab, setTab] = useState<Tab>('look');
  const [busy, setBusy] = useState(false);
  /** Pictures uploaded in this session, shown from memory until the site picks them up. */
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [uploading, setUploading] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) setForm(config);
  }, [loading, config]);

  const dirty = useMemo(() => JSON.stringify(form) !== JSON.stringify(config), [form, config]);
  const patch = (p: Partial<StoreConfig>) => setForm((f) => ({ ...f, ...p }));

  async function save() {
    setBusy(true);
    try {
      // Pictures of banners removed in this edit are emptied once the config no longer points at them.
      const removed = config.banners.filter((b) => !form.banners.some((x) => x.id === b.id));
      await saveStoreConfig(form, actor);
      await Promise.all(removed.map((b) => clearBannerImage(b.id).catch(() => undefined)));
      toast.success('اتحفظت واجهة المتجر — بتظهر في الموقع خلال دقيقة');
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر الحفظ.'));
    } finally {
      setBusy(false);
    }
  }

  async function uploadBanner(file: File, existing?: StoreBanner) {
    const id = existing?.id ?? newId();
    setUploading(id);
    try {
      const hash = await saveBannerImage(id, file);
      setPreviews((p) => ({ ...p, [id]: URL.createObjectURL(file) }));
      setForm((f) => {
        if (existing) return { ...f, banners: f.banners.map((b) => (b.id === id ? { ...b, imageHash: hash } : b)) };
        const banner: StoreBanner = { id, title: '', subtitle: '', cta: 'تسوّق الآن', href: '/shop', imageHash: hash, tone: 'light' };
        return { ...f, banners: [...f.banners, banner] };
      });
      if (!existing) toast.success('اتضاف البانر — أكتب العنوان واحفظ');
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر رفع الصورة.'));
    } finally {
      setUploading(null);
    }
  }

  const patchBanner = (id: string, p: Partial<StoreBanner>) =>
    setForm((f) => ({ ...f, banners: f.banners.map((b) => (b.id === id ? { ...b, ...p } : b)) }));

  function move<T>(list: T[], i: number, dir: -1 | 1): T[] {
    const j = i + dir;
    if (j < 0 || j >= list.length) return list;
    const next = [...list];
    [next[i], next[j]] = [next[j]!, next[i]!];
    return next;
  }

  return (
    <>
      <PageHeader
        title="واجهة المتجر"
        subtitle="كل اللي بيشوفو الزبون في الموقع — الشكل، البانرات، ترتيب الأقسام والإعلانات"
        action={
          <a href="/" target="_blank" rel="noopener noreferrer" className="press inline-flex h-11 items-center rounded-card border border-line-strong bg-surface px-4 font-bold">
            افتح الموقع
          </a>
        }
      />

      <div className="seg mb-4 overflow-x-auto">
        {TABS.map((t) => (
          <button key={t.id} type="button" aria-pressed={tab === t.id} onClick={() => setTab(t.id)} className="min-w-[4.5rem]">
            {t.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {tab === 'look' ? (
          <>
            <section className="surface p-4">
              <SectionTitle>شكل الموقع</SectionTitle>
              <div className="grid gap-3 sm:grid-cols-2">
                <LookCard look="light" active={form.look === 'light'} onPick={() => patch({ look: 'light' })} />
                <LookCard look="luxe" active={form.look === 'luxe'} onPick={() => patch({ look: 'luxe' })} />
              </div>
              <Toggle
                className="mt-3"
                title="خلّي الزبون يبدّل بين الشكلين"
                hint="زرار شمس/قمر في أعلى الموقع، وبيتذكّر اختيارو"
                checked={form.lookToggle}
                onChange={(v) => patch({ lookToggle: v })}
              />
            </section>

            <section className="surface p-4">
              <SectionTitle>الواجهة بدون بانر</SectionTitle>
              <p className="mb-3 text-[0.84rem] text-fg-2">لو ما أضفت بانرات، الموقع بيفتح بعنوان كبير جنب صور من مختاراتك.</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="اسم المتجر" value={form.shopName} onChange={(v) => patch({ shopName: v })} />
                <Field label="الشعار الصغير (بالإنجليزي)" value={form.tagline} onChange={(v) => patch({ tagline: v })} dir="ltr" />
                <Field className="sm:col-span-2" label="العنوان الكبير" value={form.heroTitle} onChange={(v) => patch({ heroTitle: v })} />
                <Field className="sm:col-span-2" label="الوصف تحتو" value={form.heroSubtitle} onChange={(v) => patch({ heroSubtitle: v })} multiline />
                <div>
                  <label className="label" htmlFor="sf-new">
                    شارة «جديد» لمدة (أيام)
                  </label>
                  <input
                    id="sf-new"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="field tnum"
                    value={form.newDays || ''}
                    placeholder="0 = بدون"
                    onChange={(e) => patch({ newDays: Math.max(0, Number(e.target.value) || 0) })}
                  />
                </div>
              </div>
            </section>
          </>
        ) : null}

        {tab === 'banners' ? (
          <section className="surface p-4">
            <SectionTitle>البانرات المتحركة</SectionTitle>
            <p className="mb-4 text-[0.84rem] text-fg-2">
              بتتبدّل براها كل 6 ثواني في أول الموقع. الصورة العريضة أحسن (زي 1600×700)، وبتتضغط تلقائياً. حتى 8 بانرات.
            </p>

            <ul className="space-y-4">
              {form.banners.map((b, i) => (
                <li key={b.id} className="surface-sunken overflow-hidden">
                  <div className="relative aspect-[21/9] bg-sunken">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={previews[b.id] ?? bannerImagePath(b)} alt="" className="h-full w-full object-cover" />
                    <div className="absolute left-2 top-2 flex gap-1.5">
                      <SmallButton label="لفوق" disabled={i === 0} onClick={() => patch({ banners: move(form.banners, i, -1) })}>
                        <IconChevronDown className="h-4 w-4 rotate-180" />
                      </SmallButton>
                      <SmallButton label="لتحت" disabled={i === form.banners.length - 1} onClick={() => patch({ banners: move(form.banners, i, 1) })}>
                        <IconChevronDown className="h-4 w-4" />
                      </SmallButton>
                    </div>
                    <span className="tnum absolute right-2 top-2 rounded-[3px] bg-fg px-2 py-0.5 font-display text-[0.8rem] font-black text-page">{i + 1}</span>
                  </div>
                  <div className="grid gap-3 p-3 sm:grid-cols-2">
                    <Field label="العنوان" value={b.title} onChange={(v) => patchBanner(b.id, { title: v })} placeholder="مثلاً: تشكيلة العيد وصلت" />
                    <Field label="نص الزرار" value={b.cta} onChange={(v) => patchBanner(b.id, { cta: v })} placeholder="فاضي = بدون زرار" />
                    <Field className="sm:col-span-2" label="سطر تحت العنوان" value={b.subtitle} onChange={(v) => patchBanner(b.id, { subtitle: v })} />
                    <div>
                      <label className="label" htmlFor={`bl-${b.id}`}>
                        البانر بيودّي على
                      </label>
                      <select
                        id={`bl-${b.id}`}
                        className="field"
                        value={LINK_PRESETS.some((l) => l.href === b.href) ? b.href : 'custom'}
                        onChange={(e) => patchBanner(b.id, { href: e.target.value === 'custom' ? '/p/' : e.target.value })}
                      >
                        {LINK_PRESETS.map((l) => (
                          <option key={l.href} value={l.href}>
                            {l.label}
                          </option>
                        ))}
                        <option value="custom">رابط تاني (منتج معيّن…)</option>
                      </select>
                      {!LINK_PRESETS.some((l) => l.href === b.href) ? (
                        <input
                          dir="ltr"
                          className="field mt-2 text-left"
                          value={b.href}
                          onChange={(e) => patchBanner(b.id, { href: e.target.value })}
                          placeholder="/p/xxxx — انسخ رابط المنتج من الموقع"
                        />
                      ) : null}
                    </div>
                    <div>
                      <p className="label">لون الكلام</p>
                      <div className="seg">
                        <button type="button" aria-pressed={b.tone === 'light'} onClick={() => patchBanner(b.id, { tone: 'light' })}>
                          أبيض على غامق
                        </button>
                        <button type="button" aria-pressed={b.tone === 'dark'} onClick={() => patchBanner(b.id, { tone: 'dark' })}>
                          أسود على فاتح
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <FilePick label="غيّر الصورة" busy={uploading === b.id} onFile={(f) => void uploadBanner(f, b)} />
                      <Button
                        variant="ghost"
                        size="sm"
                        icon={<IconTrash className="h-4 w-4" />}
                        onClick={() => patch({ banners: form.banners.filter((x) => x.id !== b.id) })}
                      >
                        احذف البانر
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {form.banners.length < 8 ? (
              <FilePick
                className="mt-4"
                label={form.banners.length ? 'أضف بانر' : 'أضف أول بانر'}
                big
                busy={uploading !== null && !form.banners.some((b) => b.id === uploading)}
                onFile={(f) => void uploadBanner(f)}
              />
            ) : null}
          </section>
        ) : null}

        {tab === 'sections' ? (
          <section className="surface p-4">
            <SectionTitle>ترتيب الصفحة الرئيسية</SectionTitle>
            <p className="mb-4 text-[0.84rem] text-fg-2">
              رتّب الأقسام بالأسهم، اقفل اللي ما دايرو، وغيّر عناوينها. القسم الفاضي (مافي منتجات ليهو) بيختفي براهو.
            </p>
            <ul className="rows surface overflow-hidden">
              {form.sections.map((s, i) => {
                const meta = HOME_SECTION_LABEL[s.type];
                const titled = !['hero', 'promise', 'categories'].includes(s.type);
                return (
                  <li key={s.type} className={`flex items-start gap-2 p-3 ${s.enabled ? '' : 'opacity-60'}`}>
                    <div className="flex shrink-0 flex-col gap-1">
                      <SmallButton label="لفوق" disabled={i === 0} onClick={() => patch({ sections: move(form.sections, i, -1) })}>
                        <IconChevronDown className="h-4 w-4 rotate-180" />
                      </SmallButton>
                      <SmallButton label="لتحت" disabled={i === form.sections.length - 1} onClick={() => patch({ sections: move(form.sections, i, 1) })}>
                        <IconChevronDown className="h-4 w-4" />
                      </SmallButton>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{meta.title}</p>
                      <p className="text-[0.76rem] text-fg-3">{meta.hint}</p>
                      {titled && s.enabled ? (
                        <input
                          className="field mt-2 !min-h-[2.5rem] !py-1.5 text-[0.92rem]"
                          value={s.title}
                          placeholder={`العنوان في الموقع: ${meta.title}`}
                          maxLength={60}
                          onChange={(e) =>
                            patch({ sections: form.sections.map((x) => (x.type === s.type ? { ...x, title: e.target.value } : x)) })
                          }
                        />
                      ) : null}
                    </div>
                    <input
                      type="checkbox"
                      aria-label={`إظهار ${meta.title}`}
                      checked={s.enabled}
                      onChange={(e) =>
                        patch({ sections: form.sections.map((x) => (x.type === s.type ? { ...x, enabled: e.target.checked } : x)) })
                      }
                      className="mt-1 h-6 w-6 shrink-0 accent-[rgb(var(--fg))]"
                    />
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-[0.8rem] text-fg-3">
              «مختارات المحل» و«تخفيضات» بتتملا من شاشة المنتج في المخزون: علّم المنتج «مميز» أو أكتب السعر قبل الخصم.
            </p>
          </section>
        ) : null}

        {tab === 'news' ? (
          <>
            <section className="surface p-4">
              <SectionTitle>الشريط المتحرك فوق</SectionTitle>
              <p className="mb-3 text-[0.84rem] text-fg-2">رسائل قصيرة بتلف في أعلى الموقع. لو فاضي، بيظهر شرط التوصيل المجاني.</p>
              <ul className="space-y-2">
                {form.announcements.map((a, i) => (
                  <li key={i} className="flex gap-2">
                    <input
                      className="field"
                      value={a}
                      maxLength={90}
                      onChange={(e) => patch({ announcements: form.announcements.map((x, j) => (j === i ? e.target.value : x)) })}
                      placeholder="مثلاً: خصم 20% على الأحذية الرياضية لحدي الخميس"
                    />
                    <button
                      type="button"
                      aria-label="احذف الرسالة"
                      onClick={() => patch({ announcements: form.announcements.filter((_, j) => j !== i) })}
                      className="press flex h-12 w-12 shrink-0 items-center justify-center rounded-card border border-line-strong text-fg-3 hover:text-bad"
                    >
                      <IconTrash className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
              {form.announcements.length < 6 ? (
                <Button className="mt-3" variant="secondary" size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => patch({ announcements: [...form.announcements, ''] })}>
                  أضف رسالة
                </Button>
              ) : null}
            </section>

            <section className="surface p-4">
              <SectionTitle>حساباتنا في السوشيال</SectionTitle>
              <p className="mb-3 text-[0.84rem] text-fg-2">بتظهر في أسفل الموقع. أكتب اسم الحساب أو الرابط كامل.</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <Field label="انستغرام" value={form.instagram} onChange={(v) => patch({ instagram: v })} dir="ltr" placeholder="@mtozero" />
                <Field label="فيسبوك" value={form.facebook} onChange={(v) => patch({ facebook: v })} dir="ltr" placeholder="mtozero.shop" />
                <Field label="تيك توك" value={form.tiktok} onChange={(v) => patch({ tiktok: v })} dir="ltr" placeholder="@mtozero" />
              </div>
              <Field className="mt-4" label="عن المتجر (في أسفل الموقع)" value={form.about} onChange={(v) => patch({ about: v })} multiline />
            </section>
          </>
        ) : null}

        {tab === 'orders' ? (
          <section className="surface p-4">
            <SectionTitle>الطلبات والتوصيل</SectionTitle>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="رقم واتساب الطلبات *" value={form.whatsapp} onChange={(v) => patch({ whatsapp: v })} dir="ltr" placeholder="09xxxxxxxx" inputMode="tel" />
              <Field label="عنوان المحل" value={form.address} onChange={(v) => patch({ address: v })} />
              <NumberField label="رسوم التوصيل" value={form.deliveryFee} placeholder="0 = مجاني" onChange={(v) => patch({ deliveryFee: v })} />
              <NumberField label="توصيل مجاني للطلبات فوق" value={form.freeDeliveryOver} placeholder="0 = ما في" onChange={(v) => patch({ freeDeliveryOver: v })} />
              <Field className="sm:col-span-2" label="سياسة الاستبدال" value={form.returnPolicy} onChange={(v) => patch({ returnPolicy: v })} />
            </div>
            <div className="surface-sunken mt-4 divide-y divide-line">
              <Toggle title="استلام من المحل" hint="العميل يختار يستلم بنفسو بدون رسوم" checked={form.pickupEnabled} onChange={(v) => patch({ pickupEnabled: v })} />
              <Toggle
                title="استقبال الطلبات"
                hint="اقفله في العطلات أو أيام الجرد — الموقع يفضل شغّال للعرض"
                checked={form.acceptingOrders}
                onChange={(v) => patch({ acceptingOrders: v })}
              />
            </div>
          </section>
        ) : null}
      </div>

      {/* Save bar: always reachable, and says when there is something unsaved. */}
      <div className="sticky bottom-[calc(5rem+env(safe-area-inset-bottom))] z-30 mt-4 lg:bottom-4">
        <div className="flex items-center gap-3 rounded-card border border-line-strong bg-surface p-2.5 shadow-lift">
          <p className={`min-w-0 flex-1 truncate px-1 text-[0.86rem] font-bold ${dirty ? 'text-warn' : 'text-fg-3'}`}>
            {loading ? 'بيحمّل…' : dirty ? 'في تعديلات ما اتحفظت' : 'كل حاجة محفوظة'}
          </p>
          <Button variant="ink" loading={busy} disabled={!dirty || loading} onClick={() => void save()}>
            حفظ ونشر
          </Button>
        </div>
      </div>
    </>
  );
}

/* ---------- small pieces ---------- */

function LookCard({ look, active, onPick }: { look: StoreLook; active: boolean; onPick: () => void }) {
  const luxe = look === 'luxe';
  // A miniature of the real thing, drawn with the look's own colours.
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onPick}
      className={`press overflow-hidden rounded-card border-2 text-right transition-colors ${active ? 'border-fg' : 'border-line hover:border-line-strong'}`}
    >
      <div className={`p-4 ${luxe ? 'bg-[#09090A] text-[#F5F2EB]' : 'bg-[#FAF9F6] text-[#111110]'}`}>
        <p className={`text-[0.6rem] font-black tracking-[0.3em] ${luxe ? 'text-[#8E8A82]' : 'text-[#706C65]'}`}>WEAR YOUR IDENTITY</p>
        <p className="mt-1 font-display text-[1.6rem] font-black leading-none">لبس يشبهك</p>
        <div className="mt-3 grid grid-cols-3 gap-1.5">
          {[0, 1, 2].map((k) => (
            <div key={k}>
              <div className={`aspect-[4/5] rounded-[3px] ${luxe ? 'bg-[#131315]' : 'bg-[#F0EEE9]'}`} />
              <div className={`mt-1 h-1.5 w-3/4 rounded-full ${luxe ? 'bg-[#3E3D42]' : 'bg-[#DCD9D2]'}`} />
              <div className={`mt-1 h-1.5 w-1/2 rounded-full ${luxe ? 'bg-[#EC5492]' : 'bg-[#C2306E]'}`} />
            </div>
          ))}
        </div>
        {luxe ? <span className="mt-2 inline-block rounded-[3px] bg-[#D4B26A] px-1.5 text-[0.6rem] font-black text-[#0C0B09]">حصري</span> : null}
      </div>
      <div className="flex items-center justify-between gap-2 bg-surface px-4 py-3">
        <span>
          <span className="block font-bold">{luxe ? 'ليلي فاخر' : 'فاتح جريء'}</span>
          <span className="block text-[0.76rem] text-fg-3">{luxe ? 'أسود عميق وذهبي — إحساس بوتيك' : 'أبيض صافي وخط ضخم — زي متاجر الماركات'}</span>
        </span>
        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${active ? 'border-fg bg-fg' : 'border-line-strong'}`}>
          {active ? <span className="h-2 w-2 rounded-full bg-page" /> : null}
        </span>
      </div>
    </button>
  );
}

function Field({
  label,
  value,
  onChange,
  className = '',
  multiline,
  dir,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
  multiline?: boolean;
  dir?: 'ltr';
  placeholder?: string;
  inputMode?: 'tel';
}) {
  const id = useRef(`f-${Math.random().toString(36).slice(2, 8)}`).current;
  return (
    <div className={className}>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea id={id} rows={2} className="field resize-none" value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          id={id}
          dir={dir}
          inputMode={inputMode}
          className={`field ${dir === 'ltr' ? 'text-left' : ''}`}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

function NumberField({ label, value, onChange, placeholder }: { label: string; value: number; onChange: (v: number) => void; placeholder: string }) {
  const id = useRef(`n-${Math.random().toString(36).slice(2, 8)}`).current;
  return (
    <div>
      <label className="label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        className="field tnum"
        value={value || ''}
        placeholder={placeholder}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
      />
    </div>
  );
}

function Toggle({
  title,
  hint,
  checked,
  onChange,
  className = '',
}: {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  className?: string;
}) {
  return (
    <label className={`flex cursor-pointer items-center gap-3 px-3.5 py-3 ${className}`}>
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{title}</span>
        <span className="block text-[0.78rem] text-fg-3">{hint}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-6 w-6 accent-[rgb(var(--fg))]" />
    </label>
  );
}

function SmallButton({ label, disabled, onClick, children }: { label: string; disabled?: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="press flex h-9 w-9 items-center justify-center rounded-card border border-line-strong bg-surface text-fg-2 disabled:opacity-30"
    >
      {children}
    </button>
  );
}

function FilePick({
  label,
  onFile,
  busy,
  big,
  className = '',
}: {
  label: string;
  onFile: (f: File) => void;
  busy?: boolean;
  big?: boolean;
  className?: string;
}) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) onFile(f);
        }}
      />
      {big ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => ref.current?.click()}
          className={`press flex w-full flex-col items-center justify-center gap-2 rounded-card border-2 border-dashed border-line-strong py-8 font-bold text-fg-2 hover:border-fg hover:text-fg disabled:opacity-60 ${className}`}
        >
          <IconImage className="h-7 w-7" />
          {busy ? 'بيرفع ويضغط الصورة…' : label}
        </button>
      ) : (
        <Button variant="secondary" size="sm" loading={busy} icon={<IconImage className="h-4 w-4" />} onClick={() => ref.current?.click()}>
          {label}
        </Button>
      )}
    </>
  );
}
