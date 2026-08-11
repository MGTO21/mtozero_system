'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { availableSizes, productImage, totalStock, useProducts } from '@/lib/db/products';
import { useCustomers } from '@/lib/db/customers';
import { money, num, whatsappNumber } from '@/lib/format';
import { IconBoxes, IconImage, IconSearch, IconTag, IconUserCircle } from '@/components/ui/Icons';
import type { Customer, Product } from '@/lib/types';

type Result =
  | { kind: 'product'; product: Product; matchedSize: string | null }
  | { kind: 'customer'; customer: Customer };

/**
 * One search box for the whole system, opened with Ctrl+K or the toolbar button.
 *
 * The driving scenario is a customer on WhatsApp asking "do you have this in 42?".
 * Answering it should not require navigating to inventory, clearing filters and
 * typing again — so a bare number is treated as a size query and matched against
 * every product's available sizes.
 */
export function QuickSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const { data: products } = useProducts();
  const { data: customers } = useCustomers();
  const [term, setTerm] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setTerm('');
      setActive(0);
      // Delay one frame so the input exists before we focus it.
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
      // Ctrl+K is a keyboard flow; closing must hand the caret back, not drop it.
      previouslyFocused?.focus?.();
    };
  }, [open]);

  const query = term.trim().toLowerCase();
  /** A bare number almost always means a shoe size, not a product name. */
  const asSize = /^\d{1,3}$/.test(query) ? query : null;

  const results = useMemo<Result[]>(() => {
    if (!query) return [];
    const out: Result[] = [];

    for (const p of products) {
      if (p.isArchived) continue;

      if (asSize) {
        const hit = availableSizes(p).find((s) => s.size === asSize);
        if (hit) out.push({ kind: 'product', product: p, matchedSize: hit.size });
        continue;
      }

      const haystack = [p.name, p.brand, p.sku, p.supplier].filter(Boolean).join(' ').toLowerCase();
      if (haystack.includes(query)) out.push({ kind: 'product', product: p, matchedSize: null });
    }

    if (!asSize) {
      const digits = query.replace(/\D/g, '');
      for (const c of customers) {
        const byName = c.name.toLowerCase().includes(query);
        const byPhone = digits.length >= 3 && c.phone.includes(digits);
        const byCode = c.referralCode.toLowerCase().includes(query);
        if (byName || byPhone || byCode) out.push({ kind: 'customer', customer: c });
      }
    }

    return out.slice(0, 12);
  }, [query, asSize, products, customers]);

  function go(result: Result) {
    onClose();
    if (result.kind === 'product') {
      router.push(`/sell?product=${result.product.id}`);
    } else {
      router.push(`/customers?focus=${result.customer.id}`);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(results.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const chosen = results[active];
      if (chosen) go(chosen);
    } else if (e.key === 'Escape') {
      onClose();
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[90] flex items-start justify-center px-4 pt-[12vh]">
      {/* Escape closes; a full-screen tab stop would only get in the way. */}
      <div aria-hidden="true" onClick={onClose} className="absolute inset-0 bg-ink-950/75 backdrop-blur-sm" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="بحث سريع"
        className="relative flex max-h-[70vh] w-full max-w-xl flex-col overflow-hidden rounded-card border border-ink-200 bg-white shadow-lift animate-sheet-up dark:border-ink-750 dark:bg-ink-850"
      >
        <div className="flex items-center gap-2.5 border-b border-ink-200 px-4 dark:border-ink-800">
          <IconSearch className="h-[1.15rem] w-[1.15rem] shrink-0 text-ink-400" />
          <input
            ref={inputRef}
            value={term}
            role="combobox"
            aria-expanded={results.length > 0}
            aria-controls="quick-search-results"
            aria-activedescendant={results.length > 0 ? `quick-search-option-${active}` : undefined}
            aria-autocomplete="list"
            onChange={(e) => {
              setTerm(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="اسم منتج، أو رقم مقاس، أو اسم عميل…"
            className="h-14 flex-1 bg-transparent text-[1rem] outline-none placeholder:text-ink-400"
          />
          <kbd className="hidden shrink-0 rounded border border-ink-200 px-1.5 py-0.5 text-[0.68rem] font-bold text-ink-400 dark:border-ink-700 sm:block">
            ESC
          </kbd>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {!query ? (
            <div className="px-3 py-8 text-center">
              <p className="text-[0.85rem] font-semibold text-ink-500 dark:text-ink-400">
                اكتب <span className="font-black text-brand-500">42</span> لترى كل المتوفر بهذا المقاس
              </p>
              <p className="mt-1.5 text-[0.78rem] text-ink-400 dark:text-ink-500">
                أو اسم منتج، أو اسم عميل أو رقم هاتفه
              </p>
            </div>
          ) : results.length === 0 ? (
            <div className="px-3 py-8 text-center text-[0.85rem] font-semibold text-ink-400 dark:text-ink-500">
              {asSize ? `لا يوجد أي منتج متوفر بمقاس ${asSize}` : 'لا توجد نتائج'}
            </div>
          ) : (
            <>
              {asSize ? (
                <p className="px-3 pb-2 pt-1 text-[0.76rem] font-bold text-brand-500">
                  {num(results.length)} منتج متوفر بمقاس {asSize}
                </p>
              ) : null}
              {/* Listbox semantics so the arrow-key highlight is actually announced
                  — without them a screen-reader user hears nothing while moving. */}
              <ul role="listbox" id="quick-search-results" aria-label="نتائج البحث">
                {results.map((r, i) => (
                  <li key={r.kind === 'product' ? r.product.id : r.customer.id} role="presentation">
                    <button
                      id={`quick-search-option-${i}`}
                      role="option"
                      aria-selected={i === active}
                      tabIndex={-1}
                      onMouseEnter={() => setActive(i)}
                      onClick={() => go(r)}
                      className={`flex w-full items-center gap-3 rounded-card px-3 py-2.5 text-right transition-colors
                        ${i === active ? 'bg-brand-500/12' : ''}`}
                    >
                      {r.kind === 'product' ? (
                        <ProductRow product={r.product} matchedSize={r.matchedSize} />
                      ) : (
                        <CustomerRow customer={r.customer} />
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-ink-200 px-4 py-2 text-[0.7rem] font-semibold text-ink-400 dark:border-ink-800 dark:text-ink-500">
          <span className="inline-flex items-center gap-1">
            <IconTag className="h-3.5 w-3.5" />
            المنتج يفتح على شاشة البيع
          </span>
          <span className="hidden sm:inline">↑↓ للتنقل · Enter للاختيار</span>
        </div>
      </div>
    </div>
  );
}

function ProductRow({ product, matchedSize }: { product: Product; matchedSize: string | null }) {
  const thumb = productImage(product);
  return (
    <>
      <span className="h-10 w-10 shrink-0 overflow-hidden rounded-card bg-ink-100 dark:bg-ink-900">
        {thumb ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={thumb} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full w-full items-center justify-center text-ink-300 dark:text-ink-700">
            <IconImage className="h-4 w-4" />
          </span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9rem] font-bold">{product.name}</span>
        <span className="tnum block text-[0.74rem] font-semibold text-ink-400 dark:text-ink-500">
          {matchedSize ? (
            <span className="text-good">
              مقاس {matchedSize} متوفر ·{' '}
              {num(product.sizes.find((s) => s.size === matchedSize)?.qty ?? 0)} قطعة
            </span>
          ) : (
            <>
              {num(totalStock(product))} قطعة · {num(availableSizes(product).length)} مقاس
            </>
          )}
        </span>
      </span>
      <span className="tnum shrink-0 font-display text-[0.95rem] font-black text-brand-500">
        {money(product.sellPrice)}
      </span>
      <IconBoxes className="h-4 w-4 shrink-0 text-ink-300 dark:text-ink-600" />
    </>
  );
}

function CustomerRow({ customer }: { customer: Customer }) {
  return (
    <>
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent-500/15 font-display text-sm font-black text-accent-500">
        {customer.name.trim().charAt(0)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[0.9rem] font-bold">{customer.name}</span>
        <span dir="ltr" className="tnum block truncate text-right text-[0.74rem] font-semibold text-ink-400 dark:text-ink-500">
          {whatsappNumber(customer.phone) ?? customer.phone}
        </span>
      </span>
      {customer.creditBalance > 0 ? (
        <span className="tnum shrink-0 chip bg-good/15 text-good">رصيد {money(customer.creditBalance)}</span>
      ) : null}
      <IconUserCircle className="h-4 w-4 shrink-0 text-ink-300 dark:text-ink-600" />
    </>
  );
}

/** Global Ctrl+K / Cmd+K listener, mounted once in the app shell. */
export function useQuickSearchHotkey(onOpen: () => void) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        onOpen();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onOpen]);
}
