'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { addDays, dateKey, endOfDay, endOfMonth, parseDateKey, startOfDay, startOfMonth } from '@/lib/format';

export type RangePreset = 'today' | 'week' | 'month' | 'prev_month' | 'custom';

export interface DateRange {
  from: Date;
  to: Date;
  label: string;
}

const PRESET_LABELS: Record<Exclude<RangePreset, 'custom'>, string> = {
  today: 'اليوم',
  week: 'آخر 7 أيام',
  month: 'هذا الشهر',
  prev_month: 'الشهر الماضي',
};

export function resolvePreset(preset: Exclude<RangePreset, 'custom'>): DateRange {
  const now = new Date();
  switch (preset) {
    case 'today':
      return { from: startOfDay(now), to: endOfDay(now), label: PRESET_LABELS.today };
    case 'week':
      return { from: startOfDay(addDays(now, -6)), to: endOfDay(now), label: PRESET_LABELS.week };
    case 'month':
      return { from: startOfMonth(now), to: endOfDay(now), label: PRESET_LABELS.month };
    case 'prev_month': {
      const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      return { from: startOfMonth(prev), to: endOfMonth(prev), label: PRESET_LABELS.prev_month };
    }
  }
}

/** Preset chips plus an optional custom from/to pair. */
export function useDateRange(initial: Exclude<RangePreset, 'custom'> = 'month') {
  const [preset, setPreset] = useState<RangePreset>(initial);
  const [customFrom, setCustomFrom] = useState(dateKey(startOfMonth()));
  const [customTo, setCustomTo] = useState(dateKey(new Date()));

  const range = useMemo<DateRange>(() => {
    if (preset !== 'custom') return resolvePreset(preset);
    const from = parseDateKey(customFrom) ?? startOfMonth();
    const to = parseDateKey(customTo) ?? new Date();
    return {
      from: startOfDay(from),
      to: endOfDay(to),
      label: `${customFrom} ← ${customTo}`,
    };
  }, [preset, customFrom, customTo]);

  const picker = (
    <div className="space-y-2">
      <div className="scroller sm:mx-0 sm:px-0">
        {([...Object.keys(PRESET_LABELS), 'custom'] as RangePreset[]).map((key) => (
          <Pill key={key} active={preset === key} onClick={() => setPreset(key)}>
            {key === 'custom' ? 'فترة مخصصة' : PRESET_LABELS[key]}
          </Pill>
        ))}
      </div>

      {preset === 'custom' ? (
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="label">من</span>
            <input
              type="date"
              value={customFrom}
              max={customTo}
              onChange={(e) => setCustomFrom(e.target.value)}
              className="field tnum"
            />
          </label>
          <label className="block">
            <span className="label">إلى</span>
            <input
              type="date"
              value={customTo}
              min={customFrom}
              onChange={(e) => setCustomTo(e.target.value)}
              className="field tnum"
            />
          </label>
        </div>
      ) : null}
    </div>
  );

  return { range, picker, preset };
}

/**
 * A filter choice. Selected reads as a solid ink stamp, not a coloured fill —
 * fuchsia is kept for money and actions only.
 */
export function Pill({
  active,
  onClick,
  children,
  count,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
  count?: number;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`press inline-flex h-9 shrink-0 items-center gap-1.5 rounded-card border px-3 text-[0.84rem] font-bold transition-colors
        ${active ? 'border-fg bg-fg text-page' : 'border-line-strong bg-surface text-fg-2 hover:text-fg'}`}
    >
      {children}
      {count !== undefined ? (
        <span className={`tnum text-[0.74rem] ${active ? 'text-page/70' : 'text-fg-3'}`}>{count}</span>
      ) : null}
    </button>
  );
}
