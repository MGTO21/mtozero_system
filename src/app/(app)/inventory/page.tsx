'use client';

import { useMemo, useState } from 'react';
import { ProductCard } from '@/components/inventory/ProductCard';
import { ProductForm } from '@/components/inventory/ProductForm';
import { ValuePanel } from '@/components/inventory/ValuePanel';
import { useActor, useAuth } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button } from '@/components/ui/Button';
import { Pill } from '@/components/ui/DateRange';
import { useConfirm } from '@/components/ui/Confirm';
import { EmptyState, ErrorBlock, SkeletonRows } from '@/components/ui/Feedback';
import { IconBoxes, IconDownload, IconPlus, IconSearch, IconX } from '@/components/ui/Icons';
import { PageHeader, SectionTitle } from '@/components/ui/PageHeader';
import { inventoryValue, productValues } from '@/lib/analytics';
import { downloadCsv, stamp } from '@/lib/csv';
import { errorMessage } from '@/lib/db/collections';
import { setArchived, totalStock, useProducts } from '@/lib/db/products';
import { num } from '@/lib/format';
import { CATEGORY_LABEL, type Category, type Product } from '@/lib/types';

type Filter = 'all' | Category | 'low' | 'archived';

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'الكل' },
  { key: 'shoes', label: 'أحذية' },
  { key: 'clothing', label: 'ملابس' },
  { key: 'low', label: 'مخزون منخفض' },
  { key: 'archived', label: 'المؤرشف' },
];

export default function InventoryPage() {
  const { data: products, loading, error } = useProducts();
  const { canSeeProfit } = useAuth();
  const actor = useActor();
  const toast = useToast();
  const { confirm, dialog } = useConfirm();

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sizeFilter, setSizeFilter] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  /** Every size that exists anywhere, for the "who has size 42?" quick filter. */
  const allSizes = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.isArchived) continue;
      for (const s of p.sizes) set.add(s.size);
    }
    return [...set].sort((a, b) => {
      const na = Number(a);
      const nb = Number(b);
      if (!Number.isNaN(na) && !Number.isNaN(nb)) return na - nb;
      return a.localeCompare(b, 'ar');
    });
  }, [products]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (filter === 'archived') {
        if (!p.isArchived) return false;
      } else if (p.isArchived) {
        return false;
      }

      if (filter === 'shoes' && p.category !== 'shoes') return false;
      if (filter === 'clothing' && p.category !== 'clothing') return false;
      if (filter === 'low' && !p.sizes.some((s) => s.qty <= p.lowStockThreshold)) return false;

      if (sizeFilter && !p.sizes.some((s) => s.size === sizeFilter && s.qty > 0)) return false;

      if (q) {
        const haystack = [p.name, p.brand, p.sku, p.supplier].filter(Boolean).join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [products, search, filter, sizeFilter]);

  const activeCount = products.filter((p) => !p.isArchived).length;
  const totalPieces = products.reduce((sum, p) => (p.isArchived ? sum : sum + totalStock(p)), 0);

  /**
   * A stock-take sheet: every product with its quantity, what it cost and what it
   * should sell for. This is the file an owner takes into the store room to count
   * against, and the one an accountant asks for at year end.
   */
  function exportValuation() {
    const rows = productValues(products).map((row) => [
      row.product.name,
      row.product.brand ?? '',
      CATEGORY_LABEL[row.product.category],
      row.product.sku ?? '',
      row.units,
      row.product.sizes
        .filter((s) => s.qty > 0)
        .map((s) => `${s.size}:${s.qty}`)
        .join(' | '),
      Math.round(row.costValue / row.units),
      row.product.sellPrice,
      row.costValue,
      row.retailValue,
      row.retailValue - row.costValue,
    ]);

    const totals = inventoryValue(products);
    rows.push([
      'الإجمالي',
      '',
      '',
      '',
      totals.units,
      '',
      '',
      '',
      totals.costValue,
      totals.retailValue,
      totals.expectedProfit,
    ]);

    downloadCsv(
      `mtozero-inventory-${stamp()}`,
      [
        'المنتج',
        'الماركة',
        'الفئة',
        'الكود',
        'الكمية',
        'المقاسات',
        'متوسط التكلفة',
        'سعر البيع',
        'قيمة التكلفة',
        'قيمة البيع',
        'الربح المتوقع',
      ],
      rows,
    );
    toast.success('تم تصدير جرد المخزون');
  }

  async function onArchive(product: Product) {
    const archiving = !product.isArchived;
    await confirm({
      title: archiving ? 'أرشفة المنتج' : 'استرجاع المنتج',
      message: archiving
        ? `سيُخفى "${product.name}" من قوائم البيع، لكن تاريخ مبيعاته يبقى محفوظاً في التقارير. يمكنك استرجاعه في أي وقت.`
        : `سيعود "${product.name}" للظهور في المخزون وشاشة البيع.`,
      confirmLabel: archiving ? 'أرشفة' : 'استرجاع',
      // The dialog holds its spinner until the write lands.
      action: async () => {
        try {
          await setArchived(product, archiving, actor);
          toast.success(archiving ? 'تمت الأرشفة' : 'تم الاسترجاع');
        } catch (err) {
          toast.error(errorMessage(err));
        }
      },
    });
  }

  return (
    <>
      <PageHeader
        title="المخزون"
        subtitle={loading ? undefined : `${num(activeCount)} منتج · ${num(totalPieces)} قطعة`}
        action={
          <Button
            variant="ink"
            size="sm"
            icon={<IconPlus className="h-4 w-4" />}
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            منتج جديد
          </Button>
        }
      />

      {/* Valuation exposes cost prices, so it follows the profit permission. */}
      {canSeeProfit && !loading && products.length > 0 ? (
        <section className="surface mb-3 p-4">
          <SectionTitle
            action={
              <button
                type="button"
                onClick={exportValuation}
                className="inline-flex items-center gap-1.5 text-[0.8rem] font-bold text-fg-2 underline"
              >
                <IconDownload className="h-4 w-4" />
                تصدير الجرد
              </button>
            }
          >
            قيمة المخزون الحالية
          </SectionTitle>
          <ValuePanel products={products} />
        </section>
      ) : null}

      <div className="mb-3 space-y-2.5">
        <div className="relative">
          <IconSearch className="pointer-events-none absolute right-3 top-1/2 h-[1.1rem] w-[1.1rem] -translate-y-1/2 text-fg-3" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="field pr-10"
            placeholder="ابحث بالاسم أو الماركة أو الكود…"
            type="search"
          />
        </div>

        <div className="scroller sm:mx-0 sm:px-0">
          {FILTERS.map((f) => (
            <Pill key={f.key} active={filter === f.key} onClick={() => setFilter(f.key)}>
              {f.label}
            </Pill>
          ))}
        </div>

        {allSizes.length > 0 ? (
          <div className="surface-sunken px-3 py-2.5">
            <p className="mb-2 text-[0.8rem] font-bold text-fg-2">العميل سأل عن مقاس؟ اضغط عليه وشوف المتوفر طوالي</p>
            <div className="flex flex-wrap gap-1.5">
              {allSizes.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={sizeFilter === s}
                  onClick={() => setSizeFilter((cur) => (cur === s ? null : s))}
                  className={`press tnum h-10 min-w-[2.75rem] rounded-card border-[1.5px] px-2 font-display text-[1rem] font-black transition-colors
                    ${sizeFilter === s ? 'border-fg bg-fg text-page' : 'border-line-strong bg-surface text-fg'}`}
                >
                  {s}
                </button>
              ))}
              {sizeFilter ? (
                <button
                  onClick={() => setSizeFilter(null)}
                  className="inline-flex items-center gap-1 rounded-card px-2.5 py-1.5 text-[0.78rem] font-bold text-bad"
                >
                  <IconX className="h-3.5 w-3.5" />
                  إلغاء الفلتر
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>

      {sizeFilter ? (
        <p className="mb-3 text-[0.9rem] font-extrabold text-fg">
          {visible.length > 0
            ? `${num(visible.length)} منتج متوفر بمقاس ${sizeFilter}`
            : `لا يوجد أي منتج متوفر بمقاس ${sizeFilter} حالياً`}
        </p>
      ) : null}

      {error ? <ErrorBlock message={error} /> : null}

      {loading ? (
        <SkeletonRows count={4} />
      ) : products.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={<IconBoxes className="h-7 w-7" />}
            title="المخزون فارغ"
            hint="ابدأ بإضافة أول منتج — الاسم، السعر، والمقاسات المتوفرة. بعدها تقدر تبيع منه مباشرة."
            action={
              <Button
                size="lg"
                icon={<IconPlus className="h-5 w-5" />}
                onClick={() => {
                  setEditing(null);
                  setFormOpen(true);
                }}
              >
                إضافة أول منتج
              </Button>
            }
          />
        </div>
      ) : visible.length === 0 ? (
        <div className="surface">
          <EmptyState title="لا توجد نتائج" hint="جرّب كلمة بحث أخرى أو ألغِ الفلاتر." />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              canSeeProfit={canSeeProfit}
              highlightSize={sizeFilter}
              onEdit={(prod) => {
                setEditing(prod);
                setFormOpen(true);
              }}
              onArchive={(prod) => void onArchive(prod)}
            />
          ))}
        </div>
      )}

      <ProductForm open={formOpen} onClose={() => setFormOpen(false)} product={editing} />
      {dialog}
    </>
  );
}
