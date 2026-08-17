'use client';

import { useMemo, useState } from 'react';
import { SendQueue } from '@/components/campaigns/SendQueue';
import { useActor, useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorBlock, PermissionNotice, SkeletonRows } from '@/components/ui/Feedback';
import {
  IconAlert,
  IconCheck,
  IconCopy,
  IconDownload,
  IconImage,
  IconUsers,
  IconWhatsApp,
} from '@/components/ui/Icons';
import { PageHeader, SectionTitle } from '@/components/ui/PageHeader';
import {
  BROADCAST_LIMIT,
  SEGMENTS,
  TEMPLATES,
  downloadVCard,
  numbersList,
  personalise,
  reachable,
  type SegmentKey,
} from '@/lib/campaign';
import { renderOfferPng, shareOffer } from '@/lib/campaign-image';
import { createCampaign, recentlyContacted, useCampaigns } from '@/lib/db/campaigns';
import { useCustomers } from '@/lib/db/customers';
import { useProducts } from '@/lib/db/products';
import { useSettings } from '@/lib/db/settings';
import { errorMessage } from '@/lib/db/collections';
import { formatDate, num } from '@/lib/format';
import { copyText } from '@/lib/invoice';
import type { Product } from '@/lib/types';

export default function CampaignsPage() {
  const { data: customers, loading, error, denied } = useCustomers();
  const { data: products } = useProducts();
  const campaigns = useCampaigns();
  const { settings } = useSettings();
  const { isOwner } = useAuth();
  const actor = useActor();
  const toast = useToast();

  const [segment, setSegment] = useState<SegmentKey>('all');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState(TEMPLATES[0]!.body);
  const [skipRecent, setSkipRecent] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  const [rendering, setRendering] = useState(false);
  const [busy, setBusy] = useState(false);
  const [active, setActive] = useState<{ id: string; sentTo: string[] } | null>(null);

  const contactedLately = useMemo(() => recentlyContacted(campaigns.data, 7), [campaigns.data]);

  const recipients = useMemo(() => {
    const definition = SEGMENTS.find((s) => s.key === segment) ?? SEGMENTS[0]!;
    const selected = reachable(definition.select(customers));
    // Meta throttles marketing per user, and a shop that blasts weekly gets muted.
    return skipRecent ? selected.filter((c) => !contactedLately.has(c.id)) : selected;
  }, [customers, segment, skipRecent, contactedLately]);

  const withoutPhone = customers.length - reachable(customers).length;
  const offerProducts = useMemo(
    () => products.filter((p) => picked.includes(p.id)),
    [products, picked],
  );
  const sellable = useMemo(
    () => products.filter((p) => !p.isArchived).slice(0, 40),
    [products],
  );

  async function makeOffer() {
    if (offerProducts.length === 0) {
      toast.error('اختر منتجاً واحداً على الأقل لصورة العرض.');
      return;
    }
    setRendering(true);
    try {
      const blob = await renderOfferPng(
        offerProducts,
        settings,
        title.trim() || 'وصلنا جديد',
        `${num(offerProducts.length)} قطعة مختارة`,
      );
      if (!blob) throw new Error('render failed');
      const how = await shareOffer(blob);
      toast.success(how === 'shared' ? 'تم فتح المشاركة' : 'نزلت صورة العرض — أرفقها مع الرسالة');
    } catch {
      toast.error('تعذّر إنشاء صورة العرض.');
    } finally {
      setRendering(false);
    }
  }

  async function startQueue() {
    if (recipients.length === 0) {
      toast.error('لا يوجد عملاء في هذه الشريحة.');
      return;
    }
    setBusy(true);
    try {
      const id = await createCampaign(
        {
          title,
          message,
          segment: SEGMENTS.find((s) => s.key === segment)?.label ?? segment,
          recipientCount: recipients.length,
        },
        actor,
      );
      setActive({ id, sentTo: [] });
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر بدء الحملة.'));
    } finally {
      setBusy(false);
    }
  }

  if (denied) return <PermissionNotice collection="customers" isOwner={isOwner} />;
  if (error) return <ErrorBlock message={error} />;
  if (loading) return <SkeletonRows count={4} />;

  if (customers.length === 0) {
    return (
      <>
        <PageHeader title="حملات واتساب" />
        <div className="surface">
          <EmptyState
            icon={<IconUsers className="h-7 w-7" />}
            title="لا يوجد عملاء بعد"
            hint="أدخل رقم هاتف العميل عند تسجيل البيع، وسيُحفظ هنا تلقائياً وتقدر تراسله."
          />
        </div>
      </>
    );
  }

  if (active) {
    return (
      <>
        <PageHeader title="إرسال الحملة" subtitle={title || 'حملة بدون عنوان'} />
        <SendQueue
          campaignId={active.id}
          recipients={recipients}
          message={message}
          settings={settings}
          sentIds={active.sentTo}
          onDone={() => setActive(null)}
        />
      </>
    );
  }

  const preview = recipients[0]
    ? personalise(message, recipients[0], settings)
    : personalise(message, { ...customers[0]!, name: 'محمد' }, settings);

  return (
    <>
      <PageHeader
        title="حملات واتساب"
        subtitle={`${num(recipients.length)} عميل في الشريحة المختارة`}
      />

      {/* The honest constraint, stated once and up front rather than discovered. */}
      <div className="surface mb-3 border-accent-500/40 p-3.5">
        <p className="text-[0.85rem] font-bold text-accent-500">كيف يعمل الإرسال الجماعي مجاناً</p>
        <p className="mt-1.5 text-[0.82rem] leading-relaxed text-ink-600 dark:text-ink-300">
          واتساب لا يسمح لأي موقع بالإرسال نيابة عنك. أمامك طريقان مجانيان تماماً:
          <span className="font-bold"> القائمة البريدية</span> في تطبيق WhatsApp Business (رسالة واحدة
          تصل للجميع، لكن فقط لمن حفظ رقمك)، أو <span className="font-bold">طابور الإرسال</span> بالأسفل
          (يصل للجميع بلا شروط، بضغطة لكل عميل).
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3">
          {/* who */}
          <section className="surface p-4">
            <SectionTitle>1 · لمن ترسل</SectionTitle>
            <div className="grid gap-2 sm:grid-cols-2">
              {SEGMENTS.map((s) => {
                const count = reachable(s.select(customers)).length;
                return (
                  <button
                    key={s.key}
                    onClick={() => setSegment(s.key)}
                    className={`rounded-card border px-3 py-2.5 text-right transition
                      ${segment === s.key
                        ? 'border-brand-500 bg-brand-500/10'
                        : 'border-ink-200 hover:border-ink-300 dark:border-ink-700'}`}
                  >
                    <span className="flex items-center justify-between gap-2">
                      <span className="text-[0.88rem] font-bold">{s.label}</span>
                      <span className="tnum chip bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                        {num(count)}
                      </span>
                    </span>
                    <span className="mt-0.5 block text-[0.72rem] text-ink-400 dark:text-ink-500">{s.hint}</span>
                  </button>
                );
              })}
            </div>

            <label className="mt-3 flex items-center gap-2 text-[0.82rem] font-bold">
              <input
                type="checkbox"
                checked={skipRecent}
                onChange={(e) => setSkipRecent(e.target.checked)}
                className="h-4 w-4 accent-brand-500"
              />
              استثنِ من راسلته خلال آخر 7 أيام
            </label>

            {withoutPhone > 0 ? (
              <p className="tnum mt-2 flex items-center gap-1.5 text-[0.76rem] font-semibold text-warn">
                <IconAlert className="h-3.5 w-3.5" />
                {num(withoutPhone)} عميل بلا رقم هاتف — لن يصلهم شيء
              </p>
            ) : null}
          </section>

          {/* message */}
          <section className="surface p-4">
            <SectionTitle>2 · الرسالة</SectionTitle>
            <div className="mb-2.5 flex flex-wrap gap-1.5">
              {TEMPLATES.map((t) => (
                <button
                  key={t.key}
                  onClick={() => {
                    setMessage(t.body);
                    if (!title.trim()) setTitle(t.label);
                  }}
                  className="rounded-card border border-ink-200 px-2.5 py-1 text-[0.76rem] font-bold text-ink-500 transition hover:border-brand-500 hover:text-brand-500 dark:border-ink-700 dark:text-ink-400"
                >
                  {t.label}
                </button>
              ))}
            </div>

            <label className="label" htmlFor="c-title">
              عنوان الحملة (لك أنت، لا يظهر للعميل)
            </label>
            <input
              id="c-title"
              className="field mb-3"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="وصول شحنة مارس"
            />

            <label className="label" htmlFor="c-message">
              نص الرسالة
            </label>
            <textarea
              id="c-message"
              rows={7}
              className="field resize-y leading-relaxed"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
            />
            <p className="mt-1.5 text-[0.72rem] leading-relaxed text-ink-400 dark:text-ink-500">
              المتغيرات: <code className="font-mono">{'{الاسم}'}</code> ·{' '}
              <code className="font-mono">{'{المتجر}'}</code> ·{' '}
              <code className="font-mono">{'{الهاتف}'}</code> ·{' '}
              <code className="font-mono">{'{الرصيد}'}</code>
            </p>

            <div className="surface-sunken mt-3 p-3">
              <p className="mb-1.5 text-[0.72rem] font-bold text-ink-500 dark:text-ink-400">
                معاينة كما ستصل العميل
              </p>
              <pre className="whitespace-pre-wrap break-words font-sans text-[0.84rem] leading-relaxed text-ink-700 dark:text-ink-200">
                {preview}
              </pre>
            </div>
          </section>
        </div>

        <div className="space-y-3">
          {/* offer image */}
          <section className="surface p-4">
            <SectionTitle>3 · صورة العرض (اختياري)</SectionTitle>
            <p className="mb-2.5 text-[0.78rem] leading-relaxed text-ink-500 dark:text-ink-400">
              الملابس تُباع بالنظر. اختر المنتجات وسأولّد صورة بلوغو المتجر والأسعار ترفقها مع الرسالة.
            </p>

            <div className="max-h-56 space-y-1 overflow-y-auto pr-1">
              {sellable.map((p: Product) => (
                <label
                  key={p.id}
                  className="flex cursor-pointer items-center gap-2 rounded-card px-2 py-1.5 hover:bg-ink-100 dark:hover:bg-ink-800"
                >
                  <input
                    type="checkbox"
                    checked={picked.includes(p.id)}
                    onChange={(e) =>
                      setPicked((cur) => (e.target.checked ? [...cur, p.id] : cur.filter((id) => id !== p.id)))
                    }
                    className="h-4 w-4 accent-brand-500"
                  />
                  <span className="min-w-0 flex-1 truncate text-[0.84rem] font-semibold">{p.name}</span>
                </label>
              ))}
            </div>

            <Button
              variant="secondary"
              block
              className="mt-3"
              loading={rendering}
              disabled={offerProducts.length === 0}
              icon={<IconImage className="h-4 w-4" />}
              onClick={() => void makeOffer()}
            >
              أنشئ صورة العرض ({num(offerProducts.length)})
            </Button>
          </section>

          {/* broadcast path */}
          <section className="surface p-4">
            <SectionTitle>الطريق (أ) · القائمة البريدية</SectionTitle>
            <p className="mb-3 text-[0.78rem] leading-relaxed text-ink-500 dark:text-ink-400">
              رسالة واحدة تصل لكل القائمة دفعة واحدة، مجاناً. <span className="font-bold text-warn">لكنها
              تصل فقط لمن حفظ رقمك</span> — لذلك صدّر جهات الاتصال أولاً وانشرها على عملائك.
            </p>

            <div className="grid gap-2">
              <Button
                variant="secondary"
                icon={<IconDownload className="h-4 w-4" />}
                onClick={() => {
                  downloadVCard(recipients, settings, `mtozero-contacts-${recipients.length}`);
                  toast.success('نزل ملف جهات الاتصال — افتحه على الهاتف لحفظهم دفعة واحدة');
                }}
              >
                تصدير جهات الاتصال (.vcf)
              </Button>
              <Button
                variant="secondary"
                icon={<IconCopy className="h-4 w-4" />}
                onClick={async () => {
                  const ok = await copyText(numbersList(recipients));
                  toast[ok ? 'success' : 'error'](ok ? 'نُسخت الأرقام' : 'تعذّر النسخ');
                }}
              >
                نسخ الأرقام
              </Button>
              <Button
                variant="secondary"
                icon={<IconCopy className="h-4 w-4" />}
                onClick={async () => {
                  const ok = await copyText(preview);
                  toast[ok ? 'success' : 'error'](ok ? 'نُسخت الرسالة' : 'تعذّر النسخ');
                }}
              >
                نسخ نص الرسالة
              </Button>
            </div>

            {recipients.length > BROADCAST_LIMIT ? (
              <p className="tnum mt-2.5 flex items-start gap-1.5 text-[0.76rem] font-semibold text-warn">
                <IconAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                القائمة الواحدة تقبل {num(BROADCAST_LIMIT)} عميلاً كحد أقصى — قسّمهم على{' '}
                {num(Math.ceil(recipients.length / BROADCAST_LIMIT))} قوائم.
              </p>
            ) : null}
          </section>

          {/* queue path */}
          <section className="surface-key p-4">
            <SectionTitle>الطريق (ب) · طابور الإرسال</SectionTitle>
            <p className="mb-3 text-[0.78rem] leading-relaxed text-ink-500 dark:text-ink-400">
              يصل <span className="font-bold">للجميع بلا شروط</span>. النظام يفتح محادثة كل عميل
              والرسالة جاهزة باسمه، ويتذكر أين وصلت.
            </p>
            <Button
              block
              size="lg"
              loading={busy}
              disabled={recipients.length === 0}
              icon={<IconWhatsApp className="h-5 w-5" />}
              onClick={() => void startQueue()}
            >
              ابدأ الإرسال لـ {num(recipients.length)} عميل
            </Button>
          </section>

          {/* history */}
          {campaigns.data.length > 0 ? (
            <section className="surface p-4">
              <SectionTitle>الحملات السابقة</SectionTitle>
              <ul className="divide-y divide-ink-200 dark:divide-ink-800">
                {campaigns.data.slice(0, 6).map((c) => (
                  <li key={c.id} className="flex items-center gap-2 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.86rem] font-bold">{c.title}</span>
                      <span className="tnum block text-[0.72rem] text-ink-400 dark:text-ink-500">
                        {formatDate(c.createdAt)} · {c.segment}
                      </span>
                    </span>
                    <span className="tnum chip shrink-0 bg-good/15 text-good">
                      <IconCheck className="h-3 w-3" />
                      {num(c.sentTo.length)}/{num(c.recipientCount)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
