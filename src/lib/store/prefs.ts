'use client';

import { useSyncExternalStore } from 'react';
import type { Category, StoreLook } from '@/lib/types';

/**
 * What the website remembers about a visitor — in their own browser only, no
 * account: saved items, what they looked at, their size, their preferred look.
 * Same pattern as the cart: one cached value per key, shared by every component
 * and kept in step across tabs.
 */

function localStore<T>(key: string, fallback: T, sanitize: (raw: unknown) => T) {
  const listeners = new Set<() => void>();
  let cache: T | undefined;

  function get(): T {
    if (typeof window === 'undefined') return fallback;
    if (cache !== undefined) return cache;
    try {
      const raw = window.localStorage.getItem(key);
      cache = raw === null ? fallback : sanitize(JSON.parse(raw));
    } catch {
      cache = fallback;
    }
    return cache;
  }

  function set(next: T) {
    cache = next;
    try {
      window.localStorage.setItem(key, JSON.stringify(next));
    } catch {
      // Private mode or full storage: it still works for this visit.
    }
    listeners.forEach((fn) => fn());
  }

  if (typeof window !== 'undefined') {
    window.addEventListener('storage', (e) => {
      if (e.key !== key) return;
      cache = undefined;
      listeners.forEach((fn) => fn());
    });
  }

  function useValue(): T {
    return useSyncExternalStore(
      (fn) => {
        listeners.add(fn);
        return () => listeners.delete(fn);
      },
      get,
      () => fallback,
    );
  }

  return { get, set, use: useValue };
}

const ids = (raw: unknown): string[] =>
  Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(x)) : [];

const NO_IDS: string[] = [];

/* ---------- wishlist ---------- */

const wishlist = localStore<string[]>('mtozero-store-wishlist-v1', NO_IDS, (r) => ids(r).slice(0, 100));

export const useWishlist = wishlist.use;

/** Saves or un-saves a product; returns whether it is saved now. */
export function toggleWishlist(id: string): boolean {
  const current = wishlist.get();
  const saved = !current.includes(id);
  wishlist.set(saved ? [id, ...current] : current.filter((x) => x !== id));
  return saved;
}

/* ---------- recently viewed ---------- */

const recent = localStore<string[]>('mtozero-store-recent-v1', NO_IDS, (r) => ids(r).slice(0, 16));

export const useRecent = recent.use;

export function rememberViewed(id: string) {
  recent.set([id, ...recent.get().filter((x) => x !== id)].slice(0, 16));
}

/* ---------- my size ---------- */

export type MySizes = Partial<Record<Category, string>>;
const NO_SIZES: MySizes = {};

const mySizes = localStore<MySizes>('mtozero-store-mysize-v1', NO_SIZES, (r) => {
  const o = (r ?? {}) as Record<string, unknown>;
  const out: MySizes = {};
  if (typeof o.shoes === 'string' && o.shoes.length <= 12) out.shoes = o.shoes;
  if (typeof o.clothing === 'string' && o.clothing.length <= 12) out.clothing = o.clothing;
  return out;
});

export const useMySizes = mySizes.use;

export function setMySize(category: Category, size: string | null) {
  const next = { ...mySizes.get() };
  if (size) next[category] = size;
  else delete next[category];
  mySizes.set(next);
}

/* ---------- look ---------- */

/** Read by the inline script in the store layout before first paint — keep the key in sync. */
export const LOOK_KEY = 'mtozero-store-look';

export function applyLook(look: StoreLook) {
  try {
    window.localStorage.setItem(LOOK_KEY, look);
  } catch {
    // Not remembered, but still applied for this visit.
  }
  document.getElementById('store-root')?.setAttribute('data-look', look);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', look === 'luxe' ? '#09090A' : '#FAF9F6');
}

/* ---------- panels (in memory) ---------- */

type Panel = 'cart' | 'search' | null;
let panel: Panel = null;
const panelListeners = new Set<() => void>();

export function openPanel(next: Panel) {
  panel = next;
  panelListeners.forEach((fn) => fn());
}

export function usePanel(): Panel {
  return useSyncExternalStore(
    (fn) => {
      panelListeners.add(fn);
      return () => panelListeners.delete(fn);
    },
    () => panel,
    () => null,
  );
}

/** True after the first client render — for values that only exist in this browser. */
export function useMounted(): boolean {
  return useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );
}
