'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_FILE = path.join(os.tmpdir(), 'alm-test-core-' + process.pid + '.db');
const config = require('../src/config');
const { normalizeIraqiPhone, validateOrderInput, signToken, verifyToken } = require('../src/utils');
const auth = require('../src/auth');

test('توحيد أرقام الهواتف العراقية', () => {
  assert.equal(normalizeIraqiPhone('07701234567'), '07701234567');
  assert.equal(normalizeIraqiPhone('+9647701234567'), '07701234567');
  assert.equal(normalizeIraqiPhone('9647701234567'), '07701234567');
  assert.equal(normalizeIraqiPhone('123'), null);
});

test('تحقق بيانات العميل: حقول مطلوبة', () => {
  const r = validateOrderInput({ name: 'x', phone: 'bad', governorate: '', area: '' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.name && r.errors.phone && r.errors.governorate && r.errors.area);
  const ok = validateOrderInput({ name: 'علي حسين', phone: '07701234567', governorate: 'النجف', area: 'الكرامة' });
  assert.equal(ok.ok, true);
});

test('توقيع صفحة النجاح: تحقق ورفض عبث', () => {
  const t = signToken('AM-260101-1234');
  assert.equal(verifyToken('AM-260101-1234', t), true);
  assert.equal(verifyToken('AM-260101-9999', t), false);
  assert.equal(verifyToken('AM-260101-1234', 'deadbeef'), false);
});

test('ثوابت النظام: 3 حسابات و8 حالات وواتساب دولي', () => {
  assert.equal(config.MAX_ADMIN_USERS, 3);
  assert.equal(config.ORDER_STATUSES.length, 8);
  assert.equal(config.defaultSettings.WHATSAPP_COMPANY_NUMBER, '9647821296460');
  assert.ok(!config.defaultSettings.WHATSAPP_COMPANY_NUMBER.includes('+'));
});

test('RBAC: دور ADMIN يملك الصلاحيات الكاملة', () => {
  const user = { role: 'ADMIN' };
  for (const perm of ['products.create', 'prices.manage', 'orders.update_status', 'settings.manage', 'audit.view', 'users.manage']) {
    assert.equal(auth.can(user, perm), true, perm);
  }
  assert.equal(auth.can({ role: 'GUEST' }, 'products.create'), false);
  assert.equal(auth.can(null, 'products.create'), false);
});
