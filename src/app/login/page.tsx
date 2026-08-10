'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { Brand } from '@/components/layout/Brand';
import { useAuth } from '@/components/providers/AuthProvider';
import { SetupNotice } from '@/components/SetupNotice';
import { Button } from '@/components/ui/Button';
import { IconStore } from '@/components/ui/Icons';
import { errorMessage } from '@/lib/db/collections';
import { isFirebaseConfigured } from '@/lib/firebase';

export default function LoginPage() {
  const { firebaseUser, loading, signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && firebaseUser) router.replace('/dashboard');
  }, [loading, firebaseUser, router]);

  if (!isFirebaseConfigured) return <SetupNotice />;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(email, password);
      router.replace('/dashboard');
    } catch (err) {
      setError(errorMessage(err, 'تعذّر تسجيل الدخول.'));
      setBusy(false);
    }
  }

  return (
    <div className="app-height flex flex-col justify-center px-5 py-10">
      <div className="mx-auto w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-white">
            <IconStore className="h-7 w-7" />
          </div>
          <Brand />
          <p className="mt-2 text-[0.85rem] font-semibold text-ink-400 dark:text-ink-500">
            إدارة المخزون والمبيعات — الأبيض
          </p>
        </div>

        <form onSubmit={onSubmit} className="surface space-y-4 p-5">
          <div>
            <label className="label" htmlFor="email">
              البريد الإلكتروني
            </label>
            <input
              id="email"
              type="email"
              dir="ltr"
              autoComplete="username"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="field text-left"
              placeholder="name@example.com"
            />
          </div>

          <div>
            <label className="label" htmlFor="password">
              كلمة المرور
            </label>
            <input
              id="password"
              type="password"
              dir="ltr"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="field text-left"
              placeholder="••••••••"
            />
          </div>

          {error ? (
            <p className="rounded-card border border-bad/40 bg-bad/10 px-3 py-2.5 text-[0.85rem] font-bold text-bad">
              {error}
            </p>
          ) : null}

          <Button type="submit" size="lg" block loading={busy}>
            دخول
          </Button>
        </form>

        <p className="mt-5 text-center text-[0.78rem] leading-relaxed text-ink-400 dark:text-ink-500">
          ليس لديك حساب؟ الحسابات يُنشئها المالك من صفحة «الفريق» داخل النظام.
        </p>
      </div>
    </div>
  );
}
