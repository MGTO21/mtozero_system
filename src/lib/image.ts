import { AppError } from '@/lib/db/collections';

/**
 * Client-side thumbnail generation.
 *
 * Product photos come off a phone camera at 3–5 MB. The app never displays one
 * larger than 96 px, so we downscale to a small JPEG and store it as a data URI
 * inside the product document. Two things fall out of that:
 *   - no storage service is needed at all (Cloud Storage now requires a card);
 *   - the picture is cached together with the product, so it still renders with
 *     no connection — which a CDN-hosted image never would.
 */

/** Display size is 96 px; 360 px keeps it crisp on 3x screens with room to spare. */
const MAX_DIM = 360;

/** Firestore documents cap at 1 MiB. Staying near 50 KB keeps catalogue sync cheap. */
const MAX_BYTES = 60 * 1024;

export interface Thumbnail {
  dataUrl: string;
  bytes: number;
  width: number;
  height: number;
}

/** Approximate decoded size of a base64 data URI. */
export function dataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.slice(dataUrl.indexOf(',') + 1);
  return Math.round((base64.length * 3) / 4);
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      // `from-image` applies the EXIF rotation, otherwise phone photos come out sideways.
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      try {
        return await createImageBitmap(file);
      } catch {
        // Fall through to the <img> path below.
      }
    }
  }

  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new AppError('تعذّر قراءة الصورة — جرّب صورة أخرى.'));
    };
    img.src = url;
  });
}

export async function makeThumbnail(file: File): Promise<Thumbnail> {
  if (!file.type.startsWith('image/')) throw new AppError('الملف المرفوع ليس صورة.');

  const source = await loadBitmap(file);
  const sourceWidth = 'width' in source ? source.width : 0;
  const sourceHeight = 'height' in source ? source.height : 0;
  if (!sourceWidth || !sourceHeight) throw new AppError('تعذّر قراءة أبعاد الصورة.');

  const scale = Math.min(1, MAX_DIM / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new AppError('تعذّر معالجة الصورة في هذا المتصفح.');

  ctx.imageSmoothingQuality = 'high';
  // A white matte keeps transparent PNGs from turning black once flattened to JPEG.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(source as CanvasImageSource, 0, 0, width, height);
  if ('close' in source) source.close();

  let quality = 0.72;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrlBytes(dataUrl) > MAX_BYTES && quality > 0.35) {
    quality -= 0.1;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }

  const bytes = dataUrlBytes(dataUrl);
  if (bytes > MAX_BYTES * 2) {
    throw new AppError('تعذّر ضغط الصورة بما يكفي — جرّب صورة أبسط.');
  }

  return { dataUrl, bytes, width, height };
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} كيلوبايت`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} ميجابايت`;
}
