/* إدارة دفتر التقسيط: حفظ الأهلية/الكتاب + تسجيل التسديد */
(function () {
  'use strict';
  const form = document.getElementById('fileForm');
  const msg = document.getElementById('fileMsg');
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const fd = new FormData(form);
    const body = {};
    fd.forEach((v, k) => { body[k] = v; });
    try {
      const r = await AdminAPI.post('/api/admin/files/' + window.FILE_ID, body);
      msg.innerHTML = '<div class="alert alert-success">تم الحفظ ✔ ' + (r.file_no ? 'رقم الدفتر: ' + r.file_no : '') + '</div>';
      setTimeout(function () { location.reload(); }, 700);
    } catch (err) {
      msg.innerHTML = '<div class="alert alert-error">' + err.message + '</div>';
    }
  });

  document.querySelectorAll('[data-pay]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      if (!confirm('تسجيل تسديد القسط رقم ' + btn.dataset.pay + ' بمبلغ ' + Number(btn.dataset.amount).toLocaleString('en-US') + ' د.ع؟')) return;
      try {
        await AdminAPI.post('/api/admin/files/' + window.FILE_ID + '/pay/' + btn.dataset.pay, { amount: btn.dataset.amount });
        ALM.toast('سُجل التسديد ✔', 'success');
        setTimeout(function () { location.reload(); }, 600);
      } catch (err) { ALM.toast(err.message, 'error'); }
    });
  });
})();
