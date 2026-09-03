/* صفحة السلة — عرض البنود، تعديل الكميات والخيارات، الحذف، والإجمالي */
(function () {
  'use strict';
  const area = document.getElementById('cartItemsArea');
  const summary = document.getElementById('cartSummary');
  const summaryRows = document.getElementById('summaryRows');
  const grandTotalEl = document.getElementById('grandTotal');

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  async function render() {
    const items = ALM.Cart.all();
    if (!items.length) {
      summary.style.display = 'none';
      area.innerHTML =
        '<div class="empty-state"><div class="big"><svg class="ic ic-xl" aria-hidden="true"><use href="/img/icons.svg#i-cart"></use></svg></div><h3>سلتك فارغة</h3><p>تصفح منتجاتنا وأضف ما يعجبك.</p><a class="btn btn-gold" href="/products">تصفح المنتجات</a></div>';
      return;
    }

    let quote;
    try {
      quote = await ALM.quoteCart(items);
    } catch {
      area.innerHTML = '<div class="alert alert-error">تعذر تحميل السلة. تحقق من اتصالك وأعد المحاولة.</div>';
      return;
    }

    // مطابقة البنود المقتبسة مع بنود السلة بالترتيب
    let html = '';
    quote.lines.forEach((line) => {
      const item = items[line.index];
      if (!item) return;
      const optsText = line.option_details.length
        ? line.option_details.map((o) => esc(o.option) + ': ' + esc(o.value) + (o.price_delta ? ' (+' + ALM.formatIQD(o.price_delta) + ')' : '')).join(' • ')
        : 'بدون خيارات';
      const planNote = line.method === 'INSTALLMENT'
        ? `<div class="opts"><svg class='ic' aria-hidden='true'><use href='/img/icons.svg#i-card'></use></svg> تقسيط: دفعة أولى ${ALM.formatIQD(line.down_payment_total)} ثم ${line.months} أشهر × ${ALM.formatIQD(line.monthly_total)}</div>`
        : '';
      html += `
        <div class="cart-item">
          <img src="${line.image || '/img/placeholder.svg'}" alt="${esc(line.name)}">
          <div>
            <h3>${esc(line.name)}</h3>
            <div class="opts">${optsText}</div>
            ${planNote}
            <div class="cart-item-actions">
              <div class="qty-ctrl">
                <button type="button" data-act="dec" data-key="${esc(item.key)}">−</button>
                <input type="number" value="${line.quantity}" min="1" max="50" data-qty-key="${esc(item.key)}" inputmode="numeric">
                <button type="button" data-act="inc" data-key="${esc(item.key)}">+</button>
              </div>
              <span class="line-price">${ALM.formatIQD(line.line_total)}</span>
              <a class="btn btn-ghost btn-sm" href="/product/${line.slug}">تعديل الخيارات</a>
              <button class="btn btn-red btn-sm" data-act="remove" data-key="${esc(item.key)}">حذف</button>
            </div>
          </div>
        </div>`;
    });

    if (quote.errors && quote.errors.length) {
      html += '<div class="alert alert-error"><svg class="ic" aria-hidden="true"><use href="/img/icons.svg#i-alert"></use></svg> ' + quote.errors.map((e) => esc(e.error)).join(' ') + ' — احذف البند غير المتوفر للمتابعة.</div>';
      // بطاقات للبنود المعطوبة مع زر حذف فعّال حتى لا تتعطل السلة
      quote.errors.forEach((e) => {
        const bad = items[e.index];
        if (!bad) return;
        html += `
          <div class="cart-item" style="opacity:.75">
            <img src="/img/placeholder.svg" alt="">
            <div>
              <h3>${esc(bad.name || 'منتج غير متوفر')}</h3>
              <div class="opts" style="color:var(--red)">${esc(e.error)}</div>
              <div class="cart-item-actions">
                <button class="btn btn-red btn-sm" data-act="remove" data-key="${esc(bad.key)}">حذف من السلة</button>
              </div>
            </div>
          </div>`;
      });
    }

    area.innerHTML = ALM.safeHtml(html);
    summary.style.display = '';

    let rowsHtml = '';
    if (quote.totals.cash_total > 0) rowsHtml += `<div class="sum-row"><span>إجمالي الدفع النقدي</span><b>${ALM.formatIQD(quote.totals.cash_total)}</b></div>`;
    if (quote.totals.installment_total > 0) rowsHtml += `<div class="sum-row"><span>إجمالي التقسيط</span><b>${ALM.formatIQD(quote.totals.installment_total)}</b></div>`;
    if (quote.totals.discount_total > 0) rowsHtml += `<div class="sum-row" style="color:var(--green-2)"><span>الخصومات</span><b>- ${ALM.formatIQD(quote.totals.discount_total)}</b></div>`;
    if (quote.totals.fees_total > 0) rowsHtml += `<div class="sum-row"><span>الرسوم الإضافية</span><b>${ALM.formatIQD(quote.totals.fees_total)}</b></div>`;
    summaryRows.innerHTML = ALM.safeHtml(rowsHtml);
    grandTotalEl.textContent = ALM.formatIQD(quote.totals.grand_total);

    const proceed = document.getElementById('proceedBtn');
    const ok = quote.errors.length === 0 && quote.lines.length > 0;
    proceed.disabled = !ok;
    proceed.onclick = function () {
      if (ok) window.location.href = '/checkout';
    };
  }

  document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const key = btn.dataset.key;
    const items = ALM.Cart.all();
    const item = items.find((i) => i.key === key);
    if (!item) return;
    if (btn.dataset.act === 'inc') ALM.Cart.updateQty(key, item.qty + 1);
    if (btn.dataset.act === 'dec') ALM.Cart.updateQty(key, item.qty - 1);
    if (btn.dataset.act === 'remove') { ALM.Cart.remove(key); ALM.toast('حذف المنتج من السلة'); }
    render();
  });

  document.addEventListener('change', function (e) {
    if (e.target.matches('[data-qty-key]')) {
      ALM.Cart.updateQty(e.target.dataset.qtyKey, parseInt(e.target.value, 10) || 1);
      render();
    }
  });

  render();
})();
