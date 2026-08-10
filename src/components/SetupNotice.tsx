import { Brand } from '@/components/layout/Brand';

/**
 * Shown instead of the app when the Firebase keys are missing, so a fresh clone
 * explains itself rather than crashing with a cryptic SDK error.
 */
export function SetupNotice() {
  return (
    <div className="app-height flex items-center justify-center px-5 py-10">
      <div className="w-full max-w-lg">
        <Brand />
        <h1 className="mt-6 text-2xl">النظام يحتاج إعداد Firebase</h1>
        <p className="mt-2 text-[0.92rem] leading-relaxed text-ink-500 dark:text-ink-400">
          لم يتم العثور على مفاتيح Firebase. أنشئ ملف <code className="rounded bg-ink-100 px-1.5 py-0.5 font-mono text-[0.8rem] dark:bg-ink-800">.env.local</code>{' '}
          في جذر المشروع وضع فيه القيم التالية من إعدادات مشروعك في Firebase Console:
        </p>

        <pre
          dir="ltr"
          className="mt-4 overflow-x-auto rounded-card border border-ink-200 bg-ink-100/70 p-4 text-left font-mono text-[0.75rem] leading-relaxed text-ink-700 dark:border-ink-800 dark:bg-ink-900 dark:text-ink-200"
        >{`NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_OWNER_EMAIL=your@email.com`}</pre>

        <p className="mt-4 text-[0.85rem] leading-relaxed text-ink-500 dark:text-ink-400">
          الخطوات الكاملة مشروحة في ملف <span className="font-bold">docs/SETUP.md</span> — بما فيها تفعيل
          تسجيل الدخول بالبريد، ونشر قواعد الأمان، وإنشاء حساب المالك.
        </p>
      </div>
    </div>
  );
}
