import path from 'node:path';
import { createCanvas, GlobalFonts, loadImage, type Image } from '@napi-rs/canvas';
import { fetchLogo } from './server';

/**
 * Stamps the shop's mark on a public product picture, so a photo that travels —
 * saved, forwarded on WhatsApp, reposted — still says where it came from.
 *
 * Applied when /img serves the picture, never stored: every product, old or
 * added tomorrow, gets it with nothing to do at upload, and the staff app keeps
 * the clean thumbnail. Uses Skia (@napi-rs/canvas) like the social card.
 */

const FONT = 'Watermark Tajawal XB';
let fontReady = false;

function registerFont() {
  if (fontReady) return;
  GlobalFonts.registerFromPath(path.join(process.cwd(), 'assets', 'fonts', 'Tajawal-ExtraBold.ttf'), FONT);
  fontReady = true;
}

let logoCache: { hash: string; image: Image | null } | null = null;

async function logoImage(): Promise<Image | null> {
  const logo = await fetchLogo().catch(() => null);
  if (!logo) return null;
  if (logoCache?.hash === logo.hash) return logoCache.image;
  const comma = logo.data.indexOf(',');
  const image = comma > 0 ? await loadImage(Buffer.from(logo.data.slice(comma + 1), 'base64')).catch(() => null) : null;
  logoCache = { hash: logo.hash, image };
  return image;
}

export const WATERMARK_TEXT = 'MTOZERO';

/** Returns the picture as JPEG with the mark in the bottom-left corner. */
export async function watermark(bytes: Buffer): Promise<Buffer> {
  registerFont();
  const [photo, logo] = await Promise.all([loadImage(bytes), logoImage()]);
  const { width: w, height: h } = photo;
  const canvas = createCanvas(w, h);
  const ctx = canvas.getContext('2d');
  ctx.drawImage(photo, 0, 0, w, h);

  // Sized from the shorter side so portrait and landscape pictures match.
  const unit = Math.max(12, Math.round(Math.min(w, h) * 0.036));
  const pad = Math.round(unit * 0.45);
  const margin = Math.round(unit * 0.6);
  ctx.font = `${unit}px "${FONT}"`;
  const textW = Math.ceil(ctx.measureText(WATERMARK_TEXT).width);
  const logoSize = logo ? Math.round(unit * 1.25) : 0;
  const gap = logo ? Math.round(unit * 0.35) : 0;
  const boxW = pad * 2 + logoSize + gap + textW;
  const boxH = Math.max(logoSize, unit) + pad * 2;
  const x = margin;
  const y = h - margin - boxH;

  ctx.globalAlpha = 0.88;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.roundRect(x, y, boxW, boxH, Math.round(boxH / 2));
  ctx.fill();
  ctx.globalAlpha = 1;

  if (logo) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(x + pad + logoSize / 2, y + boxH / 2, logoSize / 2, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(logo, x + pad, y + (boxH - logoSize) / 2, logoSize, logoSize);
    ctx.restore();
  }
  ctx.fillStyle = '#111110';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.fillText(WATERMARK_TEXT, x + pad + logoSize + gap, y + boxH / 2 + unit * 0.06);

  return canvas.toBuffer('image/jpeg', 88);
}
