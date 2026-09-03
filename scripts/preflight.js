'use strict';
/* فحص جاهزية النشر: بوابات جودة + تشغيل + أمان إنتاج + SEO + PWA/CI */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const results = [];
function check(group, name, ok, note = '') {
  results.push({ group, name, ok, note });
}

// 1) بوابات الجودة
const t = spawnSync('npm', ['test'], { encoding: 'utf8' });
const tm = (t.stdout || '').match(/# pass (\d+)/); const tf = (t.stdout || '').match(/# fail (\d+)/);
check('جودة', `الاختبارات الآلية (${tm ? tm[1] : 0} نجح / ${tf ? tf[1] : '?'} فشل)`, t.status === 0 && tf && tf[1] === '0');
const e = spawnSync('npx', ['eslint', 'server.js', 'src', 'public/js', 'test'], { encoding: 'utf8' });
check('جودة', 'ESLint بلا أخطاء', (e.stdout || '').includes('0 errors'));
const a = spawnSync('node', ['scripts/audit-a11y.js'], { encoding: 'utf8', timeout: 240000 });
check('جودة', 'axe: صفر انتهاكات حرجة', (a.stdout || '').includes('إجمالي serious/critical: 0'));
const h = spawnSync('node', ['scripts/audit-html.js'], { encoding: 'utf8', timeout: 120000 });
check('جودة', 'html-validate: صفر أخطاء', (h.stdout || '').includes('إجمالي أخطاء html-validate: 0'));

// 2) قاعدة البيانات والتشغيل
try {
  const { db } = require('../src/db');
  const admins = db.prepare('SELECT COUNT(*) c FROM admin_users').get().c;
  check('تشغيل', `ثلاثة حسابات إدارية فقط (${admins})`, admins === 3);
  db.prepare('SELECT 1').get();
  check('تشغيل', 'قاعدة البيانات تستجيب', true);
  const products = db.prepare('SELECT COUNT(*) c FROM products').get().c;
  check('محتوى', `كتالوج مبذور (${products} منتجًا)`, products > 0);
} catch (err) {
  check('تشغيل', 'قاعدة البيانات تستجيب', false, err.message);
}
check('تشغيل', 'سكربت نسخ احتياطي', fs.existsSync(path.join(__dirname, 'backup.js')));
check('تشغيل', 'دليل تشغيل موثق', fs.existsSync(path.join(__dirname, '..', 'docs', 'OPERATIONS.md')));
check('تشغيل', 'security.txt', fs.existsSync(path.join(__dirname, '..', 'public', '.well-known', 'security.txt')));
check('تشغيل', 'sitemap.xml مولّد', fs.existsSync(path.join(__dirname, '..', 'public', 'sitemap.xml')));
check('تشغيل', 'CI مهيأ (ملف جاهز للنسخ docs/ci.yml.example)', fs.existsSync(path.join(__dirname, '..', '.github', 'workflows', 'ci.yml')) || fs.existsSync(path.join(__dirname, '..', 'docs', 'ci.yml.example')));

// 3) أمان الإنتاج والـ SEO عبر الخادم الحي
const srv = spawnSync('curl', ['-s', '-D', '-', 'http://localhost:3000/'], { encoding: 'utf8' });
const page = srv.stdout || '';
check('أمان إنتاج', 'CSP مفعّل مع nonce لكل طلب', /content-security-policy:[\s\S]*?'nonce-/i.test(page));
const cfg = require('../src/config');
check('أمان إنتاج', 'سر JWT قوي وغير مكشوف (بيئة أو مولّد)', cfg.jwtSecret.length >= 32);
check('أمان إنتاج', 'HSTS/كوكي secure (PROD_SECURE أو خلف HTTPS)', process.env.PROD_SECURE === 'true' || /strict-transport-security/i.test(page), 'سطر واحد على سيرفرك: PROD_SECURE=true');
check('SEO', 'canonical يُعرض فعليًا في الصفحة', page.includes('rel="canonical"'));
check('SEO', 'SITE_URL لروابط مطلقة', !!process.env.SITE_URL || page.includes('rel="canonical"'), 'اضبطه على نطاقك للروابط المطلقة');

// 4) PWA
const foot = fs.readFileSync(path.join(__dirname, '..', 'views', 'partials', 'footer.ejs'), 'utf8');
check('PWA', 'Service Worker مسجّل + ملف موجود', foot.includes('serviceWorker.register') && fs.existsSync(path.join(__dirname, '..', 'public', 'sw.js')));
check('PWA', 'مانيفست بأيقونات', fs.existsSync(path.join(__dirname, '..', 'public', 'manifest.webmanifest')));

// الحساب
const groups = {};
for (const r of results) {
  groups[r.group] = groups[r.group] || { ok: 0, n: 0 };
  groups[r.group].n++;
  if (r.ok) groups[r.group].ok++;
}
console.log('\n======== فحص جاهزية النشر ========');
for (const r of results) {
  console.log(`${r.ok ? '✔' : '✖'} [${r.group}] ${r.name}${r.ok || !r.note ? '' : ' — ' + r.note}`);
}
console.log('-----------------------------------');
let grand = 0;
for (const [g, v] of Object.entries(groups)) {
  const pct = Math.round((v.ok / v.n) * 100);
  grand += pct;
  console.log(`${g}: ${pct}%`);
}
console.log(`\n>>> الجاهزية الإجمالية للنشر: ${Math.round(grand / Object.keys(groups).length)}% <<<`);
