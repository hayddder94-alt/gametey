/* لوحة الإدارة — أدوات مشتركة */
(function () {
  'use strict';

  window.AdminAPI = {
    async post(url, body) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body || {}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'فشلت العملية.');
      return data;
    },
    async del(url) {
      const res = await fetch(url, { method: 'DELETE' });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'فشلت العملية.');
      return data;
    },
  };

  /* ---------- القناة اللحظية: طلبات جديدة تصل للوحة فور حدوثها ---------- */
  if (window.io) {
    const socket = io({ transports: ['websocket', 'polling'] });
    socket.on('connect_error', function () { /* جلسة غير مصرحة أو اتصال مقطوع */ });
    socket.on('order:new', function (d) {
      ALM.toast('طلب جديد #' + d.order_number + ' — ' + ALM.formatIQD(d.grand_total), 'success');
      const el = document.getElementById('liveNewCount');
      if (el) el.textContent = String((parseInt(el.textContent, 10) || 0) + 1);
      const bell = document.getElementById('liveBell');
      if (bell) bell.style.display = '';
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    /* تسجيل الخروج */
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', async function () {
        try { await AdminAPI.post('/api/admin/logout'); } catch { /* تجاهل */ }
        window.location.href = '/admin/login';
      });
    }

    /* القائمة الجانبية للجوال */
    const sideToggle = document.getElementById('sideToggle');
    const side = document.getElementById('adminSide');
    if (sideToggle && side) {
      sideToggle.addEventListener('click', () => side.classList.toggle('open'));
    }

    /* حذف منتج */
    document.querySelectorAll('[data-delete-product]').forEach((btn) => {
      btn.addEventListener('click', async function () {
        if (!confirm('هل أنت متأكد من حذف المنتج "' + btn.dataset.name + '"؟ لا يمكن التراجع.')) return;
        try {
          await AdminAPI.del('/api/admin/products/' + btn.dataset.deleteProduct);
          ALM.toast('تم حذف المنتج ', 'success');
          setTimeout(() => location.reload(), 500);
        } catch (err) { ALM.toast(err.message, 'error'); }
      });
    });

    /* التصنيفات */
    const newCatForm = document.getElementById('newCatForm');
    if (newCatForm) {
      newCatForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const fd = new FormData(newCatForm);
        try {
          await AdminAPI.post('/api/admin/categories', {
            name: fd.get('name'), description: fd.get('description'), sort_order: fd.get('sort_order'),
          });
          ALM.toast('أضيف التصنيف ', 'success');
          setTimeout(() => location.reload(), 500);
        } catch (err) { ALM.toast(err.message, 'error'); }
      });
    }

    document.querySelectorAll('[data-edit-cat]').forEach((btn) => {
      btn.addEventListener('click', async function () {
        const name = prompt('اسم التصنيف:', btn.dataset.name);
        if (name === null) return;
        const sort = prompt('الترتيب:', btn.dataset.sort);
        const active = confirm('اضغط موافق ليكون التصنيف مفعلًا، إلغاء لإيقافه.');
        try {
          await AdminAPI.post('/api/admin/categories/' + btn.dataset.editCat, {
            name, description: btn.dataset.desc, sort_order: sort || btn.dataset.sort, is_active: active ? '1' : '0',
          });
          ALM.toast('تم التعديل ', 'success');
          setTimeout(() => location.reload(), 500);
        } catch (err) { ALM.toast(err.message, 'error'); }
      });
    });

    document.querySelectorAll('[data-delete-cat]').forEach((btn) => {
      btn.addEventListener('click', async function () {
        if (!confirm('حذف التصنيف "' + btn.dataset.name + '"؟ المنتجات ستبقى بدون تصنيف.')) return;
        try {
          await AdminAPI.del('/api/admin/categories/' + btn.dataset.deleteCat);
          ALM.toast('تم حذف التصنيف ', 'success');
          setTimeout(() => location.reload(), 500);
        } catch (err) { ALM.toast(err.message, 'error'); }
      });
    });

    /* الطلبات — تغيير الحالة والملاحظات */
    const saveStatusBtn = document.getElementById('saveStatusBtn');
    if (saveStatusBtn) {
      saveStatusBtn.addEventListener('click', async function () {
        const status = document.getElementById('statusSelect').value;
        try {
          await AdminAPI.post('/api/admin/orders/' + saveStatusBtn.dataset.orderId + '/status', { status });
          ALM.toast('تم تحديث حالة الطلب ', 'success');
          setTimeout(() => location.reload(), 500);
        } catch (err) { ALM.toast(err.message, 'error'); }
      });
    }
    const saveNotesBtn = document.getElementById('saveNotesBtn');
    if (saveNotesBtn) {
      saveNotesBtn.addEventListener('click', async function () {
        const notes = document.getElementById('internalNotes').value;
        try {
          await AdminAPI.post('/api/admin/orders/' + saveNotesBtn.dataset.orderId + '/notes', { internal_notes: notes });
          ALM.toast('تم حفظ الملاحظات ', 'success');
        } catch (err) { ALM.toast(err.message, 'error'); }
      });
    }

    /* الحسابات */
    document.querySelectorAll('[data-reset-pass]').forEach((btn) => {
      btn.addEventListener('click', async function () {
        const pass = prompt('كلمة المرور الجديدة للمستخدم "' + btn.dataset.name + '" (8 أحرف على الأقل):');
      if (typeof pass !== 'string') return; // ألغى المستخدم الحوار
        try {
          await AdminAPI.post('/api/admin/users/' + btn.dataset.resetPass + '/password', { password: pass });
          ALM.toast('تم تغيير كلمة المرور ', 'success');
        } catch (err) { ALM.toast(err.message, 'error'); }
      });
    });

    document.querySelectorAll('[data-toggle-user]').forEach((btn) => {
      btn.addEventListener('click', async function () {
        const isActive = btn.dataset.active === '1';
        if (!confirm(isActive ? 'تعطيل حساب "' + btn.dataset.name + '"؟' : 'تفعيل حساب "' + btn.dataset.name + '"؟')) return;
        try {
          await AdminAPI.post('/api/admin/users/' + btn.dataset.toggleUser + '/toggle-active');
          ALM.toast('تم ', 'success');
          setTimeout(() => location.reload(), 500);
        } catch (err) { ALM.toast(err.message, 'error'); }
      });
    });

    /* الإعدادات */
    const settingsForm = document.getElementById('settingsForm');
    if (settingsForm) {
      settingsForm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const fd = new FormData(settingsForm);
        const body = {};
        fd.forEach((v, k) => { body[k] = v; });
        try {
          await AdminAPI.post('/api/admin/settings', body);
          ALM.toast('تم حفظ الإعدادات ', 'success');
        } catch (err) { ALM.toast(err.message, 'error'); }
      });
    }

    /* مسح سجل العمليات */
    const clearAuditBtn = document.getElementById('clearAuditBtn');
    if (clearAuditBtn) {
      clearAuditBtn.addEventListener('click', async function () {
        if (!confirm('هل أنت متأكد من مسح سجل العمليات بالكامل؟ لا يمكن التراجع.')) return;
        try {
          await AdminAPI.del('/api/admin/audit-logs');
          ALM.toast('تم مسح السجل ', 'success');
          setTimeout(() => location.reload(), 500);
        } catch (err) { ALM.toast(err.message, 'error'); }
      });
    }
  });
})();
