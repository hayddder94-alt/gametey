/* رسوم لوحة التحكم — Chart.js (chartjs/Chart.js) ببيانات حقيقية من قاعدة البيانات */
(function () {
  'use strict';
  const D = window.DASH || {};
  if (!window.Chart) return;
  Chart.defaults.font.family = "'Tajawal','IBM Plex Sans Arabic',Tahoma,sans-serif";
  Chart.defaults.color = '#475569';
  const GOLD = '#e0a526', NAVY = '#0d2b45', GREEN = '#16a34a', RED = '#dc2626';
  const fmtIQD = (n) => Number(n || 0).toLocaleString('en-US') + ' د.ع';

  const daily = D.daily || [];
  new Chart(document.getElementById('chartDaily'), {
    type: 'bar',
    data: {
      labels: daily.map((d) => d.label),
      datasets: [{ label: 'مبيعات مكتملة', data: daily.map((d) => d.value), backgroundColor: GOLD, borderRadius: 5 },
                 { label: 'عدد الطلبات', data: daily.map((d) => d.count), backgroundColor: NAVY, borderRadius: 5, yAxisID: 'y1' }],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => c.dataset.yAxisID === 'y1' ? c.parsed.y + ' طلب' : fmtIQD(c.parsed.y) } } },
      scales: { y: { ticks: { callback: (v) => (v >= 1000 ? v / 1000 + 'K' : v) } }, y1: { position: 'left', grid: { drawOnChartArea: false }, ticks: { stepSize: 1 } } },
    },
  });

  const monthly = D.monthly || [];
  new Chart(document.getElementById('chartMonthly'), {
    type: 'line',
    data: { labels: monthly.map((m) => m.label), datasets: [{ label: 'المبيعات الشهرية', data: monthly.map((m) => m.value), borderColor: NAVY, backgroundColor: 'rgba(224,165,38,.25)', fill: true, tension: .35, pointBackgroundColor: GOLD }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' }, tooltip: { callbacks: { label: (c) => fmtIQD(c.parsed.y) } } }, scales: { y: { ticks: { callback: (v) => (v >= 1000 ? v / 1000 + 'K' : v) } } } },
  });

  const top = D.topProducts || [];
  new Chart(document.getElementById('chartTop'), {
    type: 'bar',
    data: { labels: top.map((t) => t.name), datasets: [{ label: 'الكمية المباعة', data: top.map((t) => t.qty), backgroundColor: NAVY, borderRadius: 5 }] },
    options: { indexAxis: 'y', responsive: true, plugins: { legend: { display: false } } },
  });

  const split = D.split || {};
  new Chart(document.getElementById('chartSplit'), {
    type: 'doughnut',
    data: { labels: ['مكتملة', 'ملغاة', 'قيد المتابعة'], datasets: [{ data: [split.completed || 0, split.cancelled || 0, split.active || 0], backgroundColor: [GREEN, RED, GOLD] }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });
})();
