import { Brand } from '@/components/layout/Brand';

export const metadata = { title: 'غير متصل — Mtozero Shop' };

/** Served by the service worker when a navigation happens with no cached page. */
export default function OfflinePage() {
  return (
    <div className="app-height flex flex-col items-center justify-center gap-4 px-6 text-center">
      <Brand />
      <h1 className="text-xl">لا يوجد اتصال بالإنترنت</h1>
      <p className="max-w-sm text-[0.9rem] leading-relaxed text-ink-500 dark:text-ink-400">
        هذه الصفحة لم تُحفَظ للاستخدام بدون إنترنت. افتح النظام مرة واحدة أثناء وجود شبكة، وبعدها
        ستبقى بياناتك متاحة للعرض حتى لو انقطع الاتصال.
      </p>
    </div>
  );
}
