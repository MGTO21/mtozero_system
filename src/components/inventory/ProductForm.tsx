'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useActor } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button, IconButton } from '@/components/ui/Button';
import { IconImage, IconPlus, IconTrash, IconX } from '@/components/ui/Icons';
import { Sheet } from '@/components/ui/Sheet';
import { errorMessage } from '@/lib/db/collections';
import { cloudinaryEnabled } from '@/lib/cloudinary';
import { createProduct, productImage, updateProduct, type ProductInput } from '@/lib/db/products';
import { formatBytes, makeThumbnail } from '@/lib/image';
import { margin, money, percent } from '@/lib/format';
import type { Category, Product, SizeInput } from '@/lib/types';

interface Props {
  open: boolean;
  onClose: () => void;
  /** null → create mode. */
  product: Product | null;
}

const EMPTY: ProductInput = {
  name: '',
  category: 'shoes',
  brand: '',
  costPrice: 0,
  sellPrice: 0,
  sizes: [{ size: '', qty: 1 }],
  sku: '',
  supplier: '',
  lowStockThreshold: 2,
};

/** Ready-made size sets so a full run can be entered in two taps. */
const SIZE_PRESETS: Record<Category, { label: string; sizes: string[] }[]> = {
  shoes: [
    { label: '39 – 44', sizes: ['39', '40', '41', '42', '43', '44'] },
    { label: '36 – 41', sizes: ['36', '37', '38', '39', '40', '41'] },
    { label: '28 – 35 (أطفال)', sizes: ['28', '29', '30', '31', '32', '33', '34', '35'] },
  ],
  clothing: [
    { label: 'S – XXL', sizes: ['S', 'M', 'L', 'XL', 'XXL'] },
    { label: 'مقاسات حرة', sizes: ['فري سايز'] },
  ],
};

export function ProductForm({ open, onClose, product }: Props) {
  const actor = useActor();
  const toast = useToast();
  const [form, setForm] = useState<ProductInput>(EMPTY);
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [thumbBytes, setThumbBytes] = useState<number | null>(null);
  const [imageRemoved, setImageRemoved] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    if (product) {
      setForm({
        name: product.name,
        category: product.category,
        brand: product.brand ?? '',
        costPrice: product.costPrice,
        sellPrice: product.sellPrice,
        sizes: product.sizes.length ? product.sizes.map((s) => ({ ...s })) : [{ size: '', qty: 1 }],
        sku: product.sku ?? '',
        supplier: product.supplier ?? '',
        lowStockThreshold: product.lowStockThreshold,
      });
      setPreview(productImage(product));
    } else {
      setForm({ ...EMPTY, sizes: [{ size: '', qty: 1 }] });
      setPreview(null);
    }
    setImage(null);
    setThumbBytes(null);
    setImageRemoved(false);
  }, [open, product]);

  // Preview the actual compressed thumbnail, not the original file — what the
  // seller sees here is exactly what gets stored and shown on every screen.
  useEffect(() => {
    if (!image) return;
    let cancelled = false;
    void makeThumbnail(image)
      .then((thumb) => {
        if (cancelled) return;
        setPreview(thumb.dataUrl);
        setThumbBytes(thumb.bytes);
      })
      .catch(() => {
        if (!cancelled) toast.error('تعذّر معالجة هذه الصورة — جرّب صورة أخرى.');
      });
    return () => {
      cancelled = true;
    };
  }, [image, toast]);

  const marginPct = useMemo(
    () => margin(form.costPrice, form.sellPrice),
    [form.costPrice, form.sellPrice],
  );
  const unitProfit = form.sellPrice - form.costPrice;

  const patch = (p: Partial<ProductInput>) => setForm((f) => ({ ...f, ...p }));

  const setSize = (index: number, next: Partial<SizeInput>) =>
    setForm((f) => ({
      ...f,
      sizes: f.sizes.map((s, i) => (i === index ? { ...s, ...next } : s)),
    }));

  const addRow = () => setForm((f) => ({ ...f, sizes: [...f.sizes, { size: '', qty: 1 }] }));

  const removeRow = (index: number) =>
    setForm((f) => ({
      ...f,
      sizes: f.sizes.length === 1 ? [{ size: '', qty: 1 }] : f.sizes.filter((_, i) => i !== index),
    }));

  const applyPreset = (sizes: string[]) =>
    setForm((f) => {
      const existing = new Map(f.sizes.filter((s) => s.size.trim()).map((s) => [s.size.trim(), s.qty]));
      for (const s of sizes) if (!existing.has(s)) existing.set(s, 1);
      return { ...f, sizes: [...existing].map(([size, qty]) => ({ size, qty })) };
    });

  async function save() {
    setBusy(true);
    try {
      const result = product
        ? await updateProduct(product.id, form, image, imageRemoved, product, actor)
        : await createProduct(form, image, actor);

      if (result.warning) toast.info(result.warning);
      else toast.success(product ? 'تم حفظ التعديلات' : 'تمت إضافة المنتج');
      onClose();
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر حفظ المنتج.'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Sheet
      open={open}
      onClose={onClose}
      wide
      title={product ? 'تعديل منتج' : 'إضافة منتج جديد'}
      subtitle={product ? product.name : 'أدخل البيانات والمقاسات المتوفرة'}
      footer={
        <div className="flex gap-2">
          <Button block size="lg" loading={busy} onClick={() => void save()}>
            {product ? 'حفظ التعديلات' : 'إضافة المنتج'}
          </Button>
          <Button variant="secondary" size="lg" onClick={onClose}>
            إلغاء
          </Button>
        </div>
      }
    >
      <div className="space-y-5">
        {/* image */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="relative h-24 w-24 shrink-0 overflow-hidden rounded-card border border-dashed border-ink-300 bg-ink-100 text-ink-400 transition hover:border-brand-500 hover:text-brand-500 dark:border-ink-700 dark:bg-ink-900 dark:text-ink-600"
          >
            {preview ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="flex h-full w-full flex-col items-center justify-center gap-1 text-[0.68rem] font-bold">
                <IconImage className="h-6 w-6" />
                صورة
              </span>
            )}
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[0.85rem] font-bold">صورة المنتج</p>
            <p className="mt-0.5 text-[0.75rem] leading-relaxed text-ink-500 dark:text-ink-400">
              {thumbBytes !== null ? (
                <>
                  تم ضغطها إلى <span className="tnum font-bold">{formatBytes(thumbBytes)}</span> وتُحفظ مع
                  المنتج — تظهر حتى بدون إنترنت.
                  {cloudinaryEnabled ? ' والنسخة الكاملة تُرفع إلى Cloudinary.' : ''}
                </>
              ) : (
                <>اختيارية — تُضغط تلقائياً وتعمل بدون إنترنت. أي صورة من الكاميرا مناسبة.</>
              )}
            </p>
            {preview ? (
              <button
                type="button"
                onClick={() => {
                  setImage(null);
                  setPreview(null);
                  setThumbBytes(null);
                  setImageRemoved(true);
                  if (fileRef.current) fileRef.current.value = '';
                }}
                className="mt-1.5 inline-flex items-center gap-1 text-[0.75rem] font-bold text-bad"
              >
                <IconX className="h-3.5 w-3.5" />
                إزالة الصورة
              </button>
            ) : null}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              setImageRemoved(false);
              setImage(e.target.files?.[0] ?? null);
            }}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className="label" htmlFor="p-name">
              اسم الموديل *
            </label>
            <input
              id="p-name"
              className="field"
              value={form.name}
              onChange={(e) => patch({ name: e.target.value })}
              placeholder="مثال: سنيكرز أبيض جلد"
            />
          </div>

          <div>
            <label className="label">الفئة</label>
            <div className="grid grid-cols-2 gap-2">
              {(['shoes', 'clothing'] as Category[]).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => patch({ category: c })}
                  className={`h-11 rounded-card border text-[0.9rem] font-bold transition
                    ${form.category === c
                      ? 'border-brand-500 bg-brand-500/12 text-brand-500'
                      : 'border-ink-200 text-ink-500 dark:border-ink-700 dark:text-ink-400'}`}
                >
                  {c === 'shoes' ? 'أحذية' : 'ملابس'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="label" htmlFor="p-brand">
              الماركة
            </label>
            <input
              id="p-brand"
              className="field"
              value={form.brand}
              onChange={(e) => patch({ brand: e.target.value })}
              placeholder="اختياري"
            />
          </div>

          <div>
            <label className="label" htmlFor="p-cost">
              سعر التكلفة *
            </label>
            <input
              id="p-cost"
              type="number"
              inputMode="numeric"
              min={0}
              className="field tnum text-num font-bold"
              value={form.costPrice || ''}
              onChange={(e) => patch({ costPrice: Number(e.target.value) || 0 })}
              placeholder="0"
            />
          </div>

          <div>
            <label className="label" htmlFor="p-sell">
              سعر البيع *
            </label>
            <input
              id="p-sell"
              type="number"
              inputMode="numeric"
              min={0}
              className="field tnum text-num font-bold text-brand-500"
              value={form.sellPrice || ''}
              onChange={(e) => patch({ sellPrice: Number(e.target.value) || 0 })}
              placeholder="0"
            />
          </div>

          {form.sellPrice > 0 ? (
            <div className="surface-sunken flex items-center justify-between px-3.5 py-2.5 sm:col-span-2">
              <span className="text-[0.8rem] font-bold text-ink-500 dark:text-ink-400">ربح القطعة الواحدة</span>
              <span className="flex items-baseline gap-2">
                <span className={`tnum font-display text-num font-black ${unitProfit >= 0 ? 'text-good' : 'text-bad'}`}>
                  {money(unitProfit)}
                </span>
                <span className="tnum text-[0.78rem] font-bold text-ink-400 dark:text-ink-500">
                  ({percent(marginPct)})
                </span>
              </span>
            </div>
          ) : null}

          <div>
            <label className="label" htmlFor="p-sku">
              كود داخلي (SKU)
            </label>
            <input
              id="p-sku"
              className="field"
              dir="ltr"
              value={form.sku}
              onChange={(e) => patch({ sku: e.target.value })}
              placeholder="اختياري"
            />
          </div>

          <div>
            <label className="label" htmlFor="p-supplier">
              المورد
            </label>
            <input
              id="p-supplier"
              className="field"
              value={form.supplier}
              onChange={(e) => patch({ supplier: e.target.value })}
              placeholder="اختياري"
            />
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="p-threshold">
              حد التنبيه لكل مقاس
            </label>
            <input
              id="p-threshold"
              type="number"
              inputMode="numeric"
              min={0}
              className="field tnum"
              value={form.lowStockThreshold}
              onChange={(e) => patch({ lowStockThreshold: Number(e.target.value) || 0 })}
            />
            <p className="mt-1 text-[0.72rem] text-ink-400 dark:text-ink-500">
              ينبّهك النظام عندما تصل كمية أي مقاس لهذا الرقم أو أقل.
            </p>
          </div>
        </div>

        {/* sizes */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <label className="label mb-0">المقاسات والكميات *</label>
            <button
              type="button"
              onClick={addRow}
              className="inline-flex items-center gap-1 text-[0.8rem] font-bold text-brand-500"
            >
              <IconPlus className="h-4 w-4" />
              إضافة مقاس
            </button>
          </div>

          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {SIZE_PRESETS[form.category].map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.sizes)}
                className="rounded-card border border-ink-200 px-2.5 py-1 text-[0.75rem] font-bold text-ink-500 transition hover:border-brand-500 hover:text-brand-500 dark:border-ink-700 dark:text-ink-400"
              >
                + {preset.label}
              </button>
            ))}
          </div>

          <div className="space-y-2">
            {form.sizes.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  className="field w-24 text-center font-display font-extrabold"
                  value={row.size}
                  onChange={(e) => setSize(i, { size: e.target.value })}
                  placeholder="المقاس"
                  aria-label={`المقاس ${i + 1}`}
                />
                <div className="flex flex-1 items-center gap-1.5">
                  <button
                    type="button"
                    aria-label="إنقاص"
                    onClick={() => setSize(i, { qty: Math.max(0, row.qty - 1) })}
                    className="h-11 w-11 shrink-0 rounded-card border border-ink-200 text-lg font-bold dark:border-ink-700"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    className="field tnum flex-1 text-center text-num font-bold"
                    value={row.qty}
                    onChange={(e) => setSize(i, { qty: Math.max(0, Number(e.target.value) || 0) })}
                    aria-label={`الكمية للمقاس ${row.size || i + 1}`}
                  />
                  <button
                    type="button"
                    aria-label="زيادة"
                    onClick={() => setSize(i, { qty: row.qty + 1 })}
                    className="h-11 w-11 shrink-0 rounded-card border border-ink-200 text-lg font-bold dark:border-ink-700"
                  >
                    +
                  </button>
                </div>
                <IconButton label="حذف المقاس" onClick={() => removeRow(i)}>
                  <IconTrash className="h-4 w-4" />
                </IconButton>
              </div>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  );
}
