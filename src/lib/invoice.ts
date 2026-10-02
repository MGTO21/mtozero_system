import { formatDate, formatTime, money, whatsappNumber } from '@/lib/format';
import { invoiceNumber, itemGross, itemNetQty, saleDue, saleGross, saleTotal } from '@/lib/db/sales';
import type { Sale, ShopSettings } from '@/lib/types';

/**
 * Everything an invoice says, worked out once. The WhatsApp text, the image and
 * the printed page all read from this, so the three can never disagree about a
 * total or forget a line the others show.
 */
export interface InvoiceModel {
  number: string;
  date: string;
  time: string;
  shopName: string;
  customerName?: string;
  customerPhone?: string;
  lines: {
    name: string;
    size: string;
    qty: number;
    unit: number;
    /** List price per unit when the customer got a discount, else null. */
    listUnit: number | null;
    total: number;
  }[];
  /** Kept items at the prices charged, before referral credit. */
  gross: number;
  /** What the customer saved against list prices — shown because customers like seeing it. */
  saved: number;
  credit: number;
  total: number;
  paid: number;
  due: number;
  status: 'paid' | 'partial' | 'debt';
  /** True while the sale sits in this phone's offline queue. */
  pending: boolean;
  /** The customer's own code to hand to friends — every invoice is an invitation. */
  referralCode: string | null;
  referralReward: number;
  returnPolicy: string;
  footer: string;
}

export function buildInvoice(
  sale: Sale,
  settings: Pick<ShopSettings, 'shopName' | 'invoiceFooter' | 'returnPolicy' | 'referralReward'>,
  referralCode: string | null = null,
): InvoiceModel {
  const lines = sale.items
    .filter((i) => itemNetQty(i) > 0)
    .map((i) => ({
      name: i.productName,
      size: i.size,
      qty: itemNetQty(i),
      unit: i.sellPrice,
      listUnit: i.listPrice > i.sellPrice ? i.listPrice : null,
      total: itemGross(i),
    }));
  const saved = lines.reduce((sum, l) => sum + (l.listUnit ? (l.listUnit - l.unit) * l.qty : 0), 0) + sale.creditUsed;
  const total = saleTotal(sale);
  const due = saleDue(sale);

  return {
    number: invoiceNumber(sale.id),
    date: formatDate(sale.createdAt),
    time: formatTime(sale.createdAt),
    shopName: settings.shopName,
    customerName: sale.customerName,
    customerPhone: sale.customerPhone,
    lines,
    gross: saleGross(sale),
    saved,
    credit: sale.creditUsed,
    total,
    paid: Math.min(sale.amountPaid, total),
    due,
    status: due <= 0 ? 'paid' : sale.amountPaid > 0 ? 'partial' : 'debt',
    pending: Boolean(sale.pending),
    referralCode,
    referralReward: settings.referralReward,
    returnPolicy: settings.returnPolicy,
    footer: settings.invoiceFooter,
  };
}

export const STATUS_LABEL: Record<InvoiceModel['status'], string> = {
  paid: 'مدفوعة',
  partial: 'مدفوعة جزئياً',
  debt: 'دين',
};

/**
 * The message the seller pastes into WhatsApp. Plain text on purpose — it has to
 * survive copy/paste into any chat app without formatting artefacts.
 */
export function invoiceText(model: InvoiceModel): string {
  const out: string[] = [];
  out.push(`🧾 فاتورة ${model.shopName} — رقم ${model.number}`);
  if (model.customerName) out.push(`العميل: ${model.customerName}`);
  out.push(`التاريخ: ${model.date}`);
  out.push('');

  for (const l of model.lines) {
    // One compact line per product keeps a multi-item ticket readable in chat.
    out.push(
      l.qty > 1
        ? `• ${l.name} — مقاس ${l.size} × ${l.qty} = ${money(l.total)}`
        : `• ${l.name} — مقاس ${l.size} = ${money(l.total)}`,
    );
  }

  out.push('');
  if (model.credit > 0) {
    out.push(`المجموع: ${money(model.gross)}`);
    out.push(`خصم رصيد الإحالة: ${money(model.credit)}-`);
  }
  out.push(`الإجمالي: ${money(model.total)}`);
  if (model.saved > 0) out.push(`وفّرت معانا: ${money(model.saved)}`);

  if (model.due > 0) {
    out.push(`المدفوع: ${money(model.paid)}`);
    out.push(`المتبقي: ${money(model.due)}`);
  } else {
    out.push('الحالة: مدفوعة بالكامل ✅');
  }

  if (model.referralCode && model.referralReward > 0) {
    out.push('');
    out.push(`🎁 كودك: ${model.referralCode}`);
    out.push(`أي صاحب يشتري بيه، تاخد ${money(model.referralReward)} خصم في مشترياتك الجاية.`);
  }

  if (model.returnPolicy) {
    out.push('');
    out.push(model.returnPolicy);
  }

  out.push('');
  out.push(model.footer);
  out.push(model.shopName);
  return out.join('\n');
}

/** Deep link that opens WhatsApp with the invoice pre-filled. */
export function whatsappLink(model: InvoiceModel): string {
  const text = encodeURIComponent(invoiceText(model));
  const number = whatsappNumber(model.customerPhone);
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}

/** Reminder message for an outstanding balance. */
export function debtReminderText(customerName: string, due: number, shopName = 'Mtozero Shop'): string {
  return [
    `السلام عليكم ${customerName}`,
    '',
    `تذكير ودّي: المتبقي عليك لدى ${shopName} هو ${money(due)}.`,
    'لو سددت مؤخراً تجاهل الرسالة.',
    '',
    'شكراً لك',
  ].join('\n');
}

export async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    // Fallback for non-secure contexts (e.g. plain-HTTP local network testing).
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.appendChild(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  } catch {
    return false;
  }
}
