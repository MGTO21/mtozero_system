import { formatDate, money } from '@/lib/format';
import { itemGross, itemNetQty, saleDue, saleGross, saleTotal } from '@/lib/db/sales';
import {
  BRAND,
  INK,
  MUTED,
  PAD,
  SURFACE,
  W,
  canvasToBlob,
  downloadBlob,
  drawBrandBar,
  drawShopHeader,
  hLine as line,
  labelValueRow as row,
  makeCanvas,
  shareImage,
  waitForFonts,
} from '@/lib/canvas-kit';
import type { Sale } from '@/lib/types';
import type { ShopSettings } from '@/lib/types';

/** Renders an invoice to a PNG entirely in the browser. See lib/canvas-kit.ts. */

export async function renderInvoicePng(sale: Sale, settings: ShopSettings): Promise<Blob | null> {
  const items = sale.items.filter((i) => itemNetQty(i) > 0);
  const gross = saleGross(sale);
  const total = saleTotal(sale);
  const due = saleDue(sale);

  // The canvas has no layout engine, so its height is computed up front from the
  // number of product lines plus the optional discount and balance rows.
  const extraRows = (sale.creditUsed > 0 ? 1 : 0) + (due > 0 ? 2 : 0);
  const H = 680 + Math.max(1, items.length) * 76 + extraRows * 46;

  const surface = makeCanvas(H);
  if (!surface) return null;
  const { canvas, ctx } = surface;

  await waitForFonts();

  ctx.fillStyle = SURFACE;
  ctx.fillRect(0, 0, W, H);
  drawBrandBar(ctx);
  await drawShopHeader(ctx, settings);

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

  return canvasToBlob(canvas);
}

export { downloadBlob };

export function shareInvoice(blob: Blob, sale: Sale): Promise<'shared' | 'downloaded'> {
  return shareImage(blob, `invoice-${sale.id.slice(0, 6)}.png`, 'فاتورة');
}
