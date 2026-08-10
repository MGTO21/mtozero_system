'use client';

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';

type Theme = 'dark' | 'light';

interface ThemeApi {
  theme: Theme;
  toggle: () => void;
}

const ThemeContext = createContext<ThemeApi>({ theme: 'dark', toggle: () => {} });

export const THEME_KEY = 'mtozero-theme';

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Dark is the intended default: the shop is worked mostly in the evening.
  const [theme, setTheme] = useState<Theme>('dark');

  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark') setTheme(stored);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', theme === 'dark');
    root.style.colorScheme = theme;
    window.localStorage.setItem(THEME_KEY, theme);
  }, [theme]);

  const toggle = useCallback(() => setTheme((t) => (t === 'dark' ? 'light' : 'dark')), []);

  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeApi {
  return useContext(ThemeContext);
}
