import { money } from '@/lib/format';
import { compareSizes, salePercent } from '@/lib/store/model';
import { fetchCatalog, fetchCategories, fetchOffers, fetchStoreConfig } from '@/lib/store/server';
import { siteUrl } from '@/lib/store/site';

export const revalidate = 3600;

/**
 * /llms.txt — the shop described for AI assistants (the llms.txt convention):
 * who it is, where, how ordering and payment work, and what is in stock with
 * prices and links. When someone asks an assistant "where can I buy Nike in
 * Al-Ubayyid", this is a plain, current answer it can quote and link to.
 *
 * Built from the public catalog only — the same facts as the product pages.
 */
export async function GET() {
  const [config, catalog, offers, categories] = await Promise.all([fetchStoreConfig(), fetchCatalog(), fetchOffers(), fetchCategories()]);
  const departments = categories.filter((c) => !c.hidden && catalog.some((p) => p.category === c.id));
  const site = siteUrl();

  const brands = [...new Set(catalog.map((p) => p.brand?.trim()).filter(Boolean))] as string[];
  const delivery =
    config.deliveryFee > 0
      ? `${money(config.deliveryFee)}${config.freeDeliveryOver > 0 ? `، ومجاني للطلبات فوق ${money(config.freeDeliveryOver)}` : ''}`
      : 'مجاني';

  const lines: string[] = [
    `# ${config.shopName}`,
    '',
    `> ${config.shopName} متجر أحذية وملابس في ${config.address}، السودان. ${config.heroSubtitle}`,
    '',
    config.about,
    '',
    '## معلومات الطلب',
    '',
    `- الموقع: ${site}/`,
    '- الطلب: من الموقع (اختار المنتج والمقاس وأكّد)، والطلب يوصل المحل واتساب بكل التفاصيل.',
    ...(config.whatsapp ? [`- واتساب: +${config.whatsapp} (https://wa.me/${config.whatsapp})`] : []),
    '- الدفع: عند الاستلام (كاش).',
    `- التوصيل داخل الأبيض: ${delivery}.`,
    ...(config.pickupEnabled ? [`- الاستلام من المحل: مجاني — ${config.address}.`] : []),
    `- الاستبدال: ${config.returnPolicy}`,
    ...(brands.length ? [`- الماركات المتوفرة: ${brands.join('، ')}.`] : []),
    '',
    '## الأقسام',
    '',
    `- [كل المنتجات](${site}/shop)`,
    ...departments.map((c) => `- [${c.name}](${site}/shop?c=${c.id})`),
  ];

  if (offers.length) {
    lines.push('', '## العروض الحالية', '');
    for (const o of offers) {
      lines.push(`- ${o.name}: ${o.kind === 'percent' ? `${o.value}%` : money(o.value)} خصم بالكود ${o.code}${o.minTotal > 0 ? ` للطلبات من ${money(o.minTotal)}` : ''}.`);
    }
  }

  for (const category of departments) {
    const items = catalog.filter((p) => p.category === category.id);
    if (!items.length) continue;
    lines.push('', `## ${category.name} المتوفرة الآن`, '');
    for (const p of items.slice(0, 150)) {
      const sizes = p.sizes
        .filter((s) => s.state !== 'out')
        .map((s) => s.size)
        .sort(compareSizes);
      const off = salePercent(p);
      lines.push(
        `- [${p.name}${p.brand ? ` — ${p.brand}` : ''}](${site}/p/${p.id}): ${money(p.price)}${off ? ` (بدل ${money(p.compareAtPrice)}، خصم ${off}%)` : ''}` +
          (sizes.length ? ` — المقاسات: ${sizes.join('، ')}` : ''),
      );
    }
  }

  lines.push('', `آخر تحديث: ${new Date().toISOString().slice(0, 10)}`);

  return new Response(lines.join('\n'), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
    },
  });
}
