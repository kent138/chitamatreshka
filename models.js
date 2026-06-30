'use strict';

const { db } = require('./db');

// ─────────────────────────────────────────────────────────────
// Товары
// ─────────────────────────────────────────────────────────────
function hydrate(p) {
  if (!p) return p;
  try {
    p.images = JSON.parse(p.images || '[]');
  } catch {
    p.images = [];
  }
  if (p.images.length === 0) {
    p.images = [`/placeholder/600/600?text=${encodeURIComponent(p.name)}`];
  }
  return p;
}

const Products = {
  all() {
    return db.prepare('SELECT * FROM products ORDER BY created_at DESC').all().map(hydrate);
  },

  byCategory(category) {
    return db
      .prepare('SELECT * FROM products WHERE category = ? ORDER BY created_at DESC')
      .all(category)
      .map(hydrate);
  },

  search(query) {
    const q = `%${query.trim().toLowerCase()}%`;
    return db
      .prepare(
        `SELECT * FROM products
         WHERE lower(name) LIKE ? OR lower(description) LIKE ? OR lower(category) LIKE ?
         ORDER BY created_at DESC`
      )
      .all(q, q, q)
      .map(hydrate);
  },

  filter({ q, category, sort } = {}) {
    const where = [];
    const params = [];
    if (q && q.trim()) {
      const like = `%${q.trim().toLowerCase()}%`;
      where.push('(lower(name) LIKE ? OR lower(description) LIKE ?)');
      params.push(like, like);
    }
    if (category) {
      where.push('category = ?');
      params.push(category);
    }
    let order = 'created_at DESC';
    if (sort === 'price_asc') order = 'price ASC';
    else if (sort === 'price_desc') order = 'price DESC';
    else if (sort === 'name') order = 'name ASC';

    const sql =
      'SELECT * FROM products' +
      (where.length ? ' WHERE ' + where.join(' AND ') : '') +
      ` ORDER BY ${order}`;
    return db.prepare(sql).all(...params).map(hydrate);
  },

  byId(id) {
    return hydrate(db.prepare('SELECT * FROM products WHERE id = ?').get(id));
  },

  bySlug(slug) {
    return hydrate(db.prepare('SELECT * FROM products WHERE slug = ?').get(slug));
  },

  categories() {
    return db
      .prepare('SELECT category, COUNT(*) AS count FROM products GROUP BY category ORDER BY category')
      .all();
  },

  autocomplete(query, limit = 6) {
    const q = `%${query.trim().toLowerCase()}%`;
    return db
      .prepare(
        'SELECT id, name, slug, price, category FROM products WHERE lower(name) LIKE ? ORDER BY name LIMIT ?'
      )
      .all(q, limit);
  },
};

// ─────────────────────────────────────────────────────────────
// Отзывы
// ─────────────────────────────────────────────────────────────
const Reviews = {
  forProduct(productId) {
    return db
      .prepare(
        `SELECT r.*, u.name AS user_name
         FROM reviews r LEFT JOIN users u ON u.id = r.user_id
         WHERE r.product_id = ? ORDER BY r.created_at DESC`
      )
      .all(productId);
  },

  summary(productId) {
    const row = db
      .prepare('SELECT COUNT(*) AS count, AVG(rating) AS avg FROM reviews WHERE product_id = ?')
      .get(productId);
    return { count: row.count, avg: row.avg ? Math.round(row.avg * 10) / 10 : 0 };
  },

  add(productId, userId, rating, text) {
    return db
      .prepare('INSERT INTO reviews (product_id, user_id, rating, text) VALUES (?, ?, ?, ?)')
      .run(productId, userId, rating, text);
  },
};

// ─────────────────────────────────────────────────────────────
// Заказы
// ─────────────────────────────────────────────────────────────
const Orders = {
  forUser(userId) {
    return db.prepare('SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC').all(userId);
  },

  byId(id) {
    return db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  },

  items(orderId) {
    return db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(orderId);
  },

  all() {
    return db.prepare('SELECT * FROM orders ORDER BY created_at DESC').all();
  },
};

module.exports = { Products, Reviews, Orders, hydrate };
