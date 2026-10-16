import Link from 'next/link';
import { Brand } from '@/components/layout/Brand';
import { IconFacebook, IconInstagram, IconTikTok, IconWhatsApp } from '@/components/ui/Icons';
import { socialUrl } from '@/lib/store/model';
import type { StoreConfig } from '@/lib/types';

export function StoreFooter({
  config,
  logoSrc,
  departments,
}: {
  config: StoreConfig;
  logoSrc: string | null;
  departments: { id: string; name: string }[];
}) {
  const socials = (
    [
      ['instagram', 'انستغرام', IconInstagram],
      ['facebook', 'فيسبوك', IconFacebook],
      ['tiktok', 'تيك توك', IconTikTok],
    ] as const
  )
    .map(([kind, label, Icon]) => ({ url: socialUrl(kind, config[kind]), label, Icon }))
    .filter((s) => s.url);

  return (
    <footer className="mt-24 border-t border-line bg-surface">
      <div className="mx-auto grid max-w-7xl gap-8 px-4 py-12 sm:grid-cols-3 sm:px-6">
        <div>
          <Brand src={logoSrc} />
          <p className="mt-3 max-w-xs text-[0.9rem] leading-relaxed text-fg-2">{config.about}</p>
          {socials.length > 0 ? (
            <div className="mt-4 flex gap-2">
              {socials.map(({ url, label, Icon }) => (
                <a
                  key={label}
                  href={url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="press flex h-11 w-11 items-center justify-center rounded-full border border-line-strong text-fg-2 hover:border-fg hover:text-fg"
                >
                  <Icon className="h-5 w-5" />
                </a>
              ))}
            </div>
          ) : null}
        </div>
        <div>
          <p className="ledger-head">تسوّق</p>
          <ul className="space-y-2 text-[0.92rem] font-bold text-fg-2">
            {departments.map((d) => (
              <li key={d.id}>
                <Link href={`/shop?c=${d.id}`} className="hover:text-fg">
                  {d.name}
                </Link>
              </li>
            ))}
            <li>
              <Link href="/wishlist" className="hover:text-fg">
                المفضلة
              </Link>
            </li>
            <li>
              <Link href="/card" className="hover:text-fg">
                رصيدك وكود الإحالة
              </Link>
            </li>
          </ul>
        </div>
        <div>
          <p className="ledger-head">تواصل معانا</p>
          <p className="text-[0.9rem] text-fg-2">{config.address}</p>
          {config.whatsapp ? (
            <a
              href={`https://wa.me/${config.whatsapp}`}
              target="_blank"
              rel="noopener noreferrer"
              className="press mt-3 inline-flex h-11 items-center gap-2 rounded-card bg-good px-4 font-display font-extrabold text-white"
            >
              <IconWhatsApp className="h-5 w-5" />
              واتساب
            </a>
          ) : null}
          <p className="mt-4 text-[0.8rem] leading-relaxed text-fg-3">{config.returnPolicy}</p>
        </div>
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 px-4 py-4 text-[0.78rem] text-fg-3 sm:px-6">
          <span>© {new Date().getFullYear()} {config.shopName} — الدفع عند الاستلام</span>
          <Link href="/login" className="hover:text-fg-2">
            دخول الفريق
          </Link>
        </div>
      </div>
    </footer>
  );
}

/** The always-there WhatsApp button: most customers here still prefer to ask first. */
export function WhatsAppFloat({ number }: { number: string }) {
  if (!number) return null;
  return (
    <a
      href={`https://wa.me/${number}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="تواصل واتساب"
      className="wa-float press fixed bottom-5 left-5 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-good text-white shadow-lift"
    >
      <IconWhatsApp className="h-7 w-7" />
    </a>
  );
}
