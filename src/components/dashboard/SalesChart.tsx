'use client';

import { useState } from 'react';
import type { DailyPoint } from '@/lib/analytics';
import { money, weekdayShort } from '@/lib/format';

/**
 * Hand-drawn SVG bar chart — seven bars, one label each. A charting library would
 * add ~100 KB and a generic look for something this simple.
 */
export function SalesChart({ points }: { points: DailyPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(...points.map((p) => p.revenue), 1);
  const hasData = points.some((p) => p.revenue > 0);

  return (
    <div>
      <div className="flex h-40 items-stretch gap-1.5 sm:gap-2.5">
        {points.map((p, i) => {
          const ratio = p.revenue / max;
          const isToday = i === points.length - 1;
          const isActive = active === i;
          return (
            <button
              key={p.key}
              type="button"
              onMouseEnter={() => setActive(i)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(i)}
              onBlur={() => setActive(null)}
              onClick={() => setActive((cur) => (cur === i ? null : i))}
              className="group relative flex h-full flex-1 flex-col gap-1.5"
              aria-label={`${weekdayShort(p.date)}: ${money(p.revenue)}`}
            >
              {isActive ? (
                <span className="tnum absolute -top-1 right-1/2 z-10 translate-x-1/2 whitespace-nowrap rounded-md bg-ink-900 px-2 py-1 text-[0.7rem] font-bold text-white dark:bg-ink-100 dark:text-ink-900">
                  {money(p.revenue)}
                </span>
              ) : null}

              {/* The track is a definite-height flex item, so the bar's % height resolves. */}
              <span className="flex min-h-0 w-full flex-1 items-end">
                <span
                  className={`w-full rounded-t transition-all ${
                    p.revenue === 0
                      ? 'bg-ink-200 dark:bg-ink-800'
                      : isToday
                        ? 'bg-brand-500'
                        : 'bg-brand-500/45 group-hover:bg-brand-500/70'
                  }`}
                  style={{ height: `${Math.max(p.revenue === 0 ? 3 : 8, ratio * 100)}%` }}
                />
              </span>

              <span
                className={`text-[0.68rem] font-bold ${
                  isToday ? 'text-brand-500' : 'text-ink-400 dark:text-ink-500'
                }`}
              >
                {weekdayShort(p.date)}
              </span>
            </button>
          );
        })}
      </div>

      {!hasData ? (
        <p className="mt-3 text-center text-[0.8rem] font-semibold text-ink-400 dark:text-ink-500">
          لا توجد مبيعات مسجّلة في آخر 7 أيام
        </p>
      ) : null}
    </div>
  );
}
