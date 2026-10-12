'use client';

import { useMemo, useState } from 'react';
import { useActor } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/DateRange';
import { EmptyState, ErrorBlock, Figure, SkeletonRows, Stamp } from '@/components/ui/Feedback';
import { IconCopy, IconCoupon, IconPlus, IconWhatsApp } from '@/components/ui/Icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { Sheet } from '@/components/ui/Sheet';
import { errorMessage } from '@/lib/db/collections';
import {
  createPromo,
  generateCode,
  normalizeCode,
  promoValueText,
  setPromoFlags,
  usePromos,
  type PromoInput,
} from '@/lib/db/promos';
import { useSettings } from '@/lib/db/settings';
import { dateKey, formatDate, money, num, parseDateKey } from '@/lib/format';
import { copyText } from '@/lib/invoice';
import { PROMO_KIND_LABEL, type Promo, type PromoKind } from '@/lib/types';

type Filter = 'live' | 'off' | 'all';

/** Where a code stands right now, for the stamp on its row. */
function stateOf(p: Promo): { label: string; tone: 'good' | 'warn' | 'bad' | 'muted'; live: boolean } {
  const expired = p.expiresAt ? p.expiresAt.toMillis() < Date.now() : false;
  if (!p.active) return { label: 'موقوف', tone: 'muted', live: false };
  if (expired) return { label: 'منتهي', tone: 'bad', live: false };
  if (p.maxUses > 0 && p.uses >= p.maxUses) return { label: 'اكتمل', tone: 'warn', live: false };
  if (p.kind === 'gift' && p.balance <= 0) return { label: 'رصيدها خلص', tone: 'warn', live: false };
  return { label: 'شغّال', tone: 'good', live: true };
}

/** Ready-to-send WhatsApp text for a code. */
function shareText(p: Promo, shopName: string): string {
  const lines = [`${p.name}`, '', `استخدم الكود: ${p.code}`, `وتحصل على ${promoValueText(p)}`];
  if (p.minTotal > 0) lines.push(`لأي فاتورة من ${money(p.minTotal)} وأكثر`);
  if (p.expiresAt) lines.push(`ساري لحدي ${formatDate(p.expiresAt)}`);
  if (p.oncePerCustomer) lines.push('مرة واحدة لكل عميل');
  lines.push('', shopName);
  return lines.join('\n');
}

export default function OffersPage() {
  const { data: promos, loading, error } = usePromos();
  const { settings } = useSettings();
  const actor = useActor();
  const toast = useToast();
  const [filter, setFilter] = useState<Filter>('live');
  const [creating, setCreating] = useState(false);

  const visible = useMemo(() => {
    if (filter === 'all') return promos;
    return promos.filter((p) => (filter === 'live' ? stateOf(p).live : !stateOf(p).live));
  }, [promos, filter]);

  const live = promos.filter((p) => stateOf(p).live).length;
  const uses = promos.reduce((sum, p) => sum + p.uses, 0);
  const giftOutstanding = promos.filter((p) => p.kind === 'gift' && p.active).reduce((s, p) => s + p.balance, 0);

  async function toggle(p: Promo, flags: { active?: boolean; public?: boolean }) {
    try {
      await setPromoFlags(p, flags, actor);
    } catch (err) {
      toast.error(errorMessage(err));
    }
  }

  return (
    <>
      <PageHeader
        title="العروض والكوبونات"
        subtitle="أكواد خصم، عروض، وقسائم هدية بأي قيمة"
        action={
          <Button variant="ink" size="sm" icon={<IconPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>
            كود جديد
          </Button>
        }
      />

      {!loading && promos.length > 0 ? (
        <div className="surface mb-4 grid grid-cols-3 gap-4 p-4">
          <Figure label="أكواد شغّالة" value={num(live)} />
          <Figure label="مرات الاستخدام" value={num(uses)} />
          <Figure label="رصيد قسائم لم يُصرف" value={money(giftOutstanding)} tone={giftOutstanding > 0 ? 'warn' : undefined} />
        </div>
      ) : null}

      <div className="scroller mb-3 sm:mx-0 sm:px-0">
        <Pill active={filter === 'live'} onClick={() => setFilter('live')} count={live}>
          الشغّالة
        </Pill>
        <Pill active={filter === 'off'} onClick={() => setFilter('off')} count={promos.length - live}>
          المنتهية والموقوفة
        </Pill>
        <Pill active={filter === 'all'} onClick={() => setFilter('all')} count={promos.length}>
          الكل
        </Pill>
      </div>

      {error ? <ErrorBlock message={error} /> : null}

      {loading ? (
        <SkeletonRows count={3} />
      ) : promos.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={<IconCoupon />}
            title="ما في أكواد لسه"
            hint="اعمل كود لعرض العيد، أو خصم لأول شراء، أو قسيمة هدية بأي مبلغ — وابعتها للعملاء واتساب."
            action={
              <Button variant="ink" icon={<IconPlus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                أول كود
              </Button>
            }
          />
        </div>
      ) : visible.length === 0 ? (
        <p className="surface py-8 text-center text-[0.9rem] font-semibold text-fg-3">ما في أكواد هنا.</p>
      ) : (
        <ul className="space-y-2">
          {visible.map((p) => {
            const state = stateOf(p);
            return (
              <li key={p.code} className={`surface p-3.5 ${state.live ? '' : 'opacity-75'}`}>
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p dir="ltr" className="text-right font-display text-[1.25rem] font-black tracking-wider">
                      {p.code}
                    </p>
                    <p className="truncate font-bold">{p.name}</p>
                    <p className="tnum mt-0.5 text-[0.82rem] font-semibold text-fg-3">
                      {PROMO_KIND_LABEL[p.kind]} · {promoValueText(p)}
                      {p.minTotal > 0 ? ` · من ${money(p.minTotal)}` : ''}
                    </p>
                  </div>
                  <Stamp tone={state.tone}>{state.label}</Stamp>
                </div>

                <div className="tnum mt-2.5 flex flex-wrap gap-x-4 gap-y-1 border-t border-dashed border-line-strong pt-2.5 text-[0.82rem] font-bold text-fg-2">
                  <span>
                    استُخدم {num(p.uses)}
                    {p.maxUses > 0 ? ` من ${num(p.maxUses)}` : ' مرة'}
                  </span>
                  {p.kind === 'gift' ? <span className="text-warn">الباقي {money(p.balance)}</span> : null}
                  {p.expiresAt ? <span>حتى {formatDate(p.expiresAt)}</span> : <span>بدون انتهاء</span>}
                  {p.oncePerCustomer ? <span>مرة لكل عميل</span> : null}
                  {p.public ? <span className="text-good">ظاهر في بطاقات العملاء</span> : null}
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  <a
                    href={`https://wa.me/?text=${encodeURIComponent(shareText(p, settings.shopName))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-card bg-good text-[0.85rem] font-extrabold text-white"
                  >
                    <IconWhatsApp className="h-4 w-4" />
                    شارك
                  </a>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="h-10"
                    icon={<IconCopy className="h-4 w-4" />}
                    onClick={async () => {
                      const ok = await copyText(p.code);
                      toast[ok ? 'success' : 'error'](ok ? `نُسخ ${p.code}` : 'تعذّر النسخ');
                    }}
                  >
                    نسخ
                  </Button>
                  <Button variant="secondary" size="sm" className="h-10" onClick={() => void toggle(p, { public: !p.public })}>
                    {p.public ? 'إخفاء من العملاء' : 'إظهار للعملاء'}
                  </Button>
                  <Button variant="ghost" size="sm" className="h-10" onClick={() => void toggle(p, { active: !p.active })}>
                    {p.active ? 'إيقاف' : 'تفعيل'}
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <PromoForm open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

const EMPTY: PromoInput = {
  code: '',
  name: '',
  kind: 'percent',
  value: 10,
  minTotal: 0,
  maxDiscount: 0,
  maxUses: 0,
  oncePerCustomer: false,
  expiresAt: null,
  active: true,
  public: false,
};

function PromoForm({ open, onClose }: { open: boolean; onClose: () => void }) {
  const actor = useActor();
  const toast = useToast();
  const [form, setForm] = useState<PromoInput>({ ...EMPTY, code: generateCode() });
  const [expiry, setExpiry] = useState('');
  const [busy, setBusy] = useState(false);
  const patch = (p: Partial<PromoInput>) => setForm((f) => ({ ...f, ...p }));

  async function save() {
    setBusy(true);
    try {
      const code = await createPromo({ ...form, expiresAt: expiry ? endOfDayOf(expiry) : null }, actor);
      toast.success(`الكود ${code} جاهز — شاركه مع العملاء`);
      setForm({ ...EMPTY, code: generateCode() });
      setExpiry('');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر حفظ الكود.'));
    } finally {
      setBusy(false);
    }
  }

  const kinds: [PromoKind, string][] = [
    ['percent', 'نسبة %'],
    ['fixed', 'مبلغ ثابت'],
    ['gift', 'قسيمة هدية'],
  ];

  return (
    <Sheet
      open={open}
      onClose={onClose}
      tall
      title="كود جديد"
      subtitle="العميل يكتبه أو يوريك ليهو عند الدفع"
      footer={
        <Button block size="lg" variant="ink" loading={busy} onClick={() => void save()}>
          حفظ الكود
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <p className="label">النوع</p>
          <div className="seg">
            {kinds.map(([k, label]) => (
              <button key={k} type="button" aria-pressed={form.kind === k} onClick={() => patch({ kind: k })}>
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-[0.8rem] text-fg-3">
            {form.kind === 'percent'
              ? 'نسبة من الفاتورة — مثلاً 15% في العيد.'
              : form.kind === 'fixed'
                ? 'مبلغ ثابت يتخصم — مثلاً 5,000 ج لأي فاتورة فوق 30,000.'
                : 'قسيمة برصيد: تتصرف على مراحل في أكتر من فاتورة لحدي ما الرصيد يخلص. مناسبة كهدية لزول.'}
          </p>
        </div>

        <div>
          <label className="label" htmlFor="p-name">
            اسم العرض
          </label>
          <input
            id="p-name"
            className="field"
            value={form.name}
            onChange={(e) => patch({ name: e.target.value })}
            placeholder={form.kind === 'gift' ? 'هدية عيد ميلاد سارة' : 'عرض العيد'}
          />
        </div>

        <div>
          <label className="label" htmlFor="p-code">
            الكود
          </label>
          <div className="flex gap-2">
            <input
              id="p-code"
              dir="ltr"
              className="field flex-1 text-left font-display font-black tracking-wider"
              value={form.code}
              onChange={(e) => patch({ code: normalizeCode(e.target.value) })}
            />
            <Button variant="secondary" onClick={() => patch({ code: generateCode() })}>
              توليد
            </Button>
          </div>
          <p className="mt-1 text-[0.78rem] text-fg-3">تقدر تكتب كود سهل زي EID25، أو تخلي النظام يولّد واحد.</p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="p-value">
              {form.kind === 'percent' ? 'النسبة %' : form.kind === 'gift' ? 'قيمة القسيمة' : 'مبلغ الخصم'}
            </label>
            <input
              id="p-value"
              type="number"
              inputMode="numeric"
              min={1}
              className="field tnum text-center font-display text-num font-black"
              value={form.value || ''}
              onChange={(e) => patch({ value: Number(e.target.value) || 0 })}
            />
          </div>
          <div>
            <label className="label" htmlFor="p-min">
              أقل فاتورة
            </label>
            <input
              id="p-min"
              type="number"
              inputMode="numeric"
              min={0}
              className="field tnum text-center"
              value={form.minTotal || ''}
              placeholder="بدون"
              onChange={(e) => patch({ minTotal: Number(e.target.value) || 0 })}
            />
          </div>
          {form.kind === 'percent' ? (
            <div>
              <label className="label" htmlFor="p-cap">
                أقصى خصم
              </label>
              <input
                id="p-cap"
                type="number"
                inputMode="numeric"
                min={0}
                className="field tnum text-center"
                value={form.maxDiscount || ''}
                placeholder="بدون حد"
                onChange={(e) => patch({ maxDiscount: Number(e.target.value) || 0 })}
              />
            </div>
          ) : null}
          {form.kind !== 'gift' ? (
            <div>
              <label className="label" htmlFor="p-uses">
                عدد مرات الاستخدام
              </label>
              <input
                id="p-uses"
                type="number"
                inputMode="numeric"
                min={0}
                className="field tnum text-center"
                value={form.maxUses || ''}
                placeholder="بدون حد"
                onChange={(e) => patch({ maxUses: Number(e.target.value) || 0 })}
              />
            </div>
          ) : null}
          <div>
            <label className="label" htmlFor="p-exp">
              ينتهي في
            </label>
            <input
              id="p-exp"
              type="date"
              min={dateKey(new Date())}
              className="field tnum"
              value={expiry}
              onChange={(e) => setExpiry(e.target.value)}
            />
          </div>
        </div>

        <div className="surface-sunken divide-y divide-line">
          {form.kind !== 'gift' ? (
            <Toggle
              label="مرة واحدة لكل عميل"
              hint="يحتاج رقم هاتف العميل عند البيع"
              checked={form.oncePerCustomer}
              onChange={(v) => patch({ oncePerCustomer: v })}
            />
          ) : null}
          <Toggle
            label="إظهار في بطاقات العملاء"
            hint="يظهر كعرض شغّال لكل عميل يفتح بطاقته"
            checked={form.public}
            onChange={(v) => patch({ public: v })}
          />
        </div>
      </div>
    </Sheet>
  );
}

function endOfDayOf(key: string): Date {
  const d = parseDateKey(key) ?? new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function Toggle({
  label,
  hint,
  checked,
  onChange,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-3 px-3.5 py-3">
      <span className="min-w-0 flex-1">
        <span className="block font-bold">{label}</span>
        <span className="block text-[0.78rem] text-fg-3">{hint}</span>
      </span>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-6 w-6 accent-[rgb(var(--fg))]" />
    </label>
  );
}
