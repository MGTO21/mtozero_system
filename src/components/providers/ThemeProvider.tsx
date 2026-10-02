'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'dark' | 'light';

interface ThemeApi {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeApi>({ theme: 'light', toggle: () => {} });

/**
 * v2: the default flipped from dark to daylight paper. The old key held 'dark' on
 * every device simply because dark used to be the default and was saved on each
 * load — reading it would have kept everyone on the old look. Only a choice made
 * after this change is remembered.
 */
export const THEME_KEY = 'mtozero-theme-v2';

const PAPER = '#F3EFE6';
const NIGHT = '#0F0D0B';

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>('light');

  useEffect(() => {
    try {
      if (window.localStorage.getItem(THEME_KEY) === 'dark') setTheme('dark');
    } catch {
      // Storage blocked: stay on the default.
    }
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    // The phone's status bar follows the page, so the app reads as one surface.
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', theme === 'dark' ? NIGHT : PAPER);
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme((t) => {
      const next = t === 'dark' ? 'light' : 'dark';
      try {
        window.localStorage.setItem(THEME_KEY, next);
      } catch {
        // Not remembered; still applied for this session.
      }
      return next;
    });
  }, []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  return useContext(ThemeContext);
}
