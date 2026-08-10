import { Timestamp } from 'firebase/firestore';

/**
 * Money is displayed with Western digits (the shop reads numbers fastest that way)
 * and a Sudanese pound suffix. No decimals — prices here are whole pounds.
 */
export function money(value: number | null | undefined): string {
  const n = Number.isFinite(value as number) ? (value as number) : 0;
  const rounded = Math.round(n);
  return `${rounded.toLocaleString('en-US')} ج`;
}

/** Bare number with thousands separators, for quantity readouts. */
export function num(value: number | null | undefined): string {
  const n = Number.isFinite(value as number) ? (value as number) : 0;
  return n.toLocaleString('en-US');
}

export function percent(value: number | null | undefined, digits = 0): string {
  const n = Number.isFinite(value as number) ? (value as number) : 0;
  return `${n.toFixed(digits)}%`;
}

/** Profit margin on the sell price, i.e. how much of each pound is profit. */
export function margin(costPrice: number, sellPrice: number): number {
  if (!sellPrice) return 0;
  return ((sellPrice - costPrice) / sellPrice) * 100;
}

export function toDate(value: Timestamp | Date | null | undefined): Date | null {
  if (!value) return null;
  if (value instanceof Timestamp) return value.toDate();
  if (value instanceof Date) return value;
  return null;
}

const DATE_FMT = new Intl.DateTimeFormat('ar-EG', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  numberingSystem: 'latn',
});

const DATETIME_FMT = new Intl.DateTimeFormat('ar-EG', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  numberingSystem: 'latn',
});

const TIME_FMT = new Intl.DateTimeFormat('ar-EG', {
  hour: '2-digit',
  minute: '2-digit',
  numberingSystem: 'latn',
});

export function formatDate(value: Timestamp | Date | null | undefined): string {
  const d = toDate(value);
  return d ? DATE_FMT.format(d) : '—';
}

export function formatDateTime(value: Timestamp | Date | null | undefined): string {
  const d = toDate(value);
  return d ? DATETIME_FMT.format(d) : '—';
}

export function formatTime(value: Timestamp | Date | null | undefined): string {
  const d = toDate(value);
  return d ? TIME_FMT.format(d) : '—';
}

/** "قبل 5 دقائق" style label used in the activity log. */
export function relativeTime(value: Timestamp | Date | null | undefined): string {
  const d = toDate(value);
  if (!d) return '—';
  const diffSec = Math.round((Date.now() - d.getTime()) / 1000);
  if (diffSec < 60) return 'الآن';
  if (diffSec < 3600) return `قبل ${Math.floor(diffSec / 60)} دقيقة`;
  if (diffSec < 86400) return `قبل ${Math.floor(diffSec / 3600)} ساعة`;
  if (diffSec < 86400 * 7) return `قبل ${Math.floor(diffSec / 86400)} يوم`;
  return formatDate(d);
}

/* ---------- date-range helpers (all boundaries are local-time) ---------- */

export function startOfDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date = new Date()): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d: Date, days: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}

export function startOfMonth(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1, 0, 0, 0, 0);
}

export function endOfMonth(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** Last 7 days including today, oldest first. */
export function lastNDays(n: number): Date[] {
  const today = startOfDay();
  return Array.from({ length: n }, (_, i) => addDays(today, -(n - 1 - i)));
}

const WEEKDAY_FMT = new Intl.DateTimeFormat('ar-EG', { weekday: 'short' });
export function weekdayShort(d: Date): string {
  return WEEKDAY_FMT.format(d);
}

const MONTH_FMT = new Intl.DateTimeFormat('ar-EG', { month: 'long', year: 'numeric', numberingSystem: 'latn' });
export function monthLabel(d: Date): string {
  return MONTH_FMT.format(d);
}

/** yyyy-mm-dd, used as a stable key for grouping and for <input type="date">. */
export function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function parseDateKey(key: string): Date | null {
  const parts = key.split('-').map(Number);
  const [y, m, d] = parts;
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/** Normalizes 09xxxxxxxx / +2499xxxxxxxx into a wa.me-compatible number. */
export function whatsappNumber(phone: string | undefined | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('249')) return digits;
  if (digits.startsWith('0')) return `249${digits.slice(1)}`;
  if (digits.length === 9) return `249${digits}`;
  return digits;
}
