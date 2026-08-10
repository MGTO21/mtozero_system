import { AppError } from '@/lib/db/collections';

/**
 * Optional full-resolution image hosting.
 *
 * Uploads go straight from the browser using an *unsigned* upload preset, so no
 * server and no API secret are involved. The thumbnail stored in Firestore stays
 * the primary image; this is only the "open the full picture" copy, and every
 * failure here is non-fatal by design.
 */
const CLOUD_NAME = (process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME ?? '').trim();
const UPLOAD_PRESET = (process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET ?? '').trim();

export const cloudinaryEnabled = Boolean(CLOUD_NAME && UPLOAD_PRESET);

export interface UploadedImage {
  url: string;
  publicId: string;
}

/**
 * Rewrites a delivery URL to let Cloudinary pick format and quality per device,
 * capped at a width that is plenty for a full-screen view on a phone.
 */
function optimize(secureUrl: string): string {
  return secureUrl.replace('/upload/', '/upload/f_auto,q_auto,w_1200,c_limit/');
}

export async function uploadFullImage(file: File, productId: string): Promise<UploadedImage> {
  if (!cloudinaryEnabled) throw new AppError('Cloudinary غير مُهيّأ.');

  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', UPLOAD_PRESET);
  form.append('folder', `mtozero/products/${productId}`);

  const response = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, {
    method: 'POST',
    body: form,
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    throw new AppError(
      detail.includes('preset')
        ? 'إعداد الرفع في Cloudinary غير صحيح — تأكد أن الـ preset من نوع Unsigned.'
        : 'تعذّر رفع الصورة الكاملة إلى Cloudinary.',
    );
  }

  const json = (await response.json()) as { secure_url?: string; public_id?: string };
  if (!json.secure_url || !json.public_id) throw new AppError('رد Cloudinary غير مكتمل.');

  return { url: optimize(json.secure_url), publicId: json.public_id };
}
