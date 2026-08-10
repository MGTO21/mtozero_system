'use client';

import { useEffect, useState } from 'react';
import { useActor } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { errorMessage } from '@/lib/db/collections';
import { itemNetQty, recordReturn } from '@/lib/db/sales';
import { money } from '@/lib/format';
import type { Sale } from '@/lib/types';

/**
 * Partial or full return. The sale is never deleted — it keeps its history and the
 * returned units go back into the size's stock.
 */
export interface ReturnTarget {
  sale: Sale;
  /** Which line of the invoice is being returned. */
  itemIndex: number;
}

export function ReturnSheet({ target, onClose }: { target: ReturnTarget | null; onClose: () => void }) {
  const actor = useActor();
  const toast = useToast();
  const [qty, setQty] = useState(1);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (target) {
      setQty(1);
      setReason('');
    }
  }, [target]);

  if (!target) return null;
  const item = target.sale.items[target.itemIndex];
  if (!item) return null;
  const max = itemNetQty(item);

  async function submit() {
    if (!target) return;
    setBusy(true);
    try {
      await recordReturn(target.sale, target.itemIndex, qty, reason, actor);
      toast.success('تم تسجيل الإرجاع وإعادة الكمية للمخزون');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر تسجيل الإرجاع.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open
      onClose={onClose}
      title="إرجاع / استبدال"
      subtitle={`${item.productName} — مقاس ${item.size}`}
      footer={
        <div className="flex gap-2">
          <Button block size="lg" variant="danger" loading={busy} onClick={() => void submit()} disabled={max === 0}>
            تأكيد الإرجاع
          </Button>
          <Button variant="secondary" size="lg" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      }
    >
      {max === 0 ? (
        <p className="text-center text-[0.9rem] font-bold text-ink-500 dark:text-ink-400">
          تم إرجاع كل القطع في هذه العملية بالفعل.
        </p>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="label">عدد القطع المرتجعة (الحد الأقصى {max})</label>
            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="إنقاص"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="h-12 w-12 shrink-0 rounded-card border border-ink-200 text-xl font-bold dark:border-ink-700"
              >
                −
              </button>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={max}
                value={qty}
                onChange={(e) => setQty(Math.min(max, Math.max(1, Number(e.target.value) || 1)))}
                className="field tnum h-12 flex-1 text-center font-display text-num font-black"
              />
              <button
                type="button"
                aria-label="زيادة"
                onClick={() => setQty((q) => Math.min(max, q + 1))}
                className="h-12 w-12 shrink-0 rounded-card border border-ink-200 text-xl font-bold dark:border-ink-700"
              >
                +
              </button>
            </div>
          </div>

          <div className="surface-sunken flex items-center justify-between px-3.5 py-2.5">
            <span className="text-[0.82rem] font-bold text-ink-500 dark:text-ink-400">قيمة المرتجع</span>
            <span className="tnum font-display text-num font-black text-bad">{money(item.sellPrice * qty)}</span>
          </div>

          <div>
            <label className="label" htmlFor="return-reason">
              السبب
            </label>
            <input
              id="return-reason"
              className="field"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مقاس غير مناسب، عيب في المنتج…"
            />
          </div>

          <p className="text-[0.78rem] leading-relaxed text-ink-400 dark:text-ink-500">
            ستعود {qty} قطعة لمقاس {item.size} في المخزون، وسيُعدَّل الربح والمبلغ المستحق تلقائياً.
            بقية أصناف الفاتورة لا تتأثر، والعملية تبقى مسجّلة ولا تُحذف.
          </p>
        </div>
      )}
    </Sheet>
  );
}
