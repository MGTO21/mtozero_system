import { toDate, whatsappNumber } from '@/lib/format';
import type { Customer, ShopSettings } from '@/lib/types';

/**
 * Bulk WhatsApp, honestly.
 *
 * WhatsApp does not let a website send messages on your behalf. The official
 * Cloud API charges per marketing template, needs Meta business verification and
 * a number that cannot also run the normal WhatsApp app; unofficial automation
 * gets numbers banned. So this module does the parts that are legitimate and
 * actually laborious:
 *
 *   1. pick who should hear about this (segments);
 *   2. write one message and personalise it per customer;
 *   3. export contacts as a vCard, because a WhatsApp broadcast only reaches
 *      people who have your number saved — that is the real blocker;
 *   4. drive a one-at-a-time send queue through wa.me links.
 */

export type SegmentKey = 'all' | 'recent' | 'lapsed' | 'top' | 'credit' | 'debt';

export interface Segment {
  key: SegmentKey;
  label: string;
  hint: string;
  select: (customers: Customer[]) => Customer[];
}

const DAY = 86_400_000;

function daysSincePurchase(customer: Customer): number {
  const last = toDate(customer.lastPurchaseAt);
  if (!last) return Number.POSITIVE_INFINITY;
  return (Date.now() - last.getTime()) / DAY;
}

export const SEGMENTS: Segment[] = [
  {
    key: 'all',
    label: 'كل العملاء',
    hint: 'كل من له رقم محفوظ',
    select: (c) => c,
  },
  {
    key: 'recent',
    label: 'اشتروا آخر 30 يوم',
    hint: 'الأكثر تفاعلاً — أعلى احتمال شراء',
    select: (c) => c.filter((x) => daysSincePurchase(x) <= 30),
  },
  {
    key: 'lapsed',
    label: 'انقطعوا 60 يوم',
    hint: 'عملاء قدامى يستحقون تذكيراً',
    select: (c) => c.filter((x) => daysSincePurchase(x) > 60 && x.totalOrders > 0),
  },
  {
    key: 'top',
    label: 'الأكثر إنفاقاً',
    hint: 'أعلى 20 عميلاً — يستحقون عرضاً خاصاً',
    select: (c) => [...c].sort((a, b) => b.totalSpent - a.totalSpent).slice(0, 20),
  },
  {
    key: 'credit',
    label: 'أصحاب رصيد إحالة',
    hint: 'ذكّرهم برصيدهم ليعودوا',
    select: (c) => c.filter((x) => x.creditBalance > 0),
  },
  {
    key: 'debt',
    label: 'عليهم دين',
    hint: 'لا تُرسل لهم عروضاً — للتذكير فقط',
    select: (c) => c.filter((x) => x.totalOrders > 0),
  },
];

/** Only customers with a usable WhatsApp number can be messaged at all. */
export function reachable(customers: Customer[]): Customer[] {
  return customers.filter((c) => whatsappNumber(c.phone));
}

export interface MessageTemplate {
  key: string;
  label: string;
  body: string;
}

/**
 * Starting points, not final copy. `{الاسم}` is replaced per customer — a message
 * that opens with the person's name reads as a message, not a blast.
 */
export const TEMPLATES: MessageTemplate[] = [
  {
    key: 'arrival',
    label: 'وصلت بضاعة جديدة',
    body: 'سلام {الاسم} 🌸\n\nوصلتنا تشكيلة جديدة في {المتجر} — موديلات وألوان جديدة وبمقاسات كاملة.\n\nتعال شوفها قبل ما تخلص 👟\n\n{الهاتف}',
  },
  {
    key: 'offer',
    label: 'عرض / تخفيضات',
    body: 'سلام {الاسم} 🌸\n\nعندنا عرض خاص في {المتجر} لفترة محدودة — خصومات على تشكيلة مختارة.\n\nالعرض ساري لفترة قصيرة، لا تفوّته 🔥\n\n{الهاتف}',
  },
  {
    key: 'back',
    label: 'اشتقنا لك',
    body: 'سلام {الاسم} 🌸\n\nزمان ما شفناك في {المتجر}! عندنا موديلات جديدة كتير من آخر زيارة ليك.\n\nمرحب بيك في أي وقت 🤍',
  },
  {
    key: 'credit',
    label: 'تذكير برصيد الإحالة',
    body: 'سلام {الاسم} 🌸\n\nتذكير: عندك رصيد {الرصيد} في {المتجر} من إحالاتك، تقدر تستخدمه في أي عملية شراء.\n\nمستنينك 🤍',
  },
  {
    key: 'eid',
    label: 'تهنئة بمناسبة',
    body: 'سلام {الاسم} 🌸\n\nكل عام وأنت بخير من {المتجر} 🌙\n\nعندنا تشكيلة العيد وصلت — تعال اختار قبل الزحمة.',
  },
];

/** Fills the placeholders for one recipient. */
export function personalise(body: string, customer: Customer, settings: ShopSettings): string {
  const firstName = customer.name.trim().split(/\s+/)[0] || 'صديقنا';
  return body
    .replaceAll('{الاسم}', firstName)
    .replaceAll('{المتجر}', settings.shopName)
    .replaceAll('{الهاتف}', settings.phone ? `للتواصل: ${settings.phone}` : '')
    .replaceAll('{الرصيد}', `${Math.round(customer.creditBalance).toLocaleString('en-US')} ج`)
    .trim();
}

/** wa.me deep link that opens the chat with the message already typed. */
export function sendLink(customer: Customer, message: string): string | null {
  const number = whatsappNumber(customer.phone);
  if (!number) return null;
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

/**
 * A vCard of every recipient.
 *
 * This is the piece that unlocks free broadcasting: WhatsApp only delivers a
 * broadcast to recipients who have the sender saved as a contact, and importing
 * one .vcf saves them all at once instead of by hand.
 */
export function buildVCard(customers: Customer[], settings: ShopSettings): string {
  const prefix = settings.shopName.trim() || 'MTOZERO';
  return customers
    .map((c) => {
      const number = whatsappNumber(c.phone);
      if (!number) return null;
      // The shop prefix keeps these apart from the owner's personal contacts and
      // groups them together in the phone's address book.
      const name = `${prefix} - ${c.name.trim() || 'عميل'}`;
      return [
        'BEGIN:VCARD',
        'VERSION:3.0',
        `N:${name};;;;`,
        `FN:${name}`,
        `TEL;TYPE=CELL:+${number}`,
        c.referralCode ? `NOTE:كود الإحالة ${c.referralCode}` : null,
        'END:VCARD',
      ]
        .filter(Boolean)
        .join('\r\n');
    })
    .filter(Boolean)
    .join('\r\n');
}

export function downloadVCard(customers: Customer[], settings: ShopSettings, filename: string): void {
  const blob = new Blob([buildVCard(customers, settings)], { type: 'text/vcard;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.vcf') ? filename : `${filename}.vcf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Plain list of numbers, for pasting into a broadcast list by hand. */
export function numbersList(customers: Customer[]): string {
  return customers
    .map((c) => whatsappNumber(c.phone))
    .filter(Boolean)
    .map((n) => `+${n}`)
    .join('\n');
}

/** WhatsApp caps one broadcast list at 256 recipients. */
export const BROADCAST_LIMIT = 256;
