import type { CatalogItem } from '@/lib/types';
import { lastSizes, type SocialKind, type SocialPost } from './pick';

/**
 * Captions for the daily Facebook post, written by hand in Sudanese Arabic.
 *
 * Every claim is filled from the live catalog at posting time: the price, the
 * sizes in stock and — for "last" posts — only the sizes that really are down to
 * their last pieces. No invented scarcity, no hashtag walls, at most one emoji.
 * Templates rotate per kind so two posts of the same kind never open the same way.
 */

export const SOCIAL_WHATSAPP = '0129449205';
export const SOCIAL_SITE = 'shop.mtozero.com';

interface Fill {
  name: string;
  price: string;
  sizes: string;
  link: string;
  wear: string;
  scarcity: string;
}

type Template = (f: Fill) => string;

const order = `اطلب من ${SOCIAL_SITE} أو واتساب ${SOCIAL_WHATSAPP}`;

const TEMPLATES: Record<SocialKind, Template[]> = {
  new: [
    (f) => `وصل جديد للمحل: ${f.name}.\n${f.wear}\n\nالسعر ${f.price} جنيه، والمقاسات المتوفرة ${f.sizes}.\n${order}`,
    (f) => `نزل عندنا هسع ${f.name}.\n${f.wear}\n\nبـ ${f.price} جنيه — المقاسات: ${f.sizes}.\nتفاصيلو كلها هنا: ${f.link}`,
    (f) => `جديد امتوزيرو: ${f.name} ✨\n${f.wear}\n\nالسعر ${f.price} جنيه.\nالمتوفر: ${f.sizes}.\n${order}`,
    (f) => `لسه واصل: ${f.name}.\n${f.wear}\n\nالمقاسات الموجودة ${f.sizes}، والسعر ${f.price} جنيه.\nبنوصّلو ليك لحدي الباب: ${f.link}`,
    (f) => `ضيف جديد في المحل — ${f.name}.\n${f.wear}\n\n${f.price} جنيه، ومقاساتو ${f.sizes}.\nاطلبو من الموقع ${f.link} أو رسّل لينا واتساب ${SOCIAL_WHATSAPP}`,
    (f) => `أول ما وصل قلنا نوريكم: ${f.name}.\n${f.wear}\n\nالسعر ${f.price} جنيه، المقاسات ${f.sizes}.\n${order}`,
  ],
  last: [
    (f) => `${f.name} — ${f.scarcity}\n\nالسعر ${f.price} جنيه.\nلو مقاسك موجود ما تتأخر: ${f.link}`,
    (f) => `تنبيه للناس المنتظرة ${f.name}: ${f.scarcity}\n\nبـ ${f.price} جنيه.\n${order}`,
    (f) => `${f.scarcity}\nالموديل: ${f.name}، والسعر ${f.price} جنيه.\n\nاطلبو هسع من ${f.link} أو واتساب ${SOCIAL_WHATSAPP}`,
    (f) => `قبل ما يخلص: ${f.name}.\n${f.scarcity}\n\nالسعر ${f.price} جنيه.\n${order}`,
    (f) => `خبر للناس الكانت عاجباها ${f.name}:\n${f.scarcity}\n\n${f.price} جنيه — الطلب من ${f.link}`,
    (f) => `لو كنت مأجّل ${f.name}، ده وقتو.\n${f.scarcity}\n\nبـ ${f.price} جنيه.\n${order}`,
  ],
  spotlight: [
    (f) => `من المحل: ${f.name}.\n${f.wear}\n\nالسعر ${f.price} جنيه، والمقاسات المتوفرة ${f.sizes}.\n${order}`,
    (f) => `لو بتفتش على حاجة تلبسها الأسبوع ده — ${f.name}.\n${f.wear}\n\n${f.price} جنيه، المقاسات ${f.sizes}.\n${f.link}`,
    (f) => `اختيارنا ليكم الليلة: ${f.name}.\n${f.wear}\n\nبـ ${f.price} جنيه، ومتوفر ${f.sizes}.\n${order}`,
    (f) => `${f.name} لسه موجود في المحل.\n${f.wear}\n\nالسعر ${f.price} جنيه — المقاسات ${f.sizes}.\nالطلب والتوصيل من ${f.link}`,
    (f) => `ده من الحاجات الناس بتسأل منها كتير: ${f.name}.\n${f.wear}\n\n${f.price} جنيه، والمتوفر ${f.sizes}.\n${order}`,
    (f) => `شوف ${f.name} 👀\n${f.wear}\n\nالسعر ${f.price} جنيه، والمقاسات ${f.sizes}.\nاطلب من الموقع ${f.link} أو واتساب ${SOCIAL_WHATSAPP}`,
  ],
};

/** One line on how to wear it, by category. Rotated with the template. */
const WEAR: Record<'shoes' | 'clothing' | 'other', string[]> = {
  shoes: [
    'بيمشي مع الجينز والقماش، للشغل وللطلعة.',
    'مريح للمشي الطويل، وشكلو نضيف مع أي لبسة.',
    'البسو مع بنطلون فاتح وتيشيرت ساده — كفاية.',
    'خفيف على الرجل، وبيستحمل مشاوير اليوم كلو.',
    'لونو ساهل يركب مع معظم الدولاب.',
    'من الحاجات البتلبسها كل يوم وما بتزهج منها.',
  ],
  clothing: [
    'بيمشي مع الجينز ومع البنطلون القماش.',
    'خامتو مريحة في الحر، وقصّتو مرتبة.',
    'البسو براهو أو فوق تيشيرت ساده.',
    'للجامعة، للشغل، وللطلعة بالليل.',
    'لونو ساهل يركب مع جزمة بيضاء أو بنية.',
    'قطعة أساسية تلقاها حاضرة كل ما تفتح الدولاب.',
  ],
  other: [
    'إضافة صغيرة بتفرق في اللبسة كلها.',
    'بيكمّل لبسك من غير تكلّف.',
    'ساهل يركب مع أي ستايل.',
    'هدية مضمونة لو محتار.',
    'من الحاجات البتستعملها كل يوم.',
    'خفيف وعملي، ومناسب لأي مشوار.',
  ],
};

export function templateCount(kind: SocialKind): number {
  return TEMPLATES[kind].length;
}

/** The template after the last one used for this kind, so openings never repeat back to back. */
export function nextTemplateIndex(kind: SocialKind, posts: SocialPost[]): number {
  const previous = posts.filter((p) => p.kind === kind).sort((a, b) => b.postedAtMs - a.postedAtMs)[0];
  if (!previous) return 0;
  return (previous.templateIndex + 1) % templateCount(kind);
}

export function formatPrice(price: number): string {
  return Math.round(price).toLocaleString('en-US');
}

/** The truthful scarcity line for a "last" post. */
function scarcityLine(item: CatalogItem, sizes: string[]): string {
  if (sizes.length === 1) return `فاضل مقاس ${sizes[0]} بس.`;
  const scarce = lastSizes(item);
  if (scarce.length === 1) return `مقاس ${scarce[0]} قرّب يخلص، والباقي ${sizes.filter((s) => s !== scarce[0]).join('، ')}.`;
  return `المقاسات ${scarce.join('، ')} قرّبت تخلص. المتوفر هسع: ${sizes.join('، ')}.`;
}

function wearGroup(category: string): keyof typeof WEAR {
  if (category === 'shoes') return 'shoes';
  if (category === 'clothing') return 'clothing';
  return 'other';
}

export function buildCaption(
  kind: SocialKind,
  item: CatalogItem,
  sizes: string[],
  templateIndex: number,
  productUrl: string,
): string {
  const templates = TEMPLATES[kind];
  const lines = WEAR[wearGroup(item.category)];
  const fill: Fill = {
    name: item.name.trim(),
    price: formatPrice(item.price),
    sizes: sizes.join('، '),
    link: productUrl,
    wear: lines[templateIndex % lines.length]!,
    scarcity: scarcityLine(item, sizes),
  };
  return templates[templateIndex % templates.length]!(fill);
}
