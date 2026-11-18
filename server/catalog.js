// Каталог товаров. Цены — в Telegram Stars (XTR).
// type: feature | premium | credit | cosmetic | content
// grants: какие ключи доступа открывает покупка (см. db.js hasAccess)
export const CATALOG = [
  { id: 'premium_30d', type: 'premium', stars: 299, days: 30,
    title: 'Премиум · 30 дней', desc: 'Все доски и фигуры, безлимитный разбор партий и подсказки, все курсы и задачи, без рекламы.', badge: 'hit' },

  { id: 'no_ads', type: 'feature', stars: 99, grants: ['no_ads'],
    title: 'Без рекламы', desc: 'Навсегда отключает рекламные показы между партиями.' },

  { id: 'analysis_1', type: 'credit', stars: 25, credit: { analysis: 1 },
    title: 'Разбор 1 партии', desc: 'Полный анализ: график оценки, точность, зевок/ошибка/неточность каждого хода, лучшие ходы.' },
  { id: 'analysis_10', type: 'credit', stars: 149, credit: { analysis: 10 },
    title: 'Разбор 10 партий', desc: 'Пакет разборов со скидкой 40%.', badge: 'sale' },
  { id: 'hints_20', type: 'credit', stars: 49, credit: { hints: 20 },
    title: '20 подсказок', desc: 'Подсказка лучшего хода в партии с ботом. Можно получить бесплатно за рекламу.' },

  { id: 'board_emerald', type: 'cosmetic', stars: 75, grants: ['board:emerald'],
    title: 'Доска «Изумруд»', desc: 'Турнирный зелёный стиль.' },
  { id: 'board_marble', type: 'cosmetic', stars: 75, grants: ['board:marble'],
    title: 'Доска «Мрамор»', desc: 'Светлый мрамор с прожилками.' },
  { id: 'board_midnight', type: 'cosmetic', stars: 75, grants: ['board:midnight'],
    title: 'Доска «Полночь»', desc: 'Тёмная тема для ночных баталий.' },
  { id: 'board_sakura', type: 'cosmetic', stars: 75, grants: ['board:sakura'],
    title: 'Доска «Сакура»', desc: 'Нежные розовые тона.' },
  { id: 'boards_pack', type: 'cosmetic', stars: 199, grants: ['board:emerald','board:marble','board:midnight','board:sakura'],
    title: 'Все доски', desc: 'Все 4 премиум-доски со скидкой.', badge: 'sale' },

  { id: 'pieces_neon', type: 'cosmetic', stars: 99, grants: ['pieces:neon'],
    title: 'Фигуры «Неон»', desc: 'Киберпанк-подсветка фигур.' },
  { id: 'pieces_gold', type: 'cosmetic', stars: 99, grants: ['pieces:gold'],
    title: 'Фигуры «Золото»', desc: 'Золотые и серебряные градиенты.' },
  { id: 'pieces_space', type: 'cosmetic', stars: 99, grants: ['pieces:space'],
    title: 'Фигуры «Космос»', desc: 'Фиолетовый градиент и звёздный блеск.' },
  { id: 'pieces_pack', type: 'cosmetic', stars: 249, grants: ['pieces:neon','pieces:gold','pieces:space'],
    title: 'Все наборы фигур', desc: 'Все 3 премиум-набора со скидкой.', badge: 'sale' },

  { id: 'lessons_openings', type: 'content', stars: 149, grants: ['lessons:openings'],
    title: 'Курс «Дебюты»', desc: 'Итальянская партия, сицилианская защита, ферзевый гамбит — интерактивно, ход за ходом.' },
  { id: 'lessons_tactics', type: 'content', stars: 149, grants: ['lessons:tactics'],
    title: 'Курс «Тактика»', desc: 'Вилки, связки, сквозные удары, вскрытые нападения и матовые конструкции.' },
  { id: 'lessons_endgame', type: 'content', stars: 149, grants: ['lessons:endgame'],
    title: 'Курс «Эндшпиль»', desc: 'Оппозиция, пешечные окончания, мат ферзём и ладьёй.' },
  { id: 'lessons_all', type: 'content', stars: 349, grants: ['lessons:openings','lessons:tactics','lessons:endgame'],
    title: 'Все курсы', desc: 'Три курса со скидкой 22%.', badge: 'sale' },

  { id: 'puzzles_pack', type: 'content', stars: 99, grants: ['puzzles:all'],
    title: 'Тактика+ · 12 задач', desc: 'Открывает всю библиотеку задач (мат в 1–2 хода, тактика). Одна задача дня всегда бесплатна.' },
];

export const byId = Object.fromEntries(CATALOG.map(p => [p.id, p]));

// Ключи доступа, которые даёт активный премиум
export const PREMIUM_GRANTS = [
  'no_ads', 'analysis:unlimited', 'hints:unlimited', 'puzzles:all',
  'board:emerald', 'board:marble', 'board:midnight', 'board:sakura',
  'pieces:neon', 'pieces:gold', 'pieces:space',
  'lessons:openings', 'lessons:tactics', 'lessons:endgame',
];
