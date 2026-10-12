'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { LoadingBlock } from '@/components/ui/Feedback';
import { useOrder } from '@/lib/db/store';
import { formatDateTime, money } from '@/lib/format';
import { ORDER_STATUS_LABEL, type OrderStatus } from '@/lib/types';

const STEPS: OrderStatus[] = ['new', 'confirmed', 'out', 'delivered'];

/**
 * Where my order is. Opened from the link in the WhatsApp message; reads one
 * order by its id, live, so the step moves while the customer watches.
 */
export default function OrderPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <Tracker />
    </Suspense>
  );
}

function Tracker() {
  const id = useSearchParams().get('id');
  const { order, loading } = useOrder(id);

  if (loading) return <LoadingBlock label="جاري تحميل الطلب…" />;
  if (!order)
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-[1.6rem]">ما لقينا الطلب</h1>
        <p className="mt-2 text-fg-3">افتح الرابط من رسالة الطلب في واتساب.</p>
      </div>
    );

  const step = STEPS.indexOf(order.status);
  const steps = order.fulfilment === 'pickup' ? STEPS.filter((s) => s !== 'out') : STEPS;

  return (
    <div className="mx-auto max-w-lg px-4 py-10">
      <p className="text-[0.86rem] font-bold text-fg-3">طلب رقم</p>
      <h1 dir="ltr" className="text-right font-display text-[2rem] font-black tracking-wider">
        {order.number}
      </h1>
      <p className="mt-1 text-[0.86rem] text-fg-3">{formatDateTime(order.createdAt)}</p>

      {order.status === 'cancelled' ? (
        <div className="mt-6 rounded-card border-2 border-bad px-4 py-3">
          <p className="font-display font-black text-bad">الطلب اتلغى</p>
          {order.cancelReason ? <p className="mt-1 text-fg-2">{order.cancelReason}</p> : null}
        </div>
      ) : (
        <ol className="mt-7 space-y-0">
          {steps.map((s, i) => {
            const done = STEPS.indexOf(s) <= step;
            return (
              <li key={s} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 font-display text-[0.9rem] font-black
                      ${done ? 'border-fg bg-fg text-page' : 'border-line-strong text-fg-3'}`}
                  >
                    {i + 1}
                  </span>
                  {i < steps.length - 1 ? <span className={`w-0.5 flex-1 ${done ? 'bg-fg' : 'bg-line'}`} style={{ minHeight: 28 }} /> : null}
                </div>
                <p className={`pb-6 pt-1 font-bold ${done ? 'text-fg' : 'text-fg-3'}`}>
                  {s === 'out' ? 'في الطريق ليك' : s === 'delivered' ? (order.fulfilment === 'pickup' ? 'اتسلّم من المحل' : 'اتسلّم') : ORDER_STATUS_LABEL[s]}
                </p>
              </li>
            );
          })}
        </ol>
      )}

      <ul className="surface perf-rows mt-4 overflow-hidden">
        {order.items.map((i, idx) => (
          <li key={idx} className="flex justify-between gap-3 px-3.5 py-2.5 text-[0.92rem]">
            <span className="min-w-0 truncate font-bold">
              {i.name} — {i.size} × {i.qty}
            </span>
            <span className="tnum shrink-0">{money(i.price * i.qty)}</span>
          </li>
        ))}
        <li className="flex justify-between px-3.5 py-2.5 font-display font-black">
          <span>الإجمالي</span>
          <span className="tnum">{money(order.total)}</span>
        </li>
      </ul>
      <p className="mt-2 text-center text-[0.84rem] text-fg-3">الدفع عند الاستلام</p>

      <Link href="/shop" className="mt-8 block text-center font-bold text-fg-2 underline">
        واصل التسوق
      </Link>
    </div>
  );
}
