'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { Stepper } from '@/components/ui/Button';
import { IconTrash, IconX } from '@/components/ui/Icons';
import { money } from '@/lib/format';
import { cartCount, cartSubtotal, setCartQty, useCart } from '@/lib/store/cart';
import { openPanel, usePanel } from '@/lib/store/prefs';
import { FreeDeliveryMeter } from './FreeDeliveryMeter';

/**
 * The basket as a side panel: adding a product no longer throws the shopper
 * out of the page they were browsing. Checkout itself stays on /cart, where the
 * address form has the whole screen.
 */
export function CartDrawer({ freeOver }: { freeOver: number }) {
  const open = usePanel() === 'cart';
  const items = useCart();
  const pathname = usePathname();
  const subtotal = cartSubtotal(items);
  const close = () => openPanel(null);

  // Any navigation closes it.
  useEffect(() => {
    openPanel(null);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70]" role="dialog" aria-modal="true" aria-label="السلة">
      <button type="button" aria-label="إغلاق" className="absolute inset-0 animate-fade-in bg-ink-950/60" onClick={close} />
      <aside className="drawer-in absolute inset-y-0 left-0 flex w-full max-w-md flex-col border-r border-line bg-page">
        <div className="flex h-16 items-center justify-between border-b border-line px-5">
          <p className="font-display text-[1.25rem] font-black">
            السلة <span className="tnum text-fg-3">({cartCount(items)})</span>
          </p>
          <button type="button" onClick={close} aria-label="إغلاق" className="press -me-2 flex h-11 w-11 items-center justify-center text-fg-2">
            <IconX className="h-5 w-5" />
          </button>
        </div>

        {items.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
            <p className="font-display text-[1.4rem] font-black">السلة فاضية</p>
            <p className="mt-1 text-fg-3">اختار مقاسك من أي منتج وبيظهر هنا.</p>
            <Link href="/shop" className="press mt-6 inline-flex h-12 items-center rounded-full bg-fg px-6 font-display font-black text-page">
              تسوّق الآن
            </Link>
          </div>
        ) : (
          <>
            {freeOver > 0 ? (
              <div className="border-b border-line px-5 py-3.5">
                <FreeDeliveryMeter subtotal={subtotal} freeOver={freeOver} />
              </div>
            ) : null}
            <ul className="flex-1 divide-y divide-line overflow-y-auto px-5">
              {items.map((i) => (
                <li key={`${i.productId}-${i.size}`} className="flex gap-3 py-4">
                  <Link href={`/p/${i.productId}`} className="shrink-0">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={i.image} alt="" className="h-24 w-20 rounded-card bg-sunken object-cover" />
                  </Link>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-bold leading-snug">{i.name}</p>
                    <p className="mt-0.5 text-[0.84rem] font-semibold text-fg-3">
                      مقاس <span className="tnum font-black text-fg">{i.size}</span>
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="w-32">
                        <Stepper value={i.qty} min={1} max={10} onChange={(q) => setCartQty(i.productId, i.size, q)} size="sm" label="الكمية" />
                      </div>
                      <p className="tnum font-display font-black">{money(i.price * i.qty)}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`شيل ${i.name}`}
                    onClick={() => setCartQty(i.productId, i.size, 0)}
                    className="press -m-2 flex h-11 w-11 shrink-0 items-center justify-center self-start text-fg-3 hover:text-bad"
                  >
                    <IconTrash className="h-5 w-5" />
                  </button>
                </li>
              ))}
            </ul>
            <div className="border-t border-line px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4">
              <div className="flex items-baseline justify-between">
                <span className="font-bold text-fg-2">المجموع</span>
                <span className="tnum font-display text-[1.6rem] font-black">{money(subtotal)}</span>
              </div>
              <p className="text-[0.8rem] text-fg-3">التوصيل بيتحسب في الخطوة الجاية · الدفع عند الاستلام</p>
              <Link
                href="/cart"
                className="press mt-3 flex h-14 items-center justify-center rounded-full bg-brand-500 font-display text-[1.08rem] font-black text-white"
              >
                إتمام الطلب
              </Link>
              <button type="button" onClick={close} className="mt-2 h-11 w-full text-[0.9rem] font-bold text-fg-2">
                واصل التسوق
              </button>
            </div>
          </>
        )}
      </aside>
    </div>
  );
}
