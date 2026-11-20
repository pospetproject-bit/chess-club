// Яндекс.Метрика: счётчик подключён в index.html (id 114397828).
// Здесь — тонкая обёртка: просмотры экранов SPA и цели (reachGoal).
// Приложение одностраничное, поэтому переходы между экранами не видны Метрике
// автоматически — отправляем их вручную как виртуальные страницы /#/screen.
export const METRIKA_ID = 114397828;

const TITLES = {
  home: 'Главная',
  learn: 'Обучение',
  puzzles: 'Задачи',
  rating: 'Рейтинг',
  store: 'Магазин',
  profile: 'Профиль',
  game: 'Партия',
  lesson: 'Урок',
  puzzle: 'Решение задачи',
  analysis: 'Разбор партии',
  room: 'Игра с другом',
  tourney: 'Турнир',
};

const ready = () => typeof window !== 'undefined' && typeof window.ym === 'function';

// просмотр экрана (первый показ главной уже посчитан самим счётчиком)
export function hit(screen) {
  try {
    if (!ready()) return;
    window.ym(METRIKA_ID, 'hit', location.pathname + '#/' + screen, {
      title: 'Шахматный Клуб — ' + (TITLES[screen] || screen),
    });
  } catch (_) { /* аналитика не должна ломать приложение */ }
}

// цель: в кабинете Метрики создаётся как «JavaScript-событие» с этим идентификатором
export function goal(name, params) {
  try {
    if (!ready()) return;
    window.ym(METRIKA_ID, 'reachGoal', name, params || {});
  } catch (_) { /* noop */ }
}
