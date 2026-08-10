/**
 * Read-only health check for the Firebase project behind .env.local.
 *
 * Answers the three questions that actually block a fresh setup:
 *   1. Are the web API keys valid?
 *   2. Is Email/Password sign-in switched on?
 *   3. Does the Firestore database exist, and are the security rules published?
 *
 * Nothing is written and no account is created — every probe is a request that is
 * expected to be rejected, and the rejection code is the answer.
 *
 * Usage: node scripts/check-firebase.mjs
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = join(ROOT, '.env.local');

if (!existsSync(ENV_PATH)) {
  console.error('\n✖ لا يوجد ملف .env.local — شغّل scripts/setup-firebase.mjs أولاً.\n');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync(ENV_PATH, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const at = line.indexOf('=');
      return [line.slice(0, at).trim(), line.slice(at + 1).trim()];
    }),
);

const apiKey = env.NEXT_PUBLIC_FIREBASE_API_KEY;
const projectId = env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
const ownerEmail = (env.NEXT_PUBLIC_OWNER_EMAIL ?? '').toLowerCase();

console.log(`\nالمشروع: ${projectId}\nبريد المالك: ${ownerEmail}\n`);

const results = [];
const record = (ok, label, detail) => {
  results.push(ok);
  console.log(`${ok ? '✓' : '✖'} ${label}${detail ? `\n    ${detail}` : ''}`);
};

/* ---------- 1 + 2: API key and the Email/Password provider ---------- */

try {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // A deliberately non-existent account: we only care which error comes back.
      body: JSON.stringify({
        email: 'setup-probe@mtozero.invalid',
        password: 'probe-not-a-real-password',
        returnSecureToken: true,
      }),
    },
  );
  const body = await res.json();
  const code = body?.error?.message ?? '';

  if (code.includes('API_KEY_INVALID') || code.includes('API key not valid')) {
    record(false, 'مفتاح Firebase', 'المفتاح غير صالح — راجع NEXT_PUBLIC_FIREBASE_API_KEY.');
  } else if (code.includes('OPERATION_NOT_ALLOWED')) {
    record(true, 'مفتاح Firebase صالح');
    record(false, 'تسجيل الدخول بالبريد', 'غير مفعّل — Authentication → Sign-in method → Email/Password → Enable.');
  } else if (code.includes('EMAIL_NOT_FOUND') || code.includes('INVALID_LOGIN_CREDENTIALS') || code.includes('INVALID_PASSWORD')) {
    record(true, 'مفتاح Firebase صالح');
    record(true, 'تسجيل الدخول بالبريد مفعّل');
  } else {
    record(false, 'فحص المصادقة', `رد غير متوقع: ${code || res.status}`);
  }
} catch (err) {
  record(false, 'الاتصال بـ Firebase Auth', String(err));
}

/* ---------- 3: Firestore database + published rules ---------- */

try {
  const res = await fetch(
    `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents/products?pageSize=1`,
  );
  const body = await res.json().catch(() => ({}));
  const status = body?.error?.status ?? '';

  if (res.ok) {
    record(false, 'قواعد الأمان', 'قاعدة البيانات مفتوحة للجميع! انشر firestore.rules فوراً.');
  } else if (status === 'PERMISSION_DENIED') {
    // This proves the database exists and is not world-readable, but it cannot tell
    // our published rules apart from Firebase's default deny-all rules — both reject
    // an anonymous read. Publishing firestore.rules still has to be confirmed by hand.
    record(true, 'قاعدة البيانات موجودة والوصول المجهول مرفوض');
    console.log(
      '    ⚠ هذا لا يثبت أن firestore.rules منشورة — قواعد Firebase الافتراضية ترفض أيضاً.\n' +
        '      إن لم تنشرها بعد: Firestore → Rules → الصق محتوى firestore.rules → Publish.',
    );
  } else if (status === 'NOT_FOUND') {
    record(false, 'قاعدة البيانات', 'غير منشأة — Firestore Database → Create database (Production mode).');
  } else {
    record(false, 'فحص Firestore', `رد غير متوقع: ${status || res.status}`);
  }
} catch (err) {
  record(false, 'الاتصال بـ Firestore', String(err));
}

/* ---------- 4: the two owner-email values must match ---------- */

const rules = readFileSync(join(ROOT, 'firestore.rules'), 'utf8');
const inRules = rules.match(/function ownerEmail\(\)\s*\{\s*return\s*'([^']*)'/)?.[1]?.toLowerCase();
record(
  inRules === ownerEmail,
  'تطابق بريد المالك بين .env.local و firestore.rules',
  inRules === ownerEmail ? '' : `.env.local = ${ownerEmail}   |   firestore.rules = ${inRules}`,
);

const failed = results.filter((ok) => !ok).length;
console.log(
  failed === 0
    ? '\nكل شيء جاهز. شغّل: npm run dev\n'
    : `\n${failed} خطوة متبقية — عالجها ثم أعد تشغيل هذا الفحص.\n`,
);
process.exit(failed === 0 ? 0 : 1);
