'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { IconCheck, IconQueue, IconX } from '@/components/ui/Icons';
import { errorMessage } from '@/lib/db/collections';
import { WRITE_FAILED_EVENT } from '@/lib/offline/write';

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
  success: <IconCheck className="h-4 w-4" />,
  error: <IconX className="h-4 w-4" />,
  info: <IconQueue className="h-4 w-4" />,
};

const TONES: Record<ToastKind, string> = {
  success: 'bg-fg text-page',
  error: 'bg-bad text-white',
  info: 'bg-surface text-fg border border-line-strong',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const push = useCallback((kind: ToastKind, message: string) => {
    const id = nextId.current++;
    setToasts((prev) => [...prev.slice(-2), { id, kind, message }]);
    window.setTimeout(
      () => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      },
      kind === 'error' ? 5200 : 3400,
    );
  }, []);

  // A save that was queued offline and later refused by the server has no
  // screen waiting for it any more; it is reported here instead of vanishing.
  useEffect(() => {
    const onFailed = (event: Event) => {
      push('error', `لم يُحفظ تعديل سابق: ${errorMessage((event as CustomEvent).detail)}`);
    };
    window.addEventListener(WRITE_FAILED_EVENT, onFailed);
    return () => window.removeEventListener(WRITE_FAILED_EVENT, onFailed);
  }, [push]);

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
      {/* No aria-live on the container: each toast carries its own role, so a
          failed sale interrupts while a routine success waits its turn. */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-[80] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:left-6 lg:right-auto lg:items-start">
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.kind === 'error' ? 'alert' : 'status'}
            className={`pointer-events-auto flex w-full max-w-sm items-center gap-2.5 rounded-card px-3.5 py-3 text-[0.9rem] font-bold shadow-lift animate-toast-in ${TONES[t.kind]}`}
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
