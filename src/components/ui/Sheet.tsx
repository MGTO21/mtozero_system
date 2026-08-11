'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { IconButton } from './Button';
import { IconX } from './Icons';

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const previouslyFocused = document.activeElement as HTMLElement | null;

    const focusables = () =>
      panel
        ? [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
            (el) => el.offsetParent !== null || el === document.activeElement,
          )
        : [];

    /*
     * On a desktop the first field is focused so the form can be filled without
     * touching the mouse. On a phone that would throw the on-screen keyboard up
     * over the sheet before the user has even read it, so there the panel itself
     * takes focus instead.
     */
    const usesPointer = window.matchMedia('(pointer: fine)').matches;
    const firstField = panel?.querySelector<HTMLElement>('input:not([type="hidden"]):not([disabled]), textarea, select');
    if (usesPointer && firstField) firstField.focus();
    else panel?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab') return;

      // Keep Tab inside the dialog: everything behind it is inert to the eye and
      // must be inert to the keyboard too.
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
      // Send focus back where it came from, so closing a sheet does not dump the
      // user at the top of the page.
      previouslyFocused?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center">
      {/* Not a button: Escape and the × already give an accessible way out, and a
          full-screen tab stop would just be noise for screen-reader users. */}
      <div
        aria-hidden="true"
        onClick={onClose}
        className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
      />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl border-t border-ink-200 outline-none
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
