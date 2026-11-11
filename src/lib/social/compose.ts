import type { CatalogItem } from '@/lib/types';
import { CAPTION_BANK, type BankTemplate, type CaptionBank, type StyleKey, type TemplateGroup } from './caption-bank';

/**
 * Builds the daily post's caption from the owner's caption bank.
 *
 * Pure and deterministic: the same product, kind, sizes, history and day always
 * give the same caption, so next-product stays idempotent and /posted can work
 * out what went out without Make sending it back.
 *
 * Every fact comes from the live catalog at posting time; templates whose claims
 * the shop cannot back are skipped (SKIPPED_TEMPLATES), never reworded.
 */

export const SOCIAL_WHATSAPP = '0129449205';

/** Bank entries that would state something the catalog cannot vouch for. */
export const SKIPPED_TEMPLATES: Record<string, string> = {
  // "دفع كاش أو بنكك": the store only advertises cash on delivery.
  'new-5': 'payment by Bankak is not something the store offers today',
  // "جوز واحد": a pair, and one piece. A size marked "last" has up to two pieces,
  // and the template would also be wrong for clothes and bags.
  'ls-2': 'claims exactly one pair; the catalog only knows "2 or fewer"',
  // "في ناس سألت عن {name} بعد ما خلصت": invents customer demand.
  'ls-3': 'claims people asked after it sold out, which nothing records',
  // "آخر واحدة في المحل": one piece; the catalog only knows "2 or fewer".
  'ls-5': 'claims exactly one piece left; the catalog only knows "2 or fewer"',
};

/** Style lines that assert a material the shop has not checked for every product. */
export const SKIPPED_STYLE_LINES: Partial<Record<StyleKey, number[]>> = {
  // "خامتو مريحة في الحر": fabric claim, not true of every shirt.
  shirts: [2],
};

/** Hashtag lines that only fit some products. */
const SNEAKER_TAG = '#سنيكرز';

export interface CaptionMeta {
  templateId: string;
  /** -1 when the template has no {question}. */
  questionIndex: number;
  hashtagIndex: number;
}

/** What earlier posts used — newest first is not required, posts are sorted here. */
export interface CaptionHistory {
  templateId?: string;
  questionIndex?: number;
  hashtagIndex?: number;
  postedAtMs: number;
}

export interface ComposeInput {
  kind: 'new' | 'last' | 'spotlight';
  item: Pick<CatalogItem, 'id' | 'name' | 'price' | 'category'>;
  /** In-stock sizes, in the product's order. */
  sizes: string[];
  /** The category's display name ("شنط"), to tell bags and the like apart. */
  categoryName?: string;
  productUrl: string;
  history: CaptionHistory[];
  /** Calendar day in Khartoum, "YYYY-MM-DD". */
  day: string;
}

export const TEMPLATE_REPEAT_WINDOW = 6;
export const QUESTION_REPEAT_WINDOW = 4;

export function formatPrice(price: number): string {
  return Math.round(price).toLocaleString('en-US');
}

/** Khartoum is UTC+2 all year (no daylight saving). */
export function khartoumDay(now = Date.now()): string {
  return new Date(now + 2 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

/** Small stable hash (FNV-1a) — the pick only needs to be repeatable, not secure. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

export function templateGroup(kind: ComposeInput['kind'], sizes: string[]): TemplateGroup {
  if (kind === 'last') return sizes.length === 1 ? 'last_single' : 'last_multi';
  return kind;
}

/** Category (and name, for the cases a category does not split) → styleLines key. */
export function styleKey(item: Pick<CatalogItem, 'name' | 'category'>, categoryName = ''): StyleKey {
  const text = `${item.name} ${categoryName}`;
  if (/شنط|حقيب/.test(text)) return 'bags';
  if (/بوت|boot/i.test(item.name)) return 'boots';
  const shoes = item.category === 'shoes' || /أحذية|احذية|جزم|سنيكرز/.test(categoryName);
  if (shoes) return /نسائي|حريمي|بناتي/.test(item.name) ? 'shoes_women' : 'sneakers';
  if (/قميص|قمصان/.test(item.name)) return 'shirts';
  if (/تيشيرت|تشيرت|تي شيرت|t-?shirt/i.test(item.name)) return 'tshirts';
  if (/جينز|جنز|بنطلون/.test(item.name)) return 'jeans';
  return 'other';
}

function usable(group: TemplateGroup, bank: CaptionBank): BankTemplate[] {
  return bank.templates[group].filter((t) => !(t.id in SKIPPED_TEMPLATES));
}

const newestFirst = (history: CaptionHistory[]) => [...history].sort((a, b) => b.postedAtMs - a.postedAtMs);

/** Picks the caption parts. Exposed so /posted can recompute what next-product chose. */
export function chooseCaption(input: ComposeInput, bank: CaptionBank = CAPTION_BANK): CaptionMeta & { style: string } {
  const history = newestFirst(input.history);
  const seed = `${input.item.id}|${input.day}`;

  // Template: not one of the last six used; among the rest, a stable pick.
  const templates = usable(templateGroup(input.kind, input.sizes), bank);
  const recentTemplates = new Set(history.slice(0, TEMPLATE_REPEAT_WINDOW).map((h) => h.templateId).filter(Boolean));
  let pool = templates.filter((t) => !recentTemplates.has(t.id));
  if (pool.length === 0) {
    // Every template of this group went out lately: take the one used longest ago.
    const lastUse = (id: string) => history.findIndex((h) => h.templateId === id);
    pool = [...templates].sort((a, b) => lastUse(b.id) - lastUse(a.id)).slice(0, 1);
  }
  const template = pool[hash(`${seed}|t`) % pool.length]!;

  // Question: not one of the last four used.
  let questionIndex = -1;
  if (template.text.includes('{question}')) {
    const recentQuestions = new Set(
      history
        .filter((h) => (h.questionIndex ?? -1) >= 0)
        .slice(0, QUESTION_REPEAT_WINDOW)
        .map((h) => h.questionIndex),
    );
    const all = bank.questions.map((_, i) => i);
    const free = all.filter((i) => !recentQuestions.has(i));
    const choices = free.length ? free : all;
    questionIndex = choices[hash(`${seed}|q`) % choices.length]!;
  }

  // Style line for the product's kind.
  const key = styleKey(input.item, input.categoryName);
  const skipped = SKIPPED_STYLE_LINES[key] ?? [];
  const lines = bank.styleLines[key].filter((_, i) => !skipped.includes(i));
  const style = lines.length ? lines[hash(`${seed}|s`) % lines.length]! : '';

  // Hashtags rotate: the line after the last one used, skipping #سنيكرز off shoes.
  const fitsTag = (line: string) => !line.includes(SNEAKER_TAG) || key === 'sneakers' || key === 'shoes_women';
  const previous = history.find((h) => typeof h.hashtagIndex === 'number' && h.hashtagIndex >= 0)?.hashtagIndex ?? -1;
  let hashtagIndex = -1;
  for (let step = 1; step <= bank.hashtags.length; step++) {
    const i = (previous + step) % bank.hashtags.length;
    if (fitsTag(bank.hashtags[i]!)) {
      hashtagIndex = i;
      break;
    }
  }

  return { templateId: template.id, questionIndex, hashtagIndex, style };
}

function fill(text: string, values: Record<string, string>): string {
  const lines = text.split('\n').flatMap((line) => {
    let empty = false;
    const out = line.replace(/\{(\w+)\}/g, (_, key: string) => {
      const value = values[key] ?? '';
      if (!value) empty = true;
      return value;
    });
    // A line that lost a value reads broken ("المقاس الفاضل: "); drop it rather than post it.
    return empty ? [] : [out];
  });
  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function composeCaption(
  input: ComposeInput,
  bank: CaptionBank = CAPTION_BANK,
): { caption: string; meta: CaptionMeta } {
  const choice = chooseCaption(input, bank);
  const template = bank.templates[templateGroup(input.kind, input.sizes)].find((t) => t.id === choice.templateId)!;
  const body = fill(template.text, {
    name: input.item.name.trim(),
    price: formatPrice(input.item.price),
    sizes: input.sizes.join('، '),
    size: input.sizes.length === 1 ? input.sizes[0]! : '',
    url: input.productUrl,
    wa: SOCIAL_WHATSAPP,
    style: choice.style,
    question: choice.questionIndex >= 0 ? bank.questions[choice.questionIndex]! : '',
  });
  const tags = choice.hashtagIndex >= 0 ? bank.hashtags[choice.hashtagIndex]! : '';
  // Anything that still looks like a placeholder must never reach Facebook.
  const caption = (tags ? `${body}\n\n${tags}` : body)
    .split('\n')
    .filter((line) => !/\{\w+\}/.test(line))
    .join('\n');
  const { templateId, questionIndex, hashtagIndex } = choice;
  return { caption, meta: { templateId, questionIndex, hashtagIndex } };
}

/** True when the id belongs to the bank and is in use — for validating what Make sends back. */
export function isKnownTemplate(id: string, bank: CaptionBank = CAPTION_BANK): boolean {
  return !(id in SKIPPED_TEMPLATES) && Object.values(bank.templates).some((list) => list.some((t) => t.id === id));
}
