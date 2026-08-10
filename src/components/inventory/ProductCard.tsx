'use client';

import Link from 'next/link';
import { IconButton } from '@/components/ui/Button';
import { IconArchive, IconEdit, IconImage, IconRestore, IconTag } from '@/components/ui/Icons';
import { productImage, totalStock } from '@/lib/db/products';
import { margin, money, num, percent } from '@/lib/format';
import { CATEGORY_LABEL, type Product } from '@/lib/types';
import { SizeGrid } from './SizeGrid';

interface Props {
  product: Product;
  canSeeProfit: boolean;
  onEdit: (p: Product) => void;
  onArchive: (p: Product) => void;
  /** Size the current filter is matching, highlighted so the answer is instant. */
  highlightSize?: string | null;
}

export function ProductCard({ product, canSeeProfit, onEdit, onArchive, highlightSize }: Props) {
  const stock = totalStock(product);
  const marginPct = margin(product.costPrice, product.sellPrice);
  const thumb = productImage(product);

  return (
    <article
      className={`surface flex flex-col overflow-hidden transition-colors ${
        product.isArchived ? 'opacity-60' : ''
      }`}
    >
      <div className="flex gap-3 p-3">
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-card bg-ink-100 dark:bg-ink-900">
          {thumb ? (
            // The thumbnail is an inline data URI, so there is nothing to fetch and
            // nothing for the Next image optimizer to do.
            // eslint-disable-next-line @next/next/no-img-element
            <img src={thumb} alt={product.name} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-ink-300 dark:text-ink-700">
              <IconImage className="h-7 w-7" />
            </div>
          )}
          {stock === 0 ? (
            <span className="absolute inset-x-0 bottom-0 bg-ink-950/80 py-0.5 text-center text-[0.62rem] font-bold text-white">
              نفد المخزون
            </span>
          ) : null}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-1.5">
            <h3 className="min-w-0 flex-1 truncate text-[1.02rem] leading-snug">{product.name}</h3>
            <IconButton label="تعديل" onClick={() => onEdit(product)} className="-mt-1 h-8 w-8">
              <IconEdit className="h-4 w-4" />
            </IconButton>
            <IconButton
              label={product.isArchived ? 'استرجاع' : 'أرشفة'}
              onClick={() => onArchive(product)}
              className="-mt-1 h-8 w-8"
            >
              {product.isArchived ? <IconRestore className="h-4 w-4" /> : <IconArchive className="h-4 w-4" />}
            </IconButton>
          </div>

          <p className="mt-0.5 truncate text-[0.75rem] font-semibold text-ink-400 dark:text-ink-500">
            {CATEGORY_LABEL[product.category]}
            {product.brand ? ` · ${product.brand}` : ''}
            {product.sku ? ` · ${product.sku}` : ''}
          </p>

          <div className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="tnum font-display text-num font-black text-brand-500">{money(product.sellPrice)}</span>
            {canSeeProfit ? (
              <>
                <span className="tnum text-[0.75rem] font-bold text-ink-400 dark:text-ink-500">
                  تكلفة {money(product.costPrice)}
                </span>
                <span
                  className={`chip tnum ${
                    marginPct >= 30
                      ? 'bg-good/15 text-good'
                      : marginPct >= 15
                        ? 'bg-warn/15 text-warn'
                        : 'bg-bad/15 text-bad'
                  }`}
                  title="هامش الربح من سعر البيع"
                >
                  هامش {percent(marginPct)}
                </span>
              </>
            ) : null}
          </div>

          <p className="tnum mt-1 text-[0.75rem] font-bold text-ink-500 dark:text-ink-400">
            إجمالي المخزون: {num(stock)} قطعة
          </p>
        </div>
      </div>

      <div className="border-t border-ink-200 px-3 py-2.5 dark:border-ink-800">
        {highlightSize ? (
          <p className="mb-2 text-[0.75rem] font-bold text-brand-500">
            متوفر بمقاس {highlightSize} ✓
          </p>
        ) : null}
        <SizeGrid sizes={product.sizes} lowStockThreshold={product.lowStockThreshold} />
      </div>

      {!product.isArchived && stock > 0 ? (
        <Link
          href={`/sell?product=${product.id}`}
          className="flex items-center justify-center gap-1.5 border-t border-ink-200 py-2.5 text-[0.82rem] font-bold text-brand-500 transition-colors hover:bg-brand-500/8 dark:border-ink-800"
        >
          <IconTag className="h-4 w-4" />
          بيع هذا المنتج
        </Link>
      ) : null}
    </article>
  );
}
