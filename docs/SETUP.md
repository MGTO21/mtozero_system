# الإعداد من الصفر — Mtozero Shop

اتبع الخطوات بالترتيب. المرة الأولى تستغرق حوالي 15 دقيقة.

---

## 1. إنشاء مشروع Firebase

1. افتح [console.firebase.google.com](https://console.firebase.google.com) وأنشئ مشروعاً جديداً
   باسم `mtozero-shop`.
2. من **Build → Authentication → Get started**، فعّل مزوّد **Email/Password**.
3. من **Build → Firestore Database → Create database**، اختر **Production mode** ثم أقرب موقع
   (`eur3` أو `nam5` مناسبان).
4. **لا تفعّل Storage** — النظام لا يستخدمه إطلاقاً. صور المنتجات تُضغط داخل المتصفح إلى
   ~30 كيلوبايت وتُحفظ مع بيانات المنتج في Firestore، فتظهر حتى بدون إنترنت. هذا يتجنّب
   اشتراط خطة Blaze المدفوعة التي فرضتها Firebase على Cloud Storage منذ فبراير 2026.

   للنسخة الكاملة عالية الدقة (اختياري) راجع قسم **صور بدقة كاملة عبر Cloudinary** أدناه.

## 2. الحصول على مفاتيح الويب

من **Project settings (⚙) → General → Your apps** أضف تطبيق **Web** (`</>`) باسم `Mtozero Web`.
انسخ قيم `firebaseConfig`.

أنشئ ملف `.env.local` في جذر المشروع (انسخ `.env.local.example`) واملأه:

```
NEXT_PUBLIC_FIREBASE_API_KEY=AIza...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=mtozero-shop.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=mtozero-shop
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=mtozero-shop.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=123456789012
NEXT_PUBLIC_FIREBASE_APP_ID=1:123456789012:web:abc123
NEXT_PUBLIC_OWNER_EMAIL=your-real-email@gmail.com
```

> هذه المفاتيح عامة بطبيعتها ولا تشكّل خطراً — الحماية الحقيقية في `firestore.rules`.

## 3. تحديد بريد المالك في قواعد الأمان

افتح `firestore.rules` وغيّر السطر:

```
function ownerEmail() {
  return 'owner@example.com';   // ← ضع نفس البريد الموجود في NEXT_PUBLIC_OWNER_EMAIL
}
```

القيمتان **يجب** أن تتطابقا بحروف صغيرة. هذه هي الطريقة الوحيدة التي يُنشأ بها أول حساب مالك.

## 4. نشر قواعد الأمان

**الطريقة الأسهل — بدون تثبيت أي أداة:** افتح `firestore.rules`، انسخ محتواه كاملاً، ثم في
Firebase Console: **Firestore Database → تبويب Rules** ← امسح الموجود ← الصق ← **Publish**.

أو عبر سطر الأوامر:

```bash
npm install -g firebase-tools
firebase login
firebase use --add          # اختر مشروع mtozero-shop
firebase deploy --only firestore:rules
```

بدون هذه الخطوة سيرفض Firestore كل قراءة وكتابة.

## 5. إنشاء حساب المالك

Authentication → **Users → Add user**، وأدخل نفس البريد الموجود في `NEXT_PUBLIC_OWNER_EMAIL`
مع كلمة مرور قوية. عند أول دخول للنظام سيُنشئ التطبيق ملف المستخدم تلقائياً بدور `owner`.

## 6. التشغيل محلياً

```bash
npm install
npm run dev
```

افتح <http://localhost:3000> وسجّل الدخول ببريد المالك.

## 7. النشر على Vercel

1. ارفع المشروع إلى مستودع Git.
2. في [vercel.com](https://vercel.com) اختر **New Project** ثم استورد المستودع (يكتشف Next.js تلقائياً).
3. أضف **نفس** متغيرات `.env.local` في **Settings → Environment Variables** لبيئات
   Production و Preview و Development.
4. اضغط **Deploy**.
5. بعد النشر، عُد إلى Firebase → **Authentication → Settings → Authorized domains** وأضف نطاق
   Vercel (`mtozero-shop.vercel.app` وأي نطاق مخصص). بدونها سيفشل تسجيل الدخول على الموقع المنشور.

## 8. تثبيت النظام كتطبيق (PWA)

- **أندرويد / كروم**: افتح الموقع ← ستظهر لافتة «ثبّت النظام» داخل التطبيق، أو من قائمة
  المتصفح ← «تثبيت التطبيق».
- **آيفون / سفاري**: زر المشاركة ← «إضافة إلى الشاشة الرئيسية».
- **ويندوز / ماك**: أيقونة التثبيت في شريط عنوان كروم أو إيدج.

بعد التثبيت يفتح النظام كتطبيق مستقل، ويعرض آخر بيانات محفوظة حتى بدون إنترنت.

## 9. إضافة الموظفين

من داخل النظام: **الفريق ← مستخدم جديد**. أدخل الاسم والبريد وكلمة مرور مؤقتة. حسابك يبقى
مسجّلاً للدخول (يتم الإنشاء عبر نسخة ثانوية من Firebase Auth).

---

## صور بدقة كاملة عبر Cloudinary (اختياري)

الصورة المصغّرة كافية لكل شاشات النظام (تُعرض بحجم 96 بكسل). فعّل هذا القسم فقط إذا أردت
نسخة كاملة الدقة تفتح عند الضغط على الصورة.

1. أنشئ حساباً مجانياً على [cloudinary.com](https://cloudinary.com) — **بدون بطاقة ائتمان**،
   والباقة المجانية 25 credit شهرياً (1 credit ≈ 1 جيجا تخزين أو نقل).
2. من لوحة التحكم انسخ **Cloud name**.
3. **Settings → Upload → Upload presets → Add upload preset**:
   - **Signing mode: Unsigned** ← ضروري، لأن الرفع يتم من المتصفح مباشرة بلا سيرفر.
   - احفظ واسم الـ preset.
4. أضف القيمتين إلى `.env.local`:

```
NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME=your-cloud-name
NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET=your-preset-name
```

أعد تشغيل `npm run dev`. من الآن، كل صورة جديدة تُحفظ مرتين: مصغّرة في Firestore (تعمل بدون
إنترنت) ونسخة كاملة على Cloudinary.

> **ملاحظة أمنية:** الـ preset من نوع Unsigned يعني أن أي شخص يعرف اسمه يستطيع الرفع إلى
> حسابك. للمتجر الصغير هذا مقبول، وتقدر تحدّ منه من إعدادات الـ preset (نوع الملف والحجم
> الأقصى والمجلد). لو فشل الرفع لأي سبب، يُحفظ المنتج بصورته المصغّرة ويظهر تنبيه — لا تضيع
> أي بيانات.

## استكشاف الأخطاء

| العَرَض | السبب والحل |
|---|---|
| شاشة «النظام يحتاج إعداد Firebase» | `.env.local` غير موجود أو ناقص. أعد تشغيل `npm run dev` بعد تعديله. |
| «ليست لديك صلاحية لعرض هذه البيانات» | لم تُنشر قواعد الأمان — نفّذ الخطوة 4. |
| دخلت وظهر لك دور «موظف» بدل «مالك» | البريد لا يطابق `NEXT_PUBLIC_OWNER_EMAIL`. صحّح القيمة، ثم عدّل حقل `role` يدوياً إلى `owner` في مستند `users/{uid}` من Firestore Console. |
| فشل تسجيل الدخول على Vercel فقط | نطاق Vercel غير مضاف في Authorized domains — الخطوة 7.5. |
| الصورة المصغّرة لا تظهر | صيغة غير مدعومة (HEIC من آيفون أحياناً). صوّر بصيغة JPEG أو حوّلها. |
| «إعداد الرفع في Cloudinary غير صحيح» | الـ preset ليس من نوع Unsigned — راجع قسم Cloudinary أعلاه. |
