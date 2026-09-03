'use strict';
const express = require('express');
const config = require('../config');
const { db } = require('../db');
const { computeCart } = require('../pricing');
const { createOrder, getOrderWithItems } = require('../orders');
const { buildOrderMessage, whatsappLink } = require('../whatsapp');
const { normalizeIraqiPhone, WindowLimiter, signToken, verifyToken } = require('../utils');
const { createOrderSchema, zodErrorsToMap } = require('../schemas');

const router = express.Router();
const orderLimiter = new WindowLimiter({ windowMs: config.orderWindowMs, max: config.orderMaxPerHour });
const quoteLimiter = new WindowLimiter({ windowMs: 60 * 1000, max: 90 });
const { getSetting } = require('../db');
const { formatIQD } = require('../utils');

/**
 * إشعار فوري للشركة عند كل طلب جديد عبر تيليجرام (اختياري، من الإعدادات).
 * يعمل من الخادم مباشرة — يصل الإشعار حتى لو لم يُرسل العميل رسالة واتساب.
 */
function telegramCompanyNotify(order) {
  const token = String(getSetting('TELEGRAM_BOT_TOKEN') || '').trim();
  const chatId = String(getSetting('TELEGRAM_CHAT_ID') || '').trim();
  if (!token || !chatId) return;
  const text =
    '🛒 طلب جديد #' + order.order_number + '\n' +
    '👤 ' + order.customer_name + ' — 📞 ' + order.customer_phone + '\n' +
    '📍 ' + (order.governorate || '') + ' / ' + (order.area || '') + '\n' +
    '💰 الإجمالي: ' + formatIQD(order.grand_total) + '\n' +
    '🧾 الحالة: ' + (config.STATUS_AR[order.status] || order.status);
  fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text }),
  }).catch(function () { /* لا يعطّل إنشاء الطلب أبدًا */ });
}

/** اقتباس أسعار السلة — لإعادة العرض فقط، الخادم يعيد الحساب دائمًا */
router.post('/cart/quote', (req, res) => {
  if (!quoteLimiter.hit(req.ip || 'unknown')) {
    return res.status(429).json({ error: 'طلبات كثيرة جدًا، انتظر لحظة.' });
  }
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const calc = computeCart(items);
  res.json({
    lines: calc.lines,
    totals: calc.totals,
    errors: calc.errors,
  });
});

/** إنشاء طلب — بدون حساب؛ التحقق بمخطط zod ثم إعادة الحساب في الخادم */
router.post('/orders', (req, res) => {
  const ip = req.ip || 'unknown';
  if (!orderLimiter.hit(ip)) {
    return res.status(429).json({ error: 'تم تجاوز عدد الطلبات المسموح بها مؤقتًا. حاول بعد قليل أو تواصل معنا عبر واتساب.' });
  }
  const parsed = createOrderSchema.safeParse(req.body || {});
  if (!parsed.success) {
    const flat = zodErrorsToMap(parsed.error);
    const errors = {};
    for (const [k, v] of Object.entries(flat)) {
      errors[k.startsWith('customer.') ? k.split('.')[1] : 'cart'] = v;
    }
    return res.status(400).json({ error: 'يرجى تصحيح الأخطاء التالية.', errors });
  }
  const { customer, items, idem } = parsed.data;
  const result = createOrder({ customer, items, ip, idem });
  if (!result.ok) {
    return res.status(400).json({ error: 'يرجى تصحيح الأخطاء التالية.', errors: result.errors });
  }
  // الرسالة تُبنى من الطلب المحفوظ في قاعدة البيانات — جاهزة للتحويل الفوري إلى واتساب
  const saved = getOrderWithItems(result.order.id);
  const message = buildOrderMessage(saved);

  // إشعار لحظي للوحة الإدارة (socket.io) + إشعار تيليجرام اختياري
  require('../realtime').emitAdmin('order:new', {
    order_number: result.order.order_number,
    grand_total: result.order.grand_total,
    status: result.order.status,
  });
  telegramCompanyNotify(saved);

  res.status(201).json({
    ok: true,
    order_number: result.order.order_number,
    status: result.order.status,
    grand_total: result.order.grand_total,
    whatsapp_link: whatsappLink(message),
    success_token: signToken(result.order.order_number),
  });
});

/** نسخة الواجهة للتشغيل والمراقبة — د39 */
router.get('/version', (req, res) => {
  const pkg = require('../../package.json');
  res.json({ name: pkg.name, version: pkg.version, node: process.version });
});

/** تتبع الطلبات برقم هاتف العميل — بدون حساب، بحسب رقم الهاتف فقط */
router.get('/orders/track', (req, res) => {
  const phone = normalizeIraqiPhone(req.query.phone);
  if (!phone) return res.status(400).json({ error: 'يرجى إدخال رقم هاتف عراقي صحيح.' });
  const rows = db.prepare(`
    SELECT order_number, created_at, status, grand_total, items_count
    FROM orders WHERE customer_phone = ? ORDER BY id DESC LIMIT 10
  `).all(phone);
  res.json({
    orders: rows.map((o) => ({
      order_number: o.order_number,
      created_at: o.created_at,
      status: o.status,
      status_ar: config.STATUS_AR[o.status] || o.status,
      grand_total: o.grand_total,
      items_count: o.items_count,
    })),
  });
});

/** ملخص طلب محفوظ — يتطلب رقم هاتف مطابق */
router.get('/orders/:orderNumber/summary', (req, res) => {
  const order = getOrderWithItems(req.params.orderNumber);
  if (!order) return res.status(404).json({ error: 'الطلب غير موجود.' });
  const phone = normalizeIraqiPhone(req.query.phone);
  const authorized = verifyToken(order.order_number, req.query.t) || (phone && phone === order.customer_phone);
  if (!authorized) {
    return res.status(403).json({ error: 'رقم الهاتف غير مطابق للطلب.' });
  }
  const { safeJson } = require('../whatsapp');
  res.json({
    order_number: order.order_number,
    status: order.status,
    status_ar: config.STATUS_AR[order.status] || order.status,
    grand_total: order.grand_total,
    customer_name: order.customer_name,
    created_at: order.created_at,
    items: order.items.map((it) => ({
      name: it.product_name,
      image: it.product_image,
      quantity: it.quantity,
      payment_method: it.payment_method,
      line_total: it.line_total,
      options: safeJson(it.options_snapshot),
      months: it.months,
      down_payment_total: it.down_payment_total,
      monthly_total: it.monthly_total,
    })),
  });
});

/** رسالة واتساب الخاصة بطلب محفوظ — تتطلب رقم هاتف مطابق لمنع التطفل */
router.get('/orders/:orderNumber/whatsapp-message', (req, res) => {
  const order = getOrderWithItems(req.params.orderNumber);
  if (!order) return res.status(404).json({ error: 'الطلب غير موجود.' });
  const phone = normalizeIraqiPhone(req.query.phone);
  const authorized = verifyToken(order.order_number, req.query.t) || (phone && phone === order.customer_phone);
  if (!authorized) {
    return res.status(403).json({ error: 'رقم الهاتف غير مطابق للطلب.' });
  }
  const message = buildOrderMessage(order);
  res.json({ message, link: whatsappLink(message) });
});

/** تأكيد إرسال الطلب إلى واتساب */
router.post('/orders/:orderNumber/whatsapp-sent', (req, res) => {
  const order = getOrderWithItems(req.params.orderNumber);
  if (!order) return res.status(404).json({ error: 'الطلب غير موجود.' });
  const phone = normalizeIraqiPhone(req.body.phone);
  const authorized = verifyToken(order.order_number, req.body.t) || (phone && phone === order.customer_phone);
  if (!authorized) {
    return res.status(403).json({ error: 'رقم الهاتف غير مطابق للطلب.' });
  }
  if (!order.whatsapp_sent_at) {
    db.prepare("UPDATE orders SET whatsapp_sent_at = datetime('now'), updated_at = datetime('now') WHERE id = ?")
      .run(order.id);
    db.prepare(`INSERT INTO order_status_history (order_id, admin_id, username, old_status, new_status, note) VALUES (?, NULL, 'العميل', ?, ?, 'فتح العميل واتساب لإرسال الطلب')`)
      .run(order.id, order.status, order.status);
  }
  res.json({ ok: true });
});

/** قائمة المنتجات (تُستخدم في البحث الفوري والواجهات) */
router.get('/products', (req, res) => {
  const { listProducts } = require('../store');
  const result = listProducts({
    q: String(req.query.q || ''),
    category: String(req.query.category || ''),
    inStockOnly: req.query.in_stock === '1',
    offersOnly: req.query.offers === '1',
    sort: String(req.query.sort || 'newest'),
    page: parseInt(req.query.page || '1', 10),
    perPage: 24,
  });
  res.json({
    products: result.rows.map((p) => ({
      id: p.id, name: p.name, slug: p.slug, image: p.image,
      cash_price: p.cash_price, discount_amount: p.discount_amount,
      installment_enabled: !!p.installment_enabled,
      installment_price: p.installment_price, monthly_payment: p.monthly_payment,
      stock_status: p.stock_status,
    })),
    total: result.total, page: result.page, pages: result.pages,
  });
});

module.exports = router;
