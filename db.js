'use strict';

/**
 * Слой доступа к данным.
 * Использует встроенный в Node 22+ модуль node:sqlite (синхронный, как better-sqlite3).
 * Файл базы: db.sqlite
 */

const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const DB_PATH = path.join(__dirname, 'db.sqlite');
const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// ─────────────────────────────────────────────────────────────
// Схема
// ─────────────────────────────────────────────────────────────
function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      name          TEXT NOT NULL,
      phone         TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'user',
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      slug        TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      price       INTEGER NOT NULL DEFAULT 0,
      category    TEXT NOT NULL DEFAULT '',
      stock       INTEGER NOT NULL DEFAULT 0,
      images      TEXT NOT NULL DEFAULT '[]',
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS orders (
      id               INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id          INTEGER REFERENCES users(id) ON DELETE SET NULL,
      customer_name    TEXT NOT NULL,
      customer_phone   TEXT NOT NULL,
      delivery_method  TEXT NOT NULL,
      delivery_address TEXT NOT NULL DEFAULT '',
      payment_method   TEXT NOT NULL,
      comment          TEXT NOT NULL DEFAULT '',
      status           TEXT NOT NULL DEFAULT 'new',
      total_price      INTEGER NOT NULL DEFAULT 0,
      created_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id      INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      product_id    INTEGER REFERENCES products(id) ON DELETE SET NULL,
      product_name  TEXT NOT NULL,
      product_price INTEGER NOT NULL,
      quantity      INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS reviews (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
      user_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
      rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
      text       TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
    CREATE INDEX IF NOT EXISTS idx_reviews_product   ON reviews(product_id);
    CREATE INDEX IF NOT EXISTS idx_order_items_order ON order_items(order_id);
  `);
}

// ─────────────────────────────────────────────────────────────
// Хелперы
// ─────────────────────────────────────────────────────────────
const translitMap = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z',
  и: 'i', й: 'i', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
};

function slugify(str) {
  const base = String(str)
    .toLowerCase()
    .split('')
    .map((ch) => (translitMap[ch] !== undefined ? translitMap[ch] : ch))
    .join('')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || 'tovar';
}

function uniqueSlug(name, excludeId = null) {
  let base = slugify(name);
  let slug = base;
  let n = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const row = excludeId
      ? db.prepare('SELECT id FROM products WHERE slug = ? AND id != ?').get(slug, excludeId)
      : db.prepare('SELECT id FROM products WHERE slug = ?').get(slug);
    if (!row) return slug;
    n += 1;
    slug = `${base}-${n}`;
  }
}

// ─────────────────────────────────────────────────────────────
// Сидинг (демо-данные)
// ─────────────────────────────────────────────────────────────
function seed() {
  initSchema();

  // Вход в админку — по секретному коду (см. routes/admin.js), отдельные аккаунты не нужны.
  const userCount = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (userCount === 0) {
    const insUser = db.prepare(
      'INSERT INTO users (name, phone, password_hash, role) VALUES (?, ?, ?, ?)'
    );
    insUser.run('Гость Тестовый', '+79141234567', bcrypt.hashSync('test1234', 10), 'user');
    console.log('  • создан демо-покупатель: +79141234567 / test1234');
  }

  const prodCount = db.prepare('SELECT COUNT(*) AS c FROM products').get().c;
  if (prodCount === 0) {
    const products = [
      ['Матрёшка «Сибирячка», 7 мест', 'Матрёшки',
        'Классическая семёрка, ручная роспись по липе. Тёплые охристые тона, цветочный платок. Каждая фигурка — отдельный характер.',
        4900, 12],
      ['Матрёшка «Забайкальские травы», 5 мест', 'Матрёшки',
        'Авторская роспись по мотивам забайкальского разнотравья. Матовый лак, мягкая палитра.',
        3600, 8],
      ['Матрёшка-неваляшка «Малышка»', 'Матрёшки',
        'Одиночная фигурка с мелодичным звоном. Подойдёт для самых маленьких. Безопасные краски.',
        1200, 25],
      ['Кедровая шкатулка с резьбой', 'Посуда и дерево',
        'Шкатулка из сибирского кедра, ручная резьба «солнечный узел». Хранит лёгкий аромат смолы.',
        2800, 14],
      ['Туес берестяной «Таёжный»', 'Посуда и дерево',
        'Цельный берестяной туес для чая и трав. Натуральная береста, плетёная крышка.',
        2100, 18],
      ['Кружка-бочонок из кедра', 'Посуда и дерево',
        'Долблёная кружка ручной работы. Для холодных напитков и как сувенир.',
        1500, 30],
      ['Платок павловопосадский «Зимняя Чита»', 'Текстиль',
        'Тёплый шерстяной платок с авторским узором по мотивам сибирской зимы. Размер 125×125 см.',
        3900, 10],
      ['Варежки пуховые ручной вязки', 'Текстиль',
        'Связаны из козьего пуха забайкальских мастериц. Невероятно тёплые и лёгкие.',
        1800, 22],
      ['Оберег «Сибирская берегиня»', 'Сувениры',
        'Текстильная кукла-оберег ручной работы. По поверью, хранит домашний уют и достаток.',
        950, 40],
      ['Магнит-матрёшка из бересты', 'Сувениры',
        'Маленький берестяной магнит ручной росписи. Идеальный гостинец из Сибири.',
        350, 100],
      ['Серьги «Кедровая веточка»', 'Украшения',
        'Лёгкие серьги из дерева и латуни, ручная работа. Гипоаллергенная фурнитура.',
        1300, 16],
      ['Бусы из натурального янтаря', 'Украшения',
        'Длинные бусы из балтийского янтаря медовых оттенков. Каждый камень неповторим.',
        5400, 6],
    ];

    const insProd = db.prepare(`
      INSERT INTO products (name, slug, description, price, category, stock, images)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    for (const [name, category, description, price, stock] of products) {
      const slug = uniqueSlug(name);
      // Локальный SVG-плейсхолдер (генерируется на лету в /placeholder)
      const img = `/placeholder/600/600?text=${encodeURIComponent(name)}`;
      insProd.run(name, slug, description, price, category, stock, JSON.stringify([img]));
    }
    console.log(`  • добавлено товаров: ${products.length}`);
  }

  console.log('✓ База данных готова:', DB_PATH);
}

// Инициализируем схему при любом подключении
initSchema();

module.exports = { db, slugify, uniqueSlug, seed, DB_PATH };

// Запуск напрямую: node db.js --seed
if (require.main === module && process.argv.includes('--seed')) {
  seed();
}
