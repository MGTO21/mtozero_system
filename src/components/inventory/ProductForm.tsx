'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useActor } from '@/components/providers/AuthProvider';
import { useToast } from '@/components/providers/ToastProvider';
import { Button, IconButton } from '@/components/ui/Button';
import { IconImage, IconPlus, IconTrash, IconX } from '@/components/ui/Icons';
import { Sheet } from '@/components/ui/Sheet';
import { errorMessage } from '@/lib/db/collections';
import { cloudinaryEnabled } from '@/lib/cloudinary';
import {
  createProduct,
  GALLERY_IMAGE,
  productImage,
  updateProduct,
  type GalleryInput,
  type ProductInput,
} from '@/lib/db/products';
import { hashString } from '@/lib/db/store';
import { galleryImagePath } from '@/lib/store/paths';
import { formatBytes, makeThumbnail } from '@/lib/image';
import { submitStockAdjust } from '@/lib/offline/operations';
import { margin, money, percent } from '@/lib/format';
import { MAX_GALLERY, type Category, type Product, type SizeInput } from '@/lib/types';

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
  description: '',
  onStore: true,
  compareAtPrice: 0,
  featured: false,
  storeBadge: '',
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
  const galleryRef = useRef<HTMLInputElement>(null);
  /** Extra store pictures; `data` marks ones picked in this edit. */
  const [gallery, setGallery] = useState<GalleryInput[]>([]);
  const [galleryBusy, setGalleryBusy] = useState(false);

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
        description: product.description ?? '',
        onStore: product.onStore,
        compareAtPrice: product.compareAtPrice ?? 0,
        featured: product.featured === true,
        storeBadge: product.storeBadge ?? '',
      });
      setPreview(productImage(product));
    } else {
      setForm({ ...EMPTY, sizes: [{ size: '', qty: 1 }] });
      setPreview(null);
    }
    setImage(null);
    setThumbBytes(null);
    setImageRemoved(false);
    setGallery(product?.gallery?.map((g) => ({ ...g })) ?? []);
  }, [open, product]);

  async function addGalleryFiles(files: File[]) {
    const room = MAX_GALLERY - gallery.length;
    if (room <= 0) return;
    setGalleryBusy(true);
    try {
      const added: GalleryInput[] = [];
      for (const file of files.slice(0, room)) {
        const { dataUrl } = await makeThumbnail(file, GALLERY_IMAGE);
        added.push({ id: Math.random().toString(36).slice(2, 10), hash: hashString(dataUrl), data: dataUrl });
      }
      setGallery((g) => [...g, ...added].slice(0, MAX_GALLERY));
      if (files.length > room) toast.info(`الحد ${MAX_GALLERY} صور إضافية — اتضافت ${room} بس.`);
    } catch (err) {
      toast.error(errorMessage(err, 'تعذّر معالجة الصورة — جرّب صورة أخرى.'));
    } finally {
      setGalleryBusy(false);
    }
  }

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
      let queuedStock = false;
      let warning: string | null;
      const kept = new Set(gallery.map((g) => g.id));
      const input: ProductInput = {
        ...form,
        gallery,
        galleryRemoved: (product?.gallery ?? []).filter((g) => !kept.has(g.id)).map((g) => g.id),
      };
      if (product) {
        warning = (await updateProduct(product.id, input, image, imageRemoved, actor)).warning;
        // Quantities travel separately, as differences applied against the
        // server's live stock — see updateProduct for why.
        const adjusted = await submitStockAdjust(product, form.sizes, form.costPrice, actor);
        queuedStock = adjusted?.queued ?? false;
      } else {
        warning = (await createProduct(input, image, actor)).warning;
      }

      if (warning) toast.info(warning);
      else if (queuedStock) toast.success('حُفظ التعديل — الكميات تُطبَّق عند عودة الشبكة');
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
            className="relative h-24 w-24 shrink-0 overflow-hidden rounded-card border border-dashed border-line-strong bg-sunken text-fg-3 transition hover:border-fg hover:text-fg"
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
            <p className="mt-0.5 text-[0.75rem] leading-relaxed text-fg-2">
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
                      : 'border-line-strong bg-surface text-fg-2'}`}
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
              <span className="text-[0.8rem] font-bold text-fg-2">ربح القطعة الواحدة</span>
              <span className="flex items-baseline gap-2">
                <span className={`tnum font-display text-num font-black ${unitProfit >= 0 ? 'text-good' : 'text-bad'}`}>
                  {money(unitProfit)}
                </span>
                <span className="tnum text-[0.78rem] font-bold text-fg-3">
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
            <p className="mt-1 text-[0.72rem] text-fg-3">
              ينبّهك النظام عندما تصل كمية أي مقاس لهذا الرقم أو أقل.
            </p>
          </div>

          <div className="sm:col-span-2">
            <label className="label" htmlFor="p-desc">
              وصف للموقع
            </label>
            <textarea
              id="p-desc"
              rows={2}
              className="field resize-none"
              value={form.description ?? ''}
              onChange={(e) => patch({ description: e.target.value })}
              placeholder="خامة، مناسبة الاستخدام، نصيحة المقاس… (اختياري)"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-3 rounded-card border border-line bg-sunken px-3.5 py-3 sm:col-span-2">
            <span className="min-w-0 flex-1">
              <span className="block font-bold">اعرض في المتجر الإلكتروني</span>
              <span className="block text-[0.78rem] text-fg-3">يظهر للعملاء لما يكون متوفر وعندو صورة</span>
            </span>
            <input
              type="checkbox"
              checked={form.onStore !== false}
              onChange={(e) => patch({ onStore: e.target.checked })}
              className="h-6 w-6 accent-[rgb(var(--fg))]"
            />
          </label>

          {form.onStore !== false ? (
            <>
              <div>
                <label className="label" htmlFor="p-compare">
                  السعر قبل الخصم (للموقع)
                </label>
                <input
                  id="p-compare"
                  type="number"
                  inputMode="numeric"
                  min={0}
                  className="field tnum"
                  value={form.compareAtPrice || ''}
                  onChange={(e) => patch({ compareAtPrice: Number(e.target.value) || 0 })}
                  placeholder="فاضي = ما في تخفيض"
                />
                <p className="mt-1 text-[0.72rem] text-fg-3">بيظهر مشطوب جنب السعر، ويدخل المنتج قسم التخفيضات.</p>
              </div>
              <div>
                <label className="label" htmlFor="p-badge">
                  شارة على الصورة
                </label>
                <input
                  id="p-badge"
                  maxLength={18}
                  className="field"
                  value={form.storeBadge ?? ''}
                  onChange={(e) => patch({ storeBadge: e.target.value })}
                  placeholder="مثلاً: حصري، أصلي، كمية محدودة"
                />
              </div>
              <label className="flex cursor-pointer items-center gap-3 rounded-card border border-line bg-sunken px-3.5 py-3 sm:col-span-2">
                <span className="min-w-0 flex-1">
                  <span className="block font-bold">من مختارات المحل</span>
                  <span className="block text-[0.78rem] text-fg-3">يظهر في قسم «مختارات المحل» في أول الموقع</span>
                </span>
                <input
                  type="checkbox"
                  checked={form.featured === true}
                  onChange={(e) => patch({ featured: e.target.checked })}
                  className="h-6 w-6 accent-[rgb(var(--fg))]"
                />
              </label>
            </>
          ) : null}
        </div>

        {/* extra store pictures */}
        {form.onStore !== false ? (
          <div>
            <div className="mb-2 flex items-baseline justify-between gap-2">
              <p className="label mb-0">صور إضافية للموقع</p>
              <span className="tnum text-[0.75rem] font-bold text-fg-3">
                {gallery.length} / {MAX_GALLERY}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {gallery.map((g, i) => (
                <div key={g.id} className="relative h-24 w-20 overflow-hidden rounded-card border border-line bg-sunken">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.data ?? (product ? galleryImagePath(product.id, g) : '')} alt="" className="h-full w-full object-cover" />
                  <button
                    type="button"
                    aria-label={`إزالة الصورة ${i + 1}`}
                    onClick={() => setGallery((list) => list.filter((x) => x.id !== g.id))}
                    className="absolute left-1 top-1 flex h-7 w-7 items-center justify-center rounded-full bg-ink-950/70 text-white"
                  >
                    <IconX className="h-3.5 w-3.5" />
                  </button>
                  {i > 0 ? (
                    <button
                      type="button"
                      aria-label="قدّمها"
                      onClick={() =>
                        setGallery((list) => {
                          const next = [...list];
                          [next[i - 1], next[i]] = [next[i]!, next[i - 1]!];
                          return next;
                        })
                      }
                      className="absolute bottom-1 right-1 rounded-[3px] bg-ink-950/70 px-1.5 text-[0.68rem] font-bold text-white"
                    >
                      قدّم
                    </button>
                  ) : null}
                </div>
              ))}
              {gallery.length < MAX_GALLERY ? (
                <button
                  type="button"
                  disabled={galleryBusy}
                  onClick={() => galleryRef.current?.click()}
                  className="flex h-24 w-20 flex-col items-center justify-center gap-1 rounded-card border border-dashed border-line-strong bg-sunken text-[0.7rem] font-bold text-fg-3 transition hover:border-fg hover:text-fg disabled:opacity-60"
                >
                  <IconPlus className="h-5 w-5" />
                  {galleryBusy ? 'بيضغط…' : 'أضف صور'}
                </button>
              ) : null}
            </div>
            <p className="mt-1.5 text-[0.72rem] text-fg-3">
              زوايا تانية، المنتج ملبوس، تفاصيل الخامة — بتظهر في صفحة المنتج في الموقع. اختيارية، وتقدر تختار كذا صورة مرة وحدة.
            </p>
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                const files = Array.from(e.target.files ?? []);
                e.target.value = '';
                if (files.length) void addGalleryFiles(files);
              }}
            />
          </div>
        ) : null}

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
                className="rounded-card border border-line px-2.5 py-1 text-[0.75rem] font-bold text-fg-2 transition hover:border-fg hover:text-fg"
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
                    className="h-11 w-11 shrink-0 rounded-card border border-line text-lg font-bold "
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
                    className="h-11 w-11 shrink-0 rounded-card border border-line text-lg font-bold "
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
