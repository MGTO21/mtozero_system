'use client';

import { useRef, useState, type ReactNode } from 'react';

/**
 * The product's pictures. On a phone they are a swipeable rail with a counter;
 * on a wide screen thumbnails sit underneath. With a single picture it is just
 * the picture — no empty controls.
 */
export function ProductGallery({ pictures, alt, children }: { pictures: string[]; alt: string; children?: ReactNode }) {
  const rail = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const many = pictures.length > 1;

  function go(i: number) {
    const el = rail.current;
    if (!el) return;
    // RTL rails scroll toward negative offsets.
    el.scrollTo({ left: -i * el.clientWidth, behavior: 'smooth' });
    setIndex(i);
  }

  return (
    <div className="md:sticky md:top-28 md:self-start">
      <div className="relative -mx-4 overflow-hidden bg-sunken sm:mx-0 sm:rounded-card">
        <div
          ref={rail}
          className="rail aspect-[4/5]"
          onScroll={(e) => {
            const el = e.currentTarget;
            const i = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
            if (i !== index) setIndex(i);
          }}
        >
          {pictures.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={src}
              src={src}
              alt={i === 0 ? alt : `${alt} — صورة ${i + 1}`}
              loading={i === 0 ? 'eager' : 'lazy'}
              decoding="async"
              className="h-full w-full shrink-0 object-cover"
            />
          ))}
        </div>
        {children}
        {many ? (
          <span className="tnum absolute bottom-3 left-3 rounded-full bg-ink-950/65 px-2.5 py-1 text-[0.78rem] font-bold text-white" dir="ltr">
            {index + 1} / {pictures.length}
          </span>
        ) : null}
      </div>

      {many ? (
        <div className="mt-3 hidden gap-2 sm:flex">
          {pictures.map((src, i) => (
            <button
              key={src}
              type="button"
              aria-label={`الصورة ${i + 1}`}
              aria-current={i === index}
              onClick={() => go(i)}
              className={`press h-20 w-16 shrink-0 overflow-hidden rounded-card border-2 bg-sunken transition-colors ${
                i === index ? 'border-fg' : 'border-transparent opacity-70 hover:opacity-100'
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
