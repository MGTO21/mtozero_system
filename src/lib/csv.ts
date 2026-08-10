/**
 * CSV export tuned for Arabic in Excel: UTF-8 BOM (otherwise Excel mangles the
 * text) and CRLF line endings.
 */
function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return '';
  const text = String(value);
  // A leading =, +, - or @ would be interpreted as a formula by Excel.
  const safe = /^[=+\-@]/.test(text) ? `'${text}` : text;
  return /[",\r\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  const lines = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))];
  return `﻿${lines.join('\r\n')}`;
}

export function downloadCsv(filename: string, headers: string[], rows: unknown[][]): void {
  const blob = new Blob([toCsv(headers, rows)], { type: 'text/csv;charset=utf-8;' });
  triggerDownload(blob, filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

export function downloadJson(filename: string, data: unknown): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  triggerDownload(blob, filename.endsWith('.json') ? filename : `${filename}.json`);
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Revoke on the next tick so Safari has time to start the download.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** yyyy-mm-dd stamp used in export filenames. */
export function stamp(d: Date = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
