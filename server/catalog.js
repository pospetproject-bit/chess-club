// Каталог товаров. Цена — в Telegram Stars (XTR).
// Схема совпадает с server/db.js grant(): premium→days, остальные→grants[]/credit{}.

import { PACKS, LESSONS } from '../public/js/data-lessons.js';

// Курсы— генерируются из единого источника данных уроков.
const LESSON_PACKS = PACKS.filter(p => !p.free && p.product);
const LESSON_PRICE = 19;
const lessonProducts = LESSON_PACKS.map(p => ({
  id: p.product, type: 'content', stars: LESSON_PRICE, grants: ['lessons:' + p.id],
  title: 'Курс «' + p.title + '»',
  desc: p.desc + ' · ' + LESSONS.filter(l => l.pack === p.id).length + ' интерактивных уроков.',
}));
const ALL_LESSON_GRANTS = LESSON_PACKS.map(p => 'lessons:' + p.id);

export const CATALOG = [
  // ── Подписка ─────────────────────────────────────────────
  { id: 'premium_30d', type: 'premium', stars: 199, days: 30,
    title: 'Премиум на 30 дней', badge: 'hot',
    desc: 'Все доски и фигуры, безлимитные разборы и подсказки, все уроки и задачи, без рекламы.',
    features: ['Все премиум-доски и фигуры', 'Разборы партий без ограничений', 'Подсказки без ограничений', 'Все уроки и задачи', 'Без рекламы'] },

  // ── Разовые покупки ──────────────────────────────────────
  { id: 'no_ads', type: 'feature', stars: 69, grants: ['no_ads'],
    title: 'Без рекламы навсегда', desc: 'Убирает межстраничную рекламу между партиями. Навсегда.' },

  { id: 'analysis_1', type: 'consumable', stars: 19, credit: { analysis: 1 },
    title: 'Разбор партии с другом', desc: 'Подробный разбор одной партии с другом: где ошибка и почему, что было лучше, объяснение мата и пата. Партии с ботом разбираются бесплатно.' },
  { id: 'analysis_10', type: 'consumable', stars: 99, credit: { analysis: 10 },
    title: 'Разбор 10 партий с другом', desc: 'Пакет разборов партий с друзьями со скидкой 48%. Разборы с ботом всегда бесплатны.', badge: 'sale' },

  { id: 'hints_20', type: 'consumable', stars: 35, credit: { hints: 20 },
    title: '20 подсказок', desc: 'Подсказка показывает лучший ход движка в партии с ботом.' },

  // ── Доски ────────────────────────────────────────────────
  { id: 'board_emerald', type: 'cosmetic', stars: 49, grants: ['board:emerald'],
    title: 'Изумруд', desc: 'Турнирная доска со светящимся следом хода — видно весь путь фигуры.' },
  { id: 'board_marble', type: 'cosmetic', stars: 49, grants: ['board:marble'],
    title: 'Мрамор', desc: 'Каменные прожилки и золотая инкрустация последнего хода.' },
  { id: 'board_midnight', type: 'cosmetic', stars: 49, grants: ['board:midnight'],
    title: 'Полночь', desc: 'Тёмная доска с мерцающим звёздным небом.' },
  { id: 'board_sakura', type: 'cosmetic', stars: 49, grants: ['board:sakura'],
    title: 'Сакура', desc: 'Нежная доска с падающими лепестками сакуры.' },
  { id: 'boards_pack', type: 'bundle', stars: 139,
    grants: ['board:emerald', 'board:marble', 'board:midnight', 'board:sakura'],
    title: 'Все премиум-доски', desc: 'Четыре доски со скидкой 29%.', badge: 'sale' },

  // ── Фигуры ───────────────────────────────────────────────
  { id: 'pieces_ivory', type: 'cosmetic', stars: 69, grants: ['pieces:ivory'],
    title: 'Слоновая кость', desc: 'Резные фигуры классической формы: тёплая кость против чёрного дерева.' },
  { id: 'pieces_neon', type: 'cosmetic', stars: 69, grants: ['pieces:neon'],
    title: 'Неон', desc: 'Киберпанк-набор со светящимся контуром.' },
  { id: 'pieces_crystal', type: 'cosmetic', stars: 69, grants: ['pieces:crystal'],
    title: 'Хрусталь', desc: 'Гранёные полупрозрачные фигуры, как огранённые самоцветы.' },
  { id: 'pieces_pack', type: 'bundle', stars: 169,
    grants: ['pieces:ivory', 'pieces:neon', 'pieces:crystal'],
    title: 'Все премиум-фигуры', desc: 'Три набора со скидкой 18%.', badge: 'sale' },

  // ── Уроки: 16 курсов по 19⭐ (курс «Основы» бесплатный) ───
  ...lessonProducts,
  { id: 'lessons_all', type: 'bundle', stars: 149, grants: ALL_LESSON_GRANTS,
    title: 'Все курсы навсегда', badge: 'sale',
    desc: '16 курсов и ' + LESSONS.length + ' уроков: дебюты, тактика, эндшпиль, атака, защита, классика. Выгода ' + (LESSON_PACKS.length * LESSON_PRICE - 149) + '⭐.' },

  // ── Задачи ───────────────────────────────────────────────
  { id: 'puzzles_pack', type: 'content', stars: 69, grants: ['puzzles:all'],
    title: 'Пакет задач «Мат в 1–2»', desc: '12 тактических задач с проверкой решения и подсказками.' },
];

export const byId = Object.fromEntries(CATALOG.map(p => [p.id, p]));

// Что входит в премиум-подписку (виртуальные grants)
export const PREMIUM_GRANTS = [
  'no_ads',
  'board:emerald', 'board:marble', 'board:midnight', 'board:sakura',
  'pieces:ivory', 'pieces:neon', 'pieces:crystal',
  ...ALL_LESSON_GRANTS,
  'puzzles:all',
];
