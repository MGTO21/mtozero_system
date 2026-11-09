import path from 'node:path';
import { createCanvas, GlobalFonts, loadImage, type Image, type SKRSContext2D } from '@napi-rs/canvas';
import { fetchThumb } from '@/lib/store/server';
import type { CatalogItem } from '@/lib/types';
import { formatPrice, SOCIAL_SITE, SOCIAL_WHATSAPP } from './captions';
import { KIND_LABEL } from './feed';
import type { SocialKind } from './pick';

/**
 * The daily post image, drawn on the server from live catalog data.
 *
 * Skia (@napi-rs/canvas) shapes Arabic with HarfBuzz, so letters join correctly —
 * next/og's Satori does not, which is why the store's other generated images
 * stay Latin-only. Fonts ship in assets/fonts (OFL) and are traced into the
 * function bundle by next.config.mjs.
 */

const W = 1080;
const H = 1350;
const PAD = 60;
const RIGHT = W - PAD;

const PAPER = '#F5F2EB';
const INK = '#111110';
const ACCENT = '#6D3FD8';
const MUTED = '#6E6A60';

const F = {
  display: 'Tajawal XB',
  displayBold: 'Tajawal B',
  body: 'Plex Arabic M',
  bodyStrong: 'Plex Arabic SB',
  mono: 'Plex Mono SB',
};

let fontsReady = false;
function registerFonts() {
  if (fontsReady) return;
  const dir = path.join(process.cwd(), 'assets', 'fonts');
  GlobalFonts.registerFromPath(path.join(dir, 'Tajawal-ExtraBold.ttf'), F.display);
  GlobalFonts.registerFromPath(path.join(dir, 'Tajawal-Bold.ttf'), F.displayBold);
  GlobalFonts.registerFromPath(path.join(dir, 'IBMPlexSansArabic-Medium.ttf'), F.body);
  GlobalFonts.registerFromPath(path.join(dir, 'IBMPlexSansArabic-SemiBold.ttf'), F.bodyStrong);
  GlobalFonts.registerFromPath(path.join(dir, 'IBMPlexMono-SemiBold.ttf'), F.mono);
  fontsReady = true;
}

/** Asks Cloudinary for a sensibly sized copy instead of the camera original. */
function sized(url: string): string {
  return url.includes('/upload/') && !url.includes('/upload/w_') ? url.replace('/upload/', '/upload/w_1400,c_limit,q_auto/') : url;
}

function fromDataUri(uri: string): Buffer | null {
  const comma = uri.indexOf(',');
  return comma > 0 ? Buffer.from(uri.slice(comma + 1), 'base64') : null;
}

export type PictureQuality = 'full' | 'hd' | 'thumb' | 'none';

/** The sharpest picture available: Cloudinary original, then the store's HD copy, then the thumbnail. */
export async function loadPicture(item: CatalogItem): Promise<{ image: Image | null; quality: PictureQuality }> {
  if (item.imageUrl) {
    try {
      const res = await fetch(sized(item.imageUrl), { cache: 'no-store' });
      if (res.ok) return { image: await loadImage(Buffer.from(await res.arrayBuffer())), quality: 'full' };
    } catch {
      /* fall through to the stored copies */
    }
  }
  for (const [id, quality] of [
    [`${item.id}_hd`, 'hd'],
    [item.id, 'thumb'],
  ] as const) {
    if (quality === 'hd' && !item.hdHash) continue;
    const uri = await fetchThumb(id);
    const bytes = uri ? fromDataUri(uri) : null;
    if (bytes) {
      try {
        return { image: await loadImage(bytes), quality };
      } catch {
        /* try the next copy */
      }
    }
  }
  return { image: null, quality: 'none' };
}

function roundRect(ctx: SKRSContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Skia lays a line out left to right whatever `ctx.direction` says, so a name
 * like "تشيرت اوفر سايز DIOR" came out with DIOR first. Wrapping the text in a
 * right-to-left isolate (RLI … PDI) gives it the right base direction.
 */
const rtl = (value: string) => `\u2067${value}\u2069`;

/** Draws text right-aligned at `x` in the given direction and returns its width. */
function text(ctx: SKRSContext2D, value: string, x: number, y: number, font: string, color: string, dir: 'rtl' | 'ltr' = 'rtl') {
  const shaped = dir === 'rtl' ? rtl(value) : value;
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.direction = dir;
  ctx.textAlign = 'right';
  ctx.fillText(shaped, x, y);
  return ctx.measureText(shaped).width;
}

/** Splits a name over at most two lines at word boundaries, shrinking the type if it still does not fit. */
function fitName(ctx: SKRSContext2D, name: string, maxWidth: number): { lines: string[]; size: number } {
  for (const size of [58, 52, 46, 40]) {
    ctx.font = `${size}px "${F.display}"`;
    ctx.direction = 'rtl';
    if (ctx.measureText(rtl(name)).width <= maxWidth) return { lines: [name], size };
    const words = name.split(/\s+/);
    for (let cut = words.length - 1; cut > 0; cut--) {
      const first = words.slice(0, cut).join(' ');
      const second = words.slice(cut).join(' ');
      if (ctx.measureText(rtl(first)).width <= maxWidth && ctx.measureText(rtl(second)).width <= maxWidth) {
        return { lines: [first, second], size };
      }
    }
  }
  return { lines: [name], size: 40 };
}

/** Lays chips out right to left, wrapping to new rows. Returns the rows of [label, width]. */
function chipRows(ctx: SKRSContext2D, sizes: string[], firstRowWidth: number, rowWidth: number) {
  ctx.font = `28px "${F.bodyStrong}"`;
  const rows: { label: string; w: number }[][] = [[]];
  let room = firstRowWidth;
  for (const label of sizes) {
    const w = Math.ceil(ctx.measureText(rtl(label)).width) + 44;
    if (w > room && rows[rows.length - 1]!.length) {
      rows.push([]);
      room = rowWidth;
    }
    rows[rows.length - 1]!.push({ label, w });
    room -= w + 12;
  }
  return rows;
}

export async function renderCard(item: CatalogItem, kind: SocialKind, sizes: string[]): Promise<Buffer> {
  registerFonts();
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, W, H);

  // Header: shop name (purple first word) and the line under it.
  const brandFont = `44px "${F.display}"`;
  const first = text(ctx, 'امتوزيرو', RIGHT, 104, brandFont, ACCENT);
  ctx.font = brandFont;
  text(ctx, 'للملابس', RIGHT - first - ctx.measureText(' ').width, 104, brandFont, INK);
  text(ctx, 'Mtozero Shop · الأبيض', RIGHT, 146, `26px "${F.body}"`, MUTED, 'ltr');

  // Kind pill, outlined, top left.
  const label = KIND_LABEL[kind];
  ctx.font = `28px "${F.bodyStrong}"`;
  ctx.direction = 'rtl';
  const pillW = Math.ceil(ctx.measureText(rtl(label)).width) + 52;
  roundRect(ctx, PAD, 70, pillW, 60, 30);
  ctx.strokeStyle = ACCENT;
  ctx.lineWidth = 3;
  ctx.stroke();
  text(ctx, label, PAD + pillW - 26, 110, `28px "${F.bodyStrong}"`, ACCENT);

  // Measure the text block first; the picture takes whatever height is left.
  const name = fitName(ctx, item.name.trim(), W - PAD * 2);
  ctx.font = `30px "${F.body}"`;
  const availableLabel = 'المتوفر:';
  const labelW = Math.ceil(ctx.measureText(rtl(availableLabel)).width) + 18;
  const rows = chipRows(ctx, sizes, W - PAD * 2 - labelW, W - PAD * 2);
  const nameH = name.lines.length * Math.round(name.size * 1.15);
  const blockH = nameH + 24 + 66 + 22 + rows.length * 66 + 34 + 70;

  const picTop = 180;
  const picH = H - picTop - 36 - blockH;
  const { image } = await loadPicture(item);
  ctx.save();
  roundRect(ctx, PAD, picTop, W - PAD * 2, picH, 30);
  ctx.clip();
  ctx.fillStyle = '#E7E2D7';
  ctx.fillRect(PAD, picTop, W - PAD * 2, picH);
  if (image) {
    // Cover fit: fill the frame, crop the overflow evenly.
    const frameW = W - PAD * 2;
    const scale = Math.max(frameW / image.width, picH / image.height);
    const dw = image.width * scale;
    const dh = image.height * scale;
    ctx.drawImage(image, PAD + (frameW - dw) / 2, picTop + (picH - dh) / 2, dw, dh);
  }
  ctx.restore();

  // Name.
  let y = picTop + picH + 36;
  const lineH = Math.round(name.size * 1.15);
  for (const line of name.lines) {
    y += lineH;
    text(ctx, line, RIGHT, y - Math.round(name.size * 0.22), `${name.size}px "${F.display}"`, INK);
  }

  // Price: the number reads first (rightmost), the currency after it.
  y += 24 + 52;
  const priceW = text(ctx, formatPrice(item.price), RIGHT, y, `54px "${F.mono}"`, ACCENT, 'ltr');
  text(ctx, 'جنيه', RIGHT - priceW - 16, y, `40px "${F.displayBold}"`, ACCENT);

  // Sizes in stock as dark chips after the label.
  y += 22;
  text(ctx, availableLabel, RIGHT, y + 44, `30px "${F.body}"`, MUTED);
  rows.forEach((row, i) => {
    let x = i === 0 ? RIGHT - labelW : RIGHT;
    const top = y + i * 66;
    for (const chip of row) {
      roundRect(ctx, x - chip.w, top, chip.w, 54, 27);
      ctx.fillStyle = INK;
      ctx.fill();
      ctx.font = `28px "${F.bodyStrong}"`;
      ctx.fillStyle = PAPER;
      ctx.direction = 'rtl';
      ctx.textAlign = 'center';
      ctx.fillText(rtl(chip.label), x - chip.w / 2, top + 37);
      x -= chip.w + 12;
    }
  });
  y += rows.length * 66 + 34;

  // Footer: how to order.
  ctx.fillStyle = '#DCD6C9';
  ctx.fillRect(PAD, y, W - PAD * 2, 2);
  const footY = y + 52;
  // "واتساب 0129449205" reads right to left: the word first, the number after it.
  const waW = text(ctx, 'واتساب', RIGHT, footY, `28px "${F.bodyStrong}"`, INK);
  text(ctx, SOCIAL_WHATSAPP, RIGHT - waW - 14, footY, `30px "${F.mono}"`, INK, 'ltr');
  ctx.font = `28px "${F.mono}"`;
  ctx.direction = 'ltr';
  ctx.textAlign = 'left';
  ctx.fillStyle = MUTED;
  ctx.fillText(SOCIAL_SITE, PAD, footY);

  return canvas.toBuffer('image/png');
}
