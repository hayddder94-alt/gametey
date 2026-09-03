'use strict';
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');

process.env.DB_FILE = path.join(os.tmpdir(), 'alm-rt-test-' + process.pid + '.db');
const QA_PASS = 'Qa-' + require('crypto').randomBytes(9).toString('hex');
process.env.SEED_ADMIN1_PASSWORD = QA_PASS;
process.env.SEED_ADMIN2_PASSWORD = QA_PASS;
process.env.SEED_ADMIN3_PASSWORD = QA_PASS;

const { io: ioc } = require('socket.io-client');
const request = require('supertest');
const app = require('../server');
const server = app.server;

test('القناة اللحظية: ترفض غير المصرحين، وتستقبل المدير، وتبث الطلبات', async () => {
  await new Promise((resolve) => server.listen(0, resolve));
  const port = server.address().port;

  // بدون كوكي → مرفوض
  const denied = await new Promise((resolve) => {
    const s = ioc('http://localhost:' + port, { reconnection: false, transports: ['websocket'] });
    s.on('connect_error', () => { s.close(); resolve('denied'); });
    s.on('connect', () => { s.close(); resolve('connected'); });
    setTimeout(() => resolve('timeout'), 2500);
  });
  assert.equal(denied, 'denied');

  // دخول المدير → كوكي
  const login = await request(app).post('/api/admin/login').send({ identifier: 'admin1', password: QA_PASS });
  assert.equal(login.status, 200);
  const cookie = login.headers['set-cookie'][0].split(';')[0];

  // اتصال مصرح + استقبال حدث طلب جديد
  const socket = ioc('http://localhost:' + port, { extraHeaders: { Cookie: cookie }, transports: ['websocket'], reconnection: false });
  const connected = await new Promise((resolve) => {
    socket.on('connect', () => resolve(true));
    socket.on('connect_error', () => resolve(false));
    setTimeout(() => resolve(false), 2500);
  });
  assert.equal(connected, true);

  const gotEvent = new Promise((resolve) => {
    socket.on('order:new', (d) => resolve(d));
    setTimeout(() => resolve(null), 4000);
  });
  const order = await request(app).post('/api/orders').send({
    customer: { name: 'طلب لحظي', phone: '07701234567', governorate: 'النجف', area: 'الكرامة' },
    items: [{ product_id: 13, qty: 1, method: 'CASH', options: {} }],
  });
  assert.equal(order.status, 201);
  const evt = await gotEvent;
  assert.ok(evt && evt.order_number === order.body.order_number);
  socket.close();
  server.close();
});
