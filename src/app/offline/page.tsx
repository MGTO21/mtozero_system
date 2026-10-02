import { Brand } from '@/components/layout/Brand';

export const metadata = { title: 'غير متصل — Mtozero Shop' };

/**
 * Served by the service worker only when a page could not be opened at all —
 * normally every screen is precached, so this means the app was never opened
 * online on this phone since the last update.
 */
export default function OfflinePage() {
  return (
    <div className="app-height flex flex-col items-center justify-center gap-4 px-6 text-center">
      <Brand />
      <h1 className="text-xl">بدون شبكة</h1>
      <p className="max-w-sm text-[0.92rem] leading-relaxed text-fg-2">
        الصفحة دي لسه ما اتحفظت على الجهاز. افتح النظام مرة واحدة والشبكة شغّالة — بعدها كل الشاشات تفتح
        بدون شبكة، والبيع يتسجّل على الجهاز ويترسل براهو.
      </p>
      <a href="/dashboard" className="press mt-2 rounded-card bg-fg px-5 py-3 font-display font-extrabold text-page">
        حاول مرة تانية
      </a>
    </div>
  );
}
