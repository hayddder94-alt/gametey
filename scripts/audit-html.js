'use strict';
/* تدقيق معايير HTML: html-validate على الصفحات الحية */
const { HtmlValidate } = require('html-validate');
const BASE = process.env.BASE || 'http://localhost:3000';
const PAGES = ['/', '/products', '/about', '/contact', '/track', '/cart', '/admin/login'];

const hv = new HtmlValidate({
  extends: ['html-validate:recommended'],
  rules: {
    'no-inline-style': 'off',
    'no-raw-characters': 'off',
    'long-title': 'off',
    'require-sri': 'off',
    'no-trailing-whitespace': 'off',
    'attr-quotes': 'off',
    'tel-non-breaking': 'off',
    'no-redundant-for': 'off',
  },
});

(async () => {
  let total = 0;
  for (const p of PAGES) {
    const r = await fetch(BASE + p);
    const html = await r.text();
    const rep = await hv.validateString(html);
    const errs = rep.results.flatMap((x) => x.messages).filter((m) => m.severity >= 2);
    total += errs.length;
    console.log(`\n== ${p} → ${errs.length} errors`);
    for (const m of errs.slice(0, 6)) console.log(`  L${m.line}:${m.column} ${m.ruleId}: ${m.message}`);
  }
  console.log('\nإجمالي أخطاء html-validate:', total);
})().catch((e) => { console.error(e.message); process.exit(1); });
