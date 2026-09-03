'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const config = require('./config');
const { db, setSetting, audit } = require('./db');
const auth = require('./auth');

function generatePassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789#@$%';
  let out = '';
  for (let i = 0; i < 12; i++) out += chars[crypto.randomInt(chars.length)];
  return 'Alm@' + out;
}

/**
 * عند أول تشغيل:
 * - تهيئة إعدادات الشركة الافتراضية.
 * - إنشاء الحسابات الإدارية الثلاثة (وليس أكثر — يفرضها Trigger في قاعدة البيانات).
 * - كلمات المرور من متغيرات البيئة SEED_ADMIN*_PASSWORD أو مولّدة عشوائيًا،
 *   وتُكتب في data/first-run-credentials.txt خارج Git (في بيئات الاختبار تُطبع فقط).
 */
module.exports = function bootstrap() {
  for (const [key, value] of Object.entries(config.defaultSettings)) {
    if (!db.prepare('SELECT 1 FROM settings WHERE key = ?').get(key)) {
      setSetting(key, value);
    }
  }

  const count = db.prepare('SELECT COUNT(*) AS c FROM admin_users').get().c;
  if (count === 0) {
    const defs = [
      { username: 'admin1', full_name: 'حساب الإدارة الأول', env: 'SEED_ADMIN1_PASSWORD' },
      { username: 'admin2', full_name: 'حساب الإدارة الثاني', env: 'SEED_ADMIN2_PASSWORD' },
      { username: 'admin3', full_name: 'حساب الإدارة الثالث', env: 'SEED_ADMIN3_PASSWORD' },
    ];
    const credentials = [];
    for (const d of defs) {
      const password = process.env[d.env] || generatePassword();
      db.prepare('INSERT INTO admin_users (username, email, password_hash, full_name, role) VALUES (?,?,?,?,?)')
        .run(d.username, d.username + '@almuammal.iq', auth.hashPassword(password), d.full_name, 'ADMIN');
      credentials.push({ username: d.username, password });
    }

    const isTestDb = config.dbFile.includes(os.tmpdir()) || process.env.NODE_ENV === 'test';
    if (isTestDb) {
      console.log('[bootstrap] بيئة اختبار — كلمات المرور من البيئة أو مولّدة، لن يُكتب ملف.');
    } else {
      try {
        const file = path.join(config.root, 'data', 'first-run-credentials.txt');
        const lines = [
          'كلمات مرور أول تشغيل — متجر شركة المؤمل',
          'غيّرها فورًا من: لوحة الإدارة ← الحسابات الإدارية.',
          '=============================================',
          ...credentials.map((c) => `${c.username}  ←  ${c.password}`),
        ];
        fs.writeFileSync(file, lines.join('\n'), { mode: 0o600 });
      } catch { /* غير حرج */ }
    }

    console.log('[bootstrap] أُنشئت الحسابات الإدارية الثلاثة (ADMIN موحّدة).');
    audit({ admin: null, action: 'ADMIN_ACCOUNTS_SEEDED', entityType: 'admin_user', entityId: '', newValue: { count: 3, note: '3 حسابات إدارية فقط بدور ADMIN موحّد' } });

    // إن كان Supabase مفعّلًا ومفتاح الخدمة متوفرًا: أنشئ الحسابات الثلاثة في Supabase Auth أيضًا
    const supabase = require('./supabase');
    if (supabase.isConfigured() && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      supabase.ensureAdminUsers(credentials.map((c, i) => ({
        email: ['admin1', 'admin2', 'admin3'][i] + '@almuammal.iq',
        password: c.password,
        full_name: 'حساب الإدارة ' + (i + 1),
      }))).catch(() => { /* غير حرج */ });
    }
  }

  // د5: تقليم سجل العمليات الأقدم من مدة الاحتفاظ
  const retentionDays = parseInt(process.env.AUDIT_RETENTION_DAYS || '90', 10);
  db.prepare("DELETE FROM audit_logs WHERE datetime(created_at) < datetime('now', ?)").run(`-${retentionDays} days`);

  const productsCount = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  if (productsCount === 0) {
    require('./seed')();
  }
};
