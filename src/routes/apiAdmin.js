'use strict';
const express = require('express');
const config = require('../config');
const { db, audit, getSettings, setSetting } = require('../db');
const auth = require('../auth');
const { upload, saveImage, deleteImageFile } = require('../upload');
const { toInt, uniqueSlug } = require('../utils');
const { getOrderWithItems, changeOrderStatus } = require('../orders');

const router = express.Router();

/* ---------------- المصادقة ---------------- */

router.post('/login', async (req, res) => {
  const parsed = require('../schemas').loginSchema.safeParse(req.body || {}); // د37
  if (!parsed.success) return res.status(400).json({ error: 'بيانات الدخول غير صالحة.' });
  const { identifier, password } = parsed.data;
  const result = await auth.login(identifier, password, req.ip);
  if (!result.ok) return res.status(401).json({ error: result.error });
  res.cookie(config.cookieName, result.token, auth.cookieOptions(req));
  res.json({ ok: true, role: result.user.role, via: require('../supabase').isConfigured() ? 'supabase' : 'local' });
});

router.post('/logout', auth.requireAuth, (req, res) => {
  auth.logout(req, res);
  res.json({ ok: true });
});

/* ---------------- المنتجات ---------------- */

function parseProductBody(body) {
  return {
    name: String(body.name || '').trim().slice(0, 200),
    short_description: String(body.short_description || '').trim().slice(0, 500),
    description: String(body.description || '').trim().slice(0, 8000),
    specs: String(body.specs || '').trim().slice(0, 4000),
    category_id: toInt(body.category_id, 0) || null,
    cash_price: toInt(body.cash_price, 0),
    discount_amount: Math.max(0, toInt(body.discount_amount, 0)),
    fees_amount: Math.max(0, toInt(body.fees_amount, 0)),
    fees_label: String(body.fees_label || '').trim().slice(0, 100),
    installment_enabled: body.installment_enabled === '1' || body.installment_enabled === 1 ? 1 : 0,
    installment_price: Math.max(0, toInt(body.installment_price, 0)),
    down_payment: Math.max(0, toInt(body.down_payment, 0)),
    installment_months: Math.max(0, toInt(body.installment_months, 0)),
    monthly_payment: Math.max(0, toInt(body.monthly_payment, 0)),
    stock_status: ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK'].includes(body.stock_status) ? body.stock_status : 'IN_STOCK',
    is_active: body.is_active === '0' || body.is_active === 0 ? 0 : 1,
    is_featured: body.is_featured === '1' || body.is_featured === 1 ? 1 : 0,
    on_offer: body.on_offer === '1' || body.on_offer === 1 ? 1 : 0,
  };
}

function validateProduct(p) {
  const errors = {};
  if (p.name.length < 3) errors.name = 'اسم المنتج مطلوب (3 أحرف على الأقل).';
  if (!(p.cash_price > 0)) errors.cash_price = 'السعر النقدي مطلوب ويجب أن يكون أكبر من صفر.';
  if (p.category_id && !db.prepare('SELECT 1 FROM categories WHERE id = ?').get(p.category_id)) {
    errors.category_id = 'التصنيف غير موجود.';
  }
  if (p.installment_enabled) {
    if (!(p.installment_price > 0)) errors.installment_price = 'سعر التقسيط مطلوب عند تفعيل التقسيط.';
    if (!(p.installment_months > 0)) errors.installment_months = 'عدد الأقساط مطلوب عند تفعيل التقسيط.';
    if (p.down_payment > p.installment_price) errors.down_payment = 'الدفعة الأولى لا تتجاوز سعر التقسيط.';
  }
  if (p.discount_amount > p.cash_price) errors.discount_amount = 'الخصم أكبر من السعر النقدي.';
  return errors;
}

/** يسجل كل تغيير مالي في سجل العمليات (السعر السابق والجديد) */
function auditPriceChanges(admin, productId, productName, oldP, newP, ip) {
  const fields = [
    ['cash_price', 'تعديل السعر النقدي لمنتج'],
    ['discount_amount', 'تعديل خصم منتج'],
    ['installment_price', 'تعديل سعر التقسيط لمنتج'],
    ['down_payment', 'تعديل الدفعة الأولى لمنتج'],
    ['installment_months', 'تعديل عدد الأقساط لمنتج'],
    ['monthly_payment', 'تعديل قيمة القسط الشهري لمنتج'],
    ['fees_amount', 'تعديل الرسوم الإضافية لمنتج'],
  ];
  for (const [field, action] of fields) {
    if (Number(oldP[field]) !== Number(newP[field])) {
      audit({
        admin,
        action,
        entityType: 'product',
        entityId: productId,
        oldValue: { product: productName, field, value: oldP[field] },
        newValue: { product: productName, field, value: newP[field] },
        ip,
      });
    }
  }
}

/** خيارات المنتج الديناميكية من نموذج الإرسال */
function parseOptionsFromBody(body) {
  const raw = body.options_json;
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out = [];
  for (const opt of parsed.slice(0, 20)) {
    const name = String(opt.name || '').trim().slice(0, 80);
    if (!name) continue;
    const inputType = ['select', 'color', 'text'].includes(opt.input_type) ? opt.input_type : 'select';
    const required = opt.required ? 1 : 0;
    const isActive = opt.is_active === false ? 0 : 1;
    const sortOrder = toInt(opt.sort_order, 0);
    const values = [];
    if (inputType !== 'text' && Array.isArray(opt.values)) {
      for (const v of opt.values.slice(0, 50)) {
        const label = String(v.label || '').trim().slice(0, 80);
        if (!label) continue;
        values.push({
          label,
          price_delta: toInt(v.price_delta, 0),
          is_active: v.is_active === false ? 0 : 1,
          sort_order: toInt(v.sort_order, 0),
        });
      }
      if (values.length === 0) continue; // خيار اختيار بدون قيم لا معنى له
    }
    out.push({ id: toInt(opt.id, 0) || null, name, input_type: inputType, required, is_active: isActive, sort_order: sortOrder, values });
  }
  return out;
}

function saveProductOptions(productId, options) {
  const existing = db.prepare('SELECT * FROM product_options WHERE product_id = ?').all(productId);
  const existingIds = new Set(existing.map((o) => o.id));
  const keepIds = new Set();

  options.forEach((opt, idx) => {
    let optionId;
    if (opt.id && existingIds.has(opt.id)) {
      db.prepare('UPDATE product_options SET name=?, input_type=?, required=?, is_active=?, sort_order=? WHERE id=?')
        .run(opt.name, opt.input_type, opt.required, opt.is_active, idx, opt.id);
      optionId = opt.id;
      keepIds.add(opt.id);
    } else {
      const info = db.prepare('INSERT INTO product_options (product_id, name, input_type, required, is_active, sort_order) VALUES (?,?,?,?,?,?)')
        .run(productId, opt.name, opt.input_type, opt.required, opt.is_active, idx);
      optionId = info.lastInsertRowid;
    }
    // القيم
    const existingVals = db.prepare('SELECT * FROM product_option_values WHERE option_id = ?').all(optionId);
    const existingValIds = new Set(existingVals.map((v) => v.id));
    const keepValIds = new Set();
    opt.values.forEach((v, vIdx) => {
      if (v.id && existingValIds.has(v.id)) {
        db.prepare('UPDATE product_option_values SET label=?, price_delta=?, is_active=?, sort_order=? WHERE id=?')
          .run(v.label, v.price_delta, v.is_active, vIdx, v.id);
        keepValIds.add(v.id);
      } else {
        db.prepare('INSERT INTO product_option_values (option_id, label, price_delta, is_active, sort_order) VALUES (?,?,?,?,?)')
          .run(optionId, v.label, v.price_delta, v.is_active, vIdx);
      }
    });
    for (const v of existingVals) {
      if (!keepValIds.has(v.id)) db.prepare('DELETE FROM product_option_values WHERE id = ?').run(v.id);
    }
  });

  for (const o of existing) {
    if (!keepIds.has(o.id)) db.prepare('DELETE FROM product_options WHERE id = ?').run(o.id);
  }
}

router.post('/products', auth.requireAuth, auth.requirePermission('products.create'), (req, res) => {
  const p = parseProductBody(req.body);
  const errors = validateProduct(p);
  if (Object.keys(errors).length) return res.status(400).json({ error: 'يوجد أخطاء في البيانات.', errors });

  const slug = uniqueSlug(p.name + '-' + Date.now().toString(36), (s) => !!db.prepare('SELECT 1 FROM products WHERE slug = ?').get(s));
  const info = db.prepare(`
    INSERT INTO products (name, slug, short_description, description, specs, category_id, cash_price, discount_amount,
      fees_amount, fees_label, installment_enabled, installment_price, down_payment, installment_months, monthly_payment,
      stock_status, is_active, is_featured, on_offer)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    p.name, slug, p.short_description, p.description, p.specs, p.category_id, p.cash_price, p.discount_amount,
    p.fees_amount, p.fees_label, p.installment_enabled, p.installment_price, p.down_payment, p.installment_months, p.monthly_payment,
    p.stock_status, p.is_active, p.is_featured, p.on_offer
  );
  const productId = info.lastInsertRowid;

  const options = parseOptionsFromBody(req.body);
  if (options.length) saveProductOptions(productId, options);

  audit({ admin: req.admin, action: 'PRODUCT_CREATED', entityType: 'product', entityId: productId, newValue: { name: p.name, cash_price: p.cash_price }, ip: req.ip });
  res.status(201).json({ ok: true, id: productId, slug });
});

router.post('/products/:id', auth.requireAuth, auth.requirePermission('products.update'), (req, res) => {
  const productId = toInt(req.params.id, -1);
  const old = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!old) return res.status(404).json({ error: 'المنتج غير موجود.' });

  const p = parseProductBody(req.body);
  const errors = validateProduct(p);
  if (Object.keys(errors).length) return res.status(400).json({ error: 'يوجد أخطاء في البيانات.', errors });

  db.prepare(`
    UPDATE products SET name=?, short_description=?, description=?, specs=?, category_id=?, cash_price=?, discount_amount=?,
      fees_amount=?, fees_label=?, installment_enabled=?, installment_price=?, down_payment=?, installment_months=?, monthly_payment=?,
      stock_status=?, is_active=?, is_featured=?, on_offer=?, updated_at=datetime('now')
    WHERE id=?
  `).run(
    p.name, p.short_description, p.description, p.specs, p.category_id, p.cash_price, p.discount_amount,
    p.fees_amount, p.fees_label, p.installment_enabled, p.installment_price, p.down_payment, p.installment_months, p.monthly_payment,
    p.stock_status, p.is_active, p.is_featured, p.on_offer, productId
  );

  const options = parseOptionsFromBody(req.body);
  if (options.length || req.body.options_json) saveProductOptions(productId, options);

  auditPriceChanges(req.admin, productId, p.name, old, p, req.ip);
  audit({ admin: req.admin, action: 'PRODUCT_UPDATED', entityType: 'product', entityId: productId, newValue: { name: p.name }, ip: req.ip });
  res.json({ ok: true });
});

router.delete('/products/:id', auth.requireAuth, auth.requirePermission('products.delete'), (req, res) => {
  const productId = toInt(req.params.id, -1);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return res.status(404).json({ error: 'المنتج غير موجود.' });
  const images = db.prepare('SELECT * FROM product_images WHERE product_id = ?').all(productId);
  db.prepare('DELETE FROM products WHERE id = ?').run(productId);
  for (const img of images) deleteImageFile(img.path);
  audit({ admin: req.admin, action: 'PRODUCT_DELETED', entityType: 'product', entityId: productId, oldValue: { name: product.name }, ip: req.ip });
  res.json({ ok: true });
});

router.post('/products/:id/images', auth.requireAuth, auth.requirePermission('images.upload'), upload.single('image'), saveImage, (req, res) => {
  const productId = toInt(req.params.id, -1);
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return res.status(404).json({ error: 'المنتج غير موجود.' });

  const count = db.prepare('SELECT COUNT(*) AS c FROM product_images WHERE product_id = ?').get(productId).c;
  if (count >= 10) return res.status(400).json({ error: 'الحد الأقصى 10 صور لكل منتج.' });
  const info = db.prepare('INSERT INTO product_images (product_id, path, is_primary, sort_order) VALUES (?,?,?,?)')
    .run(productId, req.savedImage, count === 0 ? 1 : 0, count);
  audit({ admin: req.admin, action: 'IMAGE_UPLOADED', entityType: 'product', entityId: productId, newValue: { path: req.savedImage }, ip: req.ip });
  res.status(201).json({ ok: true, image: { id: info.lastInsertRowid, path: req.savedImage, is_primary: count === 0 ? 1 : 0 } });
});

router.delete('/images/:id', auth.requireAuth, auth.requirePermission('images.delete'), (req, res) => {
  const imgId = toInt(req.params.id, -1);
  const img = db.prepare('SELECT * FROM product_images WHERE id = ?').get(imgId);
  if (!img) return res.status(404).json({ error: 'الصورة غير موجودة.' });
  db.prepare('DELETE FROM product_images WHERE id = ?').run(imgId);
  deleteImageFile(img.path);
  // إذا كانت الرئيسية، اجعل أول صورة متبقية رئيسية
  if (img.is_primary) {
    db.prepare('UPDATE product_images SET is_primary = 1 WHERE id = (SELECT id FROM product_images WHERE product_id = ? ORDER BY sort_order, id LIMIT 1)')
      .run(img.product_id);
  }
  audit({ admin: req.admin, action: 'IMAGE_DELETED', entityType: 'product_image', entityId: imgId, ip: req.ip });
  res.json({ ok: true });
});

router.post('/images/:id/primary', auth.requireAuth, auth.requirePermission('images.upload'), (req, res) => {
  const imgId = toInt(req.params.id, -1);
  const img = db.prepare('SELECT * FROM product_images WHERE id = ?').get(imgId);
  if (!img) return res.status(404).json({ error: 'الصورة غير موجودة.' });
  db.prepare('UPDATE product_images SET is_primary = 0 WHERE product_id = ?').run(img.product_id);
  db.prepare('UPDATE product_images SET is_primary = 1 WHERE id = ?').run(imgId);
  res.json({ ok: true });
});

/* ---------------- التصنيفات ---------------- */

router.post('/categories', auth.requireAuth, auth.requirePermission('categories.manage'), (req, res) => {
  const name = String(req.body.name || '').trim().slice(0, 80);
  if (name.length < 2) return res.status(400).json({ error: 'اسم التصنيف مطلوب.' });
  const slug = uniqueSlug(name, (s) => !!db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(s));
  const info = db.prepare('INSERT INTO categories (name, slug, description, sort_order) VALUES (?,?,?,?)')
    .run(name, slug, String(req.body.description || '').trim().slice(0, 300), toInt(req.body.sort_order, 0));
  audit({ admin: req.admin, action: 'CATEGORY_CREATED', entityType: 'category', entityId: info.lastInsertRowid, newValue: { name }, ip: req.ip });
  res.status(201).json({ ok: true, id: info.lastInsertRowid });
});

router.post('/categories/:id', auth.requireAuth, auth.requirePermission('categories.manage'), (req, res) => {
  const catId = toInt(req.params.id, -1);
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(catId);
  if (!cat) return res.status(404).json({ error: 'التصنيف غير موجود.' });
  const name = String(req.body.name || '').trim().slice(0, 80);
  if (name.length < 2) return res.status(400).json({ error: 'اسم التصنيف مطلوب.' });
  db.prepare('UPDATE categories SET name=?, description=?, sort_order=?, is_active=? WHERE id=?')
    .run(name, String(req.body.description || '').trim().slice(0, 300), toInt(req.body.sort_order, 0), req.body.is_active === '0' ? 0 : 1, catId);
  audit({ admin: req.admin, action: 'CATEGORY_UPDATED', entityType: 'category', entityId: catId, oldValue: { name: cat.name }, newValue: { name }, ip: req.ip });
  res.json({ ok: true });
});

router.delete('/categories/:id', auth.requireAuth, auth.requirePermission('categories.manage'), (req, res) => {
  const catId = toInt(req.params.id, -1);
  const cat = db.prepare('SELECT * FROM categories WHERE id = ?').get(catId);
  if (!cat) return res.status(404).json({ error: 'التصنيف غير موجود.' });
  db.prepare('DELETE FROM categories WHERE id = ?').run(catId);
  audit({ admin: req.admin, action: 'CATEGORY_DELETED', entityType: 'category', entityId: catId, oldValue: { name: cat.name }, ip: req.ip });
  res.json({ ok: true });
});

/* ---------------- الطلبات ---------------- */

router.post('/orders/:id/status', auth.requireAuth, auth.requirePermission('orders.update_status'), (req, res) => {
  const order = getOrderWithItems(toInt(req.params.id, -1));
  if (!order) return res.status(404).json({ error: 'الطلب غير موجود.' });
  const result = changeOrderStatus(order, String(req.body.status || ''), req.admin, String(req.body.note || '').slice(0, 500));
  if (!result.ok) return res.status(400).json({ error: result.error });
  res.json({ ok: true, status: result.newStatus || order.status });
});

router.post('/orders/:id/notes', auth.requireAuth, auth.requirePermission('orders.internal_notes'), (req, res) => {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(toInt(req.params.id, -1));
  if (!order) return res.status(404).json({ error: 'الطلب غير موجود.' });
  const notes = String(req.body.internal_notes || '').trim().slice(0, 2000);
  db.prepare(`UPDATE orders SET internal_notes = ?, updated_at = datetime('now') WHERE id = ?`).run(notes, order.id);
  audit({ admin: req.admin, action: 'ORDER_NOTES_UPDATED', entityType: 'order', entityId: order.id, newValue: { order_number: order.order_number }, ip: req.ip });
  res.json({ ok: true });
});

/* ---------------- الحسابات الإدارية (المدير الرئيسي فقط) ---------------- */

/* ---------------- دفاتر التقسيط ---------------- */
const BANKS = ['RAFIDAIN', 'AHLI', 'TPI'];

router.post('/files/:id', auth.requireAuth, auth.requirePermission('files.manage'), (req, res) => {
  const f = db.prepare('SELECT * FROM installment_files WHERE id = ?').get(toInt(req.params.id, -1));
  if (!f) return res.status(404).json({ error: 'الدفتر غير موجود.' });
  const b = req.body || {};
  const employment_type = b.employment_type === 'GUARANTOR' ? 'GUARANTOR' : 'EMPLOYEE';
  const bank = BANKS.includes(b.bank) ? b.bank : '';
  const letter_status = b.letter_status === 'RECEIVED' ? 'RECEIVED' : 'PENDING';
  // التفعيل: كتاب الاستمرارية مستلم → ACTIVE + رقم دفتر
  let status = f.status;
  let file_no = f.file_no;
  if (letter_status === 'RECEIVED' && f.status === 'PENDING') {
    status = 'ACTIVE';
    file_no = 'D-' + String(f.id).padStart(5, '0');
  }
  if (b.status === 'CLOSED' && f.status === 'ACTIVE') status = 'CLOSED';
  db.prepare(`UPDATE installment_files SET employment_type=?, employee_name=?, employer=?, bank=?, guarantor_name=?, letter_ref=?, letter_status=?, status=?, file_no=? WHERE id=?`)
    .run(employment_type, String(b.employee_name || '').trim(), String(b.employer || '').trim(), bank,
         String(b.guarantor_name || '').trim(), String(b.letter_ref || '').trim(), letter_status, status, file_no, f.id);
  audit({ admin: req.admin, action: 'FILE_UPDATED', entityType: 'installment_file', entityId: f.id,
    oldValue: { letter_status: f.letter_status, status: f.status }, newValue: { letter_status, status, file_no }, ip: req.ip });
  res.json({ ok: true, status, file_no });
});

router.post('/files/:id/pay/:payId', auth.requireAuth, auth.requirePermission('files.payments'), (req, res) => {
  const f = db.prepare('SELECT * FROM installment_files WHERE id = ?').get(toInt(req.params.id, -1));
  if (!f) return res.status(404).json({ error: 'الدفتر غير موجود.' });
  const pay = db.prepare('SELECT * FROM installment_payments WHERE id = ? AND file_id = ?').get(toInt(req.params.payId, -1), f.id);
  if (!pay) return res.status(404).json({ error: 'القسط غير موجود.' });
  const amount = Math.max(0, toInt(req.body.amount, pay.amount));
  db.prepare("UPDATE installment_payments SET paid_at = date('now'), paid_amount = ?, recorded_by = ?, note = ? WHERE id = ?")
    .run(amount, req.admin.username, String(req.body.note || '').trim(), pay.id);
  audit({ admin: req.admin, action: 'INSTALLMENT_PAYMENT_RECORDED', entityType: 'installment_payment', entityId: pay.id,
    newValue: { file_id: f.id, installment_no: pay.installment_no, amount }, ip: req.ip });
  res.json({ ok: true });
});

router.post('/users', auth.requireAuth, auth.requirePermission('users.manage'), (req, res) => {
  const count = db.prepare('SELECT COUNT(*) AS c FROM admin_users').get().c;
  if (count >= config.MAX_ADMIN_USERS) {
    return res.status(403).json({ error: 'تم الوصول إلى الحد الأقصى المسموح به وهو 3 حسابات إدارية فقط.' });
  }
  const { username, email, full_name, password, role } = req.body || {};
  if (!config.ROLES[role]) return res.status(400).json({ error: 'الدور غير صالح.' });
  if (!username || !/^[\w.-]{3,30}$/.test(username)) return res.status(400).json({ error: 'اسم المستخدم غير صالح.' });
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'البريد الإلكتروني غير صالح.' });
  if (!password || String(password).length < 8) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.' });
  if (db.prepare('SELECT 1 FROM admin_users WHERE username = ? OR email = ?').get(username, email)) {
    return res.status(400).json({ error: 'اسم المستخدم أو البريد مستخدم مسبقًا.' });
  }
  const info = db.prepare('INSERT INTO admin_users (username, email, password_hash, full_name, role) VALUES (?,?,?,?,?)')
    .run(username, email, auth.hashPassword(password), String(full_name || username).slice(0, 80), role);
  audit({ admin: req.admin, action: 'ADMIN_USER_CREATED', entityType: 'admin_user', entityId: info.lastInsertRowid, newValue: { username, role }, ip: req.ip });
  res.status(201).json({ ok: true });
});

router.post('/users/:id', auth.requireAuth, auth.requirePermission('users.manage'), (req, res) => {
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(toInt(req.params.id, -1));
  if (!user) return res.status(404).json({ error: 'الحساب غير موجود.' });
  const email = String(req.body.email || user.email).trim();
  const full_name = String(req.body.full_name || user.full_name).trim().slice(0, 80);
  const username = String(req.body.username || user.username).trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'البريد الإلكتروني غير صالح.' });
  if (!/^[\w.-]{3,30}$/.test(username)) return res.status(400).json({ error: 'اسم المستخدم غير صالح.' });
  const conflict = db.prepare('SELECT 1 FROM admin_users WHERE (email = ? OR username = ?) AND id != ?').get(email, username, user.id);
  if (conflict) return res.status(400).json({ error: 'البريد أو اسم المستخدم مستخدم لحساب آخر.' });
  db.prepare('UPDATE admin_users SET email = ?, full_name = ?, username = ? WHERE id = ?').run(email, full_name, username, user.id);
  audit({ admin: req.admin, action: 'ADMIN_USER_UPDATED', entityType: 'admin_user', entityId: user.id, oldValue: { email: user.email, username: user.username }, newValue: { email, full_name, username }, ip: req.ip });
  res.json({ ok: true });
});

router.post('/users/:id/password', auth.requireAuth, auth.requirePermission('users.manage'), (req, res) => {
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(toInt(req.params.id, -1));
  if (!user) return res.status(404).json({ error: 'الحساب غير موجود.' });
  const password = String(req.body.password || '');
  if (password.length < 8) return res.status(400).json({ error: 'كلمة المرور يجب أن تكون 8 أحرف على الأقل.' });
  db.prepare('UPDATE admin_users SET password_hash = ? WHERE id = ?').run(auth.hashPassword(password), user.id);
  audit({ admin: req.admin, action: 'PASSWORD_RESET', entityType: 'admin_user', entityId: user.id, newValue: { username: user.username }, ip: req.ip });
  res.json({ ok: true });
});

router.post('/users/:id/toggle-active', auth.requireAuth, auth.requirePermission('users.manage'), (req, res) => {
  const user = db.prepare('SELECT * FROM admin_users WHERE id = ?').get(toInt(req.params.id, -1));
  if (!user) return res.status(404).json({ error: 'الحساب غير موجود.' });
  if (user.is_active) {
    const activeCount = db.prepare('SELECT COUNT(*) AS c FROM admin_users WHERE is_active = 1').get().c;
    if (activeCount <= 1) {
      return res.status(400).json({ error: 'لا يمكن تعطيل آخر حساب إداري نشط — يجب ألا يبقى النظام بلا إدارة.' });
    }
  }
  db.prepare('UPDATE admin_users SET is_active = 1 - is_active WHERE id = ?').run(user.id);
  audit({
    admin: req.admin,
    action: user.is_active ? 'ADMIN_USER_DISABLED' : 'ADMIN_USER_ENABLED',
    entityType: 'admin_user', entityId: user.id,
    newValue: { username: user.username }, ip: req.ip,
  });
  res.json({ ok: true, is_active: user.is_active ? 0 : 1 });
});

/* ---------------- الإعدادات (المدير الرئيسي فقط) ---------------- */

router.post('/settings', auth.requireAuth, auth.requirePermission('settings.manage'), (req, res) => {
  const allowed = ['COMPANY_NAME', 'COMPANY_PHONE', 'WHATSAPP_COMPANY_NUMBER', 'COMPANY_ADDRESS', 'COMPANY_SLOGAN', 'SALES_INCLUDE_DELIVERED', 'TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'];
  const old = getSettings();
  if (req.body.SALES_INCLUDE_DELIVERED === undefined) req.body.SALES_INCLUDE_DELIVERED = '0';
  for (const key of allowed) {
    if (req.body[key] !== undefined) {
      let value = String(req.body[key]).trim().slice(0, 500);
      if (key === 'WHATSAPP_COMPANY_NUMBER') value = value.replace(/\D/g, '');
      setSetting(key, value);
    }
  }
  audit({ admin: req.admin, action: 'SETTINGS_UPDATED', entityType: 'settings', entityId: '', oldValue: old, newValue: getSettings(), ip: req.ip });
  res.json({ ok: true });
});

/* ---------------- سجل العمليات (المدير الرئيسي فقط) ---------------- */

router.delete('/audit-logs', auth.requireAuth, auth.requirePermission('audit.clear'), (req, res) => {
  db.prepare('DELETE FROM audit_logs').run();
  audit({ admin: req.admin, action: 'AUDIT_LOGS_CLEARED', entityType: 'audit_logs', entityId: '', ip: req.ip });
  res.json({ ok: true });
});

module.exports = router;
