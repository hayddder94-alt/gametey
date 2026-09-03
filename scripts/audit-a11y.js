'use strict';
/* تدقيق إمكانية الوصول: axe-core (dequelabs) عبر jsdom على الصفحات الحية */
const { JSDOM } = require('jsdom');
const axe = require('axe-core');

const BASE = process.env.BASE || 'http://localhost:3000';
const PAGES = ['/', '/products', '/about', '/contact', '/track', '/cart', '/checkout', '/admin/login'];

async function fetchText(p) {
  const r = await fetch(BASE + p);
  return { status: r.status, html: await r.text() };
}

(async () => {
  try {
    const list = await (await fetch(BASE + '/api/products')).json();
    if (list.products && list.products[0]) PAGES.push('/product/' + encodeURIComponent(list.products[0].slug));
  } catch { /* تجاهل */ }

  let totalSerious = 0;
  const summary = [];
  for (const p of PAGES) {
    const { status, html } = await fetchText(p);
    if (status !== 200) { console.log('SKIP', p, status); continue; }
    const dom = new JSDOM(html, { pretendToBeVisual: true, url: BASE + p });
    global.window = dom.window;
    global.document = dom.window.document;
    global.Node = dom.window.Node;
    global.NodeList = dom.window.NodeList;
    global.HTMLElement = dom.window.HTMLElement;
    global.getComputedStyle = dom.window.getComputedStyle.bind(dom.window);
    try {
      axe.setup(dom.window.document);
      const res = await axe.run({
        resultTypes: ['violations'],
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] },
      });
      const serious = res.violations.filter((v) => v.impact === 'serious' || v.impact === 'critical');
      totalSerious += serious.length;
      summary.push(`${p}: ${res.violations.length} (${serious.length} serious)`);
      console.log(`\n== ${p} → ${res.violations.length} violations (${serious.length} serious/critical)`);
      for (const v of res.violations.slice(0, 10)) {
        console.log(`  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`);
        for (const n of v.nodes.slice(0, 3)) console.log('     •', String(n.html).slice(0, 90));
      }
    } finally {
      axe.teardown();
      dom.window.close();
    }
  }
  console.log('\nملخص:', summary.join(' | '));
  console.log('إجمالي serious/critical:', totalSerious);
  process.exit(0);
})().catch((e) => { console.error(e.message); process.exit(1); });
