'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { SizeGrid } from '@/components/inventory/SizeGrid';
import { useActor } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { CustomerBlock, type CustomerSelection } from '@/components/sell/CustomerBlock';
import { SaleSuccess } from '@/components/sell/SaleSuccess';
import { Button, Stepper } from '@/components/ui/Button';
import { Pill } from '@/components/ui/DateRange';
import { EmptyState, LoadingBlock } from '@/components/ui/Feedback';
import { IconBoxes, IconChevronLeft, IconPlus, IconSearch } from '@/components/ui/Icons';
import { useOnlineStatus } from '@/lib/hooks/useFirestore';
import { errorMessage } from '@/lib/db/collections';
import { availableSizes, productImage, totalStock, useProducts } from '@/lib/db/products';
import { useSale, type CartLine, type RemainingStock } from '@/lib/db/sales';
import { submitSale } from '@/lib/offline/operations';
import { CartList } from '@/components/sell/CartList';
import { useSettings } from '@/lib/db/settings';
import { money, num } from '@/lib/format';
import { CATEGORY_LABEL, CHANNEL_LABEL, type Channel, type PaymentStatus, type Product } from '@/lib/types';

export default function SellPage() {
  return (
    <Suspense fallback={<LoadingBlock />}>
      <QuickSale />
    </Suspense>
  );
}

const CHANNELS: Channel[] = ['whatsapp', 'facebook', 'in_person', 'other'];

function QuickSale() {
  const params = useSearchParams();
  const router = useRouter();
  const { data: products, loading } = useProducts();
  const { settings } = useSettings();
  const actor = useActor();
  const toast = useToast();

  const [productId, setProductId] = useState<string | null>(null);
  const [size, setSize] = useState<string | null>(null);
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState(0);
  const [payment, setPayment] = useState<PaymentStatus>('paid');
  const [amountPaid, setAmountPaid] = useState(0);
  const [customer, setCustomer] = useState<CustomerSelection>({
    name: '',
    phone: '',
    referredByCode: '',
    matched: null,
    creditUsed: 0,
  });
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [lastSaleId, setLastSaleId] = useState<string | null>(null);
  const [remaining, setRemaining] = useState<RemainingStock>({});
  /** Lines already committed to this invoice. The line being configured is separate. */
  const [cart, setCart] = useState<CartLine[]>([]);

  const lastSale = useSale(lastSaleId);

  const sellable = useMemo(
    () => products.filter((p) => !p.isArchived && totalStock(p) > 0),
    [products],
  );

  const product = useMemo(
    () => sellable.find((p) => p.id === productId) ?? null,
    [sellable, productId],
  );

  // Deep link from the inventory card: /sell?product=<id>. Applied exactly once,
  // then dropped from the URL. Re-applying it whenever no product was selected
  // put the same product straight back after "add to invoice" and after "change",
  // so a second item could never be picked when the sale started from inventory.
  const presetApplied = useRef(false);
  useEffect(() => {
    if (presetApplied.current) return;
    const preset = params.get('product');
    if (!preset) {
      presetApplied.current = true;
      return;
    }
    if (!sellable.some((p) => p.id === preset)) return; // products still loading
    presetApplied.current = true;
    setProductId(preset);
    router.replace('/sell', { scroll: false });
  }, [params, sellable, router]);

  // Defaults follow the product; the seller only touches them to give a discount.
  //
  // Keyed on the product ID, never on the product object: `useProducts` is a live
  // listener, so every snapshot — including the metadata-only ones and any sale made
  // on another device — hands back a freshly mapped object. Depending on that object
  // re-ran this effect mid-sale and silently cleared the chosen size, the quantity
  // and any discount, which is what made building a multi-item invoice fail at random.
  useEffect(() => {
    if (!product) return;
    setPrice(product.sellPrice);
    const options = availableSizes(product);
    setSize(options.length === 1 ? options[0]!.size : null);
    setQty(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId]);

  /** Stock of the selected size, less whatever the cart already claims of it. */
  const stockForSize = useMemo(() => {
    if (!product || !size) return 0;
    const onHand = product.sizes.find((s) => s.size === size)?.qty ?? 0;
    const claimed = cart
      .filter((l) => l.product.id === product.id && l.size === size)
      .reduce((sum, l) => sum + l.qty, 0);
    return Math.max(0, onHand - claimed);
  }, [product, size, cart]);

  // Stock can drop under us while the line is being configured — another device
  // selling the same size. Clamp the quantity instead of letting the whole invoice
  // be rejected at confirmation time.
  useEffect(() => {
    if (size && qty > stockForSize) setQty(Math.max(1, stockForSize));
  }, [size, qty, stockForSize]);

  /** The line currently being configured, if it is complete and in stock. */
  const pendingLine = useMemo<CartLine | null>(
    () =>
      product && size && qty > 0 && qty <= stockForSize && price > 0
        ? { product, size, qty, sellPrice: price }
        : null,
    [product, size, qty, stockForSize, price],
  );

  // The pending line counts towards the total straight away, so a single-item sale
  // never needs an explicit "add to cart" tap.
  const lines = useMemo(
    () => (pendingLine ? [...cart, pendingLine] : cart),
    [cart, pendingLine],
  );

  const gross = lines.reduce((sum, l) => sum + l.sellPrice * l.qty, 0);
  const creditUsed = Math.min(customer.creditUsed, gross);
  const total = gross - creditUsed;
  const due = payment === 'paid' ? 0 : payment === 'debt' ? total : Math.max(0, total - amountPaid);

  function addToCart() {
    if (!pendingLine) return;
    setCart((current) => {
      // Same product and size twice becomes one line with a bigger quantity.
      const index = current.findIndex(
        (l) => l.product.id === pendingLine.product.id && l.size === pendingLine.size && l.sellPrice === pendingLine.sellPrice,
      );
      if (index === -1) return [...current, pendingLine];
      return current.map((l, i) => (i === index ? { ...l, qty: l.qty + pendingLine.qty } : l));
    });
    setProductId(null);
    setSize(null);
    setQty(1);
    setSearch('');
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sellable;
    return sellable.filter((p) =>
      [p.name, p.brand, p.sku].filter(Boolean).join(' ').toLowerCase().includes(q),
    );
  }, [sellable, search]);

  function reset() {
    setProductId(null);
    setSize(null);
    setQty(1);
    setPayment('paid');
    setAmountPaid(0);
    setCustomer({ name: '', phone: '', referredByCode: '', matched: null, creditUsed: 0 });
    setSearch('');
    setLastSaleId(null);
    setCart([]);
  }

  /** Clears only the line being configured, keeping the cart intact. */
  function clearPicker() {
    setProductId(null);
    setSize(null);
    setQty(1);
    setSearch('');
  }

  async function submit() {
    if (lines.length === 0) return;
    setBusy(true);
    try {
      // Stock left per size, worked out before the sale so a queued sale can
      // still answer "how many are left" with the screen's own numbers.
      const before: RemainingStock = {};
      for (const line of lines) {
        const key = `${line.product.id}|${line.size}`;
        const onHand = before[key] ?? line.product.sizes.find((s) => s.size === line.size)?.qty ?? 0;
        before[key] = Math.max(0, onHand - line.qty);
      }

      const result = await submitSale(
        {
          cart: lines,
          customerName: customer.name,
          customerPhone: customer.phone,
          referredByCode: customer.referredByCode,
          creditUsed,
          paymentStatus: payment,
          amountPaid,
          channel,
          referralReward: settings.referralReward,
        },
        actor,
      );

      setRemaining(result.remaining ?? before);
      setLastSaleId(result.id);
      toast.success(result.queued ? 'سُجّلت البيعة على الجهاز — تُرسل عند عودة الشبكة' : 'تم تسجيل البيع وخصم الكمية');
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر تسجيل البيع.'));
    } finally {
      setBusy(false);
    }
  }

  const [category, setCategory] = useState<'all' | Product['category']>('all');
  const online = useOnlineStatus();
  const shown = useMemo(
    () => (category === 'all' ? filtered : filtered.filter((p) => p.category === category)),
    [filtered, category],
  );

  if (loading) return <LoadingBlock label="جاري تحميل المنتجات…" />;

  const options = product ? availableSizes(product) : [];
  const canConfirm = lines.length > 0 && !busy && (payment === 'paid' || Boolean(customer.name.trim()));
  const units = lines.reduce((sum, l) => sum + l.qty, 0);

  return (
    <div className="mx-auto max-w-3xl">
      {!product ? (
        /* ---------- step 1: pick the product ---------- */
        <section>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h1 className="text-[1.6rem] leading-tight">{cart.length > 0 ? 'صنف آخر للفاتورة' : 'تسجيل بيع'}</h1>
              <p className="mt-0.5 text-[0.86rem] font-semibold text-fg-3">المنتج ← المقاس ← تأكيد</p>
            </div>
            {cart.length > 0 ? (
              <span className="stamp border-fg text-fg">
                <span className="tnum">{num(cart.length)}</span> في الفاتورة
              </span>
            ) : null}
          </div>

          <div className="sticky top-14 z-20 -mx-4 bg-page/95 px-4 pb-2 pt-1 backdrop-blur-sm sm:mx-0 sm:px-0">
            <div className="relative">
              <IconSearch className="pointer-events-none absolute right-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-fg-3" />
              <input
                autoFocus
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="field h-[3.25rem] pr-11 text-[1.05rem]"
                placeholder="اسم المنتج أو الماركة أو الكود…"
                type="search"
                enterKeyHint="search"
              />
            </div>
            <div className="scroller mt-2 sm:mx-0 sm:px-0">
              <Pill active={category === 'all'} onClick={() => setCategory('all')} count={filtered.length}>
                الكل
              </Pill>
              {(['shoes', 'clothing'] as const).map((c) => (
                <Pill
                  key={c}
                  active={category === c}
                  onClick={() => setCategory(c)}
                  count={filtered.filter((p) => p.category === c).length}
                >
                  {CATEGORY_LABEL[c]}
                </Pill>
              ))}
            </div>
          </div>

          {sellable.length === 0 ? (
            <div className="surface mt-2">
              <EmptyState
                icon={<IconBoxes />}
                title="لا يوجد مخزون للبيع"
                hint="أضف منتجات بكميات متوفرة أولاً، وبعدها تقدر تسجل البيع من هنا."
                action={
                  <Link href="/inventory">
                    <Button variant="ink">الذهاب للمخزون</Button>
                  </Link>
                }
              />
            </div>
          ) : shown.length === 0 ? (
            <div className="surface mt-2">
              <EmptyState title="لا توجد نتائج" hint="جرّب اسماً آخر أو جزءاً منه." />
            </div>
          ) : (
            <ul className="surface rows mt-2 overflow-hidden">
              {shown.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setProductId(p.id)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-right transition-colors hover:bg-sunken active:bg-sunken"
                  >
                    <Thumb product={p} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[1rem] font-bold">{p.name}</span>
                      <span className="tnum mt-0.5 block truncate text-[0.8rem] font-semibold text-fg-3">
                        {availableSizes(p)
                          .map((s) => s.size)
                          .join(' · ')}
                      </span>
                    </span>
                    <span className="shrink-0 text-left">
                      <span className="tnum block font-display text-[1.1rem] font-black text-brand-500">
                        {money(p.sellPrice)}
                      </span>
                      <span className="tnum block text-[0.74rem] font-bold text-fg-3">{num(totalStock(p))} قطعة</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : (
        /* ---------- step 2: size, quantity, price ---------- */
        <section>
          <div className="mb-3 flex items-center gap-3">
            <Thumb product={product} size="lg" />
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[1.35rem] leading-tight">{product.name}</h1>
              <p className="tnum text-[0.84rem] font-bold text-fg-3">
                {num(totalStock(product))} قطعة · {CATEGORY_LABEL[product.category]}
              </p>
            </div>
            <Button variant="secondary" size="sm" onClick={clearPicker} icon={<IconChevronLeft className="h-4 w-4 rotate-180" />}>
              تغيير
            </Button>
          </div>

          <p className="ledger-head">١ · المقاس</p>
          <SizeGrid
            sizes={options}
            lowStockThreshold={product.lowStockThreshold}
            onSelect={(s) => {
              setSize(s);
              setQty(1);
            }}
            selected={size}
            availableOnly
            size="lg"
          />

          {size ? (
            <>
              <p className="ledger-head mt-5">٢ · الكمية والسعر</p>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">الكمية (متوفر {num(stockForSize)})</label>
                  <Stepper value={qty} max={Math.max(1, stockForSize)} onChange={setQty} label="الكمية" />
                </div>
                <div>
                  <label className="label" htmlFor="sell-price">
                    سعر القطعة
                  </label>
                  <input
                    id="sell-price"
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={price || ''}
                    onChange={(e) => setPrice(Number(e.target.value) || 0)}
                    className="field tnum h-[3.1rem] text-center font-display text-num font-black text-brand-500"
                  />
                </div>
              </div>
              {price !== product.sellPrice ? (
                <p className="tnum mt-2 text-[0.8rem] font-bold text-warn">
                  {price < product.sellPrice ? 'خصم' : 'زيادة'} {money(Math.abs(product.sellPrice - price))} عن{' '}
                  {money(product.sellPrice)}
                  <button type="button" onClick={() => setPrice(product.sellPrice)} className="mr-2 underline">
                    رجوع للسعر الأصلي
                  </button>
                </p>
              ) : null}

              {/* Optional: the line being configured already counts towards the
                  total, so a one-item sale needs no extra tap. */}
              <button
                type="button"
                onClick={addToCart}
                disabled={!pendingLine}
                className="press mt-4 flex w-full items-center justify-center gap-2 rounded-card border-[1.5px] border-dashed border-line-strong py-3.5 text-[0.95rem] font-bold text-fg-2 transition-colors hover:border-fg hover:text-fg disabled:opacity-40"
              >
                <IconPlus className="h-4 w-4" />
                أضف للفاتورة واختر صنفاً آخر
              </button>
            </>
          ) : null}
        </section>
      )}

      {cart.length > 0 ? (
        <div className="mt-5">
          <CartList
            lines={cart}
            onRemove={(index) => setCart((c) => c.filter((_, i) => i !== index))}
            onChangeQty={(index, nextQty) => setCart((c) => c.map((l, i) => (i === index ? { ...l, qty: nextQty } : l)))}
          />
        </div>
      ) : null}

      {lines.length > 0 ? (
        <section className="mt-5 space-y-4">
          <p className="ledger-head !mb-0">٣ · الدفع</p>
          <div className="seg" role="group" aria-label="طريقة الدفع">
            {(
              [
                ['paid', 'مدفوع كامل'],
                ['partial', 'دفع جزئي'],
                ['debt', 'دين'],
              ] as [PaymentStatus, string][]
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                aria-pressed={payment === key}
                onClick={() => {
                  setPayment(key);
                  if (key === 'partial' && amountPaid === 0) setAmountPaid(Math.floor(total / 2));
                }}
              >
                {label}
              </button>
            ))}
          </div>

          {payment === 'partial' ? (
            <div>
              <label className="label" htmlFor="paid-amount">
                المبلغ المدفوع الآن
              </label>
              <input
                id="paid-amount"
                type="number"
                inputMode="numeric"
                min={0}
                max={total}
                value={amountPaid || ''}
                onChange={(e) => setAmountPaid(Math.min(total, Math.max(0, Number(e.target.value) || 0)))}
                className="field tnum text-center font-display text-num font-black"
              />
            </div>
          ) : null}

          <div className="surface p-3.5">
            <CustomerBlock value={customer} onChange={setCustomer} maxCredit={gross} nameRequired={payment !== 'paid'} />
          </div>

          <div>
            <p className="label">جاء من</p>
            <div className="scroller sm:mx-0 sm:px-0">
              {CHANNELS.map((c) => (
                <Pill key={c} active={channel === c} onClick={() => setChannel(c)}>
                  {CHANNEL_LABEL[c]}
                </Pill>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* The running bill. Sticky above the bottom bar; the total is the largest
          number on screen because it is the one read aloud to the customer. */}
      {lines.length > 0 ? (
        <div className="sticky bottom-[calc(4.9rem+env(safe-area-inset-bottom))] z-30 mt-5 lg:bottom-4">
          <div className="ticket rounded-card border border-line-strong px-5 py-3 shadow-lift">
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className="tnum text-[0.76rem] font-bold text-fg-3">
                  الإجمالي · {num(units)} قطعة
                  {creditUsed > 0 ? ` · خصم إحالة ${money(creditUsed)}` : ''}
                </p>
                <p className="tnum font-display text-num-lg font-black leading-tight">{money(total)}</p>
                {due > 0 ? <p className="tnum text-[0.78rem] font-bold text-warn">دين {money(due)}</p> : null}
              </div>
              <Button size="lg" loading={busy} disabled={!canConfirm} onClick={() => void submit()}>
                {online ? 'تأكيد البيع' : 'تسجيل على الجهاز'}
              </Button>
            </div>
            {payment !== 'paid' && !customer.name.trim() ? (
              <p className="mt-1 text-[0.76rem] font-bold text-warn">اكتب اسم العميل لتسجيل الدين</p>
            ) : null}
          </div>
        </div>
      ) : null}

      {lastSale ? (
        <SaleSuccess sale={lastSale} remaining={remaining} onClose={() => setLastSaleId(null)} onSellAnother={reset} />
      ) : null}
    </div>
  );
}

/** Product picture, or a printed placeholder with the first letter. */
function Thumb({ product, size }: { product: Product; size: 'md' | 'lg' }) {
  const box = size === 'lg' ? 'h-16 w-16' : 'h-14 w-14';
  const src = productImage(product);
  return (
    <span className={`${box} flex shrink-0 items-center justify-center overflow-hidden rounded-card border border-line bg-sunken`}>
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        <span className="font-display text-xl font-black text-fg-3">{product.name.trim().charAt(0) || '؟'}</span>
      )}
    </span>
  );
}
