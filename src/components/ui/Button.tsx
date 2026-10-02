'use client';

import { forwardRef, type ButtonHTMLAttributes, type ReactNode } from 'react';

/**
 * primary  — fuchsia: anything that moves money (confirm sale, record payment)
 * ink      — solid black stamp: the strong neutral action (sell another, save)
 * secondary/ghost — everything else
 */
type Variant = 'primary' | 'ink' | 'secondary' | 'ghost' | 'danger' | 'success';
type Size = 'sm' | 'md' | 'lg';

const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand-500 text-white hover:bg-brand-600 active:bg-brand-700',
  ink: 'bg-fg text-page hover:bg-fg/90',
  secondary: 'border border-line-strong bg-surface text-fg hover:border-fg-3',
  ghost: 'text-fg-2 hover:bg-sunken hover:text-fg',
  danger: 'bg-bad text-white hover:brightness-110',
  success: 'bg-good text-white hover:brightness-110',
};

const SIZES: Record<Size, string> = {
  sm: 'h-9 gap-1.5 px-3 text-[0.85rem]',
  md: 'h-12 gap-2 px-4 text-[0.95rem]',
  lg: 'h-14 gap-2.5 px-6 text-[1.05rem]',
};

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: ReactNode;
  block?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, Props>(function Button(
  { variant = 'primary', size = 'md', loading, icon, block, className = '', children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={`press inline-flex shrink-0 items-center justify-center rounded-card font-display font-extrabold
        transition-colors disabled:cursor-not-allowed disabled:opacity-45
        ${VARIANTS[variant]} ${SIZES[size]} ${block ? 'w-full' : ''} ${className}`}
      {...rest}
    >
      {loading ? <Spinner className="h-4 w-4" /> : icon}
      {children}
    </button>
  );
});

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9.5" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21.5 12A9.5 9.5 0 0 0 12 2.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * Square action button used inside list rows.
 *
 * The visible box stays compact so dense lists still read as lists, but an
 * invisible ::after pad extends the tap target to 44px — this app is used
 * one-handed on a phone in the middle of a sale, and a 36px target is a missed
 * tap waiting to happen.
 */
export function IconButton({
  label,
  children,
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return (
    <button
      type={type}
      aria-label={label}
      title={label}
      className={`relative inline-flex h-9 w-9 items-center justify-center rounded-card text-fg-2 transition-colors
        after:absolute after:left-1/2 after:top-1/2 after:h-11 after:w-11 after:-translate-x-1/2 after:-translate-y-1/2 after:content-['']
        hover:bg-sunken hover:text-fg ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

/**
 * − [ n ] + : the quantity control used at the counter. One component so every
 * screen that changes a count has the same big, thumb-sized targets.
 */
export function Stepper({
  value,
  min = 1,
  max,
  onChange,
  size = 'md',
  label,
}: {
  value: number;
  min?: number;
  max: number;
  onChange: (next: number) => void;
  size?: 'sm' | 'md';
  label: string;
}) {
  const box = size === 'sm' ? 'h-9 w-9 text-lg' : 'h-12 w-12 text-2xl';
  return (
    <div className="flex items-stretch overflow-hidden rounded-card border border-line-strong bg-surface" role="group" aria-label={label}>
      <button
        type="button"
        aria-label="إنقاص"
        disabled={value <= min}
        onClick={() => onChange(Math.max(min, value - 1))}
        className={`${box} shrink-0 font-bold text-fg-2 transition-colors hover:bg-sunken disabled:opacity-30`}
      >
        −
      </button>
      <input
        type="number"
        inputMode="numeric"
        min={min}
        max={max}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Math.min(max, Math.max(min, Math.floor(Number(e.target.value)) || min)))}
        className={`tnum w-14 min-w-0 flex-1 border-x border-line bg-transparent text-center font-display font-black outline-none
          ${size === 'sm' ? 'text-base' : 'text-num'}`}
      />
      <button
        type="button"
        aria-label="زيادة"
        disabled={value >= max}
        onClick={() => onChange(Math.min(max, value + 1))}
        className={`${box} shrink-0 font-bold text-fg-2 transition-colors hover:bg-sunken disabled:opacity-30`}
      >
        +
      </button>
    </div>
  );
}
