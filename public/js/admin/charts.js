/* رسوم بيانية SVG حقيقية تُبنى من بيانات قاعدة البيانات */
(function () {
  'use strict';
  window.Charts = window.Charts || {};

  function fmtShort(n) {
    n = Number(n) || 0;
    if (n >= 1000000) return (Math.round(n / 100000) / 10) + 'M';
    if (n >= 1000) return Math.round(n / 1000) + 'K';
    return String(Math.round(n));
  }

  /** أعمدة عمودية: data = [{label, value}] */
  Charts.bar = function (el, data, opts) {
    opts = opts || {};
    if (!el) return;
    if (!data || !data.length || data.every((d) => !d.value)) {
      el.innerHTML = '<div class="chart-empty">لا توجد بيانات كافية للعرض بعد.</div>';
      return;
    }
    const W = 560, H = 220, pad = 30, bottom = 26;
    const max = Math.max.apply(null, data.map((d) => d.value)) || 1;
    const bw = (W - pad * 2) / data.length;
    let bars = '';
    data.forEach((d, i) => {
      const h = Math.max(2, (d.value / max) * (H - pad - bottom));
      const x = pad + i * bw + bw * 0.18;
      const y = H - bottom - h;
      bars += '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw * 0.64).toFixed(1) + '" height="' + h.toFixed(1) + '" rx="4" fill="#e0a526"><title>' +
        d.label + ': ' + (opts.money ? (d.value || 0).toLocaleString('en-US') + ' د.ع' : d.value) + '</title></rect>';
      bars += '<text x="' + (pad + i * bw + bw / 2).toFixed(1) + '" y="' + (H - 8) + '" font-size="10" fill="#5b6b7c" text-anchor="middle">' + d.label + '</text>';
      if (d.value > 0) {
        bars += '<text x="' + (pad + i * bw + bw / 2).toFixed(1) + '" y="' + (y - 5).toFixed(1) + '" font-size="9" fill="#17233a" text-anchor="middle">' + fmtShort(d.value) + '</text>';
      }
    });
    el.innerHTML = '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:auto" role="img">' +
      '<line x1="' + pad + '" y1="' + (H - bottom) + '" x2="' + (W - pad) + '" y2="' + (H - bottom) + '" stroke="#e3e9f0" stroke-width="1.5"/>' +
      bars + '</svg>';
  };

  /** دائري (Donut): parts = [{label, value, color}] */
  Charts.donut = function (el, parts) {
    if (!el) return;
    const total = parts.reduce((s, p) => s + p.value, 0);
    if (!total) {
      el.innerHTML = '<div class="chart-empty">لا توجد طلبات بعد.</div>';
      return;
    }
    const R = 70, r = 42, cx = 90, cy = 90;
    let angle = -Math.PI / 2;
    let paths = '';
    parts.forEach((p) => {
      if (!p.value) return;
      const frac = p.value / total;
      const a2 = angle + frac * Math.PI * 2;
      const large = frac > 0.5 ? 1 : 0;
      const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle);
      const x2 = cx + R * Math.cos(a2), y2 = cy + R * Math.sin(a2);
      const x3 = cx + r * Math.cos(a2), y3 = cy + r * Math.sin(a2);
      const x4 = cx + r * Math.cos(angle), y4 = cy + r * Math.sin(angle);
      paths += '<path d="M' + x1.toFixed(1) + ' ' + y1.toFixed(1) + ' A' + R + ' ' + R + ' 0 ' + large + ' 1 ' + x2.toFixed(1) + ' ' + y2.toFixed(1) +
        ' L' + x3.toFixed(1) + ' ' + y3.toFixed(1) + ' A' + r + ' ' + r + ' 0 ' + large + ' 0 ' + x4.toFixed(1) + ' ' + y4.toFixed(1) + ' Z" fill="' + p.color + '"><title>' + p.label + ': ' + p.value + '</title></path>';
      angle = a2;
    });
    let legend = '';
    parts.forEach((p) => {
      legend += '<span class="legend-item"><i style="background:' + p.color + '"></i>' + p.label + ' (' + p.value + ')</span>';
    });
    el.innerHTML = '<div style="display:flex;gap:16px;align-items:center;flex-wrap:wrap">' +
      '<svg viewBox="0 0 180 180" style="width:150px;height:150px" role="img">' + paths +
      '<text x="90" y="86" text-anchor="middle" font-size="20" font-weight="800" fill="#0d2b45">' + total + '</text>' +
      '<text x="90" y="104" text-anchor="middle" font-size="10" fill="#5b6b7c">طلب</text></svg>' +
      '<div class="legend">' + legend + '</div></div>';
  };

  /** أعمدة أفقية للمنتجات الأكثر مبيعًا */
  Charts.hbar = function (el, data) {
    if (!el) return;
    if (!data || !data.length) {
      el.innerHTML = '<div class="chart-empty">لا توجد مبيعات مكتملة بعد — تُحتسب الطلبات المكتملة فقط.</div>';
      return;
    }
    const max = Math.max.apply(null, data.map((d) => d.value)) || 1;
    let html = '';
    data.forEach((d) => {
      const pct = Math.round((d.value / max) * 100);
      html += '<div class="hbar-row"><span class="hbar-label">' + d.name + '</span>' +
        '<div class="hbar-track"><div class="hbar-fill" style="width:' + Math.max(4, pct) + '%"></div></div>' +
        '<b class="hbar-val">' + d.value + '</b></div>';
    });
    el.innerHTML = html;
  };
})();
