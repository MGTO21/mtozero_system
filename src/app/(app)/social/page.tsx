'use client';

import { useMemo } from 'react';
import { EmptyState, ErrorBlock, SkeletonRows, Stamp } from '@/components/ui/Feedback';
import { IconMegaphone } from '@/components/ui/Icons';
import { PageHeader } from '@/components/ui/PageHeader';
import { productImage, useProducts } from '@/lib/db/products';
import { facebookPostUrl, SOCIAL_KIND_LABEL, useSocialPosts } from '@/lib/db/social';
import { formatDateTime, relativeTime } from '@/lib/format';

/**
 * What the daily Facebook post has published: one row per post, with the
 * product as it is now and a link to the post itself. The posts are chosen and
 * recorded by the server (/api/social) for the Make.com scenario; this screen
 * only reads.
 */
export default function SocialPage() {
  const { data: posts, loading, error } = useSocialPosts();
  const { data: products } = useProducts();
  const byId = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  return (
    <>
      <PageHeader title="منشورات فيسبوك" subtitle="المنتج البينزل كل يوم الساعة 8 بالليل في صفحة Mtozero Shop — آخر 30 منشور" />

      {error ? <ErrorBlock message={error} /> : null}

      {loading ? (
        <SkeletonRows count={4} />
      ) : posts.length === 0 ? (
        <div className="surface">
          <EmptyState
            icon={<IconMegaphone />}
            title="لسه ما نزل أي منشور"
            hint="أول ما Make ينزّل منشور ويبلّغ الموقع، بيظهر هنا. منتج ما عايزو ينزل؟ افتحو من المخزون وفعّل «ما تنزل في فيسبوك»."
          />
        </div>
      ) : (
        <ul className="surface rows overflow-hidden">
          {posts.map((post) => {
            const product = byId.get(post.productId);
            const image = product ? productImage(product) : null;
            const link = facebookPostUrl(post.fbPostId);
            return (
              <li key={post.id} className="flex items-center gap-3 px-3.5 py-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-card bg-sunken">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  {image ? <img src={image} alt="" className="h-full w-full object-cover" /> : null}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{product?.name ?? 'منتج محذوف من المخزون'}</p>
                  <p className="text-[0.8rem] text-fg-3" title={formatDateTime(post.postedAt)}>
                    {relativeTime(post.postedAt)}
                  </p>
                </div>
                <Stamp tone={post.kind === 'last' ? 'warn' : post.kind === 'new' ? 'good' : 'muted'}>
                  {SOCIAL_KIND_LABEL[post.kind]}
                </Stamp>
                {link ? (
                  <a
                    href={link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="press inline-flex h-11 shrink-0 items-center rounded-card border border-line px-3 font-display text-[0.85rem] font-extrabold"
                  >
                    المنشور
                  </a>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
