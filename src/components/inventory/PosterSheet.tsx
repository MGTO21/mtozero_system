'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/providers/ToastProvider';
import { Button, Spinner } from '@/components/ui/Button';
import { IconCopy, IconDownload, IconShare } from '@/components/ui/Icons';
import { Sheet } from '@/components/ui/Sheet';
import { downloadBlob, shareImage } from '@/lib/canvas-kit';
import { useSettings } from '@/lib/db/settings';
import { useStoreConfig } from '@/lib/db/store';
import { copyText } from '@/lib/invoice';
import { posterCaption, renderProductPoster, type PosterFormat } from '@/lib/product-poster';
import type { Product } from '@/lib/types';

/**
 * The product as a ready-made post: pick feed or status size, share straight
 * to WhatsApp or Facebook from the phone's share sheet, and copy the caption
 * with the price, sizes and the order link.
 */
export function PosterSheet({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { settings } = useSettings();
  const { config } = useStoreConfig();
  const toast = useToast();
  const [format, setFormat] = useState<PosterFormat>('square');
  const [blob, setBlob] = useState<Blob | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  const site = typeof window === 'undefined' ? '' : window.location.origin;
  const url = product ? `${site}/p/${product.id}` : '';

  useEffect(() => {
    if (!product) return;
    let cancelled = false;
    setRendering(true);
    void renderProductPoster(product, settings, {
      format,
      siteHost: site.replace(/^https?:\/\//, ''),
      whatsapp: config.whatsapp,
    })
      .then((b) => {
        if (cancelled) return;
        setBlob(b);
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return b ? URL.createObjectURL(b) : null;
        });
      })
      .finally(() => !cancelled && setRendering(false));
    return () => {
      cancelled = true;
    };
  }, [product, format, settings, config.whatsapp, site]);

  useEffect(() => {
    if (!product) {
      setBlob(null);
      setPreview((old) => {
        if (old) URL.revokeObjectURL(old);
        return null;
      });
    }
  }, [product]);

  const filename = product ? `${product.name.replace(/[^\p{L}\p{N}]+/gu, '-')}-${format}.png` : 'poster.png';

  async function share() {
    if (!blob || !product) return;
    // The caption goes to the clipboard first: most share targets drop text sent with an image.
    await copyText(posterCaption(product, url));
    const result = await shareImage(blob, filename, product.name);
    toast.success(result === 'shared' ? 'النص اتنسخ — الصقو مع الصورة' : 'اتحفظت الصورة، والنص اتنسخ');
  }

  return (
    <Sheet
      open={product !== null}
      onClose={onClose}
      title="بوستر للسوشيال"
      subtitle={product?.name}
      footer={
        <div className="grid grid-cols-2 gap-2">
          <Button block size="lg" disabled={!blob} icon={<IconShare className="h-5 w-5" />} onClick={() => void share()}>
            شارك
          </Button>
          <Button
            block
            size="lg"
            variant="secondary"
            disabled={!blob}
            icon={<IconDownload className="h-5 w-5" />}
            onClick={() => blob && downloadBlob(blob, filename)}
          >
            حمّل الصورة
          </Button>
        </div>
      }
    >
      <div className="seg mb-3">
        <button type="button" aria-pressed={format === 'square'} onClick={() => setFormat('square')}>
          منشور (فيسبوك)
        </button>
        <button type="button" aria-pressed={format === 'story'} onClick={() => setFormat('story')}>
          حالة واتساب
        </button>
      </div>

      <div className={`relative mx-auto overflow-hidden rounded-card border border-line bg-sunken ${format === 'story' ? 'aspect-[9/16] max-w-[17rem]' : 'aspect-[4/5] max-w-sm'}`}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="معاينة البوستر" className={`h-full w-full object-contain transition-opacity ${rendering ? 'opacity-50' : ''}`} />
        ) : null}
        {rendering ? (
          <span className="absolute inset-0 flex items-center justify-center">
            <Spinner className="h-7 w-7" />
          </span>
        ) : null}
      </div>

      <div className="mt-4">
        <div className="mb-1.5 flex items-center justify-between">
          <p className="label mb-0">النص المرافق</p>
          <button
            type="button"
            onClick={() => product && void copyText(posterCaption(product, url)).then(() => toast.success('اتنسخ النص'))}
            className="inline-flex items-center gap-1 text-[0.8rem] font-bold text-brand-500"
          >
            <IconCopy className="h-4 w-4" />
            انسخ
          </button>
        </div>
        <pre className="surface-sunken whitespace-pre-wrap p-3 font-sans text-[0.86rem] leading-relaxed text-fg-2">
          {product ? posterCaption(product, url) : ''}
        </pre>
        <p className="mt-2 text-[0.76rem] text-fg-3">
          البوستر بيعرض المقاسات المتوفرة بس، وما فيهو تكلفة ولا كميات. الصورة الأوضح بتطلع للمنتجات اللي صورتها اتحفظت بعد تحديث الجودة.
        </p>
      </div>
    </Sheet>
  );
}
