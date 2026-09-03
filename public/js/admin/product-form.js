/* نموذج المنتج — الخيارات الديناميكية، رفع الصور، الحفظ */
(function () {
  'use strict';
  const form = document.getElementById('productForm');
  const productId = form.dataset.productId;
  const optionsBuilder = document.getElementById('optionsBuilder');
  const alertBox = document.getElementById('formAlert');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function showAlert(msg, type) {
    alertBox.innerHTML = '<div class="alert alert-' + (type || 'info') + '">' + esc(msg) + '</div>';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ---------- تفعيل/إخفاء حقول التقسيط ---------- */
  const instToggle = document.getElementById('installmentToggle');
  const instFields = document.getElementById('installmentFields');
  instToggle.addEventListener('change', () => {
    instFields.style.display = instToggle.checked ? '' : 'none';
  });

  /* ---------- باني الخيارات الديناميكية ---------- */
  let optionsState = (window.PRODUCT_OPTIONS || []).map((o) => ({
    id: o.id || null,
    name: o.name,
    input_type: o.input_type,
    required: !!o.required,
    is_active: o.is_active !== 0,
    values: (o.values || []).map((v) => ({ id: v.id, label: v.label, price_delta: v.price_delta, is_active: v.is_active !== 0 })),
  }));

  function renderOptions() {
    optionsBuilder.innerHTML = '';
    optionsState.forEach((opt, idx) => {
      const block = document.createElement('div');
      block.className = 'opt-block';
      block.innerHTML = `
        <div class="opt-block-head">
          <input type="text" placeholder="اسم الخيار (مثال: اللون)" value="${esc(opt.name)}" data-field="name">
          <select data-field="input_type" style="padding:8px;border:1.5px solid var(--line);border-radius:8px">
            <option value="select" ${opt.input_type === 'select' ? 'selected' : ''}>قائمة اختيار</option>
            <option value="color" ${opt.input_type === 'color' ? 'selected' : ''}>ألوان</option>
            <option value="text" ${opt.input_type === 'text' ? 'selected' : ''}>حقل نصي</option>
          </select>
          <label class="check-label"><input type="checkbox" data-field="required" ${opt.required ? 'checked' : ''}> مطلوب</label>
          <label class="check-label"><input type="checkbox" data-field="is_active" ${opt.is_active ? 'checked' : ''}> مفعل</label>
          <button type="button" class="btn btn-red btn-sm" data-act="remove-option">حذف</button>
          ${idx > 0 ? '<button type="button" class="btn btn-ghost btn-sm" data-act="up">▲</button>' : ''}
          ${idx < optionsState.length - 1 ? '<button type="button" class="btn btn-ghost btn-sm" data-act="down">▼</button>' : ''}
        </div>
        <div class="opt-values" data-values></div>
        ${opt.input_type !== 'text' ? '<button type="button" class="btn btn-outline btn-sm" data-act="add-value">＋ إضافة قيمة</button>' : ''}
      `;

      block.querySelector('[data-field="name"]').addEventListener('input', (e) => { opt.name = e.target.value; });
      block.querySelector('[data-field="input_type"]').addEventListener('change', (e) => {
        opt.input_type = e.target.value;
        renderOptions();
      });
      block.querySelector('[data-field="required"]').addEventListener('change', (e) => { opt.required = e.target.checked; });
      block.querySelector('[data-field="is_active"]').addEventListener('change', (e) => { opt.is_active = e.target.checked; });

      block.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', function () {
          const act = btn.dataset.act;
          if (act === 'remove-option') { optionsState.splice(idx, 1); renderOptions(); }
          if (act === 'up') { [optionsState[idx - 1], optionsState[idx]] = [optionsState[idx], optionsState[idx - 1]]; renderOptions(); }
          if (act === 'down') { [optionsState[idx + 1], optionsState[idx]] = [optionsState[idx], optionsState[idx + 1]]; renderOptions(); }
          if (act === 'add-value') { opt.values.push({ id: null, label: '', price_delta: 0, is_active: true }); renderOptions(); }
        });
      });

      const valuesWrap = block.querySelector('[data-values]');
      if (opt.input_type !== 'text') {
        opt.values.forEach((v, vIdx) => {
          const row = document.createElement('div');
          row.className = 'val-row';
          row.innerHTML = `
            <input type="text" placeholder="اسم القيمة (مثال: أسود)" value="${esc(v.label)}">
            <input type="number" step="250" placeholder="فرق السعر" value="${v.price_delta}" title="سعر إضافي عند اختيار هذه القيمة (يمكن أن يكون سالبًا)">
            <button type="button" class="btn btn-red btn-sm" title="حذف القيمة">✕</button>
          `;
          row.children[0].addEventListener('input', (e) => { v.label = e.target.value; });
          row.children[1].addEventListener('input', (e) => { v.price_delta = parseInt(e.target.value, 10) || 0; });
          row.children[2].addEventListener('click', () => { opt.values.splice(vIdx, 1); renderOptions(); });
          valuesWrap.appendChild(row);
        });
      }

      optionsBuilder.appendChild(block);
    });
  }

  document.getElementById('addOptionBtn').addEventListener('click', function () {
    optionsState.push({ id: null, name: '', input_type: 'select', required: false, is_active: true, values: [{ id: null, label: '', price_delta: 0, is_active: true }] });
    renderOptions();
  });
  renderOptions();

  /* ---------- الحفظ ---------- */
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const fd = new FormData(form);
    const body = {};
    fd.forEach((v, k) => {
      if (k === 'is_active') body[k] = v;
      else body[k] = v;
    });
    if (!fd.get('is_active')) body.is_active = '0';
    if (!fd.get('installment_enabled')) body.installment_enabled = '0';
    body.options_json = JSON.stringify(optionsState.filter((o) => o.name.trim()));

    const saveBtn = document.getElementById('saveBtn');
    saveBtn.disabled = true;
    try {
      if (productId) {
        await AdminAPI.post('/api/admin/products/' + productId, body);
        showAlert('تم حفظ التعديلات بنجاح', 'success');
      } else {
        const res = await AdminAPI.post('/api/admin/products', body);
        showAlert('تمت إضافة المنتج بنجاح — أكمل الآن رفع الصور.', 'success');
        setTimeout(() => { window.location.href = '/admin/products/' + res.id + '/edit'; }, 900);
        return;
      }
    } catch (err) {
      showAlert(err.message, 'error');
    } finally {
      saveBtn.disabled = false;
    }
  });

  /* ---------- إدارة الصور ---------- */
  if (productId) {
    let images = window.PRODUCT_IMAGES || [];
    const imagesGrid = document.getElementById('imagesGrid');
    const dropZone = document.getElementById('dropZone');
    const imageInput = document.getElementById('imageInput');

    function renderImages() {
      imagesGrid.innerHTML = '';
      images.forEach((img) => {
        const div = document.createElement('div');
        div.className = 'img-thumb';
        div.innerHTML = `
          ${img.is_primary ? '<span class="primary-flag">رئيسية</span>' : ''}
          <img src="${img.path}" alt="">
          <div class="img-actions">
            ${!img.is_primary ? '<button type="button" class="btn btn-navy btn-sm" data-act="primary" style="background:var(--navy-3)">اجعلها الرئيسية</button>' : ''}
            <button type="button" class="btn btn-red btn-sm" data-act="delete">حذف</button>
          </div>
        `;
        div.querySelector('[data-act="delete"]').addEventListener('click', async function () {
          if (!confirm('حذف هذه الصورة؟')) return;
          try {
            await AdminAPI.del('/api/admin/images/' + img.id);
            images = images.filter((i) => i.id !== img.id);
            renderImages();
            ALM.toast('حذفت الصورة', 'success');
          } catch (err) { ALM.toast(err.message, 'error'); }
        });
        const primaryBtn = div.querySelector('[data-act="primary"]');
        if (primaryBtn) {
          primaryBtn.addEventListener('click', async function () {
            try {
              await AdminAPI.post('/api/admin/images/' + img.id + '/primary');
              images.forEach((i) => { i.is_primary = i.id === img.id ? 1 : 0; });
              renderImages();
            } catch (err) { ALM.toast(err.message, 'error'); }
          });
        }
        imagesGrid.appendChild(div);
      });
    }

    async function uploadFiles(files) {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('image', file);
        try {
          const res = await fetch('/api/admin/products/' + productId + '/images', { method: 'POST', body: fd });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'فشل رفع الصورة.');
          images.push({ id: data.image.id, path: data.image.path, is_primary: data.image.is_primary });
        } catch (err) { ALM.toast(err.message, 'error'); }
      }
      renderImages();
      ALM.toast('تم رفع الصور', 'success');
    }

    dropZone.addEventListener('click', () => imageInput.click());
    imageInput.addEventListener('change', () => { uploadFiles(imageInput.files); imageInput.value = ''; });
    dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('drag'); });
    dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag'));
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag');
      if (e.dataTransfer.files.length) uploadFiles(e.dataTransfer.files);
    });

    renderImages();
  }
})();
