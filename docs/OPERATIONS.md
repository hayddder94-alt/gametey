# دليل التشغيل (Runbook)

## النشر
1. `npm ci --omit=dev` ثم `npm start` (PORT/HOST عبر البيئة).
2. خلف HTTPS: `PROD_SECURE=true` (يفعّل HSTS وكوكي secure).
3. نطاق canonical: `SITE_URL=https://نطاقك`.

## النسخ الاحتياطي والاستعادة
- يوميًا: `npm run backup` → `data/backups/` (يُبقي آخر 7).
- استعادة: أوقف الخادم، انسخ الملف إلى `data/almuammal.db`، شغّل.

## المراقبة
- `GET /healthz` → { ok, dbMs, uptime } — نبّه إن 503 أو dbMs > 200.
- السجلات: `data/logs/app.log` (pino، مستويات حسب الحالة).
- سجل العمليات: لوحة الإدارة ← سجل العمليات (يُقلم تلقائيًا بعد 90 يومًا؛ `AUDIT_RETENTION_DAYS`).

## الحسابات والأمان
- 3 حسابات ADMIN فقط؛ غيّر كلمات المرور أول تشغيل من اللوحة.
- تفعيل Supabase Auth اختياريًا: docs/supabase-setup.md.

## مهام دورية مقترحة
- أسبوعيًا: فحص الطلبات المعلقة، تحديث العروض، مراجعة سجل العمليات.
- شهريًا: اختبار استعادة نسخة احتياطية، `npm audit`، تحديث الاعتماديات الثانوية.

## CI
انسخ `docs/ci.yml.example` إلى `.github/workflows/ci.yml` في مستودعك لتفعيل خط الجودة تلقائيًا (يتطلب صلاحية workflows).
