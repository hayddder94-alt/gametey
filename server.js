'use strict';
const path = require('path');
const express = require('express');
const cookieParser = require('cookie-parser');
const helmet = require('helmet');          // helmetjs/helmet — ترويسات أمان قياسية
const compression = require('compression'); // expressjs/compression — ضغط gzip
const config = require('./src/config');
const { formatIQD, fmtDate } = require('./src/utils');

const app = express();
const http = require('http');
const server = http.createServer(app);
require('./src/realtime').attach(server); // قناة لحظية للإدارة
app.disable('x-powered-by');
app.set('trust proxy', true);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ضغط الاستجابات (أداء) ثم nonce لكل طلب + ترويسات الأمان القياسية من helmet
app.use(compression());
app.use((req, res, next) => {
  res.locals.cspNonce = require('crypto').randomBytes(16).toString('base64');
  next();
});
app.use(require('./src/logger').httpLogger); // سجلات منظمة pino → data/logs/app.log
app.use(helmet({
  // CSP كامل: سكربتات inline تعمل عبر nonce المولّد لكل طلب
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", (req, res) => `'nonce-${res.locals.cspNonce}'`],
      styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
      fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'https://tile.openstreetmap.org'],
      connectSrc: ["'self'", 'wss:'],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'same-origin' },
  hsts: process.env.PROD_SECURE === 'true' ? { maxAge: 31536000, includeSubDomains: true } : false, // د1
}));
app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'geolocation=self, camera=(), microphone=(), payment=()');
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// ملفات ثابتة مع تخزين مؤقت طويل للصور (أداء)
app.use('/uploads', express.static(config.uploadsDir, { maxAge: '30d', immutable: true, fallthrough: false }));
app.use('/img', express.static(path.join(__dirname, 'public', 'img'), { maxAge: '30d', immutable: false, fallthrough: false }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '1d' }));

// دوال مساعدة داخل القوالب
app.locals.formatIQD = formatIQD;
app.locals.fmtDate = fmtDate;
app.locals.year = new Date().getFullYear();
app.locals.safeJson = require('./src/whatsapp').safeJson;
app.locals.canonicalBase = process.env.SITE_URL || ''; // د15
app.locals.appVersion = require('./package.json').version; // د32
/** أيقونة SVG من المكتبة الموحّدة (بلا إيموجي في واجهات النظام) */
app.locals.icon = (name, cls) =>
  `<svg class="ic${cls ? ' ' + cls : ''}" aria-hidden="true" focusable="false"><use href="/img/icons.svg#i-${name}"></use></svg>`;
/** تضمين JSON داخل <script> بأمان (يمنع كسر الوسم بحقن </script>) */
app.locals.jsonSafe = (v) => JSON.stringify(v).replace(/</g, '\\u003C').replace(/>/g, '\\u003E');
/** القسط الشهري المعروض — محمي من القسمة على صفر */
app.locals.monthlyOf = (p) => {
  if (!p || !p.installment_enabled || !(p.installment_months > 0)) return 0;
  return p.monthly_payment || Math.ceil(Math.max(0, p.installment_price - p.down_payment) / p.installment_months);
};

// نقطة فحص صحة للمراقبة والتوزيع
app.get('/healthz', (req, res) => {
  let dbOk = false;
  let dbMs = null;
  const t0 = process.hrtime.bigint();
  try {
    require('./src/db').db.prepare('SELECT 1').get();
    dbOk = true;
    dbMs = Number(process.hrtime.bigint() - t0) / 1e6;
  } catch { /* تبقى false */ }
  res.status(dbOk ? 200 : 503).json({ ok: dbOk, dbMs, uptime: process.uptime(), ts: Date.now() });
});

// المسارات
app.use('/api/admin', require('./src/routes/apiAdmin'));
app.use('/api', require('./src/routes/apiPublic'));
app.use('/admin', require('./src/routes/admin'));
app.use('/', require('./src/routes/storefront'));

app.use((req, res) => {
  res.status(404).render('404', {
    title: 'الصفحة غير موجودة',
    settings: require('./src/db').getSettings(),
    navCategories: [],
    currentPath: req.path,
    currentQuery: req.query || {},
  });
});

// معالجة مركزية للأخطاء
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'بيانات الطلب غير صالحة.' });
  }
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(400).json({ error: 'حجم الملف كبير جدًا (الحد الأقصى 6 ميغابايت).' });
  }
  console.error('[error]', err);
  if (req.path.startsWith('/api/')) {
    return res.status(500).json({ error: 'حدث خطأ غير متوقع. حاول مرة أخرى.' });
  }
  try {
    return res.status(500).render('500', { title: 'خطأ بالخادم', settings: require('./src/db').getSettings(), navCategories: [], currentPath: req.path, currentQuery: {} });
  } catch {
    return res.status(500).send('حدث خطأ غير متوقع.');
  }
});

// ضمان وجود البيانات الأولية عند أول تشغيل
require('./src/bootstrap')();

if (require.main === module) {
  server.listen(config.port, config.host, () => {
    console.log('==============================================');
    console.log(`  متجر ${config.defaultSettings.COMPANY_NAME} يعمل الآن`);
    console.log(`  المتجر:      http://localhost:${config.port}/`);
    console.log(`  لوحة الإدارة: http://localhost:${config.port}/admin/login`);
    console.log('==============================================');
  });
}

module.exports = app;
module.exports.server = server;
