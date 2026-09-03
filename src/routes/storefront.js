'use strict';
const express = require('express');
const config = require('../config');
const { db, getSettings } = require('../db');
const store = require('../store');
const { formatIQD } = require('../utils');

const router = express.Router();

router.use((req, res, next) => {
  res.locals.settings = getSettings();
  res.locals.config = {
    ORDER_STATUSES: config.ORDER_STATUSES,
    STATUS_AR: config.STATUS_AR,
    GOVERNORATES: config.GOVERNORATES,
  };
  res.locals.navCategories = store.listCategories();
  res.locals.currentPath = req.path;
  res.locals.currentQuery = req.query || {};
  next();
});

router.get('/', (req, res) => {
  const categories = store.listCategories();
  const featured = store.listProducts({ featuredOnly: true, perPage: 8 }).rows;
  const offers = store.listProducts({ offersOnly: true, perPage: 4 }).rows;
  const newest = store.listProducts({ perPage: 8 }).rows;
  res.render('home', {
    title: res.locals.settings.COMPANY_NAME,
    ogTitle: res.locals.settings.COMPANY_NAME + ' — ' + res.locals.settings.COMPANY_SLOGAN,
    ogDesc: 'كهربائيات وأثاث ومنزلية في النجف الأشرف — نقدًا أو بالتقسيط المريح بدون تعقيد.',
    ogImage: '/img/hero.jpg',
    categories, featured, offers, newest,
  });
});

router.get('/products', (req, res) => {
  const categories = store.listCategories();
  const q = String(req.query.q || '').trim();
  const category = String(req.query.category || '').trim();
  const inStockOnly = req.query.stock === '1';
  const offersOnly = req.query.offers === '1';
  const sort = String(req.query.sort || 'newest');
  const page = parseInt(req.query.page || '1', 10) || 1;
  const result = store.listProducts({ q, category, inStockOnly, offersOnly, sort, page, perPage: 12 });
  res.render('products', {
    title: 'المنتجات',
    products: result.rows,
    total: result.total,
    page: result.page,
    pages: result.pages,
    q, category, inStockOnly, offersOnly, sort,
    categories,
  });
});

router.get('/product/:slug', (req, res) => {
  const product = store.getProductBySlug(req.params.slug);
  if (!product || !product.is_active) return res.status(404).render('404', { title: 'غير موجود' });
  store.incrementViews(product.id);
  const related = product.category_id
    ? db.prepare(`
        SELECT * FROM products WHERE category_id = ? AND id != ? AND is_active = 1 ORDER BY id DESC LIMIT 4
      `).all(product.category_id, product.id)
    : [];
  for (const r of related) {
    r.image = store.primaryImage(r.id);
    r.has_required_options = !!db.prepare(
      'SELECT 1 FROM product_options WHERE product_id = ? AND required = 1 AND is_active = 1 LIMIT 1'
    ).get(r.id);
  }
  res.render('product', {
    title: product.name,
    ogType: 'product',
    ogTitle: product.name + ' — ' + res.locals.settings.COMPANY_NAME,
    ogDesc: (product.short_description || product.name) + ' | السعر النقدي: ' + formatIQD(product.cash_price - product.discount_amount) + (product.installment_enabled ? ' — متاح بالتقسيط' : ''),
    ogImage: product.image || '/img/hero.jpg',
    product, related,
  });
});

router.get('/cart', (req, res) => {
  res.render('cart', { title: 'سلة التسوق' });
});

router.get('/checkout', (req, res) => {
  res.render('checkout', { title: 'مراجعة الطلب' });
});

router.get('/checkout/details', (req, res) => {
  res.render('checkout-details', { title: 'بيانات العميل' });
});

router.get('/order/success/:orderNumber', async (req, res) => {
  const { verifyToken } = require('../utils');
  const { getOrderWithItems } = require('../orders');
  const { buildOrderMessage, whatsappLink } = require('../whatsapp');

  let waLink = null;
  let waToken = null;
  let qrSvg = null;
  if (verifyToken(req.params.orderNumber, req.query.t)) {
    const order = getOrderWithItems(req.params.orderNumber);
    if (order) {
      waLink = whatsappLink(buildOrderMessage(order));
      waToken = String(req.query.t);
      try {
        const QRCode = require('qrcode'); // qrcode — QR لرابط واتساب على صفحة النجاح
        qrSvg = await QRCode.toString(waLink, { type: 'svg', margin: 1, width: 220 });
      } catch { qrSvg = null; }
    }
  }
  res.render('order-success', { title: 'تم إنشاء طلبك', orderNumber: req.params.orderNumber, waLink, waToken, qrSvg });
});

router.get('/about', (req, res) => {
  const categories = store.listCategories();
  res.render('about', { title: 'نبذة عن الشركة', categories });
});

router.get('/track', (req, res) => {
  res.render('track', { title: 'تتبع طلبك' });
});

router.get('/contact', (req, res) => {
  res.render('contact', { title: 'اتصل بنا' });
});

module.exports = router;
