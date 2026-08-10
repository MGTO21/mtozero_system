import { formatDate, money, whatsappNumber } from '@/lib/format';
import { itemGross, itemNetQty, saleDue, saleGross, saleTotal } from '@/lib/db/sales';
import type { Sale } from '@/lib/types';

const SHOP_NAME = 'Mtozero Shop';

/**
 * The message the seller pastes into WhatsApp. Plain text on purpose — it has to
 * survive copy/paste into any chat app without formatting artefacts.
 */
export function invoiceText(sale: Sale): string {
  const gross = saleGross(sale);
  const total = saleTotal(sale);
  const due = saleDue(sale);
  const live = sale.items.filter((i) => itemNetQty(i) > 0);

  const lines: string[] = [];
  lines.push(`🧾 فاتورة ${SHOP_NAME}`);
  if (sale.customerName) lines.push(`العميل: ${sale.customerName}`);
  lines.push(`التاريخ: ${formatDate(sale.createdAt)}`);
  lines.push('');

  for (const item of live) {
    const qty = itemNetQty(item);
    // One compact line per product keeps a multi-item ticket readable in chat.
    lines.push(
      qty > 1
        ? `• ${item.productName} — مقاس ${item.size} × ${qty} = ${money(itemGross(item))}`
        : `• ${item.productName} — مقاس ${item.size} = ${money(itemGross(item))}`,
    );
  }

  lines.push('');
  if (sale.creditUsed > 0) {
    lines.push(`المجموع: ${money(gross)}`);
    lines.push(`خصم رصيد الإحالة: ${money(sale.creditUsed)}-`);
  }
  lines.push(`الإجمالي: ${money(total)}`);

  if (due > 0) {
    lines.push(`المدفوع: ${money(sale.amountPaid)}`);
    lines.push(`المتبقي: ${money(due)}`);
  } else {
    lines.push('الحالة: مدفوع بالكامل ✅');
  }

  lines.push('');
  lines.push('شكراً لثقتك بينا 🌸');
  lines.push(SHOP_NAME);

  return lines.join('\n');
}

/** Deep link that opens WhatsApp with the invoice pre-filled. */
export function whatsappLink(sale: Sale): string {
  const text = encodeURIComponent(invoiceText(sale));
  const number = whatsappNumber(sale.customerPhone);
  return number ? `https://wa.me/${number}?text=${text}` : `https://wa.me/?text=${text}`;
}

/** Reminder message for an outstanding balance. */
export function debtReminderText(customerName: string, due: number): string {
  return [
    `السلام عليكم ${customerName} 🌸`,
    '',
    `تذكير ودّي: المتبقي عليك لدى ${SHOP_NAME} هو ${money(due)}.`,
    'لو سددت مؤخراً تجاهل الرسالة.',
    '',
    'شكراً لك 🤍',
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
