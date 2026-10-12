'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState, type FormEvent } from 'react';
import { Brand } from '@/components/layout/Brand';
import { Button } from '@/components/ui/Button';
import { LoadingBlock } from '@/components/ui/Feedback';
import { IconCopy, IconCoupon, IconWhatsApp } from '@/components/ui/Icons';
import { getCard, promoValueText, usePublicPromos } from '@/lib/db/promos';
import { formatDate, money, num, whatsappNumber } from '@/lib/format';
import { copyText } from '@/lib/invoice';
import type { CustomerCard } from '@/lib/types';

const PHONE_KEY = 'mtozero-card-phone';

/**
 * The customer's own page, open to anyone without signing in: their wallet
 * balance, their referral code, and the offers running now.
 *
 * Looked up by phone number, as the owner chose. The card document behind it
 * holds only a first name, the code and the balance — nothing else about the
 * customer is reachable from here — and the rules allow fetching one card by
 * its exact number but never listing them.
 */
export default function CardPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <CustomerCardView />
    </Suspense>
  );
}

function CustomerCardView() {
  const params = useSearchParams();
  const [phone, setPhone] = useState('');
  const [card, setCard] = useState<CustomerCard | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'found' | 'missing' | 'error'>('idle');
  const offers = usePublicPromos();

  const lookup = useCallback(async (raw: string) => {
    const normalized = whatsappNumber(raw);
    if (!normalized || normalized.length < 12) {
      setState('missing');
      setCard(null);
      return;
    }
    setState('loading');
    try {
      const found = await getCard(normalized);
      setCard(found);
      setState(found ? 'found' : 'missing');
      if (found) {
        try {
          window.localStorage.setItem(PHONE_KEY, raw);
        } catch {
          // Not remembered; nothing lost.
        }
      }
    } catch {
      setState('error');
    }
  }, []);

  // Opened from an invoice link (?p=…) or by a returning visitor on the same phone.
  useEffect(() => {
    let initial = params.get('p') ?? '';
    if (!initial) {
      try {
        initial = window.localStorage.getItem(PHONE_KEY) ?? '';
      } catch {
        initial = '';
      }
    }
    if (initial) {
      setPhone(initial);
      void lookup(initial);
    }
  }, [params, lookup]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void lookup(phone);
  }

  const shareMessage = card
    ? `جرّب MTOZERO للأحذية والملابس في الأبيض 👟\nقول ليهم كودي ${card.code} لما تشتري.`
    : '';

  return (
    <div className="app-height bg-page px-4 pb-12 pt-8">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-6 flex flex-col items-center text-center">
          <Brand />
          <h1 className="mt-4 text-[1.5rem]">بطاقتك</h1>
          <p className="mt-1 text-[0.9rem] font-semibold text-fg-3">رصيدك وكود الإحالة حقك في أي وقت</p>
        </div>

        <label className="label" htmlFor="card-phone">
          رقم هاتفك
        </label>
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            id="card-phone"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="field flex-1 text-left text-[1.05rem]"
            placeholder="09xxxxxxxx"
          />
          <Button type="submit" variant="ink" loading={state === 'loading'}>
            اعرض
          </Button>
        </form>

        {state === 'missing' ? (
          <p className="mt-3 rounded-card border border-line-strong bg-surface px-3.5 py-3 text-[0.9rem] font-semibold text-fg-2">
            ما لقينا بطاقة بالرقم دا. اتأكد من الرقم، أو اشتري مرة واحدة وأدّي رقمك للبائع — البطاقة بتتعمل
            براها.
          </p>
        ) : null}
        {state === 'error' ? (
          <p className="mt-3 rounded-card border border-bad bg-surface px-3.5 py-3 text-[0.9rem] font-semibold text-bad">
            ما قدرنا نتصل. اتأكد من الشبكة وجرّب تاني.
          </p>
        ) : null}

        {card && state === 'found' ? (
          <div className="mt-5 space-y-4">
            <section className="ticket rounded-card border border-line-strong px-5 py-5">
              <p className="text-[0.95rem] font-bold text-fg-2">أهلاً {card.firstName}</p>
              <p className="mt-2 text-[0.8rem] font-bold text-fg-3">رصيدك للشراء</p>
              <p className="tnum font-display text-num-xl font-black text-brand-500">{money(card.balance)}</p>
              <p className="mt-1 text-[0.82rem] font-semibold text-fg-3">
                يتخصم من فاتورتك الجاية — قول للبائع «استخدم رصيدي».
              </p>
              <div className="tnum mt-3 flex gap-5 border-t border-dashed border-line-strong pt-3 text-[0.84rem] font-bold text-fg-2">
                <span>كسبت لحدي هسي {money(card.earned)}</span>
                <span>جبت {num(card.referrals)} صاحب</span>
              </div>
            </section>

            <section className="rounded-card border-2 border-dashed border-fg bg-surface px-5 py-4 text-center">
              <p className="text-[0.85rem] font-bold text-fg-3">كود الإحالة حقك</p>
              <p dir="ltr" className="my-1 font-display text-[2.2rem] font-black tracking-widest text-brand-500">
                {card.code}
              </p>
              <p className="text-[0.86rem] font-semibold text-fg-2">
                أي صاحب يشتري ويقول الكود دا، إنت بتكسب رصيد خصم.
              </p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(shareMessage)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="press inline-flex h-12 items-center justify-center gap-2 rounded-card bg-good font-display font-extrabold text-white"
                >
                  <IconWhatsApp className="h-5 w-5" />
                  شارك
                </a>
                <Button
                  variant="secondary"
                  icon={<IconCopy className="h-4 w-4" />}
                  onClick={() => void copyText(card.code)}
                >
                  نسخ الكود
                </Button>
              </div>
            </section>
          </div>
        ) : null}

        {offers.data.length > 0 ? (
          <section className="mt-6">
            <p className="ledger-head">عروض شغّالة هسي</p>
            <ul className="space-y-2">
              {offers.data
                .filter((p) => !p.expiresAt || p.expiresAt.toMillis() > Date.now())
                .map((p) => (
                  <li key={p.code} className="surface flex items-center gap-3 p-3.5">
                    <IconCoupon className="h-7 w-7 shrink-0 text-brand-500" />
                    <div className="min-w-0 flex-1">
                      <p className="font-bold">{p.name}</p>
                      <p className="tnum text-[0.82rem] font-semibold text-fg-3">
                        {promoValueText(p)}
                        {p.minTotal > 0 ? ` · من ${money(p.minTotal)}` : ''}
                        {p.expiresAt ? ` · حتى ${formatDate(p.expiresAt)}` : ''}
                      </p>
                    </div>
                    <span dir="ltr" className="shrink-0 rounded-card border-2 border-dashed border-fg px-2 py-1 font-display font-black">
                      {p.code}
                    </span>
                  </li>
                ))}
            </ul>
          </section>
        ) : null}
      </div>
    </div>
  );
}
