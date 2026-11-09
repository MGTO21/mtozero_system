'use client';

import { useMemo } from 'react';
import { SOCIAL_KIND_LABEL, useSocialPosts } from '@/lib/db/social';
import { formatDate, relativeTime } from '@/lib/format';
import type { Product } from '@/lib/types';

/**
 * The daily Facebook post, from the product's side: keep it out of the rotation,
 * see when it last went out, and a warning when its only picture is the small
 * thumbnail — the post image is 1080px wide and would come out soft.
 */
export function SocialSettings({
  product,
  exclude,
  onExclude,
  pictureChanged,
}: {
  product: Product | null;
  exclude: boolean;
  onExclude: (value: boolean) => void;
  /** A new picture was picked in this edit; it gets a sharp copy on save. */
  pictureChanged: boolean;
}) {
  const { data: posts } = useSocialPosts(Boolean(product));
  const last = useMemo(() => (product ? posts.find((p) => p.productId === product.id) : undefined), [posts, product]);
  const smallPicture = Boolean(product?.thumbData) && !product?.imageUrl && !product?.hdHash && !pictureChanged;

  return (
    <div className="rounded-card border border-line bg-sunken sm:col-span-2">
      <label className="flex cursor-pointer items-center gap-3 px-3.5 py-3">
        <span className="min-w-0 flex-1">
          <span className="block font-bold">ما تنزل في فيسبوك</span>
          <span className="block text-[0.78rem] text-fg-3">المنشور اليومي الساعة 8 ما بيختار المنتج ده</span>
        </span>
        <input
          type="checkbox"
          checked={exclude}
          onChange={(e) => onExclude(e.target.checked)}
          className="h-6 w-6 accent-[rgb(var(--fg))]"
        />
      </label>
      {product ? (
        <div className="space-y-1 border-t border-line px-3.5 py-2.5 text-[0.8rem]">
          <p className="text-fg-2">
            آخر مرة نزل في فيسبوك:{' '}
            {last ? (
              <span className="font-bold text-fg" title={formatDate(last.postedAt)}>
                {relativeTime(last.postedAt)} · {SOCIAL_KIND_LABEL[last.kind]}
              </span>
            ) : (
              <span className="text-fg-3">ما نزل في آخر 30 منشور</span>
            )}
          </p>
          {smallPicture ? (
            <p className="font-bold text-warn">
              صورتو صغيرة، فصورة المنشور حتطلع مش واضحة. اختار الصورة من جديد واحفظ، عشان تتحفظ نسخة واضحة.
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
