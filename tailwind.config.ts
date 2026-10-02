import type { Config } from 'tailwindcss';

/**
 * Mtozero Shop design tokens — "the shop ledger".
 *
 * Every colour resolves to a CSS variable defined in globals.css, once for the
 * daylight paper theme (default) and once under `.dark`. That lets one class —
 * `text-brand-500`, `bg-surface` — be right in both themes, and it is why fuchsia
 * can be the deeper #C2306E on paper (where #E84B8A fails contrast for text) while
 * staying #E84B8A on the dark theme.
 *
 * Two naming layers:
 *   - ramps (ink, brand, accent): the raw scale, kept so older markup still works;
 *   - roles (page, surface, sunken, line, fg…): what new screens should reach for,
 *     because a role already knows what it should be in each theme.
 */
const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;
const ramp = (name: string, stops: (number | string)[]) =>
  Object.fromEntries(stops.map((s) => [s, v(`${name}-${s}`)]));

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        white: v('white'),
        /** Money and actions: buttons, prices, the selected state. */
        brand: ramp('brand', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        /** Identity colour sampled from the MTOZERO logo — for the brand, never for actions. */
        accent: ramp('accent', [50, 100, 200, 300, 400, 500, 600, 700, 800, 900]),
        /** The violet end of the logo gradient. Only the mark uses it. */
        violet: { 400: '#9A5BE0', 500: '#7E33D4', 600: '#6822B4' },
        /** Warm paper-to-ink ramp. Never blue-grey: it sits next to fuchsia and ledger paper. */
        ink: ramp('ink', [50, 100, 200, 300, 400, 500, 600, 700, 750, 800, 850, 900, 950]),
        good: v('good'),
        warn: v('warn'),
        bad: v('bad'),

        // Roles.
        page: v('page'),
        surface: v('surface'),
        sunken: v('sunken'),
        line: v('line'),
        'line-strong': v('line-strong'),
        fg: v('fg'),
        'fg-2': v('fg-2'),
        'fg-3': v('fg-3'),
      },
      fontFamily: {
        display: ['var(--font-display)', 'system-ui', 'sans-serif'],
        sans: ['var(--font-body)', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Dedicated scale for money/quantity readouts used mid-sale.
        num: ['1.375rem', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        'num-lg': ['2rem', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'num-xl': ['2.75rem', { lineHeight: '1', letterSpacing: '-0.025em' }],
        /** Small labels above figures: the ledger's printed column headings. */
        tag: ['0.7rem', { lineHeight: '1.2', letterSpacing: '0.02em' }],
      },
      borderRadius: {
        // Square-ish: printed forms and stamps, not soft app bubbles.
        card: '0.375rem',
      },
      boxShadow: {
        // One shadow only, for things that float above the page (sheets, the sell bar).
        lift: '0 1px 0 rgb(var(--ink-900) / 0.06), 0 10px 30px -14px rgb(var(--ink-900) / 0.35)',
        glow: '0 0 0 2px rgb(var(--brand-500) / 0.35)',
      },
      keyframes: {
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(0.5rem)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'sheet-up': {
          from: { transform: 'translateY(100%)' },
          to: { transform: 'translateY(0)' },
        },
        'fade-in': {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
        stamp: {
          from: { opacity: '0', transform: 'scale(1.4) rotate(-8deg)' },
          to: { opacity: '1', transform: 'scale(1) rotate(-4deg)' },
        },
      },
      animation: {
        'toast-in': 'toast-in 160ms ease-out',
        'sheet-up': 'sheet-up 220ms cubic-bezier(0.22, 1, 0.36, 1)',
        'fade-in': 'fade-in 160ms ease-out',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
        stamp: 'stamp 260ms cubic-bezier(0.34, 1.56, 0.64, 1) both',
      },
    },
  },
  plugins: [],
};

export default config;
