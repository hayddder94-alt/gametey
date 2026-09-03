'use strict';
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');

/** سر JWT: من البيئة، أو مولّد عشوائيًا ومحفوظ خارج Git (لا قيمة تطويرية مكشوفة) */
function loadJwtSecret() {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const f = path.join(ROOT, 'data', 'jwt-secret.txt');
  try {
    if (fs.existsSync(f)) {
      const s = fs.readFileSync(f, 'utf8').trim();
      if (s.length >= 32) return s;
    }
  } catch { /* يُعاد التوليد */ }
  const s = crypto.randomBytes(48).toString('hex');
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(f, s, { mode: 0o600 });
  } catch { /* غير حرج */ }
  return s;
}

const config = {
  root: ROOT,
  port: parseInt(process.env.PORT || '3000', 10),
  host: process.env.HOST || '0.0.0.0',
  env: process.env.NODE_ENV || 'development',

  dbFile: process.env.DB_FILE || path.join(ROOT, 'data', 'almuammal.db'),

  uploadsDir: path.join(ROOT, 'public', 'uploads'),
  maxUploadBytes: 6 * 1024 * 1024,
  allowedMime: new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),

  jwtSecret: loadJwtSecret(),
  jwtExpiresIn: '10h',
  cookieName: 'alm_admin_session',

  // قاعدة صارمة: 3 حسابات إدارية فقط (تُفرض أيضًا عبر Trigger في قاعدة البيانات)
  MAX_ADMIN_USERS: 3,

  loginWindowMs: 15 * 60 * 1000,
  loginMaxAttempts: 8,
  orderWindowMs: 60 * 60 * 1000,
  orderMaxPerHour: parseInt(process.env.ORDER_MAX_PER_HOUR || '12', 10),

  defaultSettings: {
    COMPANY_NAME: 'شركة المؤمل',
    COMPANY_PHONE: '07830020117',
    WHATSAPP_COMPANY_NUMBER: '9647821296460',
    COMPANY_ADDRESS: 'النجف - حي الكرامة، Najaf, Iraq',
    COMPANY_SLOGAN: 'كل ما يحتاجه بيتك من كهربائيات وأثاث ومنزلية — نقدًا أو بالتقسيط',
    MAX_ADMIN_USERS: '3',
    SALES_INCLUDE_DELIVERED: '0', // 1 = احتساب الطلبات الموصلة ضمن المبيعات النهائية مع المكتملة
    TELEGRAM_BOT_TOKEN: '', // اختياري: إشعار تلقائي للشركة عند كل طلب جديد
    TELEGRAM_CHAT_ID: '',
  },

  // حالات الطلب النهائية المطلوبة
  ORDER_STATUSES: [
    'NEW',
    'PENDING_CONFIRMATION',
    'CONFIRMED',
    'PROCESSING',
    'READY',
    'DELIVERED',
    'COMPLETED',
    'CANCELLED',
  ],
  DEFAULT_ORDER_STATUS: 'NEW',

  STATUS_AR: {
    NEW: 'طلب جديد',
    PENDING_CONFIRMATION: 'بانتظار التأكيد',
    CONFIRMED: 'تم التأكيد',
    PROCESSING: 'قيد التنفيذ',
    READY: 'جاهز',
    DELIVERED: 'تم التوصيل',
    COMPLETED: 'مكتمل',
    CANCELLED: 'ملغي',
  },

  // صلاحية موحدة: الحسابات الثلاثة كلها ADMIN بنفس الصلاحيات الكاملة
  ROLES: { ADMIN: 'ADMIN' },
  ROLE_AR: { ADMIN: 'مدير — صلاحيات كاملة' },

  GOVERNORATES: [
    'النجف', 'كربلاء', 'بغداد', 'البصرة', 'بابل', 'ذي قار', 'ميسان',
    'المثنى', 'الديوانية', 'واسط', 'ديالى', 'الأنبار', 'صلاح الدين',
    'كركوك', 'نينوى', 'دهوك', 'أربيل', 'السليمانية', 'حلبجة',
  ],
};

module.exports = config;
