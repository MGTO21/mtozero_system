'use client';

import { useEffect, useState } from 'react';
import { useActor } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Sheet } from '@/components/ui/Sheet';
import { errorMessage } from '@/lib/db/collections';
import { createShipment, updateShipment } from '@/lib/db/shipments';
import { dateKey, parseDateKey } from '@/lib/format';
import type { Shipment } from '@/lib/types';

export function ShipmentForm({
  open,
  onClose,
  shipment,
  existing,
}: {
  open: boolean;
  onClose: () => void;
  shipment: Shipment | null;
  existing: Shipment[];
}) {
  const actor = useActor();
  const toast = useToast();
  const [name, setName] = useState('');
  const [supplier, setSupplier] = useState('');
  const [extraCost, setExtraCost] = useState(0);
  const [arrived, setArrived] = useState(dateKey(new Date()));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(shipment?.name ?? '');
    setSupplier(shipment?.supplier ?? '');
    setExtraCost(shipment?.extraCost ?? 0);
    setArrived(dateKey(shipment?.arrivedAt?.toDate() ?? new Date()));
    setNote(shipment?.note ?? '');
  }, [open, shipment]);

  async function save() {
    setBusy(true);
    try {
      if (shipment) {
        await updateShipment(shipment, { name: name.trim(), supplier, extraCost, note }, actor);
        toast.success('تم حفظ التعديلات');
      } else {
        await createShipment(
          { name, supplier, extraCost, arrivedAt: parseDateKey(arrived) ?? new Date(), note },
          existing,
          actor,
        );
        toast.success('تمت إضافة الشحنة');
      }
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر حفظ الشحنة.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={shipment ? 'تعديل شحنة' : 'شحنة جديدة'}
      subtitle={shipment ? shipment.code : 'سجّل الشحنة أولاً ثم أدخل بضاعتها'}
      footer={
        <Button block size="lg" loading={busy} onClick={() => void save()}>
          {shipment ? 'حفظ' : 'إضافة الشحنة'}
        </Button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="label" htmlFor="sh-name">
            اسم الشحنة *
          </label>
          <input
            id="sh-name"
            className="field"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="مثال: شحنة دبي — أغسطس"
          />
        </div>

        <div>
          <label className="label" htmlFor="sh-supplier">
            المورد
          </label>
          <input
            id="sh-supplier"
            className="field"
            value={supplier}
            onChange={(e) => setSupplier(e.target.value)}
            placeholder="اختياري"
          />
        </div>

        <div>
          <label className="label" htmlFor="sh-cost">
            مصاريف الشحن والجمارك
          </label>
          <input
            id="sh-cost"
            type="number"
            inputMode="numeric"
            min={0}
            className="field tnum text-num font-bold"
            value={extraCost || ''}
            onChange={(e) => setExtraCost(Number(e.target.value) || 0)}
            placeholder="0"
          />
          <p className="mt-1 text-[0.72rem] text-ink-400 dark:text-ink-500">
            تُسجَّل على مستوى الشحنة كاملة، لا على القطعة — تظهر في تفاصيل الشحنة.
          </p>
        </div>

        {!shipment ? (
          <div>
            <label className="label" htmlFor="sh-date">
              تاريخ الوصول
            </label>
            <input
              id="sh-date"
              type="date"
              className="field tnum"
              value={arrived}
              onChange={(e) => setArrived(e.target.value)}
            />
            <p className="mt-1 text-[0.72rem] text-ink-400 dark:text-ink-500">
              يحدد ترتيب الشحنة في الخصم — الأقدم يُباع أولاً.
            </p>
          </div>
        ) : null}

        <div>
          <label className="label" htmlFor="sh-note">
            ملاحظات
          </label>
          <input
            id="sh-note"
            className="field"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="اختياري"
          />
        </div>
      </div>
    </Sheet>
  );
}
