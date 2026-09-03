'use strict';
const { db, getSetting } = require('./db');
const { formatIQD } = require('./utils');

/**
 * يبني رسالة واتساب ديناميكية من الطلب المحفوظ في قاعدة البيانات.
 * الحقول الفارغة تُستبعد من الرسالة.
 */
/**
 * رسالة واتساب منظمة — كل القيم حقيقية ومستبدلة، لا متغيرات ظاهرة.
 * منتجات مرقمة + طريقة دفع + تفاصيل دفع + إجمالي + ملاحظات (الحقول الفارغة تُستبعد).
 */
function buildOrderMessage(order) {
  if (!order) return '';
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(order.id);
  const companyName = getSetting('COMPANY_NAME');

  const L = [];
  L.push(`طلب جديد من متجر ${companyName}`);
  L.push('');
  L.push(`رقم الطلب: #${order.order_number}`);
  L.push('');
  L.push('بيانات العميل:');
  L.push(`الاسم: ${order.customer_name}`);
  L.push(`رقم الهاتف: ${order.customer_phone}`);
  if (order.governorate) L.push(`المحافظة: ${order.governorate}`);
  if (order.area) L.push(`المنطقة: ${order.area}`);
  if (order.landmark) L.push(`أقرب نقطة دالة: ${order.landmark}`);
  if (order.address) L.push(`العنوان: ${order.address}`);
  if (order.location_link) {
    L.push('');
    L.push('الموقع:');
    L.push(order.location_link);
  }
  const BANK_AR = { RAFIDAIN: 'مصرف الرافدين', AHLI: 'الأهلي العراقي', TPI: 'TPI' };
  const file = db.prepare('SELECT * FROM installment_files WHERE order_id = ?').get(order.id);
  if (file) {
    L.push('');
    L.push('ملف التقسيط (آلية الدفتر):');
    L.push(`الصفة: ${file.employment_type === 'GUARANTOR' ? 'بكفيل موظف' : 'موظف'}`);
    L.push(`اسم الموظف: ${file.employee_name || order.customer_name}`);
    if (file.employer) L.push(`جهة العمل: ${file.employer}`);
    if (file.bank) L.push(`المصرف: ${BANK_AR[file.bank] || file.bank}`);
    if (file.employment_type === 'GUARANTOR' && file.guarantor_name) L.push(`الكفيل: ${file.guarantor_name}`);
    L.push('كتاب الاستمرارية: يُسلَّم في المعرض لتفعيل الدفتر');
  }

  L.push('');
  L.push('تفاصيل الطلب:');

  const cashLines = [];
  const installmentLines = [];

  items.forEach((it, i) => {
    const opts = safeJson(it.options_snapshot);
    L.push('');
    L.push(`${i + 1}. ${it.product_name}`);
    L.push(`الكمية: ${it.quantity}`);
    if (opts.length) {
      L.push(`المواصفات: ${opts.map((o) => `${o.option}: ${o.value}${o.price_delta ? ` (+${formatIQD(o.price_delta)})` : ''}`).join('، ')}`);
    }
    if (it.payment_method === 'CASH') {
      cashLines.push(it);
      L.push(`السعر: ${formatIQD(it.line_total)}`);
      L.push('نوع الدفع: نقدي');
    } else {
      installmentLines.push(it);
      L.push(`السعر: ${formatIQD(it.installment_total + it.fees_total)}`);
      L.push('نوع الدفع: أقساط');
      if (it.down_payment_total > 0) L.push(`الدفعة الأولى: ${formatIQD(it.down_payment_total)}`);
      if (it.months > 0) L.push(`عدد الأقساط: ${it.months}`);
      if (it.monthly_total > 0) L.push(`القسط الشهري: ${formatIQD(it.monthly_total)}`);
    }
  });

  const method = cashLines.length && installmentLines.length ? 'مختلط (نقدي + أقساط)'
    : installmentLines.length ? 'أقساط' : 'نقدي';
  L.push('');
  L.push(`طريقة الدفع: ${method}`);
  L.push('');
  L.push('تفاصيل الدفع:');
  if (cashLines.length) {
    L.push(`إجمالي النقدي: ${formatIQD(cashLines.reduce((s, x) => s + x.line_total, 0))}`);
  }
  if (installmentLines.length) {
    L.push(`إجمالي الأقساط: ${formatIQD(installmentLines.reduce((s, x) => s + x.installment_total + x.fees_total, 0))}`);
    const downSum = installmentLines.reduce((s, x) => s + x.down_payment_total, 0);
    if (downSum > 0) L.push(`الدفعة الأولى: ${formatIQD(downSum)}`);
    const monthlySum = installmentLines.reduce((s, x) => s + x.monthly_total, 0);
    if (monthlySum > 0) L.push(`القسط الشهري: ${formatIQD(monthlySum)}`);
  }
  L.push('');
  L.push('إجمالي الطلب:');
  L.push(`${formatIQD(order.grand_total)}`);

  if (order.notes && order.notes.trim()) {
    L.push('');
    L.push('ملاحظات العميل:');
    L.push(order.notes.trim());
  }

  return L.join('\n');
}

function safeJson(s) {
  try {
    const v = JSON.parse(s || '[]');
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

function whatsappLink(message) {
  const number = getSetting('WHATSAPP_COMPANY_NUMBER').replace(/\D/g, '');
  return `https://wa.me/${number}?text=${encodeURIComponent(message)}`;
}

module.exports = { buildOrderMessage, whatsappLink, safeJson };
