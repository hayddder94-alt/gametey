'use strict';
/* توليد sitemap.xml من قاعدة البيانات — شغّله بعد كل تغيير كبير: node scripts/gen-sitemap.js */
const fs = require('fs');
const path = require('path');
const { db } = require('../src/db');

const SITE = process.env.SITE_URL || 'https://almuammal.iq';
const today = new Date().toISOString().slice(0, 10);

const urls = [
  { loc: '/', priority: '1.0' },
  { loc: '/products', priority: '0.9' },
  { loc: '/products?offers=1', priority: '0.8' },
  { loc: '/about', priority: '0.6' },
  { loc: '/contact', priority: '0.6' },
  { loc: '/track', priority: '0.5' },
];
for (const c of db.prepare('SELECT slug FROM categories WHERE is_active = 1').all()) {
  urls.push({ loc: '/products?category=' + encodeURIComponent(c.slug), priority: '0.7' });
}
for (const p of db.prepare('SELECT slug, updated_at FROM products WHERE is_active = 1').all()) {
  urls.push({ loc: '/product/' + encodeURIComponent(p.slug), priority: '0.8', lastmod: (p.updated_at || '').slice(0, 10) || today });
}

const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
  urls.map((u) =>
    '  <url><loc>' + SITE + u.loc + '</loc>' +
    (u.lastmod ? '<lastmod>' + u.lastmod + '</lastmod>' : '') +
    '<changefreq>' + (u.loc === '/' ? 'daily' : 'weekly') + '</changefreq><priority>' + u.priority + '</priority></url>'
  ).join('\n') +
  '\n</urlset>\n';

fs.writeFileSync(path.join(__dirname, '..', 'public', 'sitemap.xml'), xml);
console.log('✔ sitemap.xml:', urls.length, 'روابط');
