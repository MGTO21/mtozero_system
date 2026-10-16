'use client';

import { useEffect, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { IconX } from '@/components/ui/Icons';

/**
 * A bottom sheet on phones, a centred card on wide screens — for the store's
 * small dialogs (size guide, "tell me when it is back"). Rendered at the store
 * root so a transformed parent can never trap it.
 */
export function StoreSheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const host = document.getElementById('store-root') ?? document.body;
  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" aria-label="إغلاق" className="absolute inset-0 animate-fade-in bg-ink-950/60" onClick={onClose} />
      <div className="relative max-h-[88dvh] w-full max-w-md animate-sheet-up overflow-y-auto rounded-t-card border border-line bg-surface p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] sm:rounded-card">
        <div className="mb-4 flex items-center justify-between gap-3">
          <p className="font-display text-[1.2rem] font-black">{title}</p>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="press -m-2 flex h-11 w-11 items-center justify-center text-fg-3">
            <IconX className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>,
    host,
  );
}
