'use strict';
/** مخططات التحقق zod (colinhacks/zod) — مصدر حقيقة واحد لبيانات الـ API */
const { z } = require('zod');

const iraquiPhone = z.string().trim().regex(/^(\+?964|0)?7\d{9}$/, 'رقم هاتف عراقي غير صالح، مثال: 07701234567');

const customerSchema = z.object({
  name: z.string().trim().min(3, 'يرجى إدخال الاسم الكامل بشكل صحيح (3 أحرف على الأقل).').max(80, 'الاسم طويل جدًا.'),
  phone: iraquiPhone,
  governorate: z.string().trim().min(2, 'يرجى اختيار المحافظة.'),
  area: z.string().trim().min(2, 'يرجى إدخال المنطقة.'),
  landmark: z.string().trim().max(200).default(''),
  address: z.string().trim().max(500).default(''),
  location_link: z.string().trim().max(500)
    .refine((v) => v === '' || /^https:\/\/(maps\.google\.com|maps\.app\.goo\.gl|www\.google\.com\/maps|google\.com\/maps)\//.test(v), 'رابط الموقع غير صالح.')
    .default(''),
  notes: z.string().trim().max(1000).default(''),
  // أهلية التقسيط وفق آلية الشركة: موظف أو كفيل موظف (الرافدين/الأهلي العراقي/TPI) + كتاب استمرارية
  employment_type: z.enum(['EMPLOYEE', 'GUARANTOR']).optional(),
  employee_name: z.string().trim().max(80).default(''),
  employer: z.string().trim().max(120).default(''),
  bank: z.enum(['RAFIDAIN', 'AHLI', 'TPI']).optional(),
  guarantor_name: z.string().trim().max(80).default(''),
  letter_ref: z.string().trim().max(120).default(''),
});

const orderItemSchema = z.object({
  product_id: z.coerce.number().int().positive('منتج غير صالح.'),
  qty: z.coerce.number().int().min(1).max(50, 'الكمية غير صالحة.'),
  method: z.enum(['CASH', 'INSTALLMENT'], { message: 'طريقة الدفع غير صالحة.' }),
  options: z.record(z.string(), z.union([z.coerce.number().int(), z.string().max(200)])).default({}),
  // أي حقول سعر يرسلها العميل تُتجاهل تمامًا — الأسعار تُحسب في الخادم
}).strip();

const createOrderSchema = z.object({
  customer: customerSchema,
  items: z.array(orderItemSchema).min(1, 'السلة فارغة.').max(30, 'عدد البنود كبير جدًا.'),
  idem: z.string().trim().max(64).optional(), // مفتاح منع الازدواج (نقر مزدوج/إعادة إرسال)
});

const loginSchema = z.object({
  identifier: z.string().trim().min(3).max(120),
  password: z.string().min(1).max(200),
});

const settingsSchema = z.object({
  COMPANY_NAME: z.string().trim().max(200).optional(),
  COMPANY_PHONE: z.string().trim().max(30).optional(),
  WHATSAPP_COMPANY_NUMBER: z.string().transform((v) => v.replace(/\D/g, '')).optional(),
  COMPANY_ADDRESS: z.string().trim().max(300).optional(),
  COMPANY_SLOGAN: z.string().trim().max(300).optional(),
  SALES_INCLUDE_DELIVERED: z.enum(['0', '1']).optional(),
  TELEGRAM_BOT_TOKEN: z.string().max(200).optional(),
  TELEGRAM_CHAT_ID: z.string().max(50).optional(),
});

/** تحويل أخطاء zod إلى كائن {مسار.منقط: رسالة} — المسار الكامل دائمًا */
function zodErrorsToMap(error) {
  const map = {};
  for (const iss of error.issues) {
    const key = iss.path.filter((p) => typeof p !== 'symbol').join('.') || '_';
    if (!map[key]) map[key] = iss.message;
  }
  return map;
}

module.exports = { z, customerSchema, orderItemSchema, createOrderSchema, loginSchema, settingsSchema, zodErrorsToMap };
