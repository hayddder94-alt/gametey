'use strict';
const { db, audit } = require('./db');
const config = require('./config');
const { computeCart } = require('./pricing');
const { generateOrderNumber, validateOrderInput } = require('./utils');

/**
 * إنشاء طلب حقيقي:
 * 1) التحقق من بيانات العميل.
 * 2) إعادة حساب الأسعار كاملة في الخادم (تجاهل أي أسعار من المتصفح).
 * 3) الحفظ في قاعدة البيانات ضمن معاملة واحدة.
 */
function createOrder({ customer, items, ip, idem }) {
  const validation = validateOrderInput(customer || {});
  if (!validation.ok) return { ok: false, errors: validation.errors };

  // منع الازدواج: نفس مفتاح idem يعيد نفس الطلب دون إنشاء تكرار
  if (idem) {
    const existing = db.prepare('SELECT * FROM orders WHERE idem_key = ?').get(String(idem));
    if (existing) return { ok: true, order: existing, duplicate: true };
  }

  const cartItems = Array.isArray(items) ? items.slice(0, 30) : [];
  if (cartItems.length === 0) return { ok: false, errors: { cart: 'السلة فارغة.' } };

  // إعادة الحساب الكاملة من قاعدة البيانات
  const calc = computeCart(cartItems);
  if (!calc.ok) {
    const errors = { cart: calc.errors.map((e) => e.error).join(' ') || 'تعذر حساب الأسعار.' };
    return { ok: false, errors };
  }

  const v = validation.value;
  const orderNumber = generateOrderNumber(
    (n) => !!db.prepare('SELECT 1 FROM orders WHERE order_number = ?').get(n)
  );

  const methods = new Set(calc.lines.map((l) => l.method));
  const paymentSummary = methods.size === 2 ? 'MIXED' : [...methods][0];

  const tx = db.transaction(() => {
    // العميل: إعادة استخدام سجل موجود بنفس الرقم أو إنشاء جديد
    let customerRow = db.prepare('SELECT * FROM customers WHERE phone = ? ORDER BY id DESC LIMIT 1').get(v.phone);
    if (customerRow) {
      db.prepare(`UPDATE customers SET name=?, governorate=?, area=?, landmark=?, address=?, location_link=?, updated_at=datetime('now') WHERE id=?`)
        .run(v.name, v.governorate, v.area, v.landmark, v.address, v.location_link, customerRow.id);
    } else {
      const info = db.prepare(`INSERT INTO customers (name, phone, governorate, area, landmark, address, location_link) VALUES (?,?,?,?,?,?,?)`)
        .run(v.name, v.phone, v.governorate, v.area, v.landmark, v.address, v.location_link);
      customerRow = { id: info.lastInsertRowid };
    }

    const orderInfo = db.prepare(`
      INSERT INTO orders (order_number, customer_id, customer_name, customer_phone, governorate, area, landmark, address, location_link, notes,
                          payment_summary, items_count, grand_total, status, idem_key)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      orderNumber, customerRow.id, v.name, v.phone, v.governorate, v.area, v.landmark, v.address, v.location_link, v.notes,
      paymentSummary, calc.totals.items_count, calc.totals.grand_total, config.DEFAULT_ORDER_STATUS, idem || null
    );
    const orderId = orderInfo.lastInsertRowid;

    const itemStmt = db.prepare(`
      INSERT INTO order_items (order_id, product_id, product_name, product_image, quantity, payment_method,
        unit_base_price, options_total, discount_total, fees_total, line_total,
        cash_total, installment_total, down_payment_total, months, monthly_total, options_snapshot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const productIds = new Set();
    for (const line of calc.lines) {
      itemStmt.run(
        orderId, line.product_id, line.name, line.image, line.quantity, line.method,
        line.unit_base_price, line.options_total_per_unit, line.discount_per_unit, line.fees_per_unit, line.line_total,
        line.method === 'CASH' ? line.line_total : 0,
        line.method === 'INSTALLMENT' ? line.line_total : 0,
        line.method === 'INSTALLMENT' ? line.down_payment_total : 0,
        line.method === 'INSTALLMENT' ? line.months : 0,
        line.method === 'INSTALLMENT' ? line.monthly_total : 0,
        JSON.stringify(line.option_details)
      );
      productIds.add(line.product_id);
    }

    // إحصاءات المنتجات
    const incStmt = db.prepare('UPDATE products SET orders_count = orders_count + 1 WHERE id = ?');
    for (const pid of productIds) incStmt.run(pid);

    // فتح دفتر تقسيط رقمي تلقائيًا لأي طلب يحتوي بنود تقسيط (بنفس شروط الشركة)
    const instLines = calc.lines.filter((l) => l.method === 'INSTALLMENT');
    if (instLines.length) {
      const monthlySum = instLines.reduce((s, l) => s + l.monthly_total, 0);
      const months = Math.max(...instLines.map((l) => l.months || 0), 0);
      const file = db.prepare(`
        INSERT INTO installment_files (order_id, customer_id, employment_type, employee_name, employer, bank, guarantor_name, letter_ref)
        VALUES (?,?,?,?,?,?,?,?)
      `).run(
        orderId, customerRow.id,
        (customer.employment_type === 'GUARANTOR' ? 'GUARANTOR' : 'EMPLOYEE'),
        String(customer.employee_name || '').trim() || v.name,
        String(customer.employer || '').trim(),
        ['RAFIDAIN', 'AHLI', 'TPI'].includes(customer.bank) ? customer.bank : '',
        String(customer.guarantor_name || '').trim(),
        String(customer.letter_ref || '').trim()
      );
      const fileId = file.lastInsertRowid;
      const payStmt = db.prepare('INSERT INTO installment_payments (file_id, installment_no, due_date, amount) VALUES (?,?,?,?)');
      for (let i = 1; i <= months; i++) {
        const d = new Date();
        d.setMonth(d.getMonth() + i);
        payStmt.run(fileId, i, d.toISOString().slice(0, 10), monthlySum);
      }
    }

    // سجل الحالة الابتدائي
    db.prepare(`INSERT INTO order_status_history (order_id, admin_id, username, old_status, new_status, note) VALUES (?, NULL, 'النظام', '', ?, 'تم إنشاء الطلب من المتجر')`)
      .run(orderId, config.DEFAULT_ORDER_STATUS);

    return orderId;
  });

  const orderId = tx();
  audit({
    admin: null,
    action: 'ORDER_CREATED',
    entityType: 'order',
    entityId: orderId,
    newValue: { order_number: orderNumber, phone: v.phone, total: calc.totals.grand_total },
    ip,
  });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  return { ok: true, order };
}

function getOrderWithItems(idOrNumber) {
  const order = /^\d+$/.test(String(idOrNumber))
    ? db.prepare('SELECT * FROM orders WHERE id = ?').get(idOrNumber)
    : db.prepare('SELECT * FROM orders WHERE order_number = ?').get(idOrNumber);
  if (!order) return null;
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY id').all(order.id);
  order.history = db.prepare('SELECT * FROM order_status_history WHERE order_id = ? ORDER BY id DESC').all(order.id);
  return order;
}

function changeOrderStatus(order, newStatus, admin, note = '') {
  if (!config.ORDER_STATUSES.includes(newStatus)) {
    return { ok: false, error: 'حالة غير صالحة.' };
  }
  const old = order.status;
  if (old === newStatus) return { ok: true, unchanged: true };
  db.prepare(`UPDATE orders SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(newStatus, order.id);
  db.prepare(`INSERT INTO order_status_history (order_id, admin_id, username, old_status, new_status, note) VALUES (?, ?, ?, ?, ?, ?)`)
    .run(order.id, admin ? admin.id : null, admin ? admin.username : 'النظام', old, newStatus, note);
  audit({
    admin,
    action: 'ORDER_STATUS_CHANGED',
    entityType: 'order',
    entityId: order.id,
    oldValue: old,
    newValue: newStatus,
  });
  return { ok: true, oldStatus: old, newStatus };
}

module.exports = { createOrder, getOrderWithItems, changeOrderStatus };
