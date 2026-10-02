import { money } from '@/lib/format';
import {
  BRAND,
  GOOD,
  INK,
  MUTED,
  PAD,
  SURFACE,
  W,
  WARN,
  canvasToBlob,
  downloadBlob,
  drawBrandBar,
  drawShopHeader,
  drawStamp,
  labelValueRow as row,
  makeCanvas,
  perforation,
  shareImage,
  waitForFonts,
  wrapText,
} from '@/lib/canvas-kit';
import { STATUS_LABEL, type InvoiceModel } from '@/lib/invoice';
import type { ShopSettings } from '@/lib/types';

const BODY = '"IBM Plex Sans Arabic", system-ui, sans-serif';
const DISPLAY = 'Cairo, system-ui, sans-serif';

/**
 * Renders an invoice to a PNG entirely in the browser, laid out as a till
 * receipt: perforated sections, a rubber stamp for the payment state, and the
 * customer's referral code as a cut-out coupon at the foot — every invoice the
 * shop sends is also an invitation to bring a friend.
 *
 * The canvas has no layout engine, so the height is measured in a first pass
 * that runs the same drawing code without painting.
 */
export async function renderInvoicePng(model: InvoiceModel, settings: ShopSettings): Promise<Blob | null> {
  await waitForFonts();

  const probe = makeCanvas(10);
  if (!probe) return null;
  const height = await draw(probe.ctx, model, settings, false);

  const surface = makeCanvas(height);
  if (!surface) return null;
  await draw(surface.ctx, model, settings, true);
  return canvasToBlob(surface.canvas);
}

async function draw(
  ctx: CanvasRenderingContext2D,
  model: InvoiceModel,
  settings: ShopSettings,
  paint: boolean,
): Promise<number> {
  const textW = W - PAD * 2;
  let y = 0;

  if (paint) {
    ctx.fillStyle = SURFACE;
    ctx.fillRect(0, 0, W, 20000);
    drawBrandBar(ctx, 8);
    y = await drawShopHeader(ctx, settings);
  } else {
    y = 190;
  }

  if (paint) perforation(ctx, y);
  y += 52;

  // Invoice number and date on one line, the stamp floating on the left.
  if (paint) {
    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.fillStyle = INK;
    ctx.font = `900 30px ${DISPLAY}`;
    ctx.fillText(`فاتورة رقم ${model.number}`, W - PAD, y);
    ctx.font = `600 19px ${BODY}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(`${model.date}  ·  ${model.time}`, W - PAD, y + 32);

    const stampColor = model.status === 'paid' ? GOOD : model.status === 'partial' ? WARN : BRAND;
    drawStamp(ctx, PAD + 110, y + 4, model.pending ? 'لم تُرسل بعد' : STATUS_LABEL[model.status], model.pending ? MUTED : stampColor);
  }
  y += 70;

  if (model.customerName) {
    if (paint) row(ctx, y, 'العميل', model.customerName, { size: 22 });
    y += 38;
  }
  if (model.customerPhone) {
    if (paint) row(ctx, y, 'الهاتف', model.customerPhone, { size: 20, color: MUTED });
    y += 36;
  }

  y += 6;
  if (paint) perforation(ctx, y);
  y += 46;

  for (const line of model.lines) {
    if (paint) {
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.fillStyle = INK;
      ctx.font = `700 25px ${BODY}`;
      ctx.fillText(line.name, W - PAD, y);

      ctx.textAlign = 'left';
      ctx.font = `900 26px ${DISPLAY}`;
      ctx.fillText(money(line.total), PAD, y);
    }
    y += 34;

    if (paint) {
      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.font = `500 20px ${BODY}`;
      ctx.fillStyle = MUTED;
      ctx.fillText(`مقاس ${line.size}   ·   ${line.qty} × ${money(line.unit)}`, W - PAD, y);

      if (line.listUnit) {
        // The struck-through list price: the customer sees the discount they got.
        ctx.textAlign = 'left';
        const was = money(line.listUnit);
        ctx.font = `500 19px ${BODY}`;
        const w = ctx.measureText(was).width;
        ctx.fillText(was, PAD, y);
        ctx.strokeStyle = MUTED;
        ctx.lineWidth = 1.6;
        ctx.beginPath();
        ctx.moveTo(PAD - 2, y - 7);
        ctx.lineTo(PAD + w + 2, y - 7);
        ctx.stroke();
      }
    }
    y += 40;
  }

  if (paint) perforation(ctx, y);
  y += 48;

  if (model.credit > 0) {
    if (paint) row(ctx, y, 'المجموع', money(model.gross), { size: 21, color: MUTED });
    y += 40;
    if (paint) row(ctx, y, 'خصم رصيد الإحالة', `- ${money(model.credit)}`, { size: 21, color: GOOD });
    y += 44;
  }

  // The total: the number the customer looks for.
  if (paint) {
    ctx.strokeStyle = INK;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(PAD, y - 26);
    ctx.lineTo(W - PAD, y - 26);
    ctx.stroke();

    ctx.direction = 'rtl';
    ctx.textAlign = 'right';
    ctx.font = `900 30px ${DISPLAY}`;
    ctx.fillStyle = INK;
    ctx.fillText('الإجمالي', W - PAD, y + 14);
    ctx.textAlign = 'left';
    ctx.font = `900 50px ${DISPLAY}`;
    ctx.fillStyle = BRAND;
    ctx.fillText(money(model.total), PAD, y + 20);
  }
  y += 66;

  if (model.saved > 0) {
    if (paint) row(ctx, y, 'وفّرت معانا', money(model.saved), { size: 21, color: GOOD, bold: true });
    y += 40;
  }
  if (model.due > 0) {
    if (paint) row(ctx, y, 'المدفوع', money(model.paid), { size: 21 });
    y += 40;
    if (paint) row(ctx, y, 'المتبقي', money(model.due), { bold: true, color: WARN, size: 24 });
    y += 44;
  }

  // Referral coupon: a dashed box the customer screenshots and forwards.
  if (model.referralCode && model.referralReward > 0) {
    y += 14;
    const boxH = 126;
    if (paint) {
      ctx.strokeStyle = INK;
      ctx.lineWidth = 2;
      ctx.setLineDash([12, 8]);
      ctx.strokeRect(PAD, y, textW, boxH);
      ctx.setLineDash([]);

      ctx.direction = 'rtl';
      ctx.textAlign = 'right';
      ctx.fillStyle = MUTED;
      ctx.font = `700 19px ${BODY}`;
      ctx.fillText('كودك للإحالة — شاركه مع صحابك', W - PAD - 24, y + 38);
      ctx.fillStyle = INK;
      ctx.font = `600 18px ${BODY}`;
      ctx.fillText(`كل صاحب يشتري بيه، تاخد ${money(model.referralReward)} خصم`, W - PAD - 24, y + 96);

      ctx.textAlign = 'left';
      ctx.direction = 'ltr';
      ctx.font = `900 44px ${DISPLAY}`;
      ctx.fillStyle = BRAND;
      ctx.fillText(model.referralCode, PAD + 24, y + 80);
    }
    y += boxH + 20;
  }

  y += 10;
  if (paint) perforation(ctx, y);
  y += 40;

  if (model.returnPolicy) {
    ctx.font = `500 18px ${BODY}`;
    const lines = wrapText(ctx, model.returnPolicy, textW);
    for (const l of lines) {
      if (paint) {
        ctx.direction = 'rtl';
        ctx.textAlign = 'center';
        ctx.fillStyle = MUTED;
        ctx.fillText(l, W / 2, y);
      }
      y += 28;
    }
    y += 12;
  }

  if (paint) {
    ctx.direction = 'rtl';
    ctx.textAlign = 'center';
    ctx.font = `800 24px ${DISPLAY}`;
    ctx.fillStyle = INK;
    ctx.fillText(model.footer, W / 2, y);
    ctx.font = `600 17px ${BODY}`;
    ctx.fillStyle = MUTED;
    ctx.fillText(model.shopName, W / 2, y + 30);
  }
  y += 70;

  return y;
}

export { downloadBlob };

export function shareInvoice(blob: Blob, model: InvoiceModel): Promise<'shared' | 'downloaded'> {
  return shareImage(blob, `invoice-${model.number}.png`, `فاتورة ${model.number}`);
}
