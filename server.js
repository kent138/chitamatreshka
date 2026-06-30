'use strict';

const path = require('path');
const express = require('express');
const session = require('express-session');
const methodOverride = require('method-override');

const { db } = require('./db');
const { locals } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Шаблоны ───────────────────────────────────────────────
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ─── Базовые middleware ────────────────────────────────────
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(methodOverride('_method'));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'matryoshka-siberian-soul-secret',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 1000 * 60 * 60 * 24 * 7 }, // 7 дней
  })
);

// Статика с кэшированием (картинки, css, js)
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '7d' }));

// Общие переменные шаблонов
app.use(locals);

// Версия ассетов для защиты от кэша (обновляется при каждом перезапуске)
app.locals.assetVer = Date.now();

// Хелперы форматирования для шаблонов
app.locals.formatPrice = (kopecksOrRubles) =>
  new Intl.NumberFormat('ru-RU').format(kopecksOrRubles) + ' ₽';
app.locals.site = {
  name: 'Матрёшка',
  slogan: 'Матрёшка — сибирская душа в каждой вещи',
  hero: 'Сделано в Чите. Сделано с любовью.',
  phone: '+7 (914) 000-00-00',
  city: 'Чита',
  metrikaId: process.env.YM_ID || '00000000', // подставьте реальный ID Яндекс.Метрики
};

// ─── Роуты ─────────────────────────────────────────────────
app.use('/', require('./routes/index'));
app.use('/', require('./routes/auth'));
app.use('/catalog', require('./routes/catalog'));
app.use('/cart', require('./routes/cart'));
app.use('/', require('./routes/orders'));
app.use('/', require('./routes/reviews'));
app.use('/admin', require('./routes/admin'));
app.use('/api', require('./routes/api'));
app.use('/placeholder', require('./routes/placeholder'));

// ─── 404 ───────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).render('error', {
    title: 'Страница не найдена',
    message: 'К сожалению, такой страницы нет. Возможно, товар распродан или ссылка устарела.',
    status: 404,
  });
});

// ─── Обработчик ошибок ─────────────────────────────────────
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).render('error', {
    title: 'Ошибка сервера',
    message: 'Что-то пошло не так. Мы уже разбираемся.',
    status: 500,
  });
});

app.listen(PORT, () => {
  console.log(`\n  🪆  Матрёшка запущена:  http://localhost:${PORT}\n`);
});

module.exports = app;
