import { money } from '@/lib/format';

/**
 * "X more and delivery is free" — the cheapest nudge there is to add a second
 * item, and it tells the customer the delivery rule without a separate line.
 */
export function FreeDeliveryMeter({ subtotal, freeOver }: { subtotal: number; freeOver: number }) {
  if (freeOver <= 0 || subtotal <= 0) return null;
  const left = freeOver - subtotal;
  const pct = Math.min(100, Math.round((subtotal / freeOver) * 100));
  return (
    <div>
      <p className="text-[0.86rem] font-bold">
        {left > 0 ? (
          <>
            فاضل <span className="tnum font-display font-black text-brand-500">{money(left)}</span> وتوصيلك مجاني
          </>
        ) : (
          <span className="text-good">مبروك — توصيلك مجاني</span>
        )}
      </p>
      <div className="meter mt-2 h-1.5 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <span className={`block h-full rounded-full ${left > 0 ? 'bg-brand-500' : 'bg-good'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
