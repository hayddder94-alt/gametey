/* صفحة نجاح الطلب — تحويل موثوق إلى واتساب:
   عدّاد تلقائي + زر بنفس التبويب/بكل المتصفح (_top) لا تُحظر كمنبثقات */
(function () {
  'use strict';
  const info = window.ORDER_INFO;
  const token = window.WA_TOKEN;
  const last = ALM.Cart.lastOrder();
  const phone = last && last.order_number === info.order_number ? last.phone : null;

  const summaryEl = document.getElementById('orderSummary');
  const waStep = document.getElementById('waStep');
  const linkEl = document.getElementById('sendWhatsappLink');
  const newTabLink = document.getElementById('waNewTabLink');
  const cancelBtn = document.getElementById('waCancelBtn');
  const countdownBox = document.getElementById('waCountdownBox');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function markSent() {
    const body = token ? { t: token } : { phone: phone };
    fetch('/api/orders/' + encodeURIComponent(info.order_number) + '/whatsapp-sent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(function () { /* غير حرج */ });
  }

  const guardKey = 'alm_wa_auto_' + info.order_number;
  function setGuard() { try { sessionStorage.setItem(guardKey, '1'); } catch { /* تجاهل */ } }
  function hasGuard() { try { return sessionStorage.getItem(guardKey) === '1'; } catch { return false; } }

  // الزر الرئيسي: يسمح بالانتقال الافتراضي (_top يفلت من أي إطار معاينة) ويوثق الإرسال
  linkEl.addEventListener('click', function () {
    setGuard();
    markSent();
    document.getElementById('waDone').style.display = '';
  });
  newTabLink.addEventListener('click', function () {
    setGuard();
    markSent();
  });
  cancelBtn.addEventListener('click', function () {
    setGuard();
    stopCountdown();
    countdownBox.style.display = 'none';
  });

  let timer = null;
  function stopCountdown() { if (timer) clearInterval(timer); }
  function startCountdown() {
    const link = linkEl.getAttribute('href');
    if (!link || link === '#' || hasGuard()) { countdownBox.style.display = 'none'; return; }
    let n = 3;
    const countEl = document.getElementById('waCount');
    timer = setInterval(function () {
      n -= 1;
      if (countEl) countEl.textContent = String(n);
      if (n <= 0) {
        stopCountdown();
        setGuard();
        markSent();
        document.getElementById('waDone').style.display = '';
        window.location.href = link; // نفس التبويب — لا يُحظر أبدًا
      }
    }, 1000);
  }

  // تفعيل عبر هاتف العميل عند الفتح المباشر بلا توقيع
  if (!token && phone) {
    fetch('/api/orders/' + encodeURIComponent(info.order_number) + '/whatsapp-message?phone=' + encodeURIComponent(phone))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.link) {
          linkEl.href = data.link;
          linkEl.style.pointerEvents = '';
          linkEl.style.opacity = '';
          newTabLink.href = data.link;
          newTabLink.style.pointerEvents = '';
          newTabLink.style.opacity = '';
          waStep.style.display = '';
          startCountdown();
        }
      })
      .catch(function () { /* يبقى الطلب محفوظًا */ });
  } else if (token) {
    startCountdown();
  }

  // ملخص الطلب
  const q = token ? ('?t=' + encodeURIComponent(token)) : ('?phone=' + encodeURIComponent(phone || ''));
  (async function () {
    try {
      const res = await fetch('/api/orders/' + encodeURIComponent(info.order_number) + '/summary' + q);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      let html = '<div class="mb-1"><b>أهلًا ' + esc(data.customer_name) + '</b> — حالة الطلب: <span class="status-pill st-' + data.status + '">' + esc(data.status_ar) + '</span></div>';
      data.items.forEach(function (it) {
        const opts = it.options.length
          ? it.options.map(function (o) { return esc(o.option) + ': ' + esc(o.value); }).join(' • ')
          : 'بدون خيارات';
        html += '<div class="cart-item" style="margin-bottom:10px">' +
          '<img src="' + (it.image || '/img/placeholder.svg') + '" alt="' + esc(it.name) + '">' +
          '<div><h3>' + esc(it.name) + ' <span class="tag">× ' + it.quantity + '</span></h3>' +
          '<div class="opts">' + opts + '</div>' +
          '<div class="opts">' + (it.payment_method === 'CASH' ? '<svg class="ic" aria-hidden="true"><use href="/img/icons.svg#i-cash"></use></svg> نقدي' : '<svg class="ic" aria-hidden="true"><use href="/img/icons.svg#i-card"></use></svg> تقسيط' + (it.months ? ' — ' + it.months + ' أشهر × ' + ALM.formatIQD(it.monthly_total) : '')) + '</div>' +
          '<div class="line-price">' + ALM.formatIQD(it.line_total) + '</div></div></div>';
      });
      html += '<div class="sum-row total"><span>إجمالي الطلب</span><span>' + ALM.formatIQD(data.grand_total) + '</span></div>';
      summaryEl.innerHTML = ALM.safeHtml(html);
    } catch {
      summaryEl.innerHTML = '<div class="alert alert-info">تم إنشاء طلبك بنجاح وهو محفوظ لدينا برقمه أعلاه.</div>';
    }
  })();
})();
