import { canvasToBlob, loadImage, waitForFonts } from '@/lib/canvas-kit';
import { money } from '@/lib/format';
import type { Product, ShopSettings } from '@/lib/types';

/**
 * A ready-to-post picture of a product for WhatsApp status, Facebook and
 * Instagram: the photo, name, price (and the old price when on sale), the sizes
 * still in stock, the shop's logo and the store link. The shop sells mostly
 * through these channels, so a clean poster in two taps replaces a screenshot
 * of the product with a hand-typed price.
 *
 * Drawn on canvas like the invoices: no dependency and the same result on every
 * phone. Only sizes in stock are listed — a poster is an advert, not a stock
 * report — and never cost, supplier or exact quantities.
 */

export type PosterFormat = 'square' | 'story';

const SIZE: Record<PosterFormat, { w: number; h: number }> = {
  square: { w: 1080, h: 1350 }, // 4:5 — the tallest a feed post shows uncropped
  story: { w: 1080, h: 1920 }, // 9:16 — WhatsApp status, stories
};

const PAPER = '#FAF9F6';
const INK = '#111110';
const MUTED = '#706C65';
const SUNKEN = '#F0EEE9';
const BRAND = '#C2306E';

/** The real family names next/font generated, so the canvas uses the site's fonts. */
function fontFamily(variable: '--font-display' | '--font-body', fallback: string): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue(variable).trim();
  return v ? `${v}, ${fallback}` : fallback;
}

/** The best picture we have of the product: the sharp store copy, then Cloudinary, then the thumbnail. */
function productPicture(p: Product): string | null {
  if (p.hdHash) return `/img/${p.id}_hd?v=${p.hdHash}`;
  if (p.imageUrl) return p.imageUrl;
  return p.thumbData ?? null;
}

function loadCrossOrigin(src: string): Promise<HTMLImageElement | null> {
  if (!/^https?:/i.test(src)) return loadImage(src);
  return new Promise((resolve) => {
    const img = new Image();
    // Cloudinary sends CORS headers; without this the canvas could not be exported.
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Draws `img` to fill the box, cropping the overflow, like object-fit: cover. */
function drawCover(ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const scale = Math.max(w / img.width, h / img.height);
  const sw = w / scale;
  const sh = h / scale;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) / 2, sw, sh, x, y, w, h);
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Shrinks the font until the text fits in `maxWidth`, down to `min`. */
function fitFont(ctx: CanvasRenderingContext2D, text: string, weight: number, start: number, min: number, family: string, maxWidth: number) {
  let size = start;
  ctx.font = `${weight} ${size}px ${family}`;
  while (size > min && ctx.measureText(text).width > maxWidth) {
    size -= 2;
    ctx.font = `${weight} ${size}px ${family}`;
  }
  return size;
}

export async function renderProductPoster(
  product: Product,
  settings: ShopSettings,
  options: { format: PosterFormat; siteHost: string; whatsapp: string },
): Promise<Blob | null> {
  await waitForFonts();
  const { w, h } = SIZE[options.format];
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  const DISPLAY = fontFamily('--font-display', 'Cairo, system-ui, sans-serif');
  const BODY = fontFamily('--font-body', '"IBM Plex Sans Arabic", system-ui, sans-serif');
  const pad = 64;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, w, h);

  // Text block height decides how much is left for the photo.
  // brand + name + price + one or two rows of size chips + the 138px footer bar.
  const textBlock = options.format === 'story' ? 660 : 560;
  const photoH = h - textBlock;

  const src = productPicture(product);
  const photo = src ? await loadCrossOrigin(src) : null;
  ctx.fillStyle = SUNKEN;
  ctx.fillRect(0, 0, w, photoH);
  if (photo) drawCover(ctx, photo, 0, 0, w, photoH);

  // Sale tag on the photo.
  const compareAt = product.compareAtPrice && product.compareAtPrice > product.sellPrice ? product.compareAtPrice : 0;
  const tag = compareAt ? `-${Math.round((1 - product.sellPrice / compareAt) * 100)}%` : (product.storeBadge ?? '').trim();
  if (tag) {
    ctx.font = `900 44px ${DISPLAY}`;
    // "-18%" must read left to right; a custom badge is Arabic.
    ctx.direction = compareAt ? 'ltr' : 'rtl';
    const tw = ctx.measureText(tag).width + 48;
    ctx.fillStyle = compareAt ? BRAND : INK;
    roundRect(ctx, w - pad - tw, pad, tw, 78, 8);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tag, w - pad - tw / 2, pad + 41);
  }

  // ---- text block ----
  ctx.textBaseline = 'alphabetic';
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  const right = w - pad;
  let y = photoH + 84;

  if (product.brand) {
    ctx.fillStyle = MUTED;
    ctx.font = `800 30px ${DISPLAY}`;
    ctx.fillText(product.brand.toUpperCase(), right, y);
    y += 70;
  } else {
    y += 14;
  }

  ctx.fillStyle = INK;
  const nameSize = fitFont(ctx, product.name, 900, 76, 46, DISPLAY, w - pad * 2);
  ctx.fillText(product.name, right, y);
  y += nameSize + 30;

  // Price, then the old price struck through beside it.
  ctx.fillStyle = BRAND;
  ctx.font = `900 84px ${DISPLAY}`;
  const price = money(product.sellPrice);
  ctx.fillText(price, right, y);
  if (compareAt) {
    const pw = ctx.measureText(price).width;
    ctx.fillStyle = MUTED;
    ctx.font = `700 44px ${BODY}`;
    const old = money(compareAt);
    const ow = ctx.measureText(old).width;
    const ox = right - pw - 32;
    ctx.fillText(old, ox, y - 6);
    ctx.strokeStyle = MUTED;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(ox, y - 22);
    ctx.lineTo(ox - ow, y - 22);
    ctx.stroke();
  }
  y += 92;

  // Sizes still in stock, as chips.
  const sizes = product.sizes.filter((s) => s.qty > 0).map((s) => s.size);
  if (sizes.length > 0) {
    ctx.font = `800 36px ${DISPLAY}`;
    let x = right;
    let row = 0;
    for (const s of sizes) {
      const cw = Math.max(ctx.measureText(s).width + 44, 92);
      if (x - cw < pad) {
        if (row === 1 || options.format === 'square') break; // one row on a post, two on a story
        row++;
        x = right;
        y += 84;
      }
      ctx.strokeStyle = INK;
      ctx.lineWidth = 3;
      roundRect(ctx, x - cw, y - 50, cw, 70, 8);
      ctx.stroke();
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.fillText(s, x - cw / 2, y - 4);
      ctx.textAlign = 'right';
      x -= cw + 14;
    }
  }

  // ---- footer: logo, shop name, link ----
  const footY = h - 64;
  ctx.fillStyle = INK;
  ctx.fillRect(0, footY - 74, w, 138);
  const logo = settings.logoData ? await loadImage(settings.logoData) : null;
  let textRight = right;
  if (logo) {
    const box = 92;
    ctx.fillStyle = '#FFFFFF';
    roundRect(ctx, right - box, footY - 60, box, box, 10);
    ctx.fill();
    const r = Math.min((box - 12) / logo.width, (box - 12) / logo.height);
    ctx.drawImage(logo, right - box + (box - logo.width * r) / 2, footY - 60 + (box - logo.height * r) / 2, logo.width * r, logo.height * r);
    textRight = right - box - 24;
  }
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `900 40px ${DISPLAY}`;
  ctx.fillText(settings.shopName, textRight, footY - 12);
  ctx.fillStyle = 'rgba(255,255,255,0.72)';
  ctx.font = `600 28px ${BODY}`;
  ctx.fillText('الدفع عند الاستلام · اطلب من الموقع', textRight, footY + 26);

  ctx.textAlign = 'left';
  ctx.direction = 'ltr';
  ctx.fillStyle = '#FFFFFF';
  ctx.font = `800 30px ${BODY}`;
  ctx.fillText(options.siteHost, pad, footY - 12);
  if (options.whatsapp) {
    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.font = `600 28px ${BODY}`;
    ctx.fillText(`WhatsApp +${options.whatsapp}`, pad, footY + 26);
  }

  return canvasToBlob(canvas);
}

/** The caption that goes with the poster — paste-ready for WhatsApp or Facebook. */
export function posterCaption(product: Product, url: string): string {
  const sizes = product.sizes.filter((s) => s.qty > 0).map((s) => s.size);
  const lines = [`${product.name}${product.brand ? ` — ${product.brand}` : ''}`];
  const compareAt = product.compareAtPrice && product.compareAtPrice > product.sellPrice ? product.compareAtPrice : 0;
  lines.push(compareAt ? `السعر: ${money(product.sellPrice)} بدل ${money(compareAt)}` : `السعر: ${money(product.sellPrice)}`);
  if (sizes.length) lines.push(`المقاسات المتوفرة: ${sizes.join(' · ')}`);
  lines.push('الدفع عند الاستلام · توصيل لحدي الباب', '', `اطلب من هنا: ${url}`);
  return lines.join('\n');
}
