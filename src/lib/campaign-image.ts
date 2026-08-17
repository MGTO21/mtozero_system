import { money } from '@/lib/format';
import { productImage } from '@/lib/db/products';
import {
  ACCENT_A,
  ACCENT_B,
  BRAND,
  INK,
  MUTED,
  PAD,
  SURFACE,
  W,
  canvasToBlob,
  drawShopHeader,
  hLine,
  loadImage,
  makeCanvas,
  shareImage,
  waitForFonts,
} from '@/lib/canvas-kit';
import type { Product, ShopSettings } from '@/lib/types';

/**
 * The offer card that goes out with a campaign.
 *
 * Clothing sells on sight — a text-only "new stock arrived" message asks the
 * customer to imagine the product. This draws the actual photos, names and
 * prices onto one image the owner attaches to the WhatsApp message.
 */

const CARD = 200;
const GAP = 20;
const COLUMNS = 3;

/** Wraps Arabic text to a width, returning the lines to draw. */
function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function renderOfferPng(
  products: Product[],
  settings: ShopSettings,
  headline: string,
  subline: string,
): Promise<Blob | null> {
  const shown = products.slice(0, 9);
  const rows = Math.max(1, Math.ceil(shown.length / COLUMNS));

  // No layout engine on a canvas, so the height is computed from the grid up front.
  const gridTop = 330;
  const rowHeight = CARD + 74;
  const H = gridTop + rows * rowHeight + 130;

  const surface = makeCanvas(H);
  if (!surface) return null;
  const { canvas, ctx } = surface;

  await waitForFonts();

  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, W, H);

  // A taller brand band than the invoice: this is an advert, not a document.
  const band = ctx.createLinearGradient(0, 0, W, 220);
  band.addColorStop(0, ACCENT_A);
  band.addColorStop(1, ACCENT_B);
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, W, 214);

  await drawShopHeader(ctx, settings, { onDark: true });

  // headline
  ctx.textAlign = 'right';
  ctx.direction = 'rtl';
  ctx.fillStyle = INK;
  ctx.font = '900 46px Cairo, system-ui, sans-serif';
  ctx.fillText(headline, W - PAD, 276);

  if (subline) {
    ctx.font = '600 22px "IBM Plex Sans Arabic", system-ui, sans-serif';
    ctx.fillStyle = MUTED;
    ctx.fillText(subline, W - PAD, 310);
  }

  // product grid, laid out right-to-left to match the reading direction
  const gridWidth = W - PAD * 2;
  const cellWidth = (gridWidth - GAP * (COLUMNS - 1)) / COLUMNS;

  for (let i = 0; i < shown.length; i++) {
    const product = shown[i]!;
    const column = i % COLUMNS;
    const row = Math.floor(i / COLUMNS);
    const x = W - PAD - cellWidth - column * (cellWidth + GAP);
    const y = gridTop + row * rowHeight;

    // photo, cropped to a square without distorting the garment
    const src = productImage(product);
    const image = src ? await loadImage(src) : null;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, cellWidth, CARD, 14);
    ctx.clip();
    if (image) {
      const scale = Math.max(cellWidth / image.width, CARD / image.height);
      const w = image.width * scale;
      const h = image.height * scale;
      ctx.drawImage(image, x + (cellWidth - w) / 2, y + (CARD - h) / 2, w, h);
    } else {
      ctx.fillStyle = '#F2F0F1';
      ctx.fillRect(x, y, cellWidth, CARD);
    }
    ctx.restore();

    ctx.textAlign = 'right';
    ctx.fillStyle = INK;
    ctx.font = '700 21px "IBM Plex Sans Arabic", system-ui, sans-serif';
    const nameLines = wrap(ctx, product.name, cellWidth).slice(0, 1);
    ctx.fillText(nameLines[0] ?? product.name, x + cellWidth, y + CARD + 30);

    ctx.fillStyle = BRAND;
    ctx.font = '900 26px Cairo, system-ui, sans-serif';
    ctx.fillText(money(product.sellPrice), x + cellWidth, y + CARD + 62);
  }

  // footer
  const footerY = gridTop + rows * rowHeight + 40;
  hLine(ctx, footerY);

  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  ctx.fillStyle = INK;
  ctx.font = '700 24px "IBM Plex Sans Arabic", system-ui, sans-serif';
  ctx.fillText(settings.phone ? `للطلب: ${settings.phone}` : settings.shopName, W / 2, footerY + 48);

  if (settings.address) {
    ctx.font = '500 19px "IBM Plex Sans Arabic", system-ui, sans-serif';
    ctx.fillStyle = MUTED;
    ctx.fillText(settings.address, W / 2, footerY + 80);
  }

  return canvasToBlob(canvas);
}

export function shareOffer(blob: Blob): Promise<'shared' | 'downloaded'> {
  return shareImage(blob, `mtozero-offer-${Date.now()}.png`, 'عرض');
}
