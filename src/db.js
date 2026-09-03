'use strict';
const fs = require('fs');
const path = require('path');
const config = require('./config');

fs.mkdirSync(path.dirname(config.dbFile), { recursive: true });

/**
 * طبقة توافق لقاعدة البيانات:
 * - تُفضّل better-sqlite3 (أداء وإمكانات كاملة) عند توفر البناء الأصلي.
 * - ترجع تلقائيًا إلى node:sqlite المدمجة في Node (22+) إذا تعذر بناء التعزيز الأصلي،
 *   بنفس واجهة الاستخدام (prepare/get/all/run/exec/transaction).
 */
function createNodeSqliteAdapter(file) {
  const { DatabaseSync } = require('node:sqlite');
  const raw = new DatabaseSync(file);
  raw.exec('PRAGMA journal_mode = WAL;');
  raw.exec('PRAGMA foreign_keys = ON;');
  raw.exec('PRAGMA busy_timeout = 5000;');
  const wrap = (st) => ({
    get: (...a) => st.get(...a),
    all: (...a) => st.all(...a),
    run: (...a) => st.run(...a),
  });
  return {
    engine: 'node:sqlite',
    prepare: (sql) => wrap(raw.prepare(sql)),
    exec: (sql) => raw.exec(sql),
    pragma: (p) => raw.exec('PRAGMA ' + p + ';'),
    transaction: (fn) => (...args) => {
      raw.exec('BEGIN');
      try {
        const r = fn(...args);
        raw.exec('COMMIT');
        return r;
      } catch (e) {
        raw.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

let db;
try {
  const Better = require('better-sqlite3');
  db = new Better(config.dbFile);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  db.engine = 'better-sqlite3';
} catch (err) {
  console.warn('[db] better-sqlite3 غير متاح (' + err.message.split('\n')[0] + ') — يتم استخدام node:sqlite المدمجة.');
  db = createNodeSqliteAdapter(config.dbFile);
}

db.exec(`
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS admin_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'ADMIN',
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- فرض الحد الأقصى 3 حسابات إدارية على مستوى قاعدة البيانات
CREATE TRIGGER IF NOT EXISTS enforce_max_admin_users
BEFORE INSERT ON admin_users
WHEN (SELECT COUNT(*) FROM admin_users) >= 3
BEGIN
  SELECT RAISE(ABORT, 'MAX_ADMIN_USERS_LIMIT');
END;

CREATE TABLE IF NOT EXISTS categories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  description TEXT DEFAULT '',
  image TEXT DEFAULT '',
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  short_description TEXT DEFAULT '',
  description TEXT DEFAULT '',
  specs TEXT DEFAULT '',
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  cash_price INTEGER NOT NULL CHECK (cash_price >= 0),
  discount_amount INTEGER NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  fees_amount INTEGER NOT NULL DEFAULT 0 CHECK (fees_amount >= 0),
  fees_label TEXT DEFAULT '',
  installment_enabled INTEGER NOT NULL DEFAULT 0,
  installment_price INTEGER NOT NULL DEFAULT 0 CHECK (installment_price >= 0),
  down_payment INTEGER NOT NULL DEFAULT 0 CHECK (down_payment >= 0),
  installment_months INTEGER NOT NULL DEFAULT 0 CHECK (installment_months >= 0),
  monthly_payment INTEGER NOT NULL DEFAULT 0 CHECK (monthly_payment >= 0),
  stock_status TEXT NOT NULL DEFAULT 'IN_STOCK' CHECK (stock_status IN ('IN_STOCK','LOW_STOCK','OUT_OF_STOCK')),
  is_active INTEGER NOT NULL DEFAULT 1,
  is_featured INTEGER NOT NULL DEFAULT 0,
  on_offer INTEGER NOT NULL DEFAULT 0,
  views INTEGER NOT NULL DEFAULT 0,
  orders_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS product_images (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  path TEXT NOT NULL,
  is_primary INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_options (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  input_type TEXT NOT NULL DEFAULT 'select' CHECK (input_type IN ('select','color','text')),
  required INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS product_option_values (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  option_id INTEGER NOT NULL REFERENCES product_options(id) ON DELETE CASCADE,
  label TEXT NOT NULL,
  price_delta INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS customers (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  phone TEXT NOT NULL,
  governorate TEXT DEFAULT '',
  area TEXT DEFAULT '',
  landmark TEXT DEFAULT '',
  address TEXT DEFAULT '',
  location_link TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);

CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_number TEXT NOT NULL UNIQUE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  customer_phone TEXT NOT NULL,
  governorate TEXT DEFAULT '',
  area TEXT DEFAULT '',
  landmark TEXT DEFAULT '',
  address TEXT DEFAULT '',
  location_link TEXT DEFAULT '',
  notes TEXT DEFAULT '',
  payment_summary TEXT NOT NULL DEFAULT '',
  items_count INTEGER NOT NULL DEFAULT 0,
  grand_total INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'PENDING_CONFIRMATION',
  whatsapp_sent_at TEXT,
  internal_notes TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_created ON orders(created_at);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON orders(customer_phone);

CREATE TABLE IF NOT EXISTS order_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  product_image TEXT DEFAULT '',
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  payment_method TEXT NOT NULL CHECK (payment_method IN ('CASH','INSTALLMENT')),
  unit_base_price INTEGER NOT NULL,
  options_total INTEGER NOT NULL DEFAULT 0,
  discount_total INTEGER NOT NULL DEFAULT 0,
  fees_total INTEGER NOT NULL DEFAULT 0,
  line_total INTEGER NOT NULL,
  cash_total INTEGER NOT NULL DEFAULT 0,
  installment_total INTEGER NOT NULL DEFAULT 0,
  down_payment_total INTEGER NOT NULL DEFAULT 0,
  months INTEGER NOT NULL DEFAULT 0,
  monthly_total INTEGER NOT NULL DEFAULT 0,
  options_snapshot TEXT NOT NULL DEFAULT '[]',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

/* دفتر التقسيط الرقمي: يطابق دفتر الشركة الورقي بنفس الشروط
   (موظف أو كفيل موظف من مصارف: الرافدين / الأهلي العراقي / TPI + كتاب استمرارية) */
CREATE TABLE IF NOT EXISTS installment_files (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
  customer_id INTEGER REFERENCES customers(id) ON DELETE SET NULL,
  file_no TEXT,                       -- رقم الدفتر عند التفعيل
  employment_type TEXT NOT NULL DEFAULT 'EMPLOYEE' CHECK (employment_type IN ('EMPLOYEE','GUARANTOR')),
  employee_name TEXT DEFAULT '',      -- اسم الموظف (الزبون أو الكفيل)
  employer TEXT DEFAULT '',           -- الدائرة / جهة العمل
  bank TEXT DEFAULT '' CHECK (bank IN ('','RAFIDAIN','AHLI','TPI')),
  guarantor_name TEXT DEFAULT '',
  letter_ref TEXT DEFAULT '',         -- رقم/تاريخ كتاب الاستمرارية
  letter_status TEXT NOT NULL DEFAULT 'PENDING' CHECK (letter_status IN ('PENDING','RECEIVED')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING','ACTIVE','CLOSED')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS installment_payments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  file_id INTEGER NOT NULL REFERENCES installment_files(id) ON DELETE CASCADE,
  installment_no INTEGER NOT NULL,
  due_date TEXT NOT NULL,
  amount INTEGER NOT NULL,
  paid_at TEXT,
  paid_amount INTEGER NOT NULL DEFAULT 0,
  recorded_by TEXT DEFAULT '',
  note TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_files_order ON installment_files(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_file ON installment_payments(file_id);

CREATE TABLE IF NOT EXISTS order_status_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  admin_id INTEGER,
  username TEXT NOT NULL,
  old_status TEXT NOT NULL,
  new_status TEXT NOT NULL,
  note TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id INTEGER,
  username TEXT NOT NULL,
  action TEXT NOT NULL,
  entity_type TEXT DEFAULT '',
  entity_id TEXT DEFAULT '',
  old_value TEXT DEFAULT '',
  new_value TEXT DEFAULT '',
  ip TEXT DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category_id);
CREATE INDEX IF NOT EXISTS idx_product_images_product ON product_images(product_id);
CREATE INDEX IF NOT EXISTS idx_product_options_product ON product_options(product_id);
CREATE INDEX IF NOT EXISTS idx_status_history_order ON order_status_history(order_id);
`);

/* ---------- ترحيل من النظام القديم (ثلاثة أدوار وحالات قديمة) إلى النظام الموحّد ---------- */
(function migrate() {
  const tbl = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='admin_users'").get();
  if (tbl && tbl.sql.includes('SUPER_ADMIN')) {
    db.exec(`
      CREATE TABLE admin_users_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT NOT NULL UNIQUE COLLATE NOCASE,
        email TEXT NOT NULL UNIQUE COLLATE NOCASE,
        password_hash TEXT NOT NULL,
        full_name TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'ADMIN',
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_login_at TEXT
      );
      INSERT INTO admin_users_new (id, username, email, password_hash, full_name, role, is_active, created_at, last_login_at)
        SELECT id, username, email, password_hash, full_name, 'ADMIN', is_active, created_at, last_login_at FROM admin_users;
      DROP TABLE admin_users;
      ALTER TABLE admin_users_new RENAME TO admin_users;
      CREATE TRIGGER IF NOT EXISTS enforce_max_admin_users
      BEFORE INSERT ON admin_users
      WHEN (SELECT COUNT(*) FROM admin_users) >= 3
      BEGIN SELECT RAISE(ABORT, 'MAX_ADMIN_USERS_LIMIT'); END;
    `);
    console.log('[db] تم ترحيل الحسابات الإدارية إلى الدور الموحّد ADMIN.');
  }
  // ترحيل حالات الطلبات القديمة إلى القائمة الجديدة
  db.prepare("UPDATE orders SET status = 'PROCESSING' WHERE status IN ('IN_PROGRESS','UNDER_REVIEW')").run();
  db.prepare("UPDATE orders SET status = 'NEW' WHERE status = 'SENT_TO_WHATSAPP'").run();

  // ترحيلات هيكلية: مفتاح منع التكرار + إبطال الجلسات
  const cols = db.prepare('PRAGMA table_info(orders)').all().map((c) => c.name);
  if (!cols.includes('idem_key')) db.exec('ALTER TABLE orders ADD COLUMN idem_key TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS idx_orders_idem ON orders(idem_key) WHERE idem_key IS NOT NULL');
  const acols = db.prepare('PRAGMA table_info(admin_users)').all().map((c) => c.name);
  if (!acols.includes('revoked_at')) db.exec('ALTER TABLE admin_users ADD COLUMN revoked_at TEXT');
})();

// ---------- helpers ----------
const stmts = {
  getSetting: db.prepare('SELECT value FROM settings WHERE key = ?'),
  upsertSetting: db.prepare(`
    INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
    ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
  `),
};

function getSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const out = { ...config.defaultSettings };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

function getSetting(key) {
  const row = stmts.getSetting.get(key);
  return row ? row.value : (config.defaultSettings[key] || '');
}

function setSetting(key, value) {
  stmts.upsertSetting.run(key, String(value));
}

function audit({ admin = null, action, entityType = '', entityId = '', oldValue = '', newValue = '', ip = '' }) {
  db.prepare(`INSERT INTO audit_logs (admin_id, username, action, entity_type, entity_id, old_value, new_value, ip)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(
      admin ? admin.id : null,
      admin ? admin.username : 'system',
      action,
      entityType,
      String(entityId),
      typeof oldValue === 'string' ? oldValue : JSON.stringify(oldValue),
      typeof newValue === 'string' ? newValue : JSON.stringify(newValue),
      ip
    );
}

module.exports = { db, getSettings, getSetting, setSetting, audit };
