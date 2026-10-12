'use client';

import { useSyncExternalStore } from 'react';

/**
 * The website visitor's basket. Kept in this browser only — no account needed —
 * and survives closing the tab, so a customer who leaves to ask a friend comes
 * back to the same basket.
 */

export interface CartItem {
  productId: string;
  name: string;
  size: string;
  qty: number;
  price: number;
  /** Image path for the cart thumbnail (/img/{id}?v=…). */
  image: string;
}

const KEY = 'mtozero-store-cart-v1';
const EMPTY: CartItem[] = [];
const listeners = new Set<() => void>();
let cache: CartItem[] | null = null;

function load(): CartItem[] {
  if (typeof window === 'undefined') return EMPTY;
  if (cache) return cache;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(KEY) ?? '[]');
    cache = Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    cache = [];
  }
  return cache;
}

function save(next: CartItem[]) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Private mode or full storage: the basket still works for this visit.
  }
  listeners.forEach((fn) => fn());
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    cache = null;
    listeners.forEach((fn) => fn());
  });
}

export function useCart(): CartItem[] {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    load,
    () => EMPTY,
  );
}

/** Adds a size to the basket; the same product and size adds to the quantity. */
export function addToCart(item: CartItem) {
  const current = load();
  const index = current.findIndex((c) => c.productId === item.productId && c.size === item.size);
  if (index === -1) save([...current, item]);
  else save(current.map((c, i) => (i === index ? { ...c, qty: Math.min(10, c.qty + item.qty) } : c)));
}

export function setCartQty(productId: string, size: string, qty: number) {
  save(
    load()
      .map((c) => (c.productId === productId && c.size === size ? { ...c, qty: Math.min(10, Math.max(0, qty)) } : c))
      .filter((c) => c.qty > 0),
  );
}

export function clearCart() {
  save([]);
}

export function cartCount(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.qty, 0);
}

export function cartSubtotal(items: CartItem[]): number {
  return items.reduce((sum, i) => sum + i.qty * i.price, 0);
}

export { productImagePath } from './paths';
