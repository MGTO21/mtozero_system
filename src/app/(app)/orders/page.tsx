'use client';

import { useEffect, useMemo, useState } from 'react';
import { useActor } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { useConfirm } from '@/components/ui/Confirm';
import { Pill } from '@/components/ui/DateRange';
import { EmptyState, ErrorBlock, SkeletonRows, Stamp } from '@/components/ui/Feedback';
import { IconAlert, IconBag, IconBell, IconPhone, IconWhatsApp } from '@/components/ui/Icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { Sheet } from '@/components/ui/Sheet';
import { errorMessage } from '@/lib/db/collections';
import { useProducts } from '@/lib/db/products';
import { useSettings } from '@/lib/db/settings';
import { deliverOrder, setOrderStatus, useOrders } from '@/lib/db/store';
import { formatDateTime, money, num, relativeTime } from '@/lib/format';
import { enableOrderNotifications } from '@/lib/hooks/useOrderAlert';
import { ORDER_STATUS_LABEL, type OrderStatus, type Product, type StoreOrder } from '@/lib/types';

type Filter = 'open' | OrderStatus | 'all';

const OPEN: OrderStatus[] = ['new', 'confirmed', 'out'];

const TONE: Record<OrderStatus, 'brand' | 'warn' | 'good' | 'muted'> = {
  new: 'brand',
  confirmed: 'warn',
  out: 'warn',
  delivered: 'good',
  cancelled: 'muted',
};

/**
 * Orders from the website, from arrival to the customer's door. Delivering an
 * order records it as a sale through the normal sale path, so stock, profit, the
 * day's close and the customer list all update exactly as for a counter sale.
 */
export default function OrdersPage() {
  const { data: orders, loading, error } = useOrders();
  const { data: products } = useProducts();
  const [filter, setFilter] = useState<Filter>('open');
  const [openId, setOpenId] = useState<string | null>(null);

  const visible = useMemo(() => {
    if (filter === 'all') return orders;
    if (filter === 'open') return orders.filter((o) => OPEN.includes(o.status));
    return orders.filter((o) => o.status === filter);
  }, [orders, filter]);

  const count = (f: Filter) =>
    f === 'all' ? orders.length : f === 'open' ? orders.filter((o) => OPEN.includes(o.status)).length : orders.filter((o) => o.status === f).length;

  const open = orders.find((o) => o.id === openId) ?? null;

  return (
    <>
      <PageHeader
        title="طلبات الموقع"
        subtitle="الطلبات اللي جات من المتجر الإلكتروني"
        action={<NotifyToggle />}
      />

      <div className="scroller mb-4 sm:mx-0 sm:px-0">
        {(['open', 'new', 'confirmed', 'out', 'delivered', 'cancelled', 'all'] as Filter[]).map((f) => (
          <Pill key={f} active={filter === f} onClick={() => setFilter(f)} count={count(f)}>
            {f === 'open' ? 'المفتوحة' : f === 'all' ? 'الكل' : ORDER_STATUS_LABEL[f]}
          </Pill>
        ))}
      </div>

      {error ? <ErrorBlock message={error} /> : null}

      {loading ? (
        <SkeletonRows count={4} />
      ) : visible.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={<IconBag />}
            title={orders.length === 0 ? 'ما في طلبات لسه' : 'ما في طلبات هنا'}
            hint="شارك رابط المتجر في حالة واتساب وفيسبوك — الطلبات بتظهر هنا وبتجيك واتساب كمان."
          />
        </div>
      ) : (
        <ul className="surface rows overflow-hidden">
          {visible.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                onClick={() => setOpenId(o.id)}
                className="flex w-full items-center gap-3 px-3.5 py-3 text-right transition-colors hover:bg-sunken"
              >
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 font-bold">
                    <span className="truncate">{o.customer.name}</span>
                    <span dir="ltr" className="shrink-0 font-display text-[0.8rem] font-black text-fg-3">
                      {o.number}
                    </span>
                  </p>
                  <p className="tnum truncate text-[0.8rem] font-semibold text-fg-3">
                    {relativeTime(o.createdAt)} · {num(o.items.reduce((s, i) => s + i.qty, 0))} قطعة ·{' '}
                    {o.fulfilment === 'pickup' ? 'استلام من المحل' : o.customer.area || 'توصيل'}
                  </p>
                </div>
                <div className="shrink-0 text-left">
                  <p className="tnum font-display font-black">{money(o.total)}</p>
                  <Stamp tone={TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Stamp>
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      <OrderSheet order={open} products={products} onClose={() => setOpenId(null)} />
    </>
  );
}

function OrderSheet({ order, products, onClose }: { order: StoreOrder | null; products: Product[]; onClose: () => void }) {
  const actor = useActor();
  const toast = useToast();
  const { settings } = useSettings();
  const { confirm, dialog } = useConfirm();
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancelReason, setCancelReason] = useState('المقاس ما متوفر');

  if (!order) return null;

  /** Stock and price check against the shop as it is now. */
  const checks = order.items.map((item) => {
    const product = products.find((p) => p.id === item.productId);
    const onHand = product?.sizes.find((s) => s.size === item.size)?.qty ?? 0;
    return {
      item,
      missing: !product,
      short: onHand < item.qty,
      onHand,
      priceChanged: product ? product.sellPrice !== item.price : false,
      currentPrice: product?.sellPrice ?? 0,
    };
  });
  const problems = checks.filter((c) => c.missing || c.short);
  const customerWa = order.customer.phone;
  const first = order.customer.name.split(' ')[0];

  const messages: Partial<Record<OrderStatus, string>> = {
    confirmed: `أهلاً ${first}، طلبك رقم ${order.number} اتأكد. الإجمالي ${money(order.total)} والدفع عند الاستلام.${order.fulfilment === 'pickup' ? ' تقدر تستلمو من المحل.' : ' حنوصلو ليك قريب.'}`,
    out: `أهلاً ${first}، طلبك رقم ${order.number} في الطريق ليك الآن. جهّز ${money(order.total)}.`,
  };

  async function move(status: OrderStatus) {
    if (!order) return;
    setBusy(true);
    try {
      await setOrderStatus(order, status, actor);
      const text = messages[status];
      if (text && customerWa) window.open(`https://wa.me/${customerWa}?text=${encodeURIComponent(text)}`, '_blank');
      toast.success(`الطلب ${ORDER_STATUS_LABEL[status]}`);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function deliver(payment: 'paid' | 'debt') {
    if (!order) return;
    await confirm({
      title: 'تسليم الطلب',
      message: `حيتسجّل بيع بـ${money(order.subtotal)} ${payment === 'paid' ? 'مدفوع' : 'دين على العميل'}، والمخزون ينقص، و${order.customer.name} يتسجّل في العملاء.${order.deliveryFee > 0 ? ` رسوم التوصيل (${money(order.deliveryFee)}) بتتكتب في ملاحظة البيعة.` : ''}`,
      confirmLabel: 'سجّل التسليم',
      action: async () => {
        try {
          const result = await deliverOrder(order, products, { status: payment, referralReward: settings.referralReward }, actor);
          toast.success(result.queued ? 'اتسجّل التسليم على الجهاز — يُرسل مع الشبكة' : 'اتسلّم واتسجّلت البيعة');
          onClose();
        } catch (err) {
          toast.error(errorMessage(err, 'تعذّر تسجيل التسليم.'));
        }
      },
    });
  }

  async function cancel() {
    if (!order) return;
    setBusy(true);
    try {
      await setOrderStatus(order, 'cancelled', actor, { cancelReason: cancelReason.trim() || 'اتلغى' });
      toast.info('اتلغى الطلب');
      setCancelling(false);
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const closed = order.status === 'delivered' || order.status === 'cancelled';

  return (
    <Sheet open onClose={onClose} tall title={`طلب ${order.number}`} subtitle={`${formatDateTime(order.createdAt)} · ${ORDER_STATUS_LABEL[order.status]}`}>
      <section className="surface p-3.5">
        <p className="font-display text-[1.1rem] font-black">{order.customer.name}</p>
        <p dir="ltr" className="tnum text-right font-bold text-fg-2">
          {order.customer.phone}
        </p>
        {order.fulfilment === 'delivery' ? (
          <p className="mt-1.5 text-[0.92rem] text-fg-2">
            <span className="font-bold text-fg">{order.customer.area}</span>
            {order.customer.area && order.customer.address ? ' — ' : ''}
            {order.customer.address}
          </p>
        ) : (
          <p className="mt-1.5 text-[0.92rem] font-bold text-fg-2">استلام من المحل</p>
        )}
        {order.customer.notes ? <p className="mt-1.5 rounded-card bg-sunken px-2.5 py-1.5 text-[0.88rem]">{order.customer.notes}</p> : null}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <a
            href={`https://wa.me/${customerWa}`}
            target="_blank"
            rel="noopener noreferrer"
            className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-card bg-good text-[0.88rem] font-extrabold text-white"
          >
            <IconWhatsApp className="h-4 w-4" />
            واتساب
          </a>
          <a
            href={`tel:+${customerWa}`}
            className="press inline-flex h-10 items-center justify-center gap-1.5 rounded-card border border-line-strong text-[0.88rem] font-extrabold"
          >
            <IconPhone className="h-4 w-4" />
            اتصال
          </a>
        </div>
      </section>

      <ul className="surface perf-rows mt-3 overflow-hidden">
        {checks.map(({ item, missing, short, onHand, priceChanged, currentPrice }, idx) => (
          <li key={idx} className="px-3.5 py-2.5">
            <div className="flex justify-between gap-3">
              <span className="min-w-0 font-bold">
                {item.name} — مقاس {item.size} × {item.qty}
              </span>
              <span className="tnum shrink-0 font-display font-black">{money(item.price * item.qty)}</span>
            </div>
            {!closed && (missing || short) ? (
              <p className="mt-1 text-[0.82rem] font-bold text-bad">
                {missing ? 'المنتج ما موجود في المخزون' : `المتوفر ${num(onHand)} بس`}
              </p>
            ) : null}
            {!closed && priceChanged ? (
              <p className="tnum mt-1 text-[0.8rem] font-bold text-warn">السعر الحالي {money(currentPrice)} — الطلب بسعر وقتو</p>
            ) : null}
          </li>
        ))}
        <li className="space-y-1 px-3.5 py-2.5 text-[0.92rem]">
          <div className="flex justify-between">
            <span className="text-fg-2">التوصيل</span>
            <span className="tnum">{order.deliveryFee > 0 ? money(order.deliveryFee) : order.fulfilment === 'pickup' ? 'استلام' : 'مجاني'}</span>
          </div>
          {order.promoCode ? (
            <div className="flex justify-between">
              <span className="text-fg-2">كود خصم</span>
              <span dir="ltr" className="font-display font-black">
                {order.promoCode}
              </span>
            </div>
          ) : null}
          <div className="flex justify-between font-display font-black">
            <span>الإجمالي</span>
            <span className="tnum text-brand-500">{money(order.total)}</span>
          </div>
        </li>
      </ul>

      {order.status === 'cancelled' && order.cancelReason ? (
        <p className="mt-3 rounded-card bg-bad/10 px-3 py-2 font-bold text-bad">اتلغى: {order.cancelReason}</p>
      ) : null}
      {order.handledByName ? <p className="mt-2 text-[0.8rem] text-fg-3">آخر تحديث بواسطة {order.handledByName}</p> : null}

      {!closed ? (
        <div className="mt-4 space-y-2">
          {problems.length > 0 ? (
            <p className="flex items-center gap-2 text-[0.86rem] font-bold text-bad">
              <IconAlert className="h-4 w-4 shrink-0" />
              في أصناف ما متوفرة بالكمية — كلّم العميل قبل التأكيد.
            </p>
          ) : null}
          {order.status === 'new' ? (
            <Button block variant="ink" loading={busy} onClick={() => void move('confirmed')}>
              أكّد الطلب وابلغ العميل
            </Button>
          ) : null}
          {order.status === 'confirmed' && order.fulfilment === 'delivery' ? (
            <Button block variant="ink" loading={busy} onClick={() => void move('out')}>
              طلع للتوصيل وابلغ العميل
            </Button>
          ) : null}
          {order.status !== 'new' ? (
            <div className="grid grid-cols-2 gap-2">
              <Button disabled={problems.length > 0} onClick={() => void deliver('paid')}>
                اتسلّم — مدفوع
              </Button>
              <Button variant="secondary" disabled={problems.length > 0} onClick={() => void deliver('debt')}>
                اتسلّم — دين
              </Button>
            </div>
          ) : null}
          {cancelling ? (
            <div className="surface-sunken space-y-2 p-3">
              <label className="label" htmlFor="cancel-reason">
                سبب الإلغاء — يظهر للعميل في صفحة التتبع
              </label>
              <input id="cancel-reason" className="field" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
              <div className="grid grid-cols-2 gap-2">
                <Button variant="danger" loading={busy} onClick={() => void cancel()}>
                  إلغاء الطلب
                </Button>
                <Button variant="secondary" onClick={() => setCancelling(false)}>
                  رجوع
                </Button>
              </div>
            </div>
          ) : (
            <Button block variant="ghost" onClick={() => setCancelling(true)}>
              إلغاء الطلب
            </Button>
          )}
        </div>
      ) : null}
      {dialog}
    </Sheet>
  );
}

/**
 * Turns on system notifications for new orders on this device. Shown only
 * while the browser has not been asked yet; the chime and the badge work
 * without it.
 */
function NotifyToggle() {
  const toast = useToast();
  const [state, setState] = useState<NotificationPermission | 'unsupported' | null>(null);
  useEffect(() => {
    setState(typeof Notification === 'undefined' ? 'unsupported' : Notification.permission);
  }, []);
  if (state !== 'default') return null;
  return (
    <Button
      variant="secondary"
      size="sm"
      icon={<IconBell className="h-4 w-4" />}
      onClick={() =>
        void enableOrderNotifications().then((r) => {
          setState(r);
          if (r === 'granted') toast.success('حيوصلك إشعار مع كل طلب جديد');
          else toast.info('الإشعارات مقفولة — الصوت والعدّاد شغّالين');
        })
      }
    >
      نبّهني بالطلبات
    </Button>
  );
}
