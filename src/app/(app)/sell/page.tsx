'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useState } from 'react';
import { SizeGrid } from '@/components/inventory/SizeGrid';
import { useActor } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { CustomerBlock, type CustomerSelection } from '@/components/sell/CustomerBlock';
import { SaleSuccess } from '@/components/sell/SaleSuccess';
import { Button } from '@/components/ui/Button';
import { EmptyState, LoadingBlock } from '@/components/ui/Feedback';
import {
  IconBoxes,
  IconChevronLeft,
  IconImage,
  IconSearch,
  IconTag,
} from '@/components/ui/Icons';
import { errorMessage } from '@/lib/db/collections';
import { awardReferralIfDue, ensureCustomer } from '@/lib/db/customers';
import { availableSizes, productImage, totalStock, useProducts } from '@/lib/db/products';
import { recordSale, useSale } from '@/lib/db/sales';
import { useSettings } from '@/lib/db/settings';
import { money, num } from '@/lib/format';
import { CHANNEL_LABEL, type Channel, type PaymentStatus, type Product } from '@/lib/types';

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
  const [remaining, setRemaining] = useState(0);

  const lastSale = useSale(lastSaleId);

  const sellable = useMemo(
    () => products.filter((p) => !p.isArchived && totalStock(p) > 0),
    [products],
  );

  const product = useMemo(
    () => sellable.find((p) => p.id === productId) ?? null,
    [sellable, productId],
  );

  // Deep link from the inventory card: /sell?product=<id>
  useEffect(() => {
    const preset = params.get('product');
    if (preset && !productId && sellable.some((p) => p.id === preset)) setProductId(preset);
  }, [params, productId, sellable]);

  // Defaults follow the product; the seller only touches them to give a discount.
  useEffect(() => {
    if (!product) return;
    setPrice(product.sellPrice);
    const options = availableSizes(product);
    setSize(options.length === 1 ? options[0]!.size : null);
    setQty(1);
  }, [product]);

  const stockForSize = useMemo(() => {
    if (!product || !size) return 0;
    return product.sizes.find((s) => s.size === size)?.qty ?? 0;
  }, [product, size]);

  const gross = price * qty;
  const creditUsed = Math.min(customer.creditUsed, gross);
  const total = gross - creditUsed;
  const due = payment === 'paid' ? 0 : payment === 'debt' ? total : Math.max(0, total - amountPaid);

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
  }

  async function submit() {
    if (!product || !size) return;
    setBusy(true);
    try {
      // The customer record is created first so the sale can spend referral credit
      // against a document that already exists, inside one transaction.
      const record = customer.phone.trim()
        ? await ensureCustomer(
            { name: customer.name, phone: customer.phone, referredByCode: customer.referredByCode },
            actor,
          )
        : null;

      const result = await recordSale(
        {
          product,
          size,
          qty,
          sellPrice: price,
          customerName: customer.name,
          customerPhone: customer.phone,
          customerId: record?.id ?? null,
          creditUsed,
          paymentStatus: payment,
          amountPaid,
          channel,
        },
        actor,
      );

      setRemaining(result.remaining);
      setLastSaleId(result.saleId);
      toast.success('تم تسجيل البيع وخصم الكمية');

      // Best-effort: a missing reward can be re-granted, a failed sale cannot.
      if (record) {
        void awardReferralIfDue(record.id, result.saleId, settings.referralReward, actor);
      }
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر تسجيل البيع.'));
    } finally {
      setBusy(false);
    }
  }

  if (loading) return <LoadingBlock label="جاري تحميل المنتجات…" />;

  /* ---------- step 1: pick the product ---------- */
  if (!product) {
    return (
      <>
        <div className="mb-4">
          <h1 className="text-xl sm:text-2xl">تسجيل بيع</h1>
          <p className="mt-0.5 text-[0.82rem] font-semibold text-ink-500 dark:text-ink-400">
            اختر المنتج ← المقاس ← تأكيد
          </p>
        </div>

        <div className="relative mb-3">
          <IconSearch className="pointer-events-none absolute right-3 top-1/2 h-[1.1rem] w-[1.1rem] -translate-y-1/2 text-ink-400" />
          <input
            autoFocus
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="field pr-10 text-[1rem]"
            placeholder="ابحث عن المنتج…"
            type="search"
          />
        </div>

        {sellable.length === 0 ? (
          <div className="surface">
            <EmptyState
              icon={<IconBoxes className="h-7 w-7" />}
              title="لا يوجد مخزون للبيع"
              hint="أضف منتجات بكميات متوفرة أولاً، وبعدها تقدر تسجل البيع من هنا."
              action={
                <Link href="/inventory">
                  <Button size="lg">الذهاب للمخزون</Button>
                </Link>
              }
            />
          </div>
        ) : filtered.length === 0 ? (
          <div className="surface">
            <EmptyState title="لا توجد نتائج" hint="جرّب اسماً آخر." />
          </div>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => setProductId(p.id)}
                className="surface flex items-center gap-3 p-2.5 text-right transition hover:border-brand-500 active:scale-[0.99]"
              >
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-card bg-ink-100 dark:bg-ink-900">
                  {productImage(p) ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={productImage(p)!} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-ink-300 dark:text-ink-700">
                      <IconImage className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[0.95rem] font-bold">{p.name}</p>
                  <p className="tnum mt-0.5 text-[0.78rem] font-bold text-ink-400 dark:text-ink-500">
                    {num(totalStock(p))} قطعة · {availableSizes(p).length} مقاس
                  </p>
                </div>
                <span className="tnum shrink-0 font-display text-[1.05rem] font-black text-brand-500">
                  {money(p.sellPrice)}
                </span>
              </button>
            ))}
          </div>
        )}
      </>
    );
  }

  /* ---------- step 2 + 3: size, quantity, payment ---------- */
  const options = availableSizes(product);
  const canConfirm = Boolean(size) && qty > 0 && qty <= stockForSize && price > 0 && !busy;

  return (
    <>
      <button
        onClick={reset}
        className="mb-3 inline-flex items-center gap-1 text-[0.85rem] font-bold text-ink-500 dark:text-ink-400"
      >
        <IconChevronLeft className="h-4 w-4 rotate-180" />
        تغيير المنتج
      </button>

      <div className="surface mb-3 flex items-center gap-3 p-3">
        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-card bg-ink-100 dark:bg-ink-900">
          {productImage(product) ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={productImage(product)!} alt="" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-ink-300 dark:text-ink-700">
              <IconImage className="h-6 w-6" />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[1.05rem]">{product.name}</h2>
          <p className="tnum text-[0.78rem] font-bold text-ink-400 dark:text-ink-500">
            {num(totalStock(product))} قطعة متوفرة
          </p>
        </div>
      </div>

      <section className="surface mb-3 p-3.5">
        <h3 className="mb-2.5 text-[0.95rem]">1 · اختر المقاس</h3>
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
          <p className="tnum mt-2.5 text-[0.8rem] font-bold text-ink-500 dark:text-ink-400">
            المتوفر من مقاس {size}: {num(stockForSize)} قطعة
          </p>
        ) : null}
      </section>

      {size ? (
        <>
          <section className="surface mb-3 p-3.5">
            <h3 className="mb-3 text-[0.95rem]">2 · الكمية والسعر</h3>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className="label">الكمية</label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="إنقاص الكمية"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                    className="h-14 w-14 shrink-0 rounded-card border border-ink-200 text-2xl font-bold dark:border-ink-700"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    max={stockForSize}
                    value={qty}
                    onChange={(e) =>
                      setQty(Math.min(stockForSize, Math.max(1, Number(e.target.value) || 1)))
                    }
                    className="field tnum h-14 flex-1 text-center font-display text-num-lg font-black"
                  />
                  <button
                    type="button"
                    aria-label="زيادة الكمية"
                    onClick={() => setQty((q) => Math.min(stockForSize, q + 1))}
                    className="h-14 w-14 shrink-0 rounded-card border border-ink-200 text-2xl font-bold dark:border-ink-700"
                  >
                    +
                  </button>
                </div>
                {qty >= stockForSize ? (
                  <p className="tnum mt-1.5 text-[0.75rem] font-bold text-warn">
                    هذه كل الكمية المتوفرة من المقاس
                  </p>
                ) : null}
              </div>

              <div>
                <label className="label" htmlFor="sell-price">
                  سعر القطعة (قابل للتعديل)
                </label>
                <input
                  id="sell-price"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={price || ''}
                  onChange={(e) => setPrice(Number(e.target.value) || 0)}
                  className="field tnum h-14 text-center font-display text-num-lg font-black text-brand-500"
                />
                {price !== product.sellPrice ? (
                  <p className="tnum mt-1.5 text-[0.75rem] font-bold text-warn">
                    السعر الافتراضي {money(product.sellPrice)} —{' '}
                    {price < product.sellPrice ? 'خصم' : 'زيادة'} {money(Math.abs(product.sellPrice - price))}
                    <button onClick={() => setPrice(product.sellPrice)} className="mr-2 underline">
                      رجوع للافتراضي
                    </button>
                  </p>
                ) : null}
              </div>
            </div>
          </section>

          <section className="surface mb-3 p-3.5">
            <h3 className="mb-3 text-[0.95rem]">3 · الدفع</h3>

            <div className="grid grid-cols-3 gap-2">
              {(
                [
                  ['paid', 'مدفوع'],
                  ['partial', 'دفع جزئي'],
                  ['debt', 'دين كامل'],
                ] as [PaymentStatus, string][]
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    setPayment(key);
                    if (key === 'partial' && amountPaid === 0) setAmountPaid(Math.floor(total / 2));
                  }}
                  className={`h-12 rounded-card border text-[0.88rem] font-bold transition
                    ${payment === key
                      ? key === 'paid'
                        ? 'border-good bg-good/12 text-good'
                        : 'border-warn bg-warn/12 text-warn'
                      : 'border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-400'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            {payment === 'partial' ? (
              <div className="mt-3">
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
                  className="field tnum h-12 text-center font-display text-num font-black"
                />
              </div>
            ) : null}

            <div className="mt-4 border-t border-ink-200 pt-4 dark:border-ink-800">
              <CustomerBlock
                value={customer}
                onChange={setCustomer}
                maxCredit={gross}
                nameRequired={payment !== 'paid'}
              />
            </div>

            <div className="mt-3">
              <label className="label">قناة البيع</label>
              <div className="flex flex-wrap gap-1.5">
                {CHANNELS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setChannel(c)}
                    className={`rounded-card border px-3 py-1.5 text-[0.8rem] font-bold transition
                      ${channel === c
                        ? 'border-brand-500 bg-brand-500/12 text-brand-500'
                        : 'border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-400'}`}
                  >
                    {CHANNEL_LABEL[c]}
                  </button>
                ))}
              </div>
            </div>
          </section>
        </>
      ) : null}

      {/* Sticky confirm bar: the total is the largest number on screen. */}
      <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 lg:bottom-4">
        <div className="surface flex items-center gap-3 p-3 shadow-lift">
          <div className="min-w-0 flex-1">
            <p className="text-[0.72rem] font-bold text-ink-400 dark:text-ink-500">الإجمالي</p>
            <p className="tnum font-display text-num-lg font-black">{money(total)}</p>
            {creditUsed > 0 ? (
              <p className="tnum text-[0.75rem] font-bold text-good">
                خُصم رصيد إحالة {money(creditUsed)} من {money(gross)}
              </p>
            ) : null}
            {due > 0 ? (
              <p className="tnum text-[0.75rem] font-bold text-warn">دين على العميل: {money(due)}</p>
            ) : null}
          </div>
          <Button
            size="lg"
            icon={<IconTag className="h-5 w-5" />}
            loading={busy}
            disabled={!canConfirm || (payment !== 'paid' && !customer.name.trim())}
            onClick={() => void submit()}
          >
            تأكيد البيع
          </Button>
        </div>
        {payment !== 'paid' && !customer.name.trim() ? (
          <p className="mt-1.5 text-center text-[0.75rem] font-bold text-warn">
            أدخل اسم العميل لتسجيل الدين
          </p>
        ) : null}
      </div>

      {lastSale ? (
        <SaleSuccess
          sale={lastSale}
          remaining={remaining}
          onClose={() => setLastSaleId(null)}
          onSellAnother={reset}
        />
      ) : null}
    </>
  );
}
