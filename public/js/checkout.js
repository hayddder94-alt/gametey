/* مراجعة الطلب + إدخال بيانات العميل */
(function () {
  'use strict';
  const script = document.currentScript;
  const mode = script ? script.dataset.mode : 'review';

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function summaryHtml(quote) {
    let rows = '';
    if (quote.totals.cash_total > 0) rows += `<div class="sum-row"><span>إجمالي الدفع النقدي</span><b>${ALM.formatIQD(quote.totals.cash_total)}</b></div>`;
    if (quote.totals.installment_total > 0) rows += `<div class="sum-row"><span>إجمالي التقسيط</span><b>${ALM.formatIQD(quote.totals.installment_total)}</b></div>`;
    if (quote.totals.discount_total > 0) rows += `<div class="sum-row" style="color:var(--green-2)"><span>الخصومات</span><b>- ${ALM.formatIQD(quote.totals.discount_total)}</b></div>`;
    if (quote.totals.fees_total > 0) rows += `<div class="sum-row"><span>الرسوم الإضافية</span><b>${ALM.formatIQD(quote.totals.fees_total)}</b></div>`;
    return rows;
  }

  /* ---------- وضع المراجعة ---------- */
  if (mode === 'review') {
    const area = document.getElementById('reviewItems');
    const summaryBox = document.getElementById('reviewSummary');

    (async function () {
      const items = ALM.Cart.all();
      if (!items.length) {
        area.innerHTML = '<div class="empty-state"><div class="big">🛒</div><h3>سلتك فارغة</h3><a class="btn btn-gold" href="/products">تصفح المنتجات</a></div>';
        return;
      }
      let quote;
      try { quote = await ALM.quoteCart(items); } catch {
        area.innerHTML = '<div class="alert alert-error">تعذر تحميل المراجعة. أعد المحاولة.</div>';
        return;
      }
      let html = '';
      quote.lines.forEach((line) => {
        const optsText = line.option_details.length
          ? line.option_details.map((o) => esc(o.option) + ': ' + esc(o.value) + (o.price_delta ? ' (+' + ALM.formatIQD(o.price_delta) + ')' : '')).join(' • ')
          : 'بدون خيارات';
        let payBlock;
        if (line.method === 'CASH') {
          payBlock = `<div class="opts"><svg class='ic' aria-hidden='true'><use href='/img/icons.svg#i-cash'></use></svg> دفع نقدي${line.discount_per_unit > 0 ? ' — خصم ' + ALM.formatIQD(line.discount_per_unit * line.quantity) : ''}</div>`;
        } else {
          payBlock = `<div class="opts"><svg class='ic' aria-hidden='true'><use href='/img/icons.svg#i-card'></use></svg> بالتقسيط — الإجمالي ${ALM.formatIQD(line.installment_total + line.line_fees)}
            ${line.down_payment_total > 0 ? '<br>الدفعة الأولى: ' + ALM.formatIQD(line.down_payment_total) : ''}
            <br>عدد الأقساط: ${line.months} أشهر — القسط الشهري: ${ALM.formatIQD(line.monthly_total)}</div>`;
        }
        html += `
          <div class="cart-item">
            <img src="${line.image || '/img/placeholder.svg'}" alt="${esc(line.name)}">
            <div>
              <h3>${esc(line.name)} <span class="tag">× ${line.quantity}</span></h3>
              <div class="opts">الخيارات: ${optsText}</div>
              ${payBlock}
              <div class="line-price mt-1">${ALM.formatIQD(line.line_total)}</div>
            </div>
          </div>`;
      });
      if (quote.errors.length) {
        html += '<div class="alert alert-error">⚠ توجد مشكلة في بعض البنود. <a href="/cart">ارجع إلى السلة</a> لإصلاحها.</div>';
      }
      area.innerHTML = ALM.safeHtml(html);
      summaryBox.style.display = '';
      document.getElementById('summaryRows').innerHTML = summaryHtml(quote);
      document.getElementById('grandTotal').textContent = ALM.formatIQD(quote.totals.grand_total);
      const btn = document.getElementById('continueBtn');
      const ok = quote.errors.length === 0 && quote.lines.length > 0;
      btn.disabled = !ok;
      btn.onclick = function () { if (ok) window.location.href = '/checkout/details'; };
    })();
    return;
  }

  /* ---------- وضع بيانات العميل ---------- */
  const miniSummary = document.getElementById('miniSummary');

  (async function () {
    const items = ALM.Cart.all();
    if (!items.length) { window.location.href = '/cart'; return; }
    try {
      const quote = await ALM.quoteCart(items);
      if (!quote.lines.length || quote.errors.length) { window.location.href = '/cart'; return; }
      let rows = '';
      quote.lines.forEach((line) => {
        rows += `<div class="sum-row"><span>${esc(line.name)} × ${line.quantity}<br><small class="text-muted">${line.method === 'CASH' ? '💵 نقدي' : '💳 تقسيط'}</small></span><b>${ALM.formatIQD(line.line_total)}</b></div>`;
      });
      document.getElementById('miniRows').innerHTML = rows;
      document.getElementById('grandTotal').textContent = ALM.formatIQD(quote.totals.grand_total);
      miniSummary.style.display = '';
    } catch { /* نكمل، الخادم سيعيد الحساب */ }
  })();

  /* إظهار ملف أهلية التقسيط عند وجود بند تقسيط في السلة */
  (function () {
    const hasInst = ALM.Cart.all().some(function (i) { return i.method === 'INSTALLMENT'; });
    const fs = document.getElementById('installmentEligibility');
    if (fs && hasInst) fs.style.display = '';
  })();

  /* قناع إدخال رقم الهاتف (nosir/cleave.js) */
  if (window.Cleave) {
    const phoneField = form.querySelector('[name="phone"]');
    if (phoneField) new Cleave(phoneField, { blocks: [4, 3, 4], delimiter: ' ', numericOnly: true });
  }

  /* ---------- خريطة Leaflet لتثبيت الموقع ---------- */
  if (window.L && document.getElementById('orderMap')) {
    const map = L.map('orderMap').setView([32.028, 44.330], 12);
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    let marker = null;
    function setPoint(lat, lng) {
      if (marker) marker.setLatLng([lat, lng]); else marker = L.marker([lat, lng]).addTo(map);
      map.setView([lat, lng], 15);
      const link = 'https://maps.google.com/?q=' + lat.toFixed(6) + ',' + lng.toFixed(6);
      locationInput.value = link;
      locationHint.innerHTML = '✔ تم تثبيت الموقع: <a href="' + link + '" target="_blank" rel="noopener">عرض</a>';
    }
    map.on('click', function (e) { setPoint(e.latlng.lat, e.latlng.lng); });
    window.__almSetPoint = setPoint;
  }

  /* تحديد الموقع الجغرافي */
  const locateBtn = document.getElementById('locateBtn');
  const locationInput = document.getElementById('locationLink');
  const locationHint = document.getElementById('locationHint');
  locateBtn.addEventListener('click', function () {
    if (!navigator.geolocation) {
      locationHint.textContent = 'المتصفح لا يدعم تحديد الموقع.';
      return;
    }
    locateBtn.disabled = true;
    locateBtn.textContent = '⏳ جارٍ تحديد الموقع...';
    navigator.geolocation.getCurrentPosition(
      function (pos) {
        const link = 'https://maps.google.com/?q=' + pos.coords.latitude.toFixed(6) + ',' + pos.coords.longitude.toFixed(6);
        locationInput.value = link;
        locationHint.innerHTML = '✔ تم تحديد موقعك: <a href="' + link + '" target="_blank" rel="noopener">' + link + '</a>';
        if (window.__almSetPoint) window.__almSetPoint(pos.coords.latitude, pos.coords.longitude);
        locateBtn.innerHTML = '<svg class=\'ic\' aria-hidden=\'true\'><use href=\'/img/icons.svg#i-check\'></use></svg> تم تحديد موقعي';
        locateBtn.disabled = false;
      },
      function () {
        locationHint.textContent = 'تعذر تحديد الموقع. تأكد من منح إذن الوصول للموقع.';
        locateBtn.innerHTML = '<svg class=\'ic\' aria-hidden=\'true\'><use href=\'/img/icons.svg#i-pin\'></use></svg> تحديد موقعي الحالي';
        locateBtn.disabled = false;
      },
      { enableHighAccuracy: true, timeout: 12000 }
    );
  });

  /* إرسال الطلب */
  const form = document.getElementById('customerForm');
  const submitBtn = document.getElementById('submitOrderBtn');

  function setFieldError(fieldName, message) {
    const wrap = document.getElementById('f-' + fieldName);
    if (!wrap) return;
    wrap.classList.toggle('invalid', !!message);
    const errEl = wrap.querySelector('.field-error');
    if (errEl) errEl.textContent = message || '';
  }

  /**
   * تحويل موثوق: لا نوافذ منبثقة إطلاقًا (تُحظر في المعاينة والجوالات).
   * الحفظ أولًا ثم التحويل في نفس التبويب إلى صفحة النجاح التي تتولى التحويل إلى واتساب.
   */
  form.addEventListener('submit', async function (e) {
    e.preventDefault();
    const fd = new FormData(form);
    const customer = {
      name: fd.get('name'), phone: fd.get('phone'), governorate: fd.get('governorate'),
      area: fd.get('area'), landmark: fd.get('landmark'), address: fd.get('address'),
      location_link: fd.get('location_link'), notes: fd.get('notes'),
      employment_type: fd.get('employment_type') || undefined,
      employee_name: '', employer: fd.get('employer') || '',
      bank: fd.get('bank') || undefined,
      guarantor_name: fd.get('guarantor_name') || '', letter_ref: '',
    };
    ['name', 'phone', 'governorate', 'area', 'landmark', 'address', 'location_link', 'notes'].forEach((f) => setFieldError(f.replace('location_link', 'location'), ''));

    submitBtn.disabled = true;
    submitBtn.innerHTML = '<svg class="ic" aria-hidden="true"><use href="/img/icons.svg#i-clock"></use></svg> جارٍ حفظ الطلب…';

    // مفتاح منع الازدواج: ثابت بين محاولات الإرسال لنفس السلة، يُمسح بعد النجاح
    let idem = sessionStorage.getItem('alm_idem');
    if (!idem) {
      idem = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2);
      sessionStorage.setItem('alm_idem', idem);
    }

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customer, idem, items: ALM.Cart.all().map((i) => ({ product_id: i.product_id, qty: i.qty, method: i.method, options: i.options })) }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.errors) {
          for (const [field, msg] of Object.entries(data.errors)) {
            setFieldError(field === 'location_link' ? 'location' : field, msg);
          }
          const firstBad = document.querySelector('.field.invalid input, .field.invalid select, .field.invalid textarea'); // د35
          if (firstBad) firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        throw new Error(data.error || 'تعذر إنشاء الطلب.');
      }

      ALM.Cart.saveLastOrder(data.order_number, customer.phone);
      ALM.Cart.clear();
      sessionStorage.removeItem('alm_idem'); // الطلب اكتمل — يسمح بطلب جديد لاحقًا
      // التحويل لنفس التبويب — لا يُحظر أبدًا
      window.location.href = '/order/success/' + encodeURIComponent(data.order_number) +
        '?t=' + encodeURIComponent(data.success_token || '');
    } catch (err) {
      ALM.toast(err.message || 'تعذر إنشاء الطلب. حاول مرة أخرى.', 'error');
      submitBtn.disabled = false;
      submitBtn.innerHTML = '<svg class=\'ic\' aria-hidden=\'true\'><use href=\'/img/icons.svg#i-whatsapp\'></use></svg> إنشاء الطلب وإتمامه عبر واتساب';
    }
  });
})();
