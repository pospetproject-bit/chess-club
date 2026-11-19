// Каталог товаров. Цена — в Telegram Stars (XTR).
// Схема совпадает с server/db.js grant(): premium→days, остальные→grants[]/credit{}.

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
    title: 'Разбор партии', desc: 'Глубокий разбор одной вашей партии: график, ошибки, зевок, лучшая линия.' },
  { id: 'analysis_10', type: 'consumable', stars: 99, credit: { analysis: 10 },
    title: 'Разбор 10 партий', desc: 'Пакет разборов со скидкой 48%.', badge: 'sale' },

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

  // ── Уроки (курс «Основы» бесплатный) ─────────────────────
  { id: 'lessons_openings', type: 'content', stars: 99, grants: ['lessons:openings'],
    title: 'Курс «Дебюты»', desc: 'Итальянская партия, сицилианская защита, ферзевый гамбит — ход за ходом.' },
  { id: 'lessons_tactics', type: 'content', stars: 99, grants: ['lessons:tactics'],
    title: 'Курс «Тактика»', desc: 'Вилки, связки, сквозные удары, матовые конструкции.' },
  { id: 'lessons_endgame', type: 'content', stars: 99, grants: ['lessons:endgame'],
    title: 'Курс «Эндшпиль»', desc: 'Правило квадрата, маты ферзём и ладьёй.' },
  { id: 'lessons_all', type: 'bundle', stars: 249,
    grants: ['lessons:openings', 'lessons:tactics', 'lessons:endgame'],
    title: 'Все курсы', desc: 'Три платных курса со скидкой 16%.', badge: 'sale' },

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
  'lessons:openings', 'lessons:tactics', 'lessons:endgame',
  'puzzles:all',
];
