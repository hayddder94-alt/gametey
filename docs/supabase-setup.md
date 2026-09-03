# تفعيل Supabase Auth لتوثيق تسجيل الدخول

النظام يدعم توثيق تسجيل دخول الإدارة عبر **Supabase Auth** رسميًا (SDK `@supabase/supabase-js`).
بدون تفعيله، يعمل التحقق المحلي الآمن (bcrypt) تلقائيًا — نفس الحسابات الثلاثة.

## الخيار 1: Supabase Cloud (الأسرع)

1. أنشئ مشروعًا مجانيًا على supabase.com.
2. من Project Settings ← API انسخ: `Project URL` و`anon public key` و`service_role key`.
3. شغّل الخادم بالمتغيرات:

```bash
SUPABASE_URL=https://xxxx.supabase.co \
SUPABASE_ANON_KEY=eyJ... \
SUPABASE_SERVICE_ROLE_KEY=eyJ... \
npm start
```

4. عند أول تشغيل سيُنشئ النظام الحسابات الإدارية الثلاثة داخل Supabase Auth تلقائيًا
   (بكلمات المرور نفسها الموجودة في `data/first-run-credentials.txt`).
5. سجّل الدخول كالمعتاد من `/admin/login` — التحقق يتم الآن عبر خوادم Supabase
   (يظهر `"via":"supabase"` في استجابة الدخول).

## الخيار 2: استضافة ذاتية (سيرفرك الخاص — يتطلب Docker)

بيئة المعاينة الحالية لا تملك Docker، لكن على سيرفرك:

```bash
git clone https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env        # عدّل JWT_SECRET وكلمات المرور
docker compose up -d        # يشغّل Postgres + Auth(GoTrue) + REST + Studio
```

ثم استخدم `http://localhost:8000` كـ `SUPABASE_URL` (Kong gateway) مع مفاتيح `.env`،
وشغّل متجر المؤمل بنفس المتغيرات أعلاه.

## سلوك النظام

- كلمة المرور تُتحقق في Supabase أولًا؛ الحساب المعطّل محليًا يُرفض دائمًا.
- الأدوار والصلاحيات (ADMIN موحّد، حد 3 حسابات) تبقى مفروضة محليًا في Backend وقاعدة البيانات.
- `SUPABASE_FALLBACK_LOCAL=true` (اختياري): يرجع للتحقق المحلي إذا تعذر الوصول لـ Supabase مؤقتًا.
- سجل العمليات يوثق طريقة التوثيق (`via: supabase / local`).

## إنشاء الحسابات يدويًا (اختياري)

إن فضلت إنشاءها من لوحة Supabase Dashboard ← Authentication ← Users ← Add user
(فعّل auto-confirm)، استخدم نفس بريدي كل حساب: `admin1@almuammal.iq` … `admin3@almuammal.iq`.
