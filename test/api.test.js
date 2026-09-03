'use strict';
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');

process.env.DB_FILE = path.join(os.tmpdir(), 'alm-api-test-' + process.pid + '.db');
const QA_PASS = 'Qa-' + require('crypto').randomBytes(9).toString('hex');
process.env.SEED_ADMIN1_PASSWORD = QA_PASS;
const request = require('supertest');
const app = require('../server'); // يبذر قاعدة اختبار مؤقتة تلقائيًا

test('الرئيسية تعمل', async () => {
  const r = await request(app).get('/');
  assert.equal(r.status, 200);
});

test('طلب ببيانات ناقصة → 400 بأخطاء zod مفسرة', async () => {
  const r = await request(app).post('/api/orders').send({ customer: { name: 'x', phone: 'bad' }, items: [] });
  assert.equal(r.status, 400);
  assert.ok(r.body.errors.name && r.body.errors.phone && r.body.errors.cart);
});

test('طلب سليم → 201 مع رابط واتساب وتوقيع', async () => {
  const r = await request(app).post('/api/orders').send({
    customer: { name: 'اختبار سوبرتست', phone: '07701234567', governorate: 'النجف', area: 'الكرامة' },
    items: [{ product_id: 13, qty: 2, method: 'CASH', options: {} }],
  });
  assert.equal(r.status, 201);
  assert.ok(r.body.whatsapp_link.startsWith('https://wa.me/9647821296460?text='));
  assert.ok(r.body.success_token);
  assert.equal(r.body.grand_total, 50000); // 25000×2 محسوبة خادميًا
});

test('تزوير سعر العميل يُتجاهل', async () => {
  const r = await request(app).post('/api/orders').send({
    customer: { name: 'مزوّر الأسعار', phone: '07709998877', governorate: 'بغداد', area: 'المنصور' },
    items: [{ product_id: 13, qty: 1, method: 'CASH', options: {}, line_total: 1, price: 1 }],
  });
  assert.equal(r.status, 201);
  assert.equal(r.body.grand_total, 25000);
});

test('API الإدارة بدون جلسة → 401', async () => {
  const r = await request(app).get('/api/admin/orders-never'); // أي مسار إدارة
  assert.ok([401, 404].includes(r.status));
  const r2 = await request(app).post('/api/admin/products').send({ name: 'x', cash_price: 1 });
  assert.equal(r2.status, 401);
});

test('دخول خاطئ → 401', async () => {
  const r = await request(app).post('/api/admin/login').send({ identifier: 'admin1', password: 'nope-nope' });
  assert.equal(r.status, 401);
});

test('زود يرفض طريقة دفع غير صالحة', async () => {
  const r = await request(app).post('/api/orders').send({
    customer: { name: 'طريقة دفع', phone: '07701234567', governorate: 'النجف', area: 'حيدري' },
    items: [{ product_id: 13, qty: 1, method: 'BITCOIN', options: {} }],
  });
  assert.equal(r.status, 400);
});

test('آلة حالات الطلب: حالة غير صالحة تُرفض', async () => {
  const login = await request(app).post('/api/admin/login').send({ identifier: 'admin1', password: QA_PASS });
  assert.equal(login.status, 200);
  const cookie = login.headers['set-cookie'][0].split(';')[0];
  const ord = await request(app).post('/api/orders').send({
    customer: { name: 'حالة طلب', phone: '07701112223', governorate: 'النجف', area: 'الكرامة' },
    items: [{ product_id: 13, qty: 1, method: 'CASH', options: {} }], idem: 'qa-state-1',
  });
  const id = (await require('../src/db').db.prepare('SELECT id FROM orders WHERE order_number = ?').get(ord.body.order_number)).id;
  const bad = await request(app).post(`/api/admin/orders/${id}/status`).set('Cookie', cookie).send({ status: 'HACKED' });
  assert.equal(bad.status, 400);
  const noauth = await request(app).post(`/api/admin/orders/${id}/status`).send({ status: 'CONFIRMED' });
  assert.equal(noauth.status, 401);
  const ok = await request(app).post(`/api/admin/orders/${id}/status`).set('Cookie', cookie).send({ status: 'CONFIRMED' });
  assert.equal(ok.status, 200);
});

test('whatsapp-sent بهاتف خاطئ يُرفض 403', async () => {
  const ord = await request(app).post('/api/orders').send({
    customer: { name: 'واتساب فحص', phone: '07701112224', governorate: 'النجف', area: 'الكرامة' },
    items: [{ product_id: 13, qty: 1, method: 'CASH', options: {} }], idem: 'qa-wa-1',
  });
  const r = await request(app).post(`/api/orders/${ord.body.order_number}/whatsapp-sent`).send({ phone: '07800000000' });
  assert.equal(r.status, 403);
});
