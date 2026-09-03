'use strict';
const { db } = require('./db');
const { toInt } = require('./utils');

/**
 * محرك حساب الأسعار — يعمل في الخادم فقط.
 * السعر = (سعر المنتج + خيارات إضافية - الخصم + الرسوم) × الكمية
 * لا يُعتمد أبدًا على أي سعر قادم من المتصفح.
 */

function loadPricingData(productId) {
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return null;
  const options = db.prepare(
    'SELECT * FROM product_options WHERE product_id = ? AND is_active = 1 ORDER BY sort_order, id'
  ).all(productId);
  const valuesStmt = db.prepare(
    'SELECT * FROM product_option_values WHERE option_id = ? AND is_active = 1 ORDER BY sort_order, id'
  );
  for (const o of options) o.values = valuesStmt.all(o.id);
  const image = db.prepare(
    'SELECT path FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order, id LIMIT 1'
  ).get(productId);
  product.image = image ? image.path : '';
  product.options = options;
  return product;
}

/**
 * يحسب سعر بند واحد.
 * @param product بيانات المنتج مع الخيارات (من قاعدة البيانات)
 * @param qty الكمية
 * @param method 'CASH' | 'INSTALLMENT'
 * @param selections { [optionId]: valueId } أو نص للخيارات النصية
 * @returns {ok, error?, quote}
 */
function computeLine(product, qty, method, selections = {}) {
  qty = toInt(qty, 1);
  if (!product || !product.is_active) return { ok: false, error: 'المنتج غير متوفر.' };
  if (qty < 1 || qty > 50) return { ok: false, error: 'الكمية غير صالحة.' };
  if (product.stock_status === 'OUT_OF_STOCK') return { ok: false, error: 'المنتج غير متوفر حاليًا.' };
  if (!['CASH', 'INSTALLMENT'].includes(method)) return { ok: false, error: 'طريقة الدفع غير صالحة.' };
  if (method === 'INSTALLMENT' && !product.installment_enabled) {
    return { ok: false, error: 'هذا المنتج غير متاح بالتقسيط.' };
  }

  let optionsTotal = 0;
  const optionDetails = [];
  for (const opt of product.options) {
    const sel = selections ? selections[String(opt.id)] : undefined;
    if (opt.input_type === 'text') {
      if (opt.required && (!sel || !String(sel).trim())) {
        return { ok: false, error: `يرجى تحديد ${opt.name}.` };
      }
      if (sel && String(sel).trim()) {
        optionDetails.push({ option: opt.name, value: String(sel).trim().slice(0, 200), price_delta: 0 });
      }
      continue;
    }
    if (sel === undefined || sel === null || sel === '') {
      if (opt.required) return { ok: false, error: `يرجى اختيار ${opt.name}.` };
      continue;
    }
    const valueId = toInt(sel, -1);
    const value = opt.values.find((v) => v.id === valueId);
    if (!value) return { ok: false, error: `قيمة غير صالحة لخيار ${opt.name}.` };
    optionsTotal += value.price_delta;
    optionDetails.push({ option: opt.name, value: value.label, price_delta: value.price_delta });
  }

  const discountPerUnit = method === 'CASH' ? product.discount_amount : 0;
  if (method === 'CASH') {
    const unitBase = product.cash_price + optionsTotal;
    const unitNet = Math.max(0, unitBase - discountPerUnit);
    const unitWithFees = unitNet + product.fees_amount;
    return {
      ok: true,
      quote: {
        product_id: product.id,
        name: product.name,
        image: product.image,
        slug: product.slug,
        quantity: qty,
        method,
        unit_base_price: product.cash_price + optionsTotal,
        options_total_per_unit: optionsTotal,
        discount_per_unit: discountPerUnit,
        fees_per_unit: product.fees_amount,
        fees_label: product.fees_label || '',
        unit_net: unitNet,
        unit_total: unitWithFees,
        line_base: (product.cash_price + optionsTotal) * qty,
        line_discount: discountPerUnit * qty,
        line_fees: product.fees_amount * qty,
        line_total: unitWithFees * qty,
        option_details: optionDetails,
      },
    };
  }

  // التقسيط
  const instPricePerUnit = product.installment_price + optionsTotal; // سعر التقسيط الإجمالي للوحدة
  const downPerUnit = Math.min(product.down_payment, Math.max(0, product.down_payment));
  const months = product.installment_months || 0;
  let monthlyPerUnit = product.monthly_payment;
  if (!monthlyPerUnit && months > 0) {
    monthlyPerUnit = Math.ceil(Math.max(0, instPricePerUnit - downPerUnit) / months);
  }
  return {
    ok: true,
    quote: {
      product_id: product.id,
      name: product.name,
      image: product.image,
      slug: product.slug,
      quantity: qty,
      method,
      unit_base_price: product.cash_price + optionsTotal,
      options_total_per_unit: optionsTotal,
      discount_per_unit: 0,
      fees_per_unit: product.fees_amount,
      fees_label: product.fees_label || '',
      installment_price_per_unit: instPricePerUnit,
      down_payment_per_unit: downPerUnit,
      months,
      monthly_per_unit: monthlyPerUnit,
      line_total: (instPricePerUnit + product.fees_amount) * qty,
      installment_total: instPricePerUnit * qty,
      down_payment_total: downPerUnit * qty,
      monthly_total: monthlyPerUnit * qty,
      line_fees: product.fees_amount * qty,
      option_details: optionDetails,
    },
  };
}

/**
 * يحسب اقتباس كامل لسلة (يُستخدم في صفحة السلة والعرض، وفي إنشاء الطلب).
 * @param items [{product_id, qty, method, options}]
 */
function computeCart(items) {
  const lines = [];
  const errors = [];
  let cashTotal = 0;
  let installmentTotal = 0;
  let discountTotal = 0;
  let feesTotal = 0;

  for (const [idx, it] of (items || []).entries()) {
    const product = loadPricingData(toInt(it.product_id, -1));
    if (!product) {
      errors.push({ index: idx, error: 'المنتج غير موجود.' });
      continue;
    }
    const res = computeLine(product, it.qty, it.method, it.options || {});
    if (!res.ok) {
      errors.push({ index: idx, name: product.name, error: res.error });
      continue;
    }
    res.quote.index = idx;
    lines.push(res.quote);
    if (it.method === 'CASH') cashTotal += res.quote.line_total;
    else installmentTotal += res.quote.line_total;
    discountTotal += res.quote.line_discount || 0;
    feesTotal += res.quote.line_fees || 0;
  }

  return {
    ok: errors.length === 0 && lines.length > 0,
    errors,
    lines,
    totals: {
      cash_total: cashTotal,
      installment_total: installmentTotal,
      discount_total: discountTotal,
      fees_total: feesTotal,
      grand_total: cashTotal + installmentTotal,
      items_count: lines.reduce((s, l) => s + l.quantity, 0),
    },
  };
}

module.exports = { loadPricingData, computeLine, computeCart };
