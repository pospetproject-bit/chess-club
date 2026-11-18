// Достижения (ачивки). Красивые SVG-бейджи рисует клиент (public/js/achievements.js).
// tier: bronze / silver / gold. icon — ключ глифа для бейджа.
export const ACHIEVEMENTS = [
  { id: 'first_game',  tier: 'bronze', icon: 'flag',      title: 'Первая партия',   desc: 'Сыграть свою первую партию' },
  { id: 'first_win',   tier: 'bronze', icon: 'trophy',    title: 'Первая победа',   desc: 'Одержать первую победу' },
  { id: 'friend_win',  tier: 'bronze', icon: 'handshake', title: 'Дружеский счёт',  desc: 'Победить друга' },
  { id: 'streak_3',    tier: 'bronze', icon: 'flame',     title: 'Серия из 3',      desc: 'Выиграть 3 партии подряд' },
  { id: 'wins_10',     tier: 'silver', icon: 'medal',     title: 'Десять побед',    desc: 'Одержать 10 побед' },
  { id: 'games_50',    tier: 'silver', icon: 'board',     title: 'Завсегдатай',     desc: 'Сыграть 50 партий' },
  { id: 'beat_hard',   tier: 'silver', icon: 'gear',      title: 'Гроза профессора',desc: 'Победить сложного бота' },
  { id: 'no_hint_win', tier: 'silver', icon: 'target',    title: 'Чистая победа',   desc: 'Победить бота без подсказок' },
  { id: 'puzzle_10',   tier: 'silver', icon: 'puzzle',    title: 'Тактик',          desc: 'Решить 10 задач' },
  { id: 'rating_1300', tier: 'silver', icon: 'chart',     title: 'Клубный игрок',   desc: 'Достичь рейтинга 1300' },
  { id: 'streak_5',    tier: 'gold',   icon: 'bolt',      title: 'Неудержимый',     desc: 'Выиграть 5 партий подряд' },
  { id: 'wins_50',     tier: 'gold',   icon: 'crown',     title: 'Полсотни побед',  desc: 'Одержать 50 побед' },
  { id: 'rating_1500', tier: 'gold',   icon: 'star',      title: 'Мастер клуба',    desc: 'Достичь рейтинга 1500' },
  { id: 'rating_1800', tier: 'gold',   icon: 'diamond',   title: 'Гроссмейстер',    desc: 'Достичь рейтинга 1800' },
  { id: 'lessons_all', tier: 'gold',   icon: 'cap',       title: 'Выпускник',       desc: 'Пройти все уроки' },
  { id: 'premium',     tier: 'gold',   icon: 'gem',       title: 'Меценат',         desc: 'Оформить Премиум' },
];
export const achById = Object.fromEntries(ACHIEVEMENTS.map(a => [a.id, a]));

const total = u => (u.stats.bot.w + u.stats.bot.l + u.stats.bot.d) + (u.stats.friend.w + u.stats.friend.l + u.stats.friend.d);
const wins = u => u.stats.bot.w + u.stats.friend.w;

const CONDITIONS = {
  first_game: u => total(u) >= 1,
  first_win: u => wins(u) >= 1,
  friend_win: (u, c) => c.win && c.mode === 'friend',
  streak_3: u => (u.best_streak || 0) >= 3,
  wins_10: u => wins(u) >= 10,
  games_50: u => total(u) >= 50,
  beat_hard: (u, c) => c.win && c.difficulty === 'hard',
  no_hint_win: (u, c) => c.win && c.mode === 'bot' && (c.hintsUsed || 0) === 0,
  puzzle_10: u => (u.puzzles_solved || 0) >= 10,
  rating_1300: u => u.rating >= 1300,
  streak_5: u => (u.best_streak || 0) >= 5,
  wins_50: u => wins(u) >= 50,
  rating_1500: u => u.rating >= 1500,
  rating_1800: u => u.rating >= 1800,
  lessons_all: u => (u.lessons_done || 0) >= 13,
  premium: u => u.premium_until > Date.now(),
};

// Возвращает массив новых достижений (объекты), дописывая их в u.achievements.
export function checkAchievements(u, ctx = {}) {
  u.achievements = u.achievements || [];
  const have = new Set(u.achievements.map(a => a.id));
  const fresh = [];
  for (const a of ACHIEVEMENTS) {
    if (have.has(a.id)) continue;
    if (CONDITIONS[a.id]?.(u, ctx)) {
      u.achievements.push({ id: a.id, ts: Date.now() });
      fresh.push(a);
    }
  }
  return fresh;
}
