'use client';

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

type ToastKind = 'success' | 'error' | 'info';

interface Toast {
  id: number;
  kind: ToastKind;
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const ICONS: Record<ToastKind, ReactNode> = {
  success: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M4 10.5 8 14.5 16 6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.4">
      <path d="M6 6l8 8M14 6l-8 8" strokeLinecap="round" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M10 9v5M10 6.2v.2" strokeLinecap="round" />
      <circle cx="10" cy="10" r="7.2" />
    </svg>
  ),
};

const TONES: Record<ToastKind, string> = {
  success: 'border-good/40 bg-good/12 text-good',
  error: 'border-bad/45 bg-bad/12 text-bad',
  info: 'border-ink-300/40 bg-ink-100 text-ink-700 dark:border-ink-600 dark:bg-ink-750 dark:text-ink-100',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev.slice(-2), { id, kind, message }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, kind === 'error' ? 5200 : 3200);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      success: (m) => push('success', m),
      error: (m) => push('error', m),
      info: (m) => push('info', m),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-[80] flex flex-col items-center gap-2 px-4 sm:bottom-6 sm:right-6 sm:left-auto sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-card border px-3.5 py-3 text-sm font-semibold shadow-lift backdrop-blur-md animate-toast-in ${TONES[t.kind]}`}
          >
            <span className="shrink-0">{ICONS[t.kind]}</span>
            <span className="leading-snug">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
