'use strict';
/* نسخة احتياطية ساخنة لقاعدة البيانات عبر API النسخ في SQLite (أفضل من نسخ الملفات)
   الاستخدام: node scripts/backup.js  →  data/backups/almuammal-YYYYMMDD-HHMM.db */
const fs = require('fs');
const path = require('path');
const config = require('../src/config');
const { db } = require('../src/db');

const dir = path.join(config.root, 'data', 'backups');
fs.mkdirSync(dir, { recursive: true });
const d = new Date();
const name = 'almuammal-' + d.toISOString().slice(0, 16).replace(/[-:T]/g, '') + '.db';
const dest = path.join(dir, name);

(async () => {
  if (typeof db.backup === 'function') {
    await db.backup(dest);
  } else {
    // مسار بديل لمحرك node:sqlite: تفريغ WAL ثم نسخ
    try { db.exec('PRAGMA wal_checkpoint(TRUNCATE);'); } catch { /* تجاهل */ }
    fs.copyFileSync(config.dbFile, dest);
  }
  // احتفظ بآخر 7 نسخ فقط
  const files = fs.readdirSync(dir).filter((f) => f.startsWith('almuammal-')).sort();
  while (files.length > 7) fs.unlinkSync(path.join(dir, files.shift()));
  console.log('✔ نسخة احتياطية:', path.relative(config.root, dest));
})().catch((e) => { console.error('فشل النسخ:', e.message); process.exit(1); });
