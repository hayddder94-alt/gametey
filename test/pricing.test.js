'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.DB_FILE = path.join(os.tmpdir(), 'alm-test-pricing-' + process.pid + '.db');
const { db } = require('../src/db');
const { computeLine, computeCart } = require('../src/pricing');

// منتج اختبار: نقدي 100,000 + خصم 10,000 + رسوم 5,000 + تقسيط 120,000/دفعة 20,000/6 أشهر
db.prepare(`INSERT INTO products (id, name, slug, cash_price, discount_amount, fees_amount, installment_enabled,
  installment_price, down_payment, installment_months, monthly_payment, stock_status, is_active)
  VALUES (1,'تجربة','tajriba',100000,10000,5000,1,120000,20000,6,0,'IN_STOCK',1)`).run();
db.prepare(`INSERT INTO product_options (id, product_id, name, input_type, required) VALUES (1,1,'اللون','select',1)`).run();
db.prepare(`INSERT INTO product_option_values (id, option_id, label, price_delta) VALUES (1,1,'أسود',5000),(2,1,'أبيض',0)`).run();

test('نقدي: (سعر + خيار − خصم + رسوم) × كمية', () => {
  const p = require('../src/pricing').loadPricingData(1);
  const r = computeLine(p, 2, 'CASH', { '1': 1 });
  assert.equal(r.ok, true);
  // (100000+5000-10000+5000)*2 = 200000
  assert.equal(r.quote.line_total, 200000);
});

test('تقسيط: إجمالي + دفعة + قسط محسوب تلقائيًا', () => {
  const p = require('../src/pricing').loadPricingData(1);
  const r = computeLine(p, 1, 'INSTALLMENT', { '1': 2 });
  assert.equal(r.quote.installment_total, 120000);
  assert.equal(r.quote.down_payment_total, 20000);
  assert.equal(r.quote.monthly_total, Math.ceil((120000 + 0 - 20000) / 6)); // خيار أبيض بدون فرق
});

test('رفض خيار مطلوب مفقود', () => {
  const p = require('../src/pricing').loadPricingData(1);
  const r = computeLine(p, 1, 'CASH', {});
  assert.equal(r.ok, false);
});

test('رفض قيمة خيار غير موجودة (حقن معرفات)', () => {
  const p = require('../src/pricing').loadPricingData(1);
  const r = computeLine(p, 1, 'CASH', { '1': 999 });
  assert.equal(r.ok, false);
});

test('computeCart يجمع طريقتي دفع ويتجاهل أسعار العميل', () => {
  const calc = computeCart([
    { product_id: 1, qty: 1, method: 'CASH', options: { '1': 2 } },
    { product_id: 1, qty: 1, method: 'INSTALLMENT', options: { '1': 2 } },
  ]);
  assert.equal(calc.ok, true);
  assert.equal(calc.totals.grand_total, (100000 - 10000 + 5000) + (120000 + 5000));
});

test('منتج غير موجود → خطأ بدون انهيار', () => {
  const calc = computeCart([{ product_id: 999, qty: 1, method: 'CASH', options: {} }]);
  assert.equal(calc.ok, false);
});
