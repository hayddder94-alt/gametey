# خريطة النظام (قبل الاختبار)

## الصفحات
متجر: / • /products • /product/:slug • /cart • /checkout • /checkout/details • /order/success/:num • /track • /about • /contact • /admin/login
إدارة: /admin • /admin/products(+/new+/:id/edit) • /admin/categories • /admin/orders(+:id+/:id/print+/:id/pdf+export) • /admin/customers • /admin/users • /admin/settings • /admin/audit

## المستخدمون والصلاحيات
- عميل GUEST: تصفح/سلة/طلب/تتبع — بدون مصادقة.
- 3 حسابات ADMIN موحّدة الصلاحيات (Backend + Trigger). لا تسجيل عام.

## مسار البيانات والطلب
متصفح → Express (zod) → pricing (خادم فقط) → SQLite (معاملة) → رقم طلب → توقيع HMAC → صفحة نجاح → wa.me (عميل) + socket.io/تيليجرام (إدارة).

## الجداول
admin_users(+revoked_at) • settings • categories • products • product_images • product_options • product_option_values • customers • orders(+idem_key) • order_items • order_status_history • audit_logs

## خدمات خارجية
wa.me (روابط عميل) • OSM tiles • Google Fonts • Supabase/Telegram اختياريان.

## نقاط فشل محتملة (مرشحة للاختبار)
1 طلب مكرر عند نقر مزدوج • 2 جلسة لا تُبطل عند الخروج • 3 تسريب Stack Trace • 4 سلة بمنتج محذوف • 5 تغيير سعر أثناء السلة • 6 حقن XSS/SQL • 7 تجاوز حدود كمية • 8 رفع ملفات خبيثة • 9 IDOR ملخصات الطلبات • 10 ضغط/تزامن.
