'use client';

import { useState } from 'react';
import { Button } from './Button';
import { Sheet } from './Sheet';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
}

/**
 * Confirmation for irreversible-ish actions (archive, delete an expense).
 * Kept as a hook so callers stay declarative and never rely on window.confirm.
 */
export function useConfirm() {
  const [state, setState] = useState<
    (ConfirmOptions & { resolve: (ok: boolean) => void }) | null
  >(null);
  const [busy, setBusy] = useState(false);

  const confirm = (options: ConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      setState({ ...options, resolve });
    });

  const settle = (ok: boolean) => {
    state?.resolve(ok);
    setState(null);
    setBusy(false);
  };

  const dialog = state ? (
    <Sheet open onClose={() => settle(false)} title={state.title}>
      <p className="text-[0.95rem] leading-relaxed text-ink-600 dark:text-ink-300">{state.message}</p>
      <div className="mt-6 flex gap-2">
        <Button
          variant={state.danger ? 'danger' : 'primary'}
          block
          loading={busy}
          onClick={() => {
            setBusy(true);
            settle(true);
          }}
        >
          {state.confirmLabel ?? 'تأكيد'}
        </Button>
        <Button variant="secondary" block onClick={() => settle(false)}>
          إلغاء
        </Button>
      </div>
    </Sheet>
  ) : null;

  return { confirm, dialog };
}
