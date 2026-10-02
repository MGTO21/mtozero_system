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
  /** Fills the phone screen — for long forms where a half sheet only scrolls. */
  tall?: boolean;
}

/**
 * One dialog primitive for the whole app: a bottom sheet on phones (thumb reach)
 * that becomes a centered panel on desktop.
 */
export function Sheet({ open, onClose, title, subtitle, children, footer, wide, tall }: Props) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

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
        onCloseRef.current();
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
  }, [open]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center sm:p-4">
      {/* Not a button: Escape and the × already give an accessible way out, and a
          full-screen tab stop would just be noise for screen-reader users. */}
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 animate-fade-in bg-ink-950/55" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={`relative flex w-full flex-col overflow-hidden rounded-t-[14px] border-t border-line bg-page shadow-lift outline-none
          animate-sheet-up sm:animate-fade-in sm:rounded-card sm:border
          ${tall ? 'h-[94dvh] sm:h-auto sm:max-h-[90dvh]' : 'max-h-[92dvh]'}
          ${wide ? 'sm:max-w-2xl' : 'sm:max-w-md'}`}
      >
        {/* Grab handle: tells a phone user this is a sheet that sits over the page. */}
        <div className="flex justify-center pt-2 sm:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-full bg-line-strong" />
        </div>

        <header className="flex items-start gap-3 px-4 pb-3 pt-2 sm:pt-4">
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-[1.2rem]">{title}</h2>
            {subtitle ? <p className="mt-0.5 truncate text-[0.84rem] font-semibold text-fg-3">{subtitle}</p> : null}
          </div>
          <IconButton label="إغلاق" onClick={onClose} className="-mt-0.5">
            <IconX className="h-5 w-5" />
          </IconButton>
        </header>

        <div className="perf min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">{children}</div>

        {footer ? (
          <footer className="border-t border-line bg-surface px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">
            {footer}
          </footer>
        ) : null}
      </div>
    </div>
  );
}
