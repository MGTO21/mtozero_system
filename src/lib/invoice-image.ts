import { formatDate, money } from '@/lib/format';
import { itemGross, itemNetQty, saleDue, saleGross, saleTotal } from '@/lib/db/sales';
import type { Sale, ShopSettings } from '@/lib/types';

/**
 * Renders an invoice to a PNG entirely in the browser.
 *
 * Drawn on a canvas rather than screenshotting DOM with a library: it adds no
 * dependency, produces the same pixels on every device, and gives exact control
 * over an RTL layout that html-to-image tools routinely get wrong.
 */

const W = 900;
const PAD = 56;

const INK = '#0A0909';
const SURFACE = '#FFFFFF';
const MUTED = '#8A8486';
const LINE = '#E4E1E2';
const BRAND = '#E84B8A';
const ACCENT_A = '#1B9BE8';
const ACCENT_B = '#7E33D4';

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Fallback mark when the shop has not uploaded a logo yet. */
function drawDefaultMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const gradient = ctx.createLinearGradient(x, y + size, x + size, y);
  gradient.addColorStop(0, ACCENT_A);
  gradient.addColorStop(1, ACCENT_B);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = SURFACE;
  ctx.beginPath();
  ctx.arc(x + size / 2, y + size / 2, size / 4.4, 0, Math.PI * 2);
  ctx.fill();
}

function line(ctx: CanvasRenderingContext2D, y: number) {
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
}

/** Right-aligned label / left-aligned value, the natural pairing in an RTL bill. */
function row(
  ctx: CanvasRenderingContext2D,
  y: number,
  label: string,
  value: string,
  options: { bold?: boolean; color?: string; size?: number } = {},
) {
  const size = options.size ?? 24;
  ctx.textAlign = 'right';
  ctx.direction = 'rtl';
  ctx.font = `${options.bold ? '700' : '500'} ${size}px "IBM Plex Sans Arabic", system-ui, sans-serif`;
  ctx.fillStyle = options.color ?? INK;
  ctx.fillText(label, W - PAD, y);

  ctx.textAlign = 'left';
  ctx.font = `700 ${size}px "IBM Plex Sans Arabic", system-ui, sans-serif`;
  ctx.fillText(value, PAD, y);
}

export async function renderInvoicePng(sale: Sale, settings: ShopSettings): Promise<Blob | null> {
  const items = sale.items.filter((i) => itemNetQty(i) > 0);
  const gross = saleGross(sale);
  const total = saleTotal(sale);
  const due = saleDue(sale);

  // The canvas has no layout engine, so its height is computed up front from the
  // number of product lines plus the optional discount and balance rows.
  const extraRows = (sale.creditUsed > 0 ? 1 : 0) + (due > 0 ? 2 : 0);
  const H = 680 + Math.max(1, items.length) * 76 + extraRows * 46;

  const canvas = document.createElement('canvas');
  const scale = 2; // retina-quality output for phone screens
  canvas.width = W * scale;
  canvas.height = H * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);

  // Fonts must be ready or the first paint falls back to a system face.
  if ('fonts' in document) {
    try {
      await document.fonts.ready;
    } catch {
      /* proceed with whatever is loaded */
    }
  }

  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, W, H);

  // Brand bar across the top, the one place the logo gradient is used.
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, ACCENT_A);
  bar.addColorStop(1, ACCENT_B);
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, W, 10);

  // header
  const logo = settings.logoData ? await loadImage(settings.logoData) : null;
  const markSize = 92;
  if (logo) {
    const ratio = Math.min(markSize / logo.width, markSize / logo.height);
    const w = logo.width * ratio;
    const h = logo.height * ratio;
    ctx.drawImage(logo, W - PAD - w, 54 + (markSize - h) / 2, w, h);
  } else {
    drawDefaultMark(ctx, W - PAD - markSize, 54, markSize);
  }

  ctx.textAlign = 'right';
  ctx.direction = 'rtl';
  ctx.fillStyle = INK;
  ctx.font = '900 40px Cairo, system-ui, sans-serif';
  ctx.fillText(settings.shopName, W - PAD - markSize - 20, 96);

  ctx.font = '600 19px "IBM Plex Sans Arabic", system-ui, sans-serif';
  ctx.fillStyle = MUTED;
  ctx.fillText(settings.tagline, W - PAD - markSize - 20, 126);

  const contact = [settings.phone, settings.address].filter(Boolean).join('  ·  ');
  if (contact) {
    ctx.font = '500 18px "IBM Plex Sans Arabic", system-ui, sans-serif';
    ctx.fillText(contact, W - PAD - markSize - 20, 152);
  }

  line(ctx, 190);

  // invoice meta
  ctx.textAlign = 'right';
  ctx.fillStyle = INK;
  ctx.font = '800 26px Cairo, system-ui, sans-serif';
  ctx.fillText('فاتورة بيع', W - PAD, 236);

  ctx.textAlign = 'left';
  ctx.font = '600 19px "IBM Plex Sans Arabic", system-ui, sans-serif';
  ctx.fillStyle = MUTED;
  ctx.fillText(`${formatDate(sale.createdAt)}   ·   #${sale.id.slice(0, 6).toUpperCase()}`, PAD, 236);

  let y = 288;
  if (sale.customerName) {
    row(ctx, y, 'العميل', sale.customerName, { size: 22 });
    y += 40;
  }
  if (sale.customerPhone) {
    row(ctx, y, 'الهاتف', sale.customerPhone, { size: 22, color: MUTED });
    y += 40;
  }

  y += 14;
  line(ctx, y);
  y += 46;

  // One block per line on the invoice, with its own subtotal on the left.
  for (const item of items) {
    const itemQty = itemNetQty(item);

    ctx.textAlign = 'right';
    ctx.fillStyle = INK;
    ctx.font = '700 26px "IBM Plex Sans Arabic", system-ui, sans-serif';
    ctx.fillText(item.productName, W - PAD, y);

    ctx.textAlign = 'left';
    ctx.font = '800 26px Cairo, system-ui, sans-serif';
    ctx.fillText(money(itemGross(item)), PAD, y);
    y += 34;

    ctx.textAlign = 'right';
    ctx.font = '500 21px "IBM Plex Sans Arabic", system-ui, sans-serif';
    ctx.fillStyle = MUTED;
    ctx.fillText(
      `المقاس ${item.size}   ·   الكمية ${itemQty}   ·   سعر القطعة ${money(item.sellPrice)}`,
      W - PAD,
      y,
    );
    y += 42;
  }

  line(ctx, y);
  y += 50;

  if (sale.creditUsed > 0) {
    row(ctx, y, 'قبل الخصم', money(gross), { color: MUTED, size: 22 });
    y += 46;
    row(ctx, y, 'خصم رصيد الإحالة', `- ${money(sale.creditUsed)}`, { color: '#2FBF71', size: 22 });
    y += 46;
  }

  // total, the number the customer looks for
  ctx.textAlign = 'right';
  ctx.font = '800 28px Cairo, system-ui, sans-serif';
  ctx.fillStyle = INK;
  ctx.fillText('الإجمالي', W - PAD, y + 4);
  ctx.textAlign = 'left';
  ctx.font = '900 44px Cairo, system-ui, sans-serif';
  ctx.fillStyle = BRAND;
  ctx.fillText(money(total), PAD, y + 10);
  y += 60;

  if (due > 0) {
    row(ctx, y, 'المدفوع', money(sale.amountPaid), { size: 22 });
    y += 44;
    row(ctx, y, 'المتبقي', money(due), { bold: true, color: '#E8A33D', size: 24 });
    y += 44;
  } else {
    ctx.textAlign = 'right';
    ctx.font = '700 22px "IBM Plex Sans Arabic", system-ui, sans-serif';
    ctx.fillStyle = '#2FBF71';
    ctx.fillText('مدفوعة بالكامل ✓', W - PAD, y);
    y += 44;
  }

  // footer
  line(ctx, H - 118);
  ctx.textAlign = 'center';
  ctx.direction = 'rtl';
  ctx.font = '700 22px "IBM Plex Sans Arabic", system-ui, sans-serif';
  ctx.fillStyle = INK;
  ctx.fillText(settings.invoiceFooter, W / 2, H - 72);

  ctx.font = '500 17px "IBM Plex Sans Arabic", system-ui, sans-serif';
  ctx.fillStyle = MUTED;
  ctx.fillText(settings.shopName, W / 2, H - 42);

  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/png'));
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Uses the native share sheet when available, which on a phone puts WhatsApp one
 * tap away; falls back to a download on desktop.
 */
export async function shareInvoice(blob: Blob, sale: Sale): Promise<'shared' | 'downloaded'> {
  const filename = `invoice-${sale.id.slice(0, 6)}.png`;
  const file = new File([blob], filename, { type: 'image/png' });

  const nav = navigator as Navigator & {
    canShare?: (data: { files: File[] }) => boolean;
    share?: (data: { files: File[]; title?: string }) => Promise<void>;
  };

  if (nav.canShare?.({ files: [file] }) && nav.share) {
    try {
      await nav.share({ files: [file], title: 'فاتورة' });
      return 'shared';
    } catch {
      // User dismissed the sheet, or the platform refused — fall through.
    }
  }

  downloadBlob(blob, filename);
  return 'downloaded';
}
