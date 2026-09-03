'use strict';
const { db } = require('./db');

/** استعلامات واجهة المتجر */

function listCategories({ activeOnly = true } = {}) {
  const sql = `
    SELECT c.*, (SELECT COUNT(*) FROM products p WHERE p.category_id = c.id AND p.is_active = 1) AS products_count
    FROM categories c ${activeOnly ? 'WHERE c.is_active = 1' : ''}
    ORDER BY c.sort_order, c.id
  `;
  return db.prepare(sql).all();
}

function getCategoryBySlug(slug) {
  return db.prepare('SELECT * FROM categories WHERE slug = ?').get(slug);
}

function primaryImage(productId) {
  const row = db.prepare(
    'SELECT path FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order, id LIMIT 1'
  ).get(productId);
  return row ? row.path : '';
}

function listProducts({
  q = '', category = '', inStockOnly = false, offersOnly = false, featuredOnly = false,
  sort = 'newest', page = 1, perPage = 12, includeInactive = false,
} = {}) {
  const where = [];
  const params = {};
  if (!includeInactive) where.push('p.is_active = 1');
  if (q) {
    q = q.slice(0, 100);
    where.push('(p.name LIKE @q OR p.short_description LIKE @q OR p.description LIKE @q)');
    params.q = `%${q}%`;
  }
  if (category) {
    where.push('c.slug = @cat');
    params.cat = category;
  }
  if (inStockOnly) where.push("p.stock_status != 'OUT_OF_STOCK'");
  if (offersOnly) where.push('(p.discount_amount > 0 OR p.on_offer = 1)');
  if (featuredOnly) where.push('p.is_featured = 1');

  const sortMap = {
    newest: 'p.id DESC',
    oldest: 'p.id ASC',
    price_asc: '(p.cash_price - p.discount_amount) ASC',
    price_desc: '(p.cash_price - p.discount_amount) DESC',
    popular: 'p.orders_count DESC, p.views DESC',
  };
  const orderBy = sortMap[sort] || sortMap.newest;

  const countRow = db.prepare(`
    SELECT COUNT(*) AS c FROM products p LEFT JOIN categories c ON c.id = p.category_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
  `).get(params);
  const total = countRow.c;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const safePage = Math.min(Math.max(1, page), pages);

  const rows = db.prepare(`
    SELECT p.*, c.name AS category_name, c.slug AS category_slug
    FROM products p
    LEFT JOIN categories c ON c.id = p.category_id
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY ${orderBy}
    LIMIT @limit OFFSET @offset
  `).all({ ...params, limit: perPage, offset: (safePage - 1) * perPage });

  for (const r of rows) {
    r.image = primaryImage(r.id);
    r.has_required_options = !!db.prepare(
      'SELECT 1 FROM product_options WHERE product_id = ? AND required = 1 AND is_active = 1 LIMIT 1'
    ).get(r.id);
  }
  return { rows, total, page: safePage, pages, perPage };
}

function getProductBySlug(slug) {
  const p = db.prepare('SELECT p.*, c.name AS category_name, c.slug AS category_slug FROM products p LEFT JOIN categories c ON c.id = p.category_id WHERE p.slug = ?').get(slug);
  if (!p) return null;
  p.images = db.prepare('SELECT * FROM product_images WHERE product_id = ? ORDER BY is_primary DESC, sort_order, id').all(p.id);
  p.image = p.images.length ? p.images[0].path : '';
  p.options = db.prepare('SELECT * FROM product_options WHERE product_id = ? AND is_active = 1 ORDER BY sort_order, id').all(p.id);
  const vStmt = db.prepare('SELECT * FROM product_option_values WHERE option_id = ? AND is_active = 1 ORDER BY sort_order, id');
  for (const o of p.options) o.values = vStmt.all(o.id);
  return p;
}

function incrementViews(productId) {
  db.prepare('UPDATE products SET views = views + 1 WHERE id = ?').run(productId);
}

module.exports = { listCategories, getCategoryBySlug, primaryImage, listProducts, getProductBySlug, incrementViews };
