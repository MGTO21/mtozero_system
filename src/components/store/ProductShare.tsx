'use client';

import { useState } from 'react';

/**
 * Lets a customer pass a product on: the phone's own share sheet where there is
 * one (WhatsApp, Messenger, copy…), otherwise copy the link or open WhatsApp.
 * «حفظ الصورة» downloads the picture with the shop's mark on it.
 */
export function ProductShare({ name, path, imagePath }: { name: string; path: string; imagePath: string }) {
  const [copied, setCopied] = useState(false);
  const [fallback, setFallback] = useState(false);

  const url = () => new URL(path, window.location.origin).toString();
  const downloadHref = imagePath.startsWith('/img/') ? `${imagePath}${imagePath.includes('?') ? '&' : '?'}dl=1` : imagePath;

  async function share() {
    const link = url();
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: name, text: `${name} — من MTOZERO`, url: link });
        return;
      } catch (err) {
        // Closing the sheet is not a failure.
        if (err instanceof DOMException && err.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* clipboard blocked: the WhatsApp link below still works */
    }
    setFallback(true);
  }

  return (
    <div className="mt-4">
      <div className="grid grid-cols-2 gap-2.5">
        <button
          type="button"
          onClick={share}
          className="press inline-flex h-12 items-center justify-center rounded-card border border-line-strong font-display font-extrabold"
        >
          {copied ? 'اتنسخ الرابط' : 'شارك المنتج'}
        </button>
        <a
          href={downloadHref}
          download={`mtozero-${name}.jpg`}
          className="press inline-flex h-12 items-center justify-center rounded-card border border-line-strong font-display font-extrabold"
        >
          حفظ الصورة
        </a>
      </div>
      {fallback ? (
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`${name} — من MTOZERO\n${url()}`)}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 block text-center text-[0.88rem] font-bold text-fg-2 underline"
        >
          أرسل الرابط في واتساب
        </a>
      ) : null}
    </div>
  );
}
