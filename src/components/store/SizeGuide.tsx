'use client';

import type { SizeKind } from '@/lib/types';
import { StoreSheet } from './StoreSheet';

/**
 * The size chart, as the owner wrote it in «واجهة المتجر»: one line per size,
 * "42 = 27 سم". Split on the first "=" into two columns; any other line is
 * shown as a note.
 */
export function SizeGuide({ kind, name, text, onClose }: { kind: SizeKind; name: string; text: string; onClose: () => void }) {
  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const rows = lines
    .filter((l) => l.includes('='))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim()] as const);
  const notes = lines.filter((l) => !l.includes('='));

  return (
    <StoreSheet title={`دليل مقاسات ${name}`} onClose={onClose}>
      {kind === 'shoes' ? (
        <p className="mb-4 text-[0.88rem] leading-relaxed text-fg-2">
          قيس رجلك من الكعب لأطول إصبع وإنت واقف، وقارن بالجدول. لو بين مقاسين، خُد الأكبر.
        </p>
      ) : (
        <p className="mb-4 text-[0.88rem] leading-relaxed text-fg-2">قيس حول أعرض نقطة في الصدر، والشريط موازي للأرض.</p>
      )}
      {rows.length > 0 ? (
        <table className="w-full overflow-hidden rounded-card border border-line text-[0.95rem]">
          <thead className="bg-sunken text-[0.8rem] text-fg-2">
            <tr>
              <th className="px-4 py-2.5 text-right font-bold">المقاس</th>
              <th className="px-4 py-2.5 text-right font-bold">{kind === 'shoes' ? 'طول الرجل' : 'القياس'}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {rows.map(([size, value]) => (
              <tr key={size}>
                <td className="tnum px-4 py-2.5 font-display font-black">{size}</td>
                <td className="tnum px-4 py-2.5 text-fg-2">{value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
      {notes.map((n) => (
        <p key={n} className="mt-3 text-[0.86rem] text-fg-3">
          {n}
        </p>
      ))}
    </StoreSheet>
  );
}
