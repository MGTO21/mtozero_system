'use client';

import { useMemo, useState } from 'react';
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
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {(Object.keys(PRESET_LABELS) as Exclude<RangePreset, 'custom'>[]).map((key) => (
          <button
            key={key}
            onClick={() => setPreset(key)}
            className={`shrink-0 rounded-card border px-3 py-1.5 text-[0.8rem] font-bold transition
              ${preset === key
                ? 'border-brand-500 bg-brand-500 text-white'
                : 'border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-400'}`}
          >
            {PRESET_LABELS[key]}
          </button>
        ))}
        <button
          onClick={() => setPreset('custom')}
          className={`shrink-0 rounded-card border px-3 py-1.5 text-[0.8rem] font-bold transition
            ${preset === 'custom'
              ? 'border-brand-500 bg-brand-500 text-white'
              : 'border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-400'}`}
        >
          فترة مخصصة
        </button>
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
