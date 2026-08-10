/**
 * The MTOZERO mark, rebuilt as inline SVG.
 *
 * Redrawn rather than embedded as PNG for three reasons: it stays sharp at every
 * size, it costs ~1 KB instead of ~80 KB, and the gradient can be given a unique
 * id per instance so several marks can sit on one page without clashing.
 */

let gradientSeq = 0;

/** The M-to-O monogram with the hanger inside the O. */
export function BrandMark({ className = 'h-8 w-8' }: { className?: string }) {
  const id = `mto-${(gradientSeq += 1)}`;
  return (
    <svg viewBox="0 0 64 64" className={className} role="img" aria-label="MTOZERO">
      <defs>
        <linearGradient id={id} x1="4" y1="56" x2="60" y2="10" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#1B9BE8" />
          <stop offset="0.45" stopColor="#38B0EE" />
          <stop offset="1" stopColor="#7E33D4" />
        </linearGradient>
      </defs>

      {/* M */}
      <path
        d="M6 52V17.5a1.5 1.5 0 0 1 2.6-1L21 30.4 33.4 16.5a1.5 1.5 0 0 1 2.6 1V26h-7.2l-6.6 7.4a1.6 1.6 0 0 1-2.4 0L13 26.4V52Z"
        fill={`url(#${id})`}
      />
      {/* T crossbar and stem, tucked into the M's right shoulder */}
      <path d="M26 10h22a1 1 0 0 1 1 1v6H26Z" fill={`url(#${id})`} />
      <path d="M33 17h7v14.2a12 12 0 0 0-7 3.4Z" fill={`url(#${id})`} />
      {/* O */}
      <path
        d="M44 26a13 13 0 1 1 0 26 13 13 0 0 1 0-26Zm0 7a6 6 0 1 0 0 12 6 6 0 0 0 0-12Z"
        fill={`url(#${id})`}
      />
      {/* hanger inside the O */}
      <path
        d="M44 34.6a1.7 1.7 0 0 0-1.7 1.7h1.4a.4.4 0 1 1 .4.4c-.4 0-.7.3-.7.6v.6l-4.2 2.6a.9.9 0 0 0 .5 1.7h9.3a.9.9 0 0 0 .5-1.7l-4.2-2.6v-.2a1.7 1.7 0 0 0-1.3-3.1Z"
        fill="#fff"
      />
    </svg>
  );
}

/** Mark plus wordmark. `compact` drops the tagline for tight bars. */
export function Brand({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <BrandMark className={compact ? 'h-7 w-7' : 'h-9 w-9'} />
      <span className="flex flex-col leading-none">
        <span
          className={`font-display font-black tracking-[0.06em] text-ink-900 dark:text-white ${
            compact ? 'text-base' : 'text-lg'
          }`}
        >
          MTOZERO
        </span>
        {!compact ? (
          <span className="mt-1 text-[0.56rem] font-bold tracking-[0.34em] text-ink-400 dark:text-ink-500">
            WEAR YOUR IDENTITY
          </span>
        ) : null}
      </span>
    </span>
  );
}
