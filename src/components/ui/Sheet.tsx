'use client';

import { useEffect, type ReactNode } from 'react';
import { IconButton } from './Button';
import { IconX } from './Icons';

interface Props {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** Wider variant for forms with two columns. */
  wide?: boolean;
}

/**
 * One dialog primitive for the whole app: a bottom sheet on phones (thumb reach)
 * that becomes a centered panel on desktop.
 */
export function Sheet({ open, onClose, title, subtitle, children, footer, wide }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      <button
        aria-label="إغلاق"
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-ink-200
          bg-white shadow-lift animate-sheet-up dark:border-ink-750 dark:bg-ink-850
          sm:rounded-card sm:border ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
      >
        <header className="flex items-start gap-3 border-b border-ink-200 px-4 py-3.5 dark:border-ink-800">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-lg">{title}</h2>
            {subtitle ? <p className="mt-0.5 text-[0.82rem] text-ink-500 dark:text-ink-400">{subtitle}</p> : null}
          </div>
          <IconButton label="إغلاق" onClick={onClose} className="-mt-1">
            <IconX className="h-5 w-5" />
          </IconButton>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>

        {footer ? (
          <footer className="border-t border-ink-200 bg-ink-50/70 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] dark:border-ink-800 dark:bg-ink-900/60 sm:pb-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
