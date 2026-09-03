/* متجر شركة المؤمل — أدوات المتجر العامة */
(function () {
  'use strict';

  window.ALM = window.ALM || {};

  ALM.safeHtml = function (h) { return window.DOMPurify ? window.DOMPurify.sanitize(h) : h; };
  ALM.formatIQD = function (n) {
    return Math.round(Number(n) || 0).toLocaleString('en-US') + ' د.ع';
  };

  /* ---------- التنبيهات ---------- */
  ALM.toast = function (message, type) {
    const wrap = document.getElementById('toastWrap');
    if (!wrap) return;
    const el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = message;
    wrap.appendChild(el);
    setTimeout(function () {
      el.style.opacity = '0';
      el.style.transition = 'opacity .3s';
      setTimeout(function () { el.remove(); }, 320);
    }, 2600);
  };

  /* ---------- السلة (محفوظة في Local Storage) ---------- */
  const CART_KEY = 'alm_cart_v1';
  const LAST_ORDER_KEY = 'alm_last_order_v1';

  const Cart = {
    all() {
      try {
        const raw = localStorage.getItem(CART_KEY);
        const items = raw ? JSON.parse(raw) : [];
        return Array.isArray(items) ? items : [];
      } catch { return []; }
    },
    save(items) {
      localStorage.setItem(CART_KEY, JSON.stringify(items));
      Cart.updateBadge();
      document.dispatchEvent(new CustomEvent('cart:changed'));
    },
    clear() { Cart.save([]); },
    count() { return Cart.all().reduce((s, i) => s + (i.qty || 0), 0); },
    itemKey(productId, method, options) {
      return productId + ':' + method + ':' + JSON.stringify(options || {});
    },
    add(item) {
      const items = Cart.all();
      const key = Cart.itemKey(item.product_id, item.method, item.options);
      const existing = items.find((i) => i.key === key);
      if (existing) {
        existing.qty = Math.min(50, existing.qty + item.qty);
      } else {
        item.key = key;
        items.push(item);
      }
      Cart.save(items);
    },
    updateQty(key, qty) {
      const items = Cart.all();
      const it = items.find((i) => i.key === key);
      if (it) it.qty = Math.max(1, Math.min(50, qty));
      Cart.save(items);
    },
    updateMethod(key, method) {
      const items = Cart.all();
      const it = items.find((i) => i.key === key);
      if (!it) return;
      it.method = method;
      const newKey = Cart.itemKey(it.product_id, method, it.options);
      const conflict = items.find((i) => i.key === newKey && i.key !== key);
      if (conflict) {
        conflict.qty = Math.min(50, conflict.qty + it.qty);
        Cart.save(items.filter((i) => i.key !== key));
      } else {
        it.key = newKey;
        Cart.save(items);
      }
    },
    remove(key) { Cart.save(Cart.all().filter((i) => i.key !== key)); },
    updateBadge() {
      const badge = document.getElementById('cartBadge');
      if (!badge) return;
      const c = Cart.count();
      badge.textContent = c;
      badge.style.display = c > 0 ? 'flex' : 'none';
    },
    saveLastOrder(orderNumber, phone) {
      localStorage.setItem(LAST_ORDER_KEY, JSON.stringify({ order_number: orderNumber, phone }));
    },
    lastOrder() {
      try { return JSON.parse(localStorage.getItem(LAST_ORDER_KEY)); } catch { return null; }
    },
  };
  ALM.Cart = Cart;

  ALM.quoteCart = async function (items) {
    const res = await fetch('/api/cart/quote', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items.map((i) => ({ product_id: i.product_id, qty: i.qty, method: i.method, options: i.options })) }),
    });
    if (!res.ok) throw new Error('quote failed');
    return res.json();
  };

  /* ---------- الإضافة السريعة من البطاقات ---------- */
  document.addEventListener('click', function (e) {
    const btn = e.target.closest('[data-quick-add]');
    if (!btn) return;
    if (btn.dataset.hasOptions === '1') {
      window.location.href = '/product/' + btn.dataset.slug;
      return;
    }
    const productId = parseInt(btn.dataset.quickAdd, 10);
    Cart.add({ product_id: productId, qty: 1, method: 'CASH', options: {} });
    ALM.toast('أضيف المنتج إلى السلة', 'success');
  });

  // كشف ناعم بالتمرير (aosjs) مع احترام تقليل الحركة
  if (window.AOS) {
    window.AOS.init({
      once: true,
      duration: 450,
      easing: 'ease-out-cubic',
      disable: function () { return window.matchMedia('(prefers-reduced-motion: reduce)').matches; },
    });
  }

  // د31 عودة للأعلى + د34 نبضة العداد عند الإضافة
  (function () {
    const toTop = document.getElementById('toTop');
    if (toTop) {
      window.addEventListener('scroll', function () { toTop.style.display = window.scrollY > 600 ? 'flex' : 'none'; }, { passive: true });
      toTop.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    }
    document.addEventListener('cart:changed', function () {
      const b = document.getElementById('cartBadge');
      if (b) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
    });
  })();

  Cart.updateBadge();
  // العداد يُحدَّث بعد اكتمال DOM (السكربت يُحمَّل في head قبل رسم الهيدر)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { Cart.updateBadge(); });
  }
})();
