import type { Config } from 'tailwindcss';

/**
 * Mtozero Shop design tokens.
 * Deliberately narrow palette: warm fuchsia brand + neutral near-black surfaces.
 * No purple/blue gradients, no generic indigo.
 */
const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /**
         * Interaction colour: buttons, prices, selected states. Kept fuchsia
         * because it out-contrasts the logo blue on a near-black surface, and the
         * numbers on this screen are read at speed.
         */
        brand: {
          50: '#FEF2F7',
          100: '#FDE3EE',
          200: '#FBC7DD',
          300: '#F79CC2',
          400: '#F16BA2',
          500: '#E84B8A',
          600: '#D22F70',
          700: '#AF215A',
          800: '#8D1E4B',
          900: '#741D41',
        },
        /** Identity colour, sampled from the MTOZERO logo. Used for the mark and
         * for anything that speaks about the brand rather than about an action. */
        accent: {
          50: '#EDF8FE',
          100: '#D5EFFC',
          200: '#A9DFF9',
          300: '#6FC9F4',
          400: '#38B0EE',
          500: '#1B9BE8',
          600: '#127BC4',
          700: '#12609B',
          800: '#154F7C',
          900: '#164365',
        },
        /** The violet end of the logo gradient. Only the mark uses it. */
        violet: {
          400: '#9A5BE0',
          500: '#7E33D4',
          600: '#6822B4',
        },
        // Neutral ramp tuned warm-neutral (never blue-grey) so it sits calmly next to fuchsia.
        ink: {
          50: '#F7F6F6',
          100: '#EDEBEC',
          200: '#D9D6D7',
          300: '#B5B0B2',
          400: '#8A8486',
          500: '#645F61',
          600: '#4A4547',
          700: '#332F31',
          750: '#282526',
          800: '#1E1C1D',
          850: '#171516',
          900: '#111011',
          950: '#0A0909',
        },
        good: '#2FBF71',
        warn: '#E8A33D',
        bad: '#E2483C',
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
      },
      borderRadius: {
        card: '0.625rem',
      },
      boxShadow: {
        lift: '0 1px 2px rgb(0 0 0 / 0.25), 0 8px 24px -12px rgb(0 0 0 / 0.45)',
        glow: '0 0 0 1px rgb(232 75 138 / 0.35), 0 6px 20px -8px rgb(232 75 138 / 0.4)',
      },
      keyframes: {
        'toast-in': {
          from: { opacity: '0', transform: 'translateY(0.5rem) scale(0.98)' },
          to: { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'sheet-up': {
          from: { opacity: '0', transform: 'translateY(1.5rem)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-soft': {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.45' },
        },
      },
      animation: {
        'toast-in': 'toast-in 160ms ease-out',
        'sheet-up': 'sheet-up 180ms cubic-bezier(0.22, 1, 0.36, 1)',
        'pulse-soft': 'pulse-soft 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
