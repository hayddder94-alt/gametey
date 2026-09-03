'use strict';
const express = require('express');
const config = require('../config');
const { db, getSettings } = require('../db');
const auth = require('../auth');
const { toInt, fmtDate } = require('../utils');
const { getOrderWithItems } = require('../orders');
const store = require('../store');

const router = express.Router();

router.use((req, res, next) => {
  res.locals.settings = getSettings();
  res.locals.STATUS_AR = config.STATUS_AR;
  res.locals.ROLE_AR = config.ROLE_AR;
  res.locals.ORDER_STATUSES = config.ORDER_STATUSES;
  res.locals.fmtDate = fmtDate;
  res.locals.admin = null;
  res.locals.currentAdminNav = '';
  next();
});

/** إحصائيات مبيعات حقيقية من قاعدة البيانات (حسب حالات الطلب فقط) */
function computeSalesStats() {
  const { getSetting } = require('../db');
  const includeDelivered = String(getSetting('SALES_INCLUDE_DELIVERED')) === '1';
  const salesStatuses = includeDelivered ? ['COMPLETED', 'DELIVERED'] : ['COMPLETED'];
  const inList = salesStatuses.map((s) => `'${s}'`).join(',');

  const sum = (extra) => db.prepare(
    `SELECT COALESCE(SUM(grand_total),0) AS s FROM orders WHERE status IN (${inList}) ${extra}`
  ).get().s;

  const totalSales = sum('');
  const todaySales = sum("AND date(created_at) = date('now')");
  const weekSales = sum("AND datetime(created_at) >= datetime('now', '-7 days')");
  const monthSales = sum("AND date(created_at) >= date('now', 'start of month')");

  // نمو المبيعات: آخر 30 يومًا مقابل الـ30 التي قبلها
  const cur = sum("AND datetime(created_at) >= datetime('now', '-30 days')");
  const prev = sum("AND datetime(created_at) >= datetime('now', '-60 days') AND datetime(created_at) < datetime('now', '-30 days')");
  const growth = prev > 0 ? Math.round(((cur - prev) / prev) * 10000) / 100 : null;

  // المبيعات اليومية (آخر 14 يومًا) مع تصفير الأيام الفارغة
  const dailyRows = db.prepare(
    `SELECT date(created_at) AS d, COALESCE(SUM(grand_total),0) AS t, COUNT(*) AS c
     FROM orders WHERE status IN (${inList}) AND date(created_at) >= date('now', '-13 days')
     GROUP BY d`
  ).all();
  const dailyMap = Object.fromEntries(dailyRows.map((r) => [r.d, r]));
  const daily = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000).toISOString().slice(0, 10);
    daily.push({ label: d.slice(8, 10) + '/' + d.slice(5, 7), value: dailyMap[d] ? dailyMap[d].t : 0, count: dailyMap[d] ? dailyMap[d].c : 0 });
  }

  // المبيعات الشهرية (آخر 6 أشهر)
  const monthlyRows = db.prepare(
    `SELECT strftime('%Y-%m', created_at) AS m, COALESCE(SUM(grand_total),0) AS t
     FROM orders WHERE status IN (${inList}) AND strftime('%Y-%m', created_at) >= strftime('%Y-%m', 'now', '-5 months')
     GROUP BY m ORDER BY m`
  ).all();
  const monthly = monthlyRows.map((r) => ({ label: r.m.slice(5) + '/' + r.m.slice(2, 4), value: r.t }));

  // أكثر المنتجات مبيعًا (من بنود الطلبات المكتملة/الموصلة)
  const topProducts = db.prepare(
    `SELECT oi.product_name AS name, SUM(oi.quantity) AS qty
     FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.status IN (${inList})
     GROUP BY oi.product_id ORDER BY qty DESC LIMIT 5`
  ).all();

  // توزيع حالات الطلبات (مكتمل/ملغي/نشط)
  const split = { completed: 0, cancelled: 0, active: 0 };
  for (const r of db.prepare('SELECT status, COUNT(*) AS c FROM orders GROUP BY status').all()) {
    if (r.status === 'COMPLETED') split.completed = r.c;
    else if (r.status === 'CANCELLED') split.cancelled = r.c;
    else split.active += r.c;
  }

  const orderCounts = {};
  for (const s of config.ORDER_STATUSES) orderCounts[s] = 0;
  for (const r of db.prepare('SELECT status, COUNT(*) AS c FROM orders GROUP BY status').all()) {
    if (orderCounts[r.status] !== undefined) orderCounts[r.status] = r.c;
  }

  return {
    salesStatuses, includeDelivered, totalSales, todaySales, weekSales, monthSales,
    growth, daily, monthly, topProducts, split, orderCounts,
    totalOrders: db.prepare('SELECT COUNT(*) AS c FROM orders').get().c,
  };
}

/* ---------------- صفحة الدخول ---------------- */

router.get('/login', (req, res) => {
  if (auth.loadAdminFromRequest(req)) return res.redirect('/admin');
  // وجهة آمنة: داخل /admin فقط وبلا محارف تكسر الوسوم
  // eslint-disable-next-line no-control-regex -- تنظيف مقصود لرموز التحكم من وجهة التحويل
  let next = String(req.query.next || '/admin').replace(/[<>"'\u0000-\u001f]/g, '');
  if (!next.startsWith('/admin')) next = '/admin';
  res.render('admin/login', { title: 'دخول الإدارة', error: null, next });
});

/* ---------------- كل ما يلي محمي ---------------- */

router.use(auth.requireAuth);
router.use((req, res, next) => {
  res.locals.admin = req.admin;
  next();
});

router.get('/', (req, res) => {
  res.locals.currentAdminNav = 'dashboard';
  const stats = computeSalesStats();

  stats.productsCount = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  stats.outOfStock = db.prepare("SELECT COUNT(*) AS c FROM products WHERE stock_status = 'OUT_OF_STOCK'").get().c;
  stats.lowStock = db.prepare("SELECT COUNT(*) AS c FROM products WHERE stock_status = 'LOW_STOCK'").get().c;

  stats.latestOrders = db.prepare('SELECT * FROM orders ORDER BY id DESC LIMIT 6').all();
  const overdue = db.prepare(`
    SELECT COUNT(*) c, COALESCE(SUM(p.amount),0) s
    FROM installment_payments p JOIN installment_files f ON f.id = p.file_id
    WHERE p.paid_at IS NULL AND date(p.due_date) < date('now') AND f.status = 'ACTIVE'
  `).get();
  stats.overdueCount = overdue.c;
  stats.overdueSum = overdue.s;
  stats.recentlyUpdated = db.prepare('SELECT id, name, cash_price, updated_at FROM products ORDER BY updated_at DESC, id DESC LIMIT 6').all();
  stats.priceAudits = db.prepare("SELECT * FROM audit_logs WHERE action LIKE 'تعديل%' ORDER BY id DESC LIMIT 6").all();
  const recentAudits = db.prepare('SELECT * FROM audit_logs ORDER BY id DESC LIMIT 8').all();

  res.render('admin/dashboard', {
    title: 'لوحة التحكم',
    stats,
    recentAudits,
    dashJson: { daily: stats.daily, monthly: stats.monthly, topProducts: stats.topProducts, split: stats.split },
  });
});

/* ---------------- المنتجات ---------------- */

router.get('/products', auth.requirePermission('products.view'), (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const rows = db.prepare(`
    SELECT p.*, c.name AS category_name FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    ${q ? "WHERE p.name LIKE @q OR p.short_description LIKE @q" : ''}
    ORDER BY p.updated_at DESC, p.id DESC LIMIT 200
  `).all(q ? { q: `%${q}%` } : {});
  for (const r of rows) r.image = store.primaryImage(r.id);
  const categories = store.listCategories({ activeOnly: false });
  res.locals.currentAdminNav = 'products';
  res.render('admin/products', { title: 'إدارة المنتجات', products: rows, categories, q });
});

router.get('/products/new', auth.requirePermission('products.create'), (req, res) => {
  const categories = store.listCategories({ activeOnly: false });
  res.locals.currentAdminNav = 'products';
  res.render('admin/product-form', { title: 'إضافة منتج', product: null, images: [], options: [], categories });
});

router.get('/products/:id/edit', auth.requirePermission('products.update'), (req, res) => {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(toInt(req.params.id, -1));
  if (!product) return res.status(404).render('admin/error', { title: 'غير موجود', message: 'المنتج غير موجود.', admin: req.admin });
  const images = db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order, id').all(product.id);
  const options = db.prepare('SELECT * FROM product_options WHERE product_id = ? ORDER BY sort_order, id').all(product.id);
  const vStmt = db.prepare('SELECT * FROM product_option_values WHERE option_id = ? ORDER BY sort_order, id');
  for (const o of options) o.values = vStmt.all(o.id);
  const categories = store.listCategories({ activeOnly: false });
  res.locals.currentAdminNav = 'products';
  res.render('admin/product-form', { title: 'تعديل منتج', product, images, options, categories });
});

router.get('/categories', auth.requirePermission('categories.manage'), (req, res) => {
  const categories = db.prepare('SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id) AS products_count FROM categories c ORDER BY c.sort_order, c.id').all();
  res.locals.currentAdminNav = 'categories';
  res.render('admin/categories', { title: 'إدارة التصنيفات', categories });
});

/* ---------------- الطلبات ---------------- */

router.get('/orders', auth.requirePermission('orders.view'), (req, res) => {
  const q = String(req.query.q || '').trim().slice(0, 100);
  const status = String(req.query.status || '').trim();
  const where = [];
  const params = {};
  if (q) {
    where.push('(o.order_number LIKE @q OR o.customer_name LIKE @q OR o.customer_phone LIKE @q)');
    params.q = `%${q}%`;
  }
  if (status && config.ORDER_STATUSES.includes(status)) {
    where.push('o.status = @status');
    params.status = status;
  }
  const page = Math.max(1, toInt(req.query.page, 1));
  const perPage = 20;
  const total = db.prepare(`SELECT COUNT(*) AS c FROM orders o ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`).get(params).c;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const orders = db.prepare(`
    SELECT o.* FROM orders o ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY o.id DESC LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: perPage, offset: (Math.min(page, pages) - 1) * perPage });
  res.locals.currentAdminNav = 'orders';
  res.render('admin/orders', { title: 'إدارة الطلبات', orders, q, status, page: Math.min(page, pages), pages, total });
});

/** تصدير الطلبات CSV (بترميز يدعم العربية في Excel) */
router.get('/orders/export', auth.requirePermission('orders.view'), (req, res) => {
  const status = String(req.query.status || '').trim();
  const where = status && config.ORDER_STATUSES.includes(status) ? 'WHERE status = @status' : '';
  const params = status ? { status } : {};
  const rows = db.prepare(`SELECT * FROM orders ${where} ORDER BY id DESC LIMIT 2000`).all(params);
  const esc = (v) => '"' + String(v == null ? '' : v).replace(/"/g, '""') + '"';
  const header = ['رقم الطلب', 'التاريخ', 'الاسم', 'الهاتف', 'المحافظة', 'المنطقة', 'طريقة الدفع', 'الإجمالي (د.ع)', 'الحالة'];
  const lines = rows.map((o) => [
    o.order_number, o.created_at, o.customer_name, o.customer_phone, o.governorate, o.area,
    o.payment_summary, o.grand_total, config.STATUS_AR[o.status] || o.status,
  ].map(esc).join(','));
  const csv = '\uFEFF' + header.map(esc).join(',') + '\n' + lines.join('\n');
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="almuammal-orders.csv"');
  res.send(csv);
});

/** إيصال طلب قابل للطباعة */
router.get('/orders/:id/print', auth.requirePermission('orders.view'), (req, res) => {
  const order = getOrderWithItems(toInt(req.params.id, -1));
  if (!order) return res.status(404).render('admin/error', { title: 'غير موجود', message: 'الطلب غير موجود.', admin: req.admin });
  res.render('admin/order-print', { title: 'إيصال ' + order.order_number, order });
});

/** إيصال PDF حقيقي بخط عربي */
router.get('/orders/:id/pdf', auth.requirePermission('orders.view'), async (req, res) => {
  const order = getOrderWithItems(toInt(req.params.id, -1));
  if (!order) return res.status(404).render('admin/error', { title: 'غير موجود', message: 'الطلب غير موجود.', admin: req.admin });
  try {
    const { buildOrderPdf } = require('../receipts');
    const buf = await buildOrderPdf(order, getSettings(), config.STATUS_AR[order.status] || order.status);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'inline; filename="order-' + order.order_number + '.pdf"');
    res.send(buf);
  } catch (e) {
    res.status(500).send('تعذر توليد الإيصال.');
  }
});

router.get('/orders/:id', auth.requirePermission('orders.view'), (req, res) => {
  const order = getOrderWithItems(toInt(req.params.id, -1));
  if (!order) return res.status(404).render('admin/error', { title: 'غير موجود', message: 'الطلب غير موجود.', admin: req.admin });
  res.locals.currentAdminNav = 'orders';
  res.render('admin/order-detail', { title: 'طلب ' + order.order_number, order });
});

/* ---------------- الحسابات والإعدادات والسجل ---------------- */

router.get('/customers', auth.requirePermission('customers.view'), (req, res) => {
  res.locals.currentAdminNav = 'customers';
  const customers = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) AS orders_count,
      (SELECT COALESCE(SUM(grand_total),0) FROM orders o WHERE o.customer_id = c.id AND o.status != 'CANCELLED') AS total_spent
    FROM customers c ORDER BY c.updated_at DESC LIMIT 300
  `).all();
  res.render('admin/customers', { title: 'العملاء', customers });
});

/* ---------- دفاتر التقسيط (مطابقة الدفتر الورقي رقميًا) ---------- */
router.get('/files', auth.requirePermission('files.view'), (req, res) => {
  res.locals.currentAdminNav = 'files';
  const files = db.prepare(`
    SELECT f.*, o.order_number, o.grand_total, c.name AS customer_name, c.phone AS customer_phone,
      (SELECT COALESCE(SUM(paid_amount),0) FROM installment_payments p WHERE p.file_id = f.id) AS paid,
      (SELECT COALESCE(SUM(amount),0) FROM installment_payments p WHERE p.file_id = f.id) AS due,
      (SELECT COUNT(*) FROM installment_payments p WHERE p.file_id = f.id AND p.paid_at IS NULL AND date(p.due_date) < date('now')) AS overdue
    FROM installment_files f
    LEFT JOIN orders o ON o.id = f.order_id
    LEFT JOIN customers c ON c.id = f.customer_id
    ORDER BY overdue DESC, f.id DESC
  `).all();
  res.render('admin/files', { title: 'دفاتر التقسيط', files });
});

router.get('/files/:id', auth.requirePermission('files.view'), (req, res) => {
  res.locals.currentAdminNav = 'files';
  const f = db.prepare(`
    SELECT f.*, o.order_number, o.grand_total, c.name AS customer_name, c.phone AS customer_phone
    FROM installment_files f LEFT JOIN orders o ON o.id = f.order_id LEFT JOIN customers c ON c.id = f.customer_id
    WHERE f.id = ?
  `).get(toInt(req.params.id, -1));
  if (!f) return res.status(404).render('admin/error', { title: 'غير موجود', message: 'الدفتر غير موجود.', admin: req.admin });
  const payments = db.prepare('SELECT * FROM installment_payments WHERE file_id = ? ORDER BY installment_no').all(f.id);
  res.render('admin/file-detail', { title: 'دفتر ' + (f.file_no || '#' + f.id), f, payments });
});

router.get('/files/:id/print', auth.requirePermission('files.view'), (req, res) => {
  const f = db.prepare(`
    SELECT f.*, o.order_number, o.grand_total, c.name AS customer_name, c.phone AS customer_phone
    FROM installment_files f LEFT JOIN orders o ON o.id = f.order_id LEFT JOIN customers c ON c.id = f.customer_id
    WHERE f.id = ?
  `).get(toInt(req.params.id, -1));
  if (!f) return res.status(404).render('admin/error', { title: 'غير موجود', message: 'الدفتر غير موجود.', admin: req.admin });
  const payments = db.prepare('SELECT * FROM installment_payments WHERE file_id = ? ORDER BY installment_no').all(f.id);
  res.render('admin/file-print', { title: 'دفتر ' + (f.file_no || '#' + f.id), f, payments });
});

router.get('/users', auth.requirePermission('users.manage'), (req, res) => {
  const users = db.prepare('SELECT * FROM admin_users ORDER BY id').all();
  res.locals.currentAdminNav = 'users';
  res.render('admin/users', { title: 'الحسابات الإدارية', users, MAX_ADMIN_USERS: config.MAX_ADMIN_USERS });
});

router.get('/settings', auth.requirePermission('settings.manage'), (req, res) => {
  res.locals.currentAdminNav = 'settings';
  res.render('admin/settings', { title: 'إعدادات الشركة', s: getSettings() });
});

router.get('/audit', auth.requirePermission('audit.view'), (req, res) => {
  const action = String(req.query.action || '').trim();
  const page = Math.max(1, toInt(req.query.page, 1));
  const perPage = 30;
  const where = action ? 'WHERE action = @action' : '';
  const params = action ? { action } : {};
  const total = db.prepare(`SELECT COUNT(*) AS c FROM audit_logs ${where}`).get(params).c;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const logs = db.prepare(`SELECT * FROM audit_logs ${where} ORDER BY id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...params, limit: perPage, offset: (Math.min(page, pages) - 1) * perPage });
  const actions = db.prepare('SELECT DISTINCT action FROM audit_logs ORDER BY action').all().map((r) => r.action);
  res.locals.currentAdminNav = 'audit';
  res.render('admin/audit', { title: 'سجل العمليات', logs, action, page: Math.min(page, pages), pages, total, actions });
});

module.exports = router;
