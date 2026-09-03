'use strict';
/** إيصال طلب PDF حقيقي (pdfkit) بخط عربي — يُبنى من قاعدة البيانات فقط */
const PDFDocument = require('pdfkit');
const path = require('path');
const dayjs = require('dayjs'); // iamkun/dayjs — تنسيق تواريخ الإيصال
const { safeJson } = require('./whatsapp');

const FONT = path.join(__dirname, '..', 'node_modules', '@fontsource', 'tajawal', 'files', 'tajawal-arabic-400-normal.woff');
const FONT_BOLD = path.join(__dirname, '..', 'node_modules', '@fontsource', 'tajawal', 'files', 'tajawal-arabic-700-normal.woff');

const fmt = (n) => (Math.round(Number(n) || 0)).toLocaleString('en-US') + ' د.ع';

function buildOrderPdf(order, settings, statusAr) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: 'A4', margin: 40, bufferPages: true });
      const chunks = [];
      doc.on('data', (c) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      doc.registerFont('ar', FONT);
      doc.registerFont('arb', FONT_BOLD);
      const W = doc.page.width - 80;
      const R = (y) => y; // نرصف يدويًا باتجاه اليمين

      // الترويسة
      doc.font('arb').fontSize(18).fillColor('#0d2b45')
        .text(settings.COMPANY_NAME, 40, 40, { width: W, align: 'right' });
      doc.font('ar').fontSize(10).fillColor('#475569')
        .text(settings.COMPANY_ADDRESS, 40, 66, { width: W, align: 'right' })
        .text('هاتف/واتساب: ' + settings.COMPANY_PHONE, 40, 82, { width: W, align: 'right' });
      doc.rect(40, 104, W, 2).fill('#e0a526');

      // عنوان الإيصال
      doc.font('arb').fontSize(14).fillColor('#0d2b45')
        .text('إيصال طلب رقم: ' + order.order_number, 40, 120, { width: W, align: 'right' });
      doc.font('ar').fontSize(10).fillColor('#475569')
        .text('الحالة: ' + (statusAr || '') + '   |   التاريخ: ' + dayjs(String(order.created_at).replace(' ', 'T') + 'Z').format('YYYY-MM-DD HH:mm'), 40, 140, { width: W, align: 'right' });

      // بيانات العميل
      let y = 170;
      doc.font('arb').fontSize(12).fillColor('#0d2b45').text('بيانات العميل', 40, y, { width: W, align: 'right' });
      y += 20;
      doc.font('ar').fontSize(10).fillColor('#17233a');
      const cust = [
        ['الاسم', order.customer_name], ['الهاتف', order.customer_phone],
        ['المحافظة/المنطقة', (order.governorate || '') + ' / ' + (order.area || '')],
      ];
      if (order.landmark) cust.push(['نقطة دالة', order.landmark]);
      if (order.address) cust.push(['العنوان', order.address]);
      for (const [k, v] of cust) {
        doc.text(k + ': ' + v, 40, y, { width: W, align: 'right' });
        y += 16;
      }

      // البنود
      y += 10;
      doc.font('arb').fontSize(12).fillColor('#0d2b45').text('تفاصيل الطلب', 40, y, { width: W, align: 'right' });
      y += 22;
      (order.items || []).forEach((it, i) => {
        const opts = safeJson(it.options_snapshot);
        doc.font('arb').fontSize(10).fillColor('#0d2b45')
          .text((i + 1) + '. ' + it.product_name + '  × ' + it.quantity, 40, y, { width: W, align: 'right' });
        y += 15;
        doc.font('ar').fontSize(9).fillColor('#475569');
        if (opts.length) {
          doc.text('الخيارات: ' + opts.map((o) => o.option + ': ' + o.value).join('، '), 40, y, { width: W, align: 'right' });
          y += 14;
        }
        const pay = it.payment_method === 'CASH'
          ? 'الدفع: نقدي — الإجمالي ' + fmt(it.line_total)
          : 'الدفع: أقساط — إجمالي ' + fmt(it.installment_total + it.fees_total) + ' | دفعة أولى ' + fmt(it.down_payment_total) + ' | ' + it.months + ' أشهر × ' + fmt(it.monthly_total);
        doc.text(pay, 40, y, { width: W, align: 'right' });
        y += 20;
      });

      // الإجمالي
      doc.rect(40, y, W, 30).fill('#f8fafc');
      doc.font('arb').fontSize(13).fillColor('#0d2b45')
        .text('الإجمالي النهائي: ' + fmt(order.grand_total), 50, y + 8, { width: W - 20, align: 'right' });
      y += 45;
      if (order.notes) {
        doc.font('ar').fontSize(9).fillColor('#475569')
          .text('ملاحظات العميل: ' + order.notes, 40, y, { width: W, align: 'right' });
      }

      // تذييل بتوقيعات
      doc.font('ar').fontSize(9).fillColor('#475569')
        .text('توقيع المستلم: ____________________          توقيع مسؤول الشركة: ____________________', 40, doc.page.height - 80, { width: W, align: 'right' });

      doc.end();
    } catch (e) { reject(e); }
  });
}

module.exports = { buildOrderPdf };
