export const COL = {
  products: 'products',
  sales: 'sales',
  expenses: 'expenses',
  users: 'users',
  activity: 'activityLog',
  payments: 'debtPayments',
  returns: 'returns',
  shipments: 'shipments',
  shipmentGroups: 'shipmentGroups',
  customers: 'customers',
  referrals: 'referrals',
  settings: 'settings',
} as const;

/** Single configuration document holding shop identity and referral rules. */
export const SETTINGS_DOC = 'shop';

/** Error whose message is already user-facing Arabic and safe to show in a toast. */
export class AppError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AppError';
  }
}

export function errorMessage(err: unknown, fallback = 'حدث خطأ غير متوقع. حاول مرة أخرى.'): string {
  if (err instanceof AppError) return err.message;
  if (err instanceof Error) {
    const code = (err as { code?: string }).code ?? '';
    if (code === 'permission-denied') return 'ليست لديك صلاحية لهذه العملية.';
    if (code === 'unavailable') return 'لا يوجد اتصال بالإنترنت. سيتم المزامنة عند عودة الشبكة.';
    if (code === 'auth/invalid-credential' || code === 'auth/wrong-password')
      return 'البريد أو كلمة المرور غير صحيحة.';
    if (code === 'auth/user-not-found') return 'لا يوجد حساب بهذا البريد.';
    if (code === 'auth/too-many-requests') return 'محاولات كثيرة. انتظر قليلاً ثم حاول مرة أخرى.';
    if (code === 'auth/email-already-in-use') return 'هذا البريد مستخدم بالفعل.';
    if (code === 'auth/weak-password') return 'كلمة المرور قصيرة — 6 أحرف على الأقل.';
    if (code === 'auth/network-request-failed') return 'تعذّر الاتصال بالشبكة.';
    if (code === 'auth/operation-not-allowed')
      return 'تسجيل الدخول بالبريد غير مفعّل في Firebase — فعّل Email/Password من Authentication.';
    if (code === 'auth/invalid-api-key' || code === 'auth/api-key-not-valid')
      return 'مفاتيح Firebase غير صحيحة — راجع ملف .env.local.';
    if (code === 'storage/unauthorized') return 'ليست لديك صلاحية رفع الصور.';
    if (code === 'storage/unknown' || code === 'storage/retry-limit-exceeded')
      return 'تخزين الصور غير مفعّل في مشروع Firebase. المنتج يُحفظ بدون صورة.';
  }
  return fallback;
}
