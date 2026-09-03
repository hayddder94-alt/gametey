/* Service Worker — عمل جزئي دون اتصال وتسريع الأصول الثابتة */
const VERSION = 'alm-v3';
const CORE = ['/', '/css/style.css', '/js/main.js', '/img/logo.png', '/img/icons.svg', '/manifest.webmanifest', '/img/placeholder.svg'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then((c) => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;

  // تنقّل: شبكة أولًا مع رجوع للنسخة المخزنة عند الانقطاع
  if (e.request.mode === 'navigate') {
    e.respondWith(fetch(e.request).then((r) => { const cp = r.clone(); caches.open(VERSION).then((c) => c.put('/', cp)); return r; }).catch(() => caches.match('/')));
    return;
  }
  // أصول ثابتة: تخزين مع تحديث بالخلفية
  if (/\/(img|uploads|css|js)\//.test(url.pathname)) {
    e.respondWith(
      caches.match(e.request).then((hit) => {
        const net = fetch(e.request).then((r) => { if (r.ok) caches.open(VERSION).then((c) => c.put(e.request, r.clone())); return r; }).catch(() => hit);
        return hit || net;
      })
    );
  }
});
