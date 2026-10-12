'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { IconChevronLeft } from '@/components/ui/Icons';
import { bannerImagePath } from '@/lib/store/model';
import type { StoreBanner } from '@/lib/types';

const SLIDE_MS = 6000;

/**
 * The owner's banners, full width. Slides cross-fade with a slow push-in on the
 * picture; the dot under the current slide fills as its time runs. It pauses
 * while a finger or mouse is on it and when the tab is hidden, and swipes on a
 * phone. With "reduce motion" on, it simply stays put until tapped.
 */
export function HeroSlider({ banners }: { banners: StoreBanner[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const touchX = useRef<number | null>(null);
  const count = banners.length;

  const go = useCallback((next: number) => setIndex(((next % count) + count) % count), [count]);

  useEffect(() => {
    if (count < 2 || paused) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const t = window.setTimeout(() => go(index + 1), SLIDE_MS);
    return () => window.clearTimeout(t);
  }, [index, paused, count, go]);

  useEffect(() => {
    const onVis = () => setPaused(document.hidden);
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, []);

  if (count === 0) return null;

  return (
    <section
      aria-roledescription="carousel"
      aria-label="عروض المحل"
      className={`relative mx-auto max-w-7xl px-0 sm:px-6 ${paused ? 'hero-paused' : ''}`}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={(e) => {
        touchX.current = e.touches[0]?.clientX ?? null;
        setPaused(true);
      }}
      onTouchEnd={(e) => {
        const start = touchX.current;
        const end = e.changedTouches[0]?.clientX;
        touchX.current = null;
        setPaused(false);
        if (start === null || end === undefined || Math.abs(end - start) < 40) return;
        // RTL: swiping toward the right brings the next slide.
        go(end > start ? index + 1 : index - 1);
      }}
    >
      <div className="relative aspect-[4/5] overflow-hidden bg-sunken sm:aspect-[21/9] sm:rounded-card">
        {banners.map((b, i) => {
          const active = i === index;
          const light = b.tone === 'light';
          return (
            <div
              key={b.id}
              className="hero-slide absolute inset-0 transition-opacity duration-700"
              data-active={active}
              style={{ opacity: active ? 1 : 0, zIndex: active ? 1 : 0 }}
              aria-hidden={!active}
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} من ${count}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={bannerImagePath(b)}
                alt=""
                loading={i === 0 ? 'eager' : 'lazy'}
                className="hero-img absolute inset-0 h-full w-full object-cover"
              />
              {b.title || b.subtitle || b.cta ? (
                <div className="absolute inset-x-0 bottom-0 p-5 pb-12 sm:p-10 sm:pb-14">
                  {/* A solid scrim panel, not a gradient: legible on any picture. */}
                  <div
                    className={`hero-copy inline-block max-w-xl rounded-card p-4 sm:p-6 ${
                      light ? 'bg-ink-950/55 text-white' : 'bg-white/75 text-ink-950'
                    }`}
                  >
                    {b.title ? <h2 className="store-display !text-[clamp(2rem,6.5vw,4.4rem)]">{b.title}</h2> : null}
                    {b.subtitle ? (
                      <p className={`mt-2 max-w-md text-[1rem] font-semibold leading-relaxed sm:text-[1.1rem] ${light ? 'text-white/85' : 'text-ink-800'}`}>
                        {b.subtitle}
                      </p>
                    ) : null}
                    {b.cta ? (
                      <Link
                        href={b.href}
                        tabIndex={active ? 0 : -1}
                        className={`press mt-4 inline-flex h-12 items-center gap-2 rounded-full px-6 font-display text-[1rem] font-black ${
                          light ? 'bg-white text-ink-950' : 'bg-ink-950 text-white'
                        }`}
                      >
                        {b.cta}
                        <IconChevronLeft className="h-4 w-4" />
                      </Link>
                    ) : null}
                  </div>
                </div>
              ) : (
                <Link href={b.href} tabIndex={active ? 0 : -1} className="absolute inset-0" aria-label="افتح العرض" />
              )}
            </div>
          );
        })}

        {count > 1 ? (
          <div className="absolute inset-x-0 bottom-4 z-10 flex justify-center gap-2" style={{ '--slide-ms': `${SLIDE_MS}ms` } as React.CSSProperties}>
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                aria-label={`البانر ${i + 1}`}
                aria-current={i === index}
                onClick={() => go(i)}
                className="hero-dot flex h-6 items-center"
                data-active={i === index}
              >
                <span className={`block h-1 overflow-hidden rounded-full bg-white/40 ${i === index ? 'w-10' : 'w-5'} transition-all`}>
                  <span className="block h-full origin-right bg-white" style={{ transform: i === index ? undefined : 'scaleX(0)' }} />
                </span>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
