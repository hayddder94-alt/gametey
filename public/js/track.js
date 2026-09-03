/* تتبع الطلبات برقم الهاتف */
(function () {
  'use strict';
  const btn = document.getElementById('trackBtn');
  const input = document.getElementById('trackPhone');
  const results = document.getElementById('trackResults');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function load() {
    const phone = input.value.trim();
    if (!phone) { ALM.toast('أدخل رقم الهاتف أولًا.', 'error'); return; }
    btn.disabled = true;
    btn.textContent = '⏳ جارٍ البحث…';
    results.innerHTML = '<div class="skeleton" style="height:90px"></div>';
    try {
      const res = await fetch('/api/orders/track?phone=' + encodeURIComponent(phone));
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'تعذر البحث.');
      if (!data.orders.length) {
        results.innerHTML = '<div class="empty-state"><div class="big"><svg class="ic ic-xl" aria-hidden="true"><use href="/img/icons.svg#i-inbox"></use></svg></div><h3>لا توجد طلبات على هذا الرقم</h3><p>ربما طلبت برقم مختلف، أو لم تُنشئ طلبًا بعد.</p><a class="btn btn-gold" href="/products">تصفح المنتجات</a></div>';
        return;
      }
      let html = '<h3 style="text-align:center;color:var(--navy)">طلباتك (' + data.orders.length + ')</h3>';
      data.orders.forEach((o) => {
        html += `
          <div class="cart-item" style="grid-template-columns:1fr">
            <div>
              <h3 style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
                <span dir="ltr">#${esc(o.order_number)}</span>
                <span class="status-pill st-${esc(o.status)}">${esc(o.status_ar)}</span>
              </h3>
              <div class="opts">${esc(o.items_count)} منتج — الإجمالي: <b>${ALM.formatIQD(o.grand_total)}</b></div>
              <div class="opts">تاريخ الطلب: ${esc(o.created_at)}</div>
              <div class="cart-item-actions">
                <a class="btn btn-green btn-sm" target="_blank" rel="noopener"
                   href="https://wa.me/${window.WA_NUMBER}?text=${encodeURIComponent('السلام عليكم، استفسار عن طلبي رقم ' + o.order_number)}"><svg class='ic' aria-hidden='true'><use href='/img/icons.svg#i-whatsapp'></use></svg> استفسار عن هذا الطلب</a>
              </div>
            </div>
          </div>`;
      });
      results.innerHTML = ALM.safeHtml(html);
    } catch (err) {
      results.innerHTML = '<div class="alert alert-error">' + esc(err.message) + '</div>';
    } finally {
      btn.disabled = false;
      btn.textContent = '🔎 عرض حالة طلباتي';
    }
  }

  btn.addEventListener('click', load);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') load(); });
})();
