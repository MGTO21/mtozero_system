import type { ShopSettings } from '@/lib/types';

/**
 * Shared canvas primitives for the images the app generates — invoices and
 * offer cards.
 *
 * Everything is drawn rather than screenshotted from the DOM: no dependency, the
 * same pixels on every device, and exact control over an RTL layout that
 * html-to-image tools routinely get wrong.
 */

export const W = 900;
export const PAD = 56;

export const INK = '#0A0909';
export const SURFACE = '#FFFFFF';
export const MUTED = '#8A8486';
export const LINE = '#E4E1E2';
export const BRAND = '#E84B8A';
export const ACCENT_A = '#1B9BE8';
export const ACCENT_B = '#7E33D4';

export function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src;
  });
}

/** Web fonts must be ready or the first paint falls back to a system face. */
export async function waitForFonts(): Promise<void> {
  if (!('fonts' in document)) return;
  try {
    await document.fonts.ready;
  } catch {
    /* proceed with whatever is loaded */
  }
}

/** Fallback mark when the shop has not uploaded a logo yet. */
export function drawDefaultMark(ctx: CanvasRenderingContext2D, x: number, y: number, size: number): void {
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

export function hLine(ctx: CanvasRenderingContext2D, y: number): void {
  ctx.strokeStyle = LINE;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(PAD, y);
  ctx.lineTo(W - PAD, y);
  ctx.stroke();
}

/** Right-aligned label / left-aligned value, the natural pairing in an RTL bill. */
export function labelValueRow(
  ctx: CanvasRenderingContext2D,
  y: number,
  label: string,
  value: string,
  options: { bold?: boolean; color?: string; size?: number } = {},
): void {
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

/** The brand gradient bar. The only place the logo gradient is used on an image. */
export function drawBrandBar(ctx: CanvasRenderingContext2D, height = 10): void {
  const bar = ctx.createLinearGradient(0, 0, W, 0);
  bar.addColorStop(0, ACCENT_A);
  bar.addColorStop(1, ACCENT_B);
  ctx.fillStyle = bar;
  ctx.fillRect(0, 0, W, height);
}

/** Logo, shop name, tagline and contact line. Returns the y to continue from. */
export async function drawShopHeader(
  ctx: CanvasRenderingContext2D,
  settings: ShopSettings,
  options: { onDark?: boolean } = {},
): Promise<number> {
  const nameColor = options.onDark ? SURFACE : INK;
  const subColor = options.onDark ? 'rgba(255,255,255,0.72)' : MUTED;

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
  ctx.fillStyle = nameColor;
  ctx.font = '900 40px Cairo, system-ui, sans-serif';
  ctx.fillText(settings.shopName, W - PAD - markSize - 20, 96);

  ctx.font = '600 19px "IBM Plex Sans Arabic", system-ui, sans-serif';
  ctx.fillStyle = subColor;
  ctx.fillText(settings.tagline, W - PAD - markSize - 20, 126);

  const contact = [settings.phone, settings.address].filter(Boolean).join('  ·  ');
  if (contact) {
    ctx.font = '500 18px "IBM Plex Sans Arabic", system-ui, sans-serif';
    ctx.fillText(contact, W - PAD - markSize - 20, 152);
  }

  return 190;
}

/** Creates a retina-scaled canvas context, or null where canvas is unavailable. */
export function makeCanvas(height: number): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement('canvas');
  const scale = 2; // retina-quality output for phone screens
  canvas.width = W * scale;
  canvas.height = height * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.scale(scale, scale);
  return { canvas, ctx };
}

export function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
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
 * Hands the image to the OS share sheet when available — on a phone that puts
 * WhatsApp one tap away — and falls back to a download on desktop.
 */
export async function shareImage(
  blob: Blob,
  filename: string,
  title: string,
): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], filename, { type: 'image/png' });
  const shareData = { files: [file], title };

  if (navigator.canShare?.(shareData)) {
    try {
      await navigator.share(shareData);
      return 'shared';
    } catch {
      // Cancelled or unsupported mid-flight — fall through to the download.
    }
  }

  downloadBlob(blob, filename);
  return 'downloaded';
}
