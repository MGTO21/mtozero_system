'use client';

import { useMemo, useState } from 'react';
import { useActor, useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { ReceiveSheet } from '@/components/shipments/ReceiveSheet';
import { ShipmentForm } from '@/components/shipments/ShipmentForm';
import { Button } from '@/components/ui/Button';
import { EmptyState, ErrorBlock, PermissionNotice, SkeletonRows } from '@/components/ui/Feedback';
import { IconBoxes, IconChevronDown, IconPlus } from '@/components/ui/Icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { shipmentStats, sumStats, UNASSIGNED, type ShipmentStats } from '@/lib/analytics';
import { errorMessage } from '@/lib/db/collections';
import { useProducts } from '@/lib/db/products';
import { useSalesBetween } from '@/lib/db/sales';
import { groupShipments, ungroupShipment, useShipmentGroups, useShipments } from '@/lib/db/shipments';
import { formatDate, money, num } from '@/lib/format';
import type { Shipment } from '@/lib/types';

/** Wide enough to cover any shipment's selling life. */
const ALL_TIME_START = new Date(2020, 0, 1);

export default function ShipmentsPage() {
  const shipments = useShipments();
  const groups = useShipmentGroups();
  const { data: products } = useProducts();
  const sales = useSalesBetween(ALL_TIME_START, new Date());
  const actor = useActor();
  const { isOwner } = useAuth();
  const toast = useToast();

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Shipment | null>(null);
  const [receiving, setReceiving] = useState<Shipment | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [mergeMode, setMergeMode] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [mergeName, setMergeName] = useState('');
  const [merging, setMerging] = useState(false);

  const stats = useMemo(() => shipmentStats(products, sales.data), [products, sales.data]);
  const unassigned = stats.get(UNASSIGNED);

  /** Shipments bucketed by group, ungrouped ones keyed by their own id. */
  const grouped = useMemo(() => {
    const byGroup = new Map<string, Shipment[]>();
    for (const s of shipments.data) {
      const key = s.groupId ?? `solo:${s.id}`;
      byGroup.set(key, [...(byGroup.get(key) ?? []), s]);
    }
    return byGroup;
  }, [shipments.data]);

  async function merge() {
    setMerging(true);
    try {
      await groupShipments(mergeName, selected, actor);
      toast.success('تم دمج الشحنات — كل شحنة تبقى مميّزة داخل المجموعة');
      setMergeMode(false);
      setSelected([]);
      setMergeName('');
    } catch (err) {
      toast.error(errorMessage(err));
    } finally {
      setMerging(false);
    }
  }

  const loading = shipments.loading || sales.loading;

  return (
    <>
      <PageHeader
        title="الشحنات"
        subtitle={loading ? undefined : `${num(shipments.data.length)} شحنة`}
        action={
          <div className="flex gap-2">
            {shipments.data.length > 1 ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setMergeMode((m) => !m);
                  setSelected([]);
                }}
              >
                {mergeMode ? 'إلغاء' : 'دمج'}
              </Button>
            ) : null}
            <Button
              icon={<IconPlus className="h-4 w-4" />}
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              شحنة
            </Button>
          </div>
        }
      />

      {shipments.denied ? (
        <PermissionNotice collection="shipments" isOwner={isOwner} />
      ) : shipments.error ? (
        <ErrorBlock message={shipments.error} />
      ) : loading ? (
        <SkeletonRows count={3} />
      ) : shipments.data.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={<IconBoxes className="h-7 w-7" />}
            title="لا توجد شحنات بعد"
            hint="سجّل كل شحنة تصلك، ثم أدخل بضاعتها. بعدها ترى بالضبط كم بعت من كل شحنة وكم بقي منها."
            action={
              <Button size="lg" icon={<IconPlus className="h-5 w-5" />} onClick={() => setFormOpen(true)}>
                إضافة أول شحنة
              </Button>
            }
          />
        </div>
      ) : (
        <div className="space-y-2">
          {[...grouped.entries()].map(([key, members]) => {
            const group = key.startsWith('solo:') ? null : groups.data.find((g) => g.id === key);
            const memberStats = members.map((m) => stats.get(m.id) ?? null);
            const combined = sumStats(memberStats.filter(Boolean) as ShipmentStats[]);

            return (
              <div key={key} className="surface overflow-hidden">
                {group ? (
                  <div className="border-b border-ink-200 bg-accent-500/8 px-3.5 py-2.5 dark:border-ink-800">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="text-[0.95rem] font-bold text-accent-500">
                        مجموعة: {group.name}
                      </span>
                      <span className="tnum text-[0.76rem] font-semibold text-ink-500 dark:text-ink-400">
                        {num(members.length)} شحنات مدموجة
                      </span>
                      <span className="flex-1" />
                      <span className="tnum text-[0.82rem] font-black text-brand-500">
                        {money(combined.soldRevenue)}
                      </span>
                    </div>
                  </div>
                ) : null}

                {members.map((shipment) => (
                  <ShipmentRow
                    key={shipment.id}
                    shipment={shipment}
                    stats={stats.get(shipment.id)}
                    inGroup={Boolean(group)}
                    open={expanded === shipment.id}
                    selectable={mergeMode && !shipment.groupId}
                    checked={selected.includes(shipment.id)}
                    onToggleCheck={() =>
                      setSelected((cur) =>
                        cur.includes(shipment.id)
                          ? cur.filter((id) => id !== shipment.id)
                          : [...cur, shipment.id],
                      )
                    }
                    onToggle={() => setExpanded((cur) => (cur === shipment.id ? null : shipment.id))}
                    onReceive={() => setReceiving(shipment)}
                    onEdit={() => {
                      setEditing(shipment);
                      setFormOpen(true);
                    }}
                    onUngroup={async () => {
                      try {
                        await ungroupShipment(shipment, actor);
                        toast.success('أُخرجت الشحنة من المجموعة');
                      } catch (err) {
                        toast.error(errorMessage(err));
                      }
                    }}
                  />
                ))}
              </div>
            );
          })}

          {unassigned && unassigned.remainingUnits + unassigned.soldUnits > 0 ? (
            <div className="surface px-3.5 py-3">
              <p className="text-[0.9rem] font-bold text-ink-500 dark:text-ink-400">بضاعة بدون شحنة محددة</p>
              <p className="tnum mt-1 text-[0.78rem] font-semibold text-ink-400 dark:text-ink-500">
                {num(unassigned.remainingUnits)} قطعة متبقية · بيع منها {num(unassigned.soldUnits)} بقيمة{' '}
                {money(unassigned.soldRevenue)}
              </p>
              <p className="mt-1.5 text-[0.72rem] text-ink-400 dark:text-ink-500">
                هذه كميات أُضيفت يدوياً أو قبل تفعيل تتبع الشحنات. أدخل الجديد عبر «استلام بضاعة» لتُنسب لشحنتها.
              </p>
            </div>
          ) : null}
        </div>
      )}

      {mergeMode ? (
        <div className="sticky bottom-[calc(4.75rem+env(safe-area-inset-bottom))] z-30 mt-3 lg:bottom-4">
          <div className="surface space-y-2 p-3 shadow-lift">
            <p className="text-[0.82rem] font-bold">
              اختير {num(selected.length)} شحنة — الدمج يجمع الأرقام مع إبقاء كل شحنة مميّزة
            </p>
            <div className="flex gap-2">
              <input
                className="field flex-1"
                value={mergeName}
                onChange={(e) => setMergeName(e.target.value)}
                placeholder="اسم المجموعة، مثال: شحنات الصيف"
              />
              <Button loading={merging} disabled={selected.length < 2 || !mergeName.trim()} onClick={() => void merge()}>
                دمج
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      <ShipmentForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        shipment={editing}
        existing={shipments.data}
      />
      <ReceiveSheet shipment={receiving} onClose={() => setReceiving(null)} />
    </>
  );
}

function ShipmentRow({
  shipment,
  stats,
  inGroup,
  open,
  selectable,
  checked,
  onToggleCheck,
  onToggle,
  onReceive,
  onEdit,
  onUngroup,
}: {
  shipment: Shipment;
  stats?: ShipmentStats;
  inGroup: boolean;
  open: boolean;
  selectable: boolean;
  checked: boolean;
  onToggleCheck: () => void;
  onToggle: () => void;
  onReceive: () => void;
  onEdit: () => void;
  onUngroup: () => void;
}) {
  const sold = stats?.soldUnits ?? 0;
  const remaining = stats?.remainingUnits ?? 0;
  const totalUnits = sold + remaining;
  const soldPct = totalUnits === 0 ? 0 : (sold / totalUnits) * 100;

  return (
    <div className={inGroup ? 'border-b border-ink-200 last:border-0 dark:border-ink-800' : ''}>
      <div className="flex items-center gap-3 p-3.5">
        {selectable ? (
          <input
            type="checkbox"
            checked={checked}
            onChange={onToggleCheck}
            aria-label={`اختيار ${shipment.name}`}
            className="h-5 w-5 shrink-0 accent-brand-500"
          />
        ) : null}

        <button onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-3 text-right">
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="truncate text-[0.98rem] font-bold">{shipment.name}</span>
              <span className="tnum chip bg-ink-200 text-ink-600 dark:bg-ink-800 dark:text-ink-300">
                {shipment.code}
              </span>
            </span>
            <span className="tnum mt-0.5 block text-[0.75rem] font-semibold text-ink-400 dark:text-ink-500">
              {formatDate(shipment.arrivedAt)}
              {shipment.supplier ? ` · ${shipment.supplier}` : ''}
            </span>
          </span>
          <span className="shrink-0 text-left">
            <span className="tnum block font-display text-num font-black text-brand-500">
              {money(stats?.soldRevenue ?? 0)}
            </span>
            <span className="tnum block text-[0.72rem] font-bold text-ink-400 dark:text-ink-500">
              بيع {num(sold)} · باقي {num(remaining)}
            </span>
          </span>
          <IconChevronDown
            className={`h-4 w-4 shrink-0 text-ink-400 transition-transform ${open ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {/* Sold-through bar: the fastest read of "is this shipment moving?" */}
      {totalUnits > 0 ? (
        <div className="px-3.5 pb-3">
          <div className="h-1.5 overflow-hidden rounded-full bg-ink-200 dark:bg-ink-800">
            <div className="h-full rounded-full bg-brand-500" style={{ width: `${soldPct}%` }} />
          </div>
        </div>
      ) : null}

      {open ? (
        <div className="border-t border-ink-200 px-3.5 py-3 dark:border-ink-800">
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="قيمة المبيعات" value={money(stats?.soldRevenue ?? 0)} tone="brand" />
            <Metric label="ربح الشحنة" value={money(stats?.profit ?? 0)} tone="good" />
            <Metric label="تكلفة الباقي" value={money(stats?.remainingCost ?? 0)} />
            <Metric label="مصاريف الشحن" value={money(shipment.extraCost)} />
          </dl>

          {shipment.note ? (
            <p className="mt-3 text-[0.8rem] text-ink-500 dark:text-ink-400">{shipment.note}</p>
          ) : null}

          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={onReceive} icon={<IconPlus className="h-4 w-4" />}>
              استلام بضاعة
            </Button>
            <Button size="sm" variant="secondary" onClick={onEdit}>
              تعديل
            </Button>
            {shipment.groupId ? (
              <Button size="sm" variant="ghost" onClick={onUngroup}>
                إخراج من المجموعة
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: 'brand' | 'good' }) {
  return (
    <div>
      <dt className="text-[0.72rem] font-bold text-ink-400 dark:text-ink-500">{label}</dt>
      <dd
        className={`tnum mt-0.5 font-display text-[1.1rem] font-black ${
          tone === 'brand' ? 'text-brand-500' : tone === 'good' ? 'text-good' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}
