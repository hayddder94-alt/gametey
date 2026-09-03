/* تعديل بيانات الحسابات الإدارية الثلاثة */
(function () {
  'use strict';
  document.querySelectorAll('[data-edit-user]').forEach(function (btn) {
    btn.addEventListener('click', async function () {
      const username = prompt('اسم المستخدم:', btn.dataset.username);
      if (username === null) return;
      const email = prompt('البريد الإلكتروني:', btn.dataset.email);
      if (email === null) return;
      const full_name = prompt('الاسم الظاهر:', btn.dataset.name);
      if (full_name === null) return;
      try {
        await AdminAPI.post('/api/admin/users/' + btn.dataset.editUser, { username, email, full_name });
        ALM.toast('تم حفظ بيانات الحساب', 'success');
        setTimeout(function () { location.reload(); }, 500);
      } catch (err) { ALM.toast(err.message, 'error'); }
    });
  });
})();
