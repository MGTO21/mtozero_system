'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Button, Stepper } from '@/components/ui/Button';
import { IconTrash, IconWhatsApp } from '@/components/ui/Icons';
import { errorMessage } from '@/lib/db/collections';
import { deliveryFeeFor, orderWhatsappText, placeOrder } from '@/lib/db/store';
import { money } from '@/lib/format';
import { cartSubtotal, clearCart, setCartQty, useCart } from '@/lib/store/cart';
import type { StoreConfig, StoreOrder } from '@/lib/types';
import { FreeDeliveryMeter } from './FreeDeliveryMeter';

const DETAILS_KEY = 'mtozero-store-customer-v1';

/**
 * Basket and order form on one page: on a phone every extra screen is a
 * customer lost. Submitting does two things at once — records the order in the
 * shop's system, and opens WhatsApp to the shop with every detail written out,
 * because that is how customers here expect to confirm an order.
 */
export function CartCheckout({ config }: { config: StoreConfig }) {
  const items = useCart();
  const [mounted, setMounted] = useState(false);
  const [fulfilment, setFulfilment] = useState<'delivery' | 'pickup'>('delivery');
  const [form, setForm] = useState({ name: '', phone: '', area: '', address: '', notes: '', promo: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<StoreOrder | null>(null);

  // Returning customers do not type their details twice.
  useEffect(() => {
    setMounted(true);
    try {
      const saved = JSON.parse(window.localStorage.getItem(DETAILS_KEY) ?? 'null');
      if (saved) setForm((f) => ({ ...f, ...saved, notes: '', promo: '' }));
    } catch {
      // Nothing saved.
    }
  }, []);

  const subtotal = cartSubtotal(items);
  const delivery = deliveryFeeFor(config, subtotal, fulfilment);
  const total = subtotal + delivery;
  const patch = (p: Partial<typeof form>) => setForm((f) => ({ ...f, ...p }));

  async function submit() {
    setBusy(true);
    setError(null);
    try {
      const order = await placeOrder(
        {
          items: items.map((i) => ({ productId: i.productId, name: i.name, size: i.size, qty: i.qty, price: i.price })),
          fulfilment,
          promoCode: form.promo,
          customer: { name: form.name, phone: form.phone, area: form.area, address: form.address, notes: form.notes },
        },
        config,
      );
      try {
        window.localStorage.setItem(
          DETAILS_KEY,
          JSON.stringify({ name: form.name, phone: form.phone, area: form.area, address: form.address }),
        );
      } catch {
        // Not remembered.
      }
      const trackUrl = `${window.location.origin}/order?id=${order.id}`;
      const waUrl = `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(orderWhatsappText(order, trackUrl))}`;
      clearCart();
      setPlaced(order);
      window.scrollTo({ top: 0 });
      // Straight into WhatsApp with the order written out. The same tab is sent
      // there rather than a new one: phones block a window opened after an await
      // as a popup, while a navigation hands off to the WhatsApp app directly.
      // The confirmation screen stays behind it with a button to send again.
      if (config.whatsapp) window.location.assign(waUrl);
    } catch (err) {
      setError(errorMessage(err, 'ما قدرنا نرسل الطلب.'));
    } finally {
      setBusy(false);
    }
  }

  if (placed) {
    const trackUrl = `/order?id=${placed.id}`;
    const waUrl = `https://wa.me/${config.whatsapp}?text=${encodeURIComponent(
      orderWhatsappText(placed, `${typeof window !== 'undefined' ? window.location.origin : ''}${trackUrl}`),
    )}`;
    return (
      <div className="mx-auto max-w-lg px-4 py-12 text-center">
        <span className="stamp animate-stamp border-good text-[1.1rem] text-good">اتسجّل طلبك</span>
        <h1 className="mt-5 text-[2rem]">شكراً {placed.customer.name.split(' ')[0]}</h1>
        <p className="mt-2 text-fg-2">
          رقم طلبك <span dir="ltr" className="font-display font-black text-fg">{placed.number}</span>. حنتواصل معاك قريب
          لتأكيد الطلب وموعد {placed.fulfilment === 'delivery' ? 'التوصيل' : 'الاستلام'}.
        </p>
        <p className="tnum mt-4 font-display text-[1.6rem] font-black">{money(placed.total)}</p>
        <p className="text-[0.88rem] text-fg-3">الدفع عند الاستلام</p>
        <div className="mt-7 grid gap-2">
          {config.whatsapp ? (
            <a
              href={waUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="press inline-flex h-14 items-center justify-center gap-2 rounded-card bg-good font-display text-[1.05rem] font-black text-white"
            >
              <IconWhatsApp className="h-5 w-5" />
              أرسل الطلب واتساب
            </a>
          ) : null}
          <Link href={trackUrl} className="press inline-flex h-12 items-center justify-center rounded-card border border-line-strong font-display font-extrabold">
            تتبع طلبك
          </Link>
          <Link href="/shop" className="mt-2 text-[0.9rem] font-bold text-fg-2 underline">
            واصل التسوق
          </Link>
        </div>
      </div>
    );
  }

  if (!mounted) return <div className="py-24" />;

  if (items.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-4 py-20 text-center">
        <h1 className="text-[1.8rem]">السلة فاضية</h1>
        <p className="mt-2 text-fg-3">اختار من المنتجات وضيف مقاسك.</p>
        <Link href="/shop" className="press mt-6 inline-flex h-12 items-center rounded-card bg-fg px-6 font-display font-black text-page">
          تسوّق الآن
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto grid max-w-7xl gap-8 px-4 pt-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <section>
        <h1 className="store-title mb-5">السلة</h1>
        {fulfilment === 'delivery' && config.freeDeliveryOver > 0 ? (
          <div className="mb-5">
            <FreeDeliveryMeter subtotal={subtotal} freeOver={config.freeDeliveryOver} />
          </div>
        ) : null}
        <ul className="surface perf-rows overflow-hidden">
          {items.map((i) => (
            <li key={`${i.productId}-${i.size}`} className="flex gap-3 p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={i.image} alt="" className="h-24 w-20 shrink-0 rounded-card bg-sunken object-cover" />
              <div className="min-w-0 flex-1">
                <Link href={`/p/${i.productId}`} className="line-clamp-2 font-bold hover:underline">
                  {i.name}
                </Link>
                <p className="tnum text-[0.84rem] font-semibold text-fg-3">
                  مقاس {i.size} · {money(i.price)}
                </p>
                <div className="mt-2 flex items-center justify-between gap-2">
                  <div className="w-32">
                    <Stepper size="sm" value={i.qty} max={10} onChange={(q) => setCartQty(i.productId, i.size, q)} label="الكمية" />
                  </div>
                  <button
                    type="button"
                    onClick={() => setCartQty(i.productId, i.size, 0)}
                    aria-label="حذف"
                    className="press inline-flex h-9 w-9 items-center justify-center rounded-card text-fg-3 hover:bg-bad/10 hover:text-bad"
                  >
                    <IconTrash className="h-4 w-4" />
                  </button>
                </div>
              </div>
              <p className="tnum shrink-0 font-display font-black">{money(i.price * i.qty)}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="lg:pt-[3.75rem]">
        <div className="surface space-y-4 p-4">
          <p className="font-display text-[1.2rem] font-black">بيانات الطلب</p>

          {config.pickupEnabled ? (
            <div className="seg" role="group" aria-label="طريقة الاستلام">
              <button type="button" aria-pressed={fulfilment === 'delivery'} onClick={() => setFulfilment('delivery')}>
                توصيل
              </button>
              <button type="button" aria-pressed={fulfilment === 'pickup'} onClick={() => setFulfilment('pickup')}>
                استلام من المحل
              </button>
            </div>
          ) : null}

          <Field label="الاسم" value={form.name} onChange={(v) => patch({ name: v })} autoComplete="name" />
          <Field
            label="رقم الهاتف (واتساب)"
            value={form.phone}
            onChange={(v) => patch({ phone: v })}
            autoComplete="tel"
            inputMode="tel"
            ltr
            placeholder="09xxxxxxxx"
          />
          {fulfilment === 'delivery' ? (
            <>
              <Field label="المنطقة / الحي" value={form.area} onChange={(v) => patch({ area: v })} placeholder="مثلاً: حي القبة" />
              <Field
                label="العنوان بالتفصيل"
                value={form.address}
                onChange={(v) => patch({ address: v })}
                placeholder="الشارع، أقرب معلم، لون البيت…"
                multiline
              />
            </>
          ) : (
            <p className="rounded-card bg-sunken px-3 py-2.5 text-[0.88rem] text-fg-2">تستلم من المحل: {config.address}</p>
          )}
          <Field label="ملاحظات (اختياري)" value={form.notes} onChange={(v) => patch({ notes: v })} placeholder="وقت مناسب للتوصيل…" />
          <Field label="كود خصم (اختياري)" value={form.promo} onChange={(v) => patch({ promo: v.toUpperCase() })} ltr />

          <dl className="space-y-1.5 border-t border-dashed border-line-strong pt-3 text-[0.95rem]">
            <div className="flex justify-between">
              <dt className="text-fg-2">المنتجات</dt>
              <dd className="tnum font-bold">{money(subtotal)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-fg-2">{fulfilment === 'delivery' ? 'التوصيل' : 'الاستلام'}</dt>
              <dd className="tnum font-bold">{delivery > 0 ? money(delivery) : 'مجاني'}</dd>
            </div>
            {fulfilment === 'delivery' && delivery > 0 && config.freeDeliveryOver > 0 ? (
              <p className="tnum text-[0.8rem] font-bold text-good">
                ضيف بـ{money(config.freeDeliveryOver - subtotal)} والتوصيل يبقى مجاني
              </p>
            ) : null}
            <div className="flex items-baseline justify-between border-t-[1.5px] border-fg pt-2">
              <dt className="font-display font-black">الإجمالي</dt>
              <dd className="tnum font-display text-[1.6rem] font-black text-brand-500">{money(total)}</dd>
            </div>
            {form.promo ? <p className="text-[0.8rem] text-fg-3">خصم الكود بيتحسب عند تأكيد الطلب.</p> : null}
          </dl>

          {error ? <p className="rounded-card bg-bad/10 px-3 py-2 text-[0.9rem] font-bold text-bad">{error}</p> : null}
          {!config.acceptingOrders ? (
            <p className="rounded-card bg-warn/10 px-3 py-2 text-[0.9rem] font-bold text-warn">الطلبات متوقفة مؤقتاً — تواصل معانا واتساب.</p>
          ) : null}

          <Button block size="lg" loading={busy} disabled={!config.acceptingOrders} onClick={() => void submit()} icon={<IconWhatsApp className="h-5 w-5" />}>
            أكّد الطلب
          </Button>
          <p className="text-center text-[0.78rem] text-fg-3">
            الدفع عند الاستلام. بعد التأكيد يتفتح واتساب برسالة فيها طلبك كامل — اضغط إرسال.
          </p>
        </div>
      </section>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  ltr,
  multiline,
  autoComplete,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  ltr?: boolean;
  multiline?: boolean;
  autoComplete?: string;
  inputMode?: 'tel' | 'text';
}) {
  const id = `f-${label}`;
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
      </label>
      {multiline ? (
        <textarea id={id} rows={2} className="field resize-none" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
      ) : (
        <input
          id={id}
          dir={ltr ? 'ltr' : undefined}
          className={`field ${ltr ? 'text-left' : ''}`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={autoComplete}
          inputMode={inputMode}
        />
      )}
    </div>
  );
}
