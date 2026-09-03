'use strict';
/**
 * بذر البيانات الأولية: تصنيفات ومنتجات واقعية لشركة المؤمل.
 * يعمل مرة واحدة (يتخطى الموجود مسبقًا عبر الأسماء الفريدة).
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { db, audit } = require('./db');
const { uniqueSlug } = require('./utils');

const CATEGORIES = [
  { name: 'أجهزة التبريد والتكييف', description: 'ثلاجات، فريزرات، سبلت ومبردات هواء', sort: 1, image: '/img/products/fridge.jpg', icon: '🧊' },
  { name: 'كهربائيات المطبخ', description: 'طباخات، ميكروويف، خلاطات وكل ما يخص المطبخ', sort: 2, image: '/img/products/cooker.jpg', icon: '🍳' },
  { name: 'أجهزة الغسيل', description: 'غسالات أوتوماتيك وعادية', sort: 3, image: '/img/products/washer.jpg', icon: '🧺' },
  { name: 'شاشات وإلكترونيات', description: 'تلفازات سمارت وأجهزة إلكترونية', sort: 4, image: '/img/products/tv.jpg', icon: '📺' },
  { name: 'الأثاث المنزلي', description: 'كنب، أسرّة وغرف نوم', sort: 5, image: '/img/products/sofa.jpg', icon: '🛋️' },
  { name: 'أدوات منزلية', description: 'أدوات المطبخ والمنزل اليومية', sort: 6, image: '/img/products/kitchen-set.jpg', icon: '🍽️' },
];

const PRODUCTS = [
  {
    name: 'ثلاجة 18 قدم بابين - نوفروست',
    category: 'أجهزة التبريد والتكييف',
    short: 'ثلاجة عائلية بسعة كبيرة، تبريد سريع بدون تجميد، موفرة للطاقة.',
    description: 'ثلاجة 18 قدم بابين مع تقنية النوفروست التي تمنع تراكم الثلج. تبريد سريع ومتساوٍ في جميع الأرفف، مع أدراج واسعة للخضروات ومساحات تخزين كبيرة تناسب العائلة. محرك هادئ وموفر للطاقة مع ضمان شامل.',
    specs: 'السعة: 18 قدم\nالباب: بابان (فريزر علوي)\nنوع التبريد: نوفروست بدون تجميد\nاللون: فضي / أسود (حسب الاختيار)\nالضمان: سنة كاملة',
    image: '/img/products/fridge.jpg',
    cash: 850000, discount: 0, fees: 0,
    inst: { price: 950000, down: 190000, months: 6 },
    featured: true, offer: false, stock: 'IN_STOCK',
    options: [
      { name: 'اللون', required: true, values: [ { label: 'فضي', delta: 0 }, { label: 'أسود', delta: 25000 } ] },
    ],
  },
  {
    name: 'فريزر عمودي 6 أدراج',
    category: 'أجهزة التبريد والتكييف',
    short: 'فريزر عائلي 6 أدراج، تجميد سريع وسعة تخزين ممتازة.',
    description: 'فريزر عمودي بستة أدراج واسعة لتخزين اللحوم والخضروات والمجمدات. تجميد سريع وعميق، وإضاءة داخلية مع تحكم بدرجة التجميد.',
    specs: 'عدد الأدراج: 6 أدراج\nنوع التجميد: سريع وعميق\nاللون: أبيض',
    image: '/img/products/freezer.jpg',
    cash: 650000, discount: 0, fees: 0,
    inst: { price: 730000, down: 130000, months: 6 },
    featured: false, offer: false, stock: 'IN_STOCK',
    options: [],
  },
  {
    name: 'سبليت 1.5 طن مع التوصيل والنصب',
    category: 'أجهزة التبريد والتكييف',
    short: 'سبليت توفير طاقة مع النصب والتوصيل مجانًا داخل النجف.',
    description: 'جهاز تبريد سبليت بقوة 1.5 طن مع خدمة التوصيل والنصب مجانًا داخل محافظة النجف. تبريد سريع وتوزيع ممتاز للهواء مع وضع التوفير الليلي.',
    specs: 'القدرة: 1.5 طن (متوفر 2 طن)\nالتركيب: مشمول داخل النجف\nالضمان: سنة على الجهاز + 5 سنوات على الضاغط',
    image: '/img/products/ac.jpg',
    cash: 700000, discount: 0, fees: 0,
    inst: { price: 780000, down: 150000, months: 6 },
    featured: true, offer: false, stock: 'IN_STOCK',
    options: [
      { name: 'الحجم', required: true, values: [ { label: '1.5 طن', delta: 0 }, { label: '2 طن', delta: 90000 } ] },
    ],
  },
  {
    name: 'مبردة هواء كبيرة متنقلة',
    category: 'أجهزة التبريد والتكييف',
    short: 'مبردة هواء قوية بعجلات متنقلة، مناسبة للغرف والحدائق.',
    description: 'مبردة هواء كبيرة بخزان ماء واسع وألواح تبريد عسلية، تعمل بكفاءة في الأجواء الجافة مع عجلات سهلة التنقل.',
    specs: 'النوع: مبردة هواء متنقلة\nخزان الماء: كبير\nالعجلات: نعم',
    image: '/img/products/cooler.jpg',
    cash: 185000, discount: 15000, fees: 0,
    inst: null,
    featured: false, offer: true, stock: 'IN_STOCK',
    options: [],
  },
  {
    name: 'غسالة أوتوماتيك 8 كغم',
    category: 'أجهزة الغسيل',
    short: 'غسالة تحميل أمامي 8 كغم ببرامج غسيل متعددة وتوفير ماء.',
    description: 'غسالة أوتوماتيك تحميل أمامي بسعة 8 كغم، لوحة تحكم رقمية وبرامج غسيل متعددة منها الغسيل السريع والاقتصادي. محرك هادئ وعمر تشغيلي طويل.',
    specs: 'السعة: 8 كغم\nالنوع: تحميل أمامي أوتوماتيك\nالبرامج: متعددة + اقتصادي + سريع',
    image: '/img/products/washer.jpg',
    cash: 520000, discount: 0, fees: 0,
    inst: { price: 590000, down: 110000, months: 6 },
    featured: true, offer: false, stock: 'IN_STOCK',
    options: [
      { name: 'اللون', required: false, values: [ { label: 'أبيض', delta: 0 }, { label: 'فضي', delta: 15000 } ] },
    ],
  },
  {
    name: 'طباخ غاز 4 شعلات مع فرن',
    category: 'كهربائيات المطبخ',
    short: 'طباخ غاز ستانلس مع فرن وشواية وأمان كامل.',
    description: 'طباخ غاز ستانلس ستيل بأربع شعلات وفرن واسع مع شواية. نظام أمان كامل يقطع الغاز عند انطفاء الشعلة، وإشعال ذاتي.',
    specs: 'الشعلات: 4 (متوفر 5 شعلات)\nالفرن: واسع مع شواية\nالأمان: قاطع غاز أوتوماتيكي',
    image: '/img/products/cooker.jpg',
    cash: 265000, discount: 0, fees: 0,
    inst: { price: 300000, down: 60000, months: 6 },
    featured: false, offer: false, stock: 'IN_STOCK',
    options: [
      { name: 'الحجم', required: true, values: [ { label: '4 شعلات', delta: 0 }, { label: '5 شعلات', delta: 35000 } ] },
    ],
  },
  {
    name: 'ميكروويف 30 لتر مع شواية',
    category: 'كهربائيات المطبخ',
    short: 'ميكروويف 30 لتر بشواية وتحكم رقمي وطبخ مسبق.',
    description: 'ميكروويف سعة 30 لتر مع شواية علوية، تحكم رقمي سهل، وقوائم طبخ مسبقة لأشهر الأطباق.',
    specs: 'السعة: 30 لتر\nالشواية: نعم\nالتحكم: رقمي',
    image: '/img/products/microwave.jpg',
    cash: 145000, discount: 10000, fees: 0,
    inst: null,
    featured: false, offer: true, stock: 'IN_STOCK',
    options: [],
  },
  {
    name: 'خلاط كهربائي 3 في 1 - 1000 واط',
    category: 'كهربائيات المطبخ',
    short: 'خلاط، مفرمة ومطحنة بقوة 1000 واط وشفرات ستانلس.',
    description: 'طقم خلاط 3 في 1: إبريق خلاط كبير، مفرمة لحوم وخضار، ومطحنة توابل. قوة 1000 واط وشفرات ستانلس ستيل حادة.',
    specs: 'القوة: 1000 واط\nالقطع: 3 (خلاط + مفرمة + مطحنة)\nالشفرات: ستانلس ستيل',
    image: '/img/products/blender.jpg',
    cash: 65000, discount: 0, fees: 0,
    inst: null,
    featured: false, offer: false, stock: 'IN_STOCK',
    options: [],
  },
  {
    name: 'تلفاز سمارت 55 بوصة 4K',
    category: 'شاشات وإلكترونيات',
    short: 'شاشة سمارت 4K بنظام أندرويد مع واي فاي وريموت ذكي.',
    description: 'تلفاز ذكي بدقة 4K ونظام أندرويد يتيح تنزيل التطبيقات ومشاهدة يوتيوب ومنصات البث. إطارات نحيفة وصوت محيطي واضح. متوفر بأحجام 43 و50 و55 بوصة.',
    specs: 'الدقة: 4K UHD\nالنظام: أندرويد سمارت\nالاتصال: واي فاي + 3 HDMI + USB',
    image: '/img/products/tv.jpg',
    cash: 615000, discount: 0, fees: 0,
    inst: { price: 690000, down: 135000, months: 6 },
    featured: true, offer: false, stock: 'IN_STOCK',
    options: [
      { name: 'الحجم', required: true, values: [ { label: '43 بوصة', delta: -140000 }, { label: '50 بوصة', delta: -70000 }, { label: '55 بوصة', delta: 0 } ] },
    ],
  },
  {
    name: 'مروحة عمودية بالريموت',
    category: 'أدوات منزلية',
    short: 'مروحة عمودية 18 إنش بالريموت و3 سرعات وتايمر.',
    description: 'مروحة عمودية 18 إنش مع ريموت تحكم، 3 سرعات وتايمر إيقاف تلقائي، وارتفاع قابل للتعديل.',
    specs: 'الحجم: 18 إنش\nالريموت: نعم\nالتايمر: حتى 7.5 ساعة',
    image: '/img/products/fan.jpg',
    cash: 45000, discount: 0, fees: 0,
    inst: null,
    featured: false, offer: false, stock: 'LOW_STOCK',
    options: [],
  },
  {
    name: 'طقم كنب 7 قطع (3+3+1)',
    category: 'الأثاث المنزلي',
    short: 'طقم كنب فاخر 7 قطع بقماش مخملي وهيكل خشب زان.',
    description: 'طقم كنب فاخر مكوّن من كنبتي 3 مقاعد وكرسيين مفردة وطاولة وسط. هيكل خشب زان متين وإسفنج عالي الكثافة مع قماش مخملي بألوان أنيقة.',
    specs: 'القطع: 3+3+1+1+طاولة\nالهيكل: خشب زان\nالقماش: مخمل (حسب الاختيار)',
    image: '/img/products/sofa.jpg',
    cash: 1150000, discount: 0, fees: 0,
    inst: { price: 1300000, down: 250000, months: 6 },
    featured: true, offer: false, stock: 'IN_STOCK',
    options: [
      { name: 'لون القماش', required: true, values: [ { label: 'رمادي', delta: 0 }, { label: 'كحلي', delta: 0 }, { label: 'بيج فاخر', delta: 20000 } ] },
    ],
  },
  {
    name: 'سرير مزدوج مع مرتبة طبية',
    category: 'الأثاث المنزلي',
    short: 'سرير مزدوج خشب تركي مع مرتبة طبية مريحة.',
    description: 'سرير مزدوج من الخشب التركي عالي الجودة مع مرتبة طبية داعمة للظهر. متوفر بحجم مزدوج وكنج.',
    specs: 'الحجم: مزدوج / كنج (حسب الاختيار)\nالخشب: تركي عالي الجودة\nالمرتبة: طبية مشمولة',
    image: '/img/products/bed.jpg',
    cash: 480000, discount: 0, fees: 0,
    inst: { price: 540000, down: 100000, months: 6 },
    featured: false, offer: false, stock: 'IN_STOCK',
    options: [
      { name: 'الحجم', required: true, values: [ { label: 'مزدوج', delta: 0 }, { label: 'كنج', delta: 70000 } ] },
    ],
  },
  {
    name: 'طقم أدوات مطبخ 12 قطعة',
    category: 'أدوات منزلية',
    short: 'طقم أدوات مطبخ ستانلس 12 قطعة مع حامل أنيق.',
    description: 'طقم أدوات مطبخ متكامل من الستانلس ستيل: 12 قطعة مع حامل أنيق يضيف لمسة عصرية لمطبخك.',
    specs: 'القطع: 12 قطعة + حامل\nالخامة: ستانلس ستيل',
    image: '/img/products/kitchen-set.jpg',
    cash: 25000, discount: 0, fees: 0,
    inst: null,
    featured: true, offer: false, stock: 'IN_STOCK',
    options: [],
  },
  {
    name: 'مكواة بخار كهربائية',
    category: 'أدوات منزلية',
    short: 'مكواة بخار بقاعدة سيراميك وقوة 2200 واط.',
    description: 'مكواة بخار بقاعدة سيراميك مانعة للالتصاق، قوة 2200 واط مع رشاش ماء وضبط حرارة لكل الأقمشة.',
    specs: 'القوة: 2200 واط\nالقاعدة: سيراميك\nالبخار: مستمر + دفعة قوية',
    image: '/img/products/iron.jpg',
    cash: 38000, discount: 0, fees: 0,
    inst: null,
    featured: false, offer: false, stock: 'OUT_OF_STOCK',
    options: [],
  },
  {
    name: 'براد ماء كهربائي حار وبارد',
    category: 'أجهزة التبريد والتكييف',
    short: 'براد ماء بخزانين حار وبارد مع خزانة سفلية.',
    description: 'براد ماء كهربائي بثلاثة صنابير (حار، بارد، عادي) وخزانة سفلية للتخزين، مناسب للبيوت والمكاتب.',
    specs: 'التبريد: بارد وحار وعادي\nالصنابير: 3',
    image: '/img/products/water-cooler.jpg',
    cash: 210000, discount: 20000, fees: 10000, feesLabel: 'أجور التوصيل',
    inst: { price: 240000, down: 50000, months: 6 },
    featured: false, offer: true, stock: 'IN_STOCK',
    options: [],
  },
];

function seed() {
  const catIds = {};
  for (const c of CATEGORIES) {
    const existing = db.prepare('SELECT id FROM categories WHERE name = ?').get(c.name);
    if (existing) {
      catIds[c.name] = existing.id;
      continue;
    }
    const slug = uniqueSlug(c.name, (s) => !!db.prepare('SELECT 1 FROM categories WHERE slug = ?').get(s));
    const info = db.prepare('INSERT INTO categories (name, slug, description, image, sort_order) VALUES (?,?,?,?,?)')
      .run(c.name, slug, c.description, c.image && fs.existsSync(path.join(config.root, 'public', c.image)) ? c.image : '', c.sort);
    catIds[c.name] = info.lastInsertRowid;
    console.log('[seed] تصنيف:', c.name);
  }

  for (const p of PRODUCTS) {
    const existing = db.prepare('SELECT id FROM products WHERE name = ?').get(p.name);
    if (existing) continue;

    const slug = uniqueSlug(p.name, (s) => !!db.prepare('SELECT 1 FROM products WHERE slug = ?').get(s));
    const info = db.prepare(`
      INSERT INTO products (name, slug, short_description, description, specs, category_id, cash_price, discount_amount,
        fees_amount, fees_label, installment_enabled, installment_price, down_payment, installment_months, monthly_payment,
        stock_status, is_active, is_featured, on_offer)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,1,?,?)
    `).run(
      p.name, slug, p.short, p.description, p.specs, catIds[p.category] || null, p.cash, p.discount,
      p.fees || 0, p.feesLabel || '',
      p.inst ? 1 : 0,
      p.inst ? p.inst.price : 0,
      p.inst ? p.inst.down : 0,
      p.inst ? p.inst.months : 0,
      0, // يُحسب القسط الشهري تلقائيًا
      p.stock, p.featured ? 1 : 0, p.offer ? 1 : 0
    );
    const productId = info.lastInsertRowid;

    // الصورة
    if (p.image && fs.existsSync(path.join(config.root, 'public', p.image))) {
      db.prepare('INSERT INTO product_images (product_id, path, is_primary, sort_order) VALUES (?,?,1,0)')
        .run(productId, p.image);
    }

    // الخيارات
    (p.options || []).forEach((opt, oi) => {
      const oInfo = db.prepare('INSERT INTO product_options (product_id, name, input_type, required, is_active, sort_order) VALUES (?,?,?,?,1,?)')
        .run(productId, opt.name, 'select', opt.required ? 1 : 0, oi);
      opt.values.forEach((v, vi) => {
        db.prepare('INSERT INTO product_option_values (option_id, label, price_delta, is_active, sort_order) VALUES (?,?,?,1,?)')
          .run(oInfo.lastInsertRowid, v.label, v.delta || 0, vi);
      });
    });

    console.log('[seed] منتج:', p.name);
  }

  audit({ admin: null, action: 'SEED_COMPLETED', entityType: 'catalog', entityId: '', newValue: { products: PRODUCTS.length, categories: CATEGORIES.length } });
  console.log('[seed] اكتمل بذر البيانات.');
}

if (require.main === module) {
  seed();
}

module.exports = seed;
