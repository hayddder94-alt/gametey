/* صفحة تفاصيل المنتج — الخيارات الديناميكية وحساب السعر المباشر */
(function () {
  'use strict';
  const P = window.PRODUCT;
  if (!P) return;

  let method = 'CASH';
  const selections = {}; // optionId -> valueId أو نص

  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  /* المعرض */
  const mainImg = $('#galleryImg');
  $$('.gallery-thumbs button').forEach((btn) => {
    btn.addEventListener('click', function () {
      $$('.gallery-thumbs button').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      mainImg.src = btn.dataset.src;
    });
  });
  const lightbox = $('#lightbox');
  if (lightbox && mainImg) {
    $('#galleryMain').addEventListener('click', function () {
      $('#lightboxImg').src = mainImg.src;
      lightbox.classList.add('open');
    });
    $('#lightboxClose').addEventListener('click', () => lightbox.classList.remove('open'));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') lightbox.classList.remove('open'); }); // د10
    lightbox.addEventListener('click', (e) => { if (e.target === lightbox) lightbox.classList.remove('open'); });
  }

  /* اختيار طريقة الدفع */
  const cashBtn = $('#methodCash');
  const instBtn = $('#methodInstallment');
  const planBox = $('#planBox');

  function setMethod(m) {
    method = m;
    cashBtn.classList.toggle('active', m === 'CASH');
    if (instBtn) instBtn.classList.toggle('active', m === 'INSTALLMENT');
    if (planBox) planBox.classList.toggle('hidden', m !== 'INSTALLMENT');
    recalc();
  }
  if (cashBtn) cashBtn.addEventListener('click', () => setMethod('CASH'));
  if (instBtn) instBtn.addEventListener('click', () => setMethod('INSTALLMENT'));

  /* الخيارات */
  $$('.option-group').forEach((group) => {
    const optId = group.dataset.optionId;
    if (group.dataset.type === 'text') {
      const input = group.querySelector('.opt-text');
      input.addEventListener('input', function () {
        selections[optId] = input.value.trim();
        recalc();
      });
    } else {
      group.querySelectorAll('.choice-btn').forEach((btn) => {
        btn.addEventListener('click', function () {
          const already = btn.classList.contains('selected');
          group.querySelectorAll('.choice-btn').forEach((b) => b.classList.remove('selected'));
          if (already) {
            delete selections[optId];
          } else {
            btn.classList.add('selected');
            selections[optId] = parseInt(btn.dataset.valueId, 10);
          }
          recalc();
        });
      });
    }
  });

  /* الكمية */
  const qtyInput = $('#qtyInput');
  if (qtyInput) {
    $('#qtyMinus').addEventListener('click', () => { qtyInput.value = Math.max(1, (parseInt(qtyInput.value, 10) || 1) - 1); recalc(); });
    $('#qtyPlus').addEventListener('click', () => { qtyInput.value = Math.min(50, (parseInt(qtyInput.value, 10) || 1) + 1); recalc(); });
    qtyInput.addEventListener('input', recalc);
  }
  function getQty() { return Math.max(1, Math.min(50, parseInt(qtyInput ? qtyInput.value : 1, 10) || 1)); }

  /* حساب السعر المباشر (للعرض فقط — الخادم يعيد الحساب دائمًا) */
  function optionsDelta() {
    let delta = 0;
    for (const opt of P.options) {
      const sel = selections[opt.id];
      if (sel === undefined || sel === '') continue;
      if (opt.input_type === 'text') continue;
      const v = opt.values.find((x) => x.id === sel);
      if (v) delta += v.price_delta;
    }
    return delta;
  }

  function recalc() {
    const qty = getQty();
    const delta = optionsDelta();
    let total;
    if (method === 'CASH') {
      const unit = Math.max(0, P.cash_price + delta - P.discount_amount) + P.fees_amount;
      total = unit * qty;
    } else {
      const unit = P.installment_price + delta + P.fees_amount;
      total = unit * qty;
    }
    const liveTotal = document.getElementById('liveTotal');
    if (liveTotal) liveTotal.textContent = ALM.formatIQD(total);
    return total;
  }

  function buildItem() {
    return { product_id: P.id, name: P.name, image: P.image, qty: getQty(), method, options: Object.assign({}, selections) };
  }

  const addBtn = $('#addToCartBtn');
  if (addBtn) {
    addBtn.addEventListener('click', function () {
      ALM.Cart.add(buildItem());
      ALM.toast('أضيف المنتج إلى السلة ✔', 'success');
    });
  }

  // د33 مشاركة عبر Web Share API مع بديل نسخ الرابط
  const shareBtn = $('#shareBtn');
  if (shareBtn) {
    shareBtn.addEventListener('click', async function () {
      const url = location.href;
      const data = { title: P.name, text: P.name + ' — ' + document.title, url };
      try {
        if (navigator.share) await navigator.share(data);
        else { await navigator.clipboard.writeText(url); ALM.toast('تم نسخ رابط المنتج', 'success'); }
      } catch { /* ألغى المستخدم */ }
    });
  }

  const orderBtn = $('#orderNowBtn');
  if (orderBtn) {
    orderBtn.addEventListener('click', function () {
      ALM.Cart.add(buildItem());
      window.location.href = '/checkout';
    });
  }

  recalc();
})();
