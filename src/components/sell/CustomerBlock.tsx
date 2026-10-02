'use client';

import { useEffect, useMemo, useState } from 'react';
import { IconCheck, IconSearch, IconUserCircle, IconUsers, IconX } from '@/components/ui/Icons';
import { findCustomerByPhone, useCustomers } from '@/lib/db/customers';
import { money, whatsappNumber } from '@/lib/format';
import type { Customer } from '@/lib/types';

export interface CustomerSelection {
  name: string;
  phone: string;
  referredByCode: string;
  /** Existing record matched by phone, if any. */
  matched: Customer | null;
  creditUsed: number;
}

interface Props {
  value: CustomerSelection;
  onChange: (next: CustomerSelection) => void;
  /** Ticket value, so credit can never exceed what is owed. */
  maxCredit: number;
  /** Name becomes mandatory once the sale is on credit. */
  nameRequired: boolean;
}

/**
 * Customer capture during a sale. Typing a phone number looks the person up, which
 * is what turns the sales log into a marketing list without any extra data entry.
 */
export function CustomerBlock({ value, onChange, maxCredit, nameRequired }: Props) {
  const [looking, setLooking] = useState(false);
  const [lookup, setLookup] = useState('');
  const { data: customers } = useCustomers();

  /**
   * Returning customers are found by name as well as by number, because the seller
   * knows the person, not their phone — retyping it from memory was the whole
   * friction. The list is already in memory from the live listener, so matching is
   * instant and works with no connection.
   */
  const suggestions = useMemo(() => {
    const q = lookup.trim().toLowerCase();
    if (!q || value.matched) return [];
    const digits = q.replace(/\D/g, '');
    return customers
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          (digits.length >= 3 && c.phone.includes(digits)) ||
          c.referralCode.toLowerCase() === q,
      )
      .slice(0, 5);
  }, [customers, lookup, value.matched]);

  /** Fills the whole block from an existing record — no retyping, no lookup round trip. */
  function pick(customer: Customer) {
    setLookup('');
    onChange({
      ...value,
      name: customer.name,
      phone: customer.phone,
      referredByCode: '',
      matched: customer,
      creditUsed: 0,
    });
  }

  function clearPicked() {
    onChange({ ...value, name: '', phone: '', matched: null, creditUsed: 0 });
  }

  // Debounced lookup: the seller is typing on a phone, so we wait for a pause
  // rather than firing a query per keystroke.
  useEffect(() => {
    const normalized = whatsappNumber(value.phone);
    if (!normalized || normalized.length < 12) {
      if (value.matched) onChange({ ...value, matched: null, creditUsed: 0 });
      return;
    }
    if (value.matched && whatsappNumber(value.matched.phone) === normalized) return;

    let cancelled = false;
    setLooking(true);
    const timer = window.setTimeout(async () => {
      try {
        const found = await findCustomerByPhone(normalized);
        if (cancelled) return;
        onChange({
          ...value,
          matched: found,
          name: found && !value.name.trim() ? found.name : value.name,
          creditUsed: 0,
        });
      } finally {
        if (!cancelled) setLooking(false);
      }
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.phone]);

  const credit = value.matched?.creditBalance ?? 0;
  const applicable = Math.min(credit, maxCredit);

  return (
    <div className="space-y-3">
      {!value.matched ? (
        <div>
          <label className="label" htmlFor="cust-lookup">
            عميل سجّل عندنا قبل؟
          </label>
          <div className="relative">
            <IconSearch className="pointer-events-none absolute right-3 top-1/2 h-[1.1rem] w-[1.1rem] -translate-y-1/2 text-fg-3" />
            <input
              id="cust-lookup"
              className="field pr-10"
              value={lookup}
              onChange={(e) => setLookup(e.target.value)}
              placeholder="ابحث بالاسم أو الرقم أو كود الإحالة…"
            />
          </div>

          {suggestions.length > 0 ? (
            <ul className="mt-2 space-y-1">
              {suggestions.map((c) => (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => pick(c)}
                    className="flex w-full items-center gap-2.5 rounded-card border border-line px-3 py-2 text-right transition hover:border-brand-500 "
                  >
                    <IconUserCircle className="h-5 w-5 shrink-0 text-accent-500" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.88rem] font-bold">{c.name}</span>
                      <span className="tnum block text-[0.74rem] font-semibold text-fg-3" dir="ltr">
                        {c.phone}
                      </span>
                    </span>
                    {c.creditBalance > 0 ? (
                      <span className="tnum chip shrink-0 bg-good/15 text-good">
                        رصيد {money(c.creditBalance)}
                      </span>
                    ) : null}
                    <span className="tnum shrink-0 text-[0.74rem] font-bold text-fg-3">
                      {c.totalOrders} عملية
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}

          {lookup.trim() && suggestions.length === 0 ? (
            <p className="mt-1.5 text-[0.75rem] font-semibold text-fg-3">
              ما في عميل بهذا الاسم — اكتب بياناتو تحت وهو يُحفظ تلقائياً.
            </p>
          ) : null}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="cust-name">
            اسم العميل {nameRequired ? '*' : ''}
          </label>
          <input
            id="cust-name"
            className="field"
            value={value.name}
            onChange={(e) => onChange({ ...value, name: e.target.value })}
            placeholder={nameRequired ? 'مطلوب لمتابعة الدين' : 'اختياري'}
          />
        </div>
        <div>
          <label className="label" htmlFor="cust-phone">
            رقم الهاتف
          </label>
          <input
            id="cust-phone"
            className="field text-left"
            dir="ltr"
            inputMode="tel"
            value={value.phone}
            onChange={(e) => onChange({ ...value, phone: e.target.value })}
            placeholder="09xxxxxxxx"
          />
          <p className="mt-1 text-[0.72rem] text-fg-3">
            {looking
              ? 'جاري البحث عن العميل…'
              : 'الرقم يحفظ العميل تلقائياً في قائمة العملاء لإرسال العروض لاحقاً.'}
          </p>
        </div>
      </div>

      {value.matched ? (
        <div className="surface-sunken flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-3">
          <span className="inline-flex items-center gap-1.5 text-[0.85rem] font-bold text-good">
            <IconCheck className="h-4 w-4" />
            عميل مسجّل
          </span>
          <span className="tnum text-[0.78rem] font-semibold text-fg-2">
            {value.matched.totalOrders} عملية · أنفق {money(value.matched.totalSpent)}
          </span>
          <span className="flex-1" />
          <span className="tnum chip bg-accent-500/15 text-accent-500">كود {value.matched.referralCode}</span>
          <button
            type="button"
            onClick={clearPicked}
            className="inline-flex items-center gap-1 rounded-card px-2 py-1 text-[0.76rem] font-bold text-fg-3 transition-colors hover:bg-bad/10 hover:text-bad"
          >
            <IconX className="h-3.5 w-3.5" />
            تغيير العميل
          </button>
        </div>
      ) : whatsappNumber(value.phone) ? (
        <div>
          <label className="label" htmlFor="ref-code">
            كود إحالة (من دلّه علينا؟)
          </label>
          <input
            id="ref-code"
            className="field text-left uppercase"
            dir="ltr"
            value={value.referredByCode}
            onChange={(e) => onChange({ ...value, referredByCode: e.target.value.toUpperCase() })}
            placeholder="اختياري — مثال AHMD1234"
          />
          <p className="mt-1 text-[0.72rem] text-fg-3">
            عند إدخال كود صحيح يحصل صاحبه على رصيد خصم بعد إتمام هذه العملية.
          </p>
        </div>
      ) : null}

      {applicable > 0 ? (
        <div className="rounded-card border border-good/40 bg-good/8 px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span className="inline-flex items-center gap-1.5 text-[0.85rem] font-bold text-good">
              <IconUsers className="h-4 w-4" />
              رصيد إحالة متاح
            </span>
            <span className="tnum font-display text-num font-black text-good">{money(credit)}</span>
            <span className="flex-1" />
            <button
              type="button"
              onClick={() => onChange({ ...value, creditUsed: value.creditUsed > 0 ? 0 : applicable })}
              className={`rounded-card border px-3 py-1.5 text-[0.8rem] font-bold transition
                ${value.creditUsed > 0
                  ? 'border-good bg-good text-ink-950'
                  : 'border-good/50 text-good hover:bg-good/10'}`}
            >
              {value.creditUsed > 0 ? `مستخدم ${money(value.creditUsed)}` : `استخدم ${money(applicable)}`}
            </button>
          </div>
          {credit > maxCredit ? (
            <p className="tnum mt-1.5 text-[0.72rem] font-semibold text-fg-2">
              قيمة الفاتورة أقل من الرصيد — سيُخصم {money(applicable)} ويبقى الباقي للمرة القادمة.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
