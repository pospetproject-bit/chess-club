// Хранилище: JSON-файл локально или Postgres (Neon) в продакшене.
// В продакшене задайте DATABASE_URL — покупки и история переживут рестарты.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { byId, PREMIUM_GRANTS } from './catalog.js';
import { BOT_RATING, K_FRIEND, K_BOT, delta, scoreOf } from './rating.js';
import { avatarUrl } from './avatars.js';
import { checkAchievements } from './achievements.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILE = path.join(ROOT, 'db.json');
const DATABASE_URL = process.env.DATABASE_URL || '';

let db = { users: {}, games: {}, purchases: [], tournaments: {} };
let pool = null;

export async function initDb() {
  if (DATABASE_URL) {
    pool = new pg.Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false }, max: 3 });
    await pool.query('CREATE TABLE IF NOT EXISTS cc_state (id INTEGER PRIMARY KEY, data JSONB NOT NULL)');
    const r = await pool.query('SELECT data FROM cc_state WHERE id = 1');
    if (r.rows.length) db = r.rows[0].data;
    console.log('[db] Postgres подключён (DATABASE_URL)');
  } else {
    try { db = JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch {}
    console.log('[db] JSON-файл (локальный режим)');
  }
  // миграция переименованных наборов фигур: gold→ivory, space→crystal
  for (const u of Object.values(db.users || {})) {
    if (Array.isArray(u.owned)) {
      u.owned = u.owned.map(g => g === 'pieces:gold' ? 'pieces:ivory' : g === 'pieces:space' ? 'pieces:crystal' : g);
    }
  }
}

let saveTimer = null;
let lastWrite = 0;

function doWrite() {
  lastWrite = Date.now();
  if (pool) {
    pool.query(
      'INSERT INTO cc_state (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = $1',
      [JSON.stringify(db)]
    ).catch(e => console.error('[db] save error:', e.message));
  } else {
    fs.mkdirSync(ROOT, { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, FILE);
  }
}

// Деbounce 150 мс, но не реже раза в 500 мс даже под непрерывной нагрузкой.
function save() {
  if (Date.now() - lastWrite > 500) { doWrite(); return; }
  clearTimeout(saveTimer);
  saveTimer = setTimeout(doWrite, 150);
}

// Гарантированный сброс на диск/в БД при остановке (Render шлёт SIGTERM).
export async function flushDb() {
  clearTimeout(saveTimer);
  if (pool) {
    try {
      await pool.query(
        'INSERT INTO cc_state (id, data) VALUES (1, $1) ON CONFLICT (id) DO UPDATE SET data = $1',
        [JSON.stringify(db)]
      );
    } catch (e) { console.error('[db] flush error:', e.message); }
    await pool.end().catch(() => {});
  } else {
    doWrite();
  }
}

export function getUser(id, name = 'Игрок') {
  const key = String(id);
  if (!db.users[key]) {
    db.users[key] = {
      id: key, name, created: Date.now(),
      premium_until: 0,
      hints: 3,            // стартовый подарок: 3 подсказки
      analysis_credits: 1, // и 1 бесплатный разбор — попробовать продукт
      owned: [],           // купленные ключи доступа
      rewarded_today: { day: '', count: 0 },
      stats: { bot: { w: 0, l: 0, d: 0 }, friend: { w: 0, l: 0, d: 0 } },
      rating: 1200, rating_games: 0,
      win_streak: 0, best_streak: 0,
      achievements: [], opponents: {},
      puzzles_solved: 0, puzzles_ids: [],
      lessons_done: 0, lessons_ids: [],
    };
    save();
  }
  // миграция старых профилей: недостающие поля
  const u0 = db.users[key];
  if (u0.rating === undefined) { u0.rating = 1200; u0.rating_games = 0; u0.win_streak = 0; u0.best_streak = 0; u0.achievements = []; u0.opponents = {}; u0.puzzles_solved = 0; u0.puzzles_ids = []; u0.lessons_done = 0; u0.lessons_ids = []; }
  if (name && name !== 'Игрок' && db.users[key].name !== name) { db.users[key].name = name; save(); }
  return db.users[key];
}

export const isPremium = u => u.premium_until > Date.now();

export function hasAccess(u, key) {
  if (isPremium(u)) {
    if (key === 'analysis' || key === 'hints') return true;
    if (PREMIUM_GRANTS.includes(key)) return true;
  }
  if (key === 'analysis') return u.analysis_credits > 0;
  if (key === 'hints') return u.hints > 0;
  return u.owned.includes(key);
}

export function grant(userId, productId, chargeId = null) {
  const u = getUser(userId);
  const p = byId[productId];
  if (!p) return { ok: false, error: 'unknown product' };
  if (p.type === 'premium') {
    const base = Math.max(Date.now(), u.premium_until);
    u.premium_until = base + p.days * 86400_000;
  } else {
    for (const g of p.grants || []) if (!u.owned.includes(g)) u.owned.push(g);
    if (p.credit) {
      if (p.credit.analysis) u.analysis_credits += p.credit.analysis;
      if (p.credit.hints) u.hints += p.credit.hints;
    }
  }
  db.purchases.push({ user: u.id, product: productId, stars: p.stars, ts: Date.now(), charge: chargeId });
  checkAchievements(u, {});
  save();
  return { ok: true, user: u };
}

export function useHint(u) {
  if (isPremium(u)) return true;
  if (u.hints <= 0) return false;
  u.hints--; save(); return true;
}

export function addRewardedHint(u) {
  const day = new Date().toISOString().slice(0, 10);
  if (u.rewarded_today.day !== day) u.rewarded_today = { day, count: 0 };
  if (u.rewarded_today.count >= 5) return false; // не более 5 рекламных подсказок в день
  u.rewarded_today.count++; u.hints++; save(); return true;
}

export function saveGame(u, g) {
  const id = 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const mode = g.mode || 'bot';
  const pc = g.player_color || 'w';
  const result = g.result;
  const win = result === pc, draw = result === 'draw';
  const rated = !!g.rated && mode !== 'local';
  let ratingDelta = 0;
  if (rated) {
    const score = scoreOf(result, pc);
    if (typeof g.rating_delta === 'number') ratingDelta = g.rating_delta;
    else {
      const opp = g.opponent?.rating ?? BOT_RATING[g.difficulty] ?? 1200;
      ratingDelta = delta(u.rating, opp, score, mode === 'friend' ? K_FRIEND : K_BOT);
    }
    u.rating = Math.max(100, u.rating + ratingDelta);
    u.rating_games = (u.rating_games || 0) + 1;
  }
  if (mode !== 'local') {
    if (win) { u.win_streak = (u.win_streak || 0) + 1; u.best_streak = Math.max(u.best_streak || 0, u.win_streak); }
    else if (!draw) u.win_streak = 0;
  }
  if (mode === 'friend' && g.opponent?.id) {
    u.opponents = u.opponents || {};
    u.opponents[g.opponent.id] = { name: g.opponent.name || 'Игрок', ts: Date.now() };
  }
  const game = {
    id, user: u.id, mode, difficulty: g.difficulty || null,
    result, player_color: pc, pgn: String(g.pgn || '').slice(0, 20000), ts: Date.now(), analyzed: false,
    rated, rating_delta: ratingDelta,
  };
  db.games[id] = game;
  const s = mode === 'friend' ? u.stats.friend : u.stats.bot;
  if (draw) s.d++; else if (win) s.w++; else s.l++;
  // ограничим историю 60 партиями на пользователя
  const mine = Object.values(db.games).filter(x => x.user === u.id).sort((a, b) => b.ts - a.ts);
  for (const old of mine.slice(60)) delete db.games[old.id];
  const fresh = checkAchievements(u, { win, mode, difficulty: g.difficulty, hintsUsed: g.hints_used || 0 });
  save();
  return { ...game, new_achievements: fresh };
}

// Таблица лидеров: все игроки или «друзья» (те, с кем играл) + ты.
export function leaderboard(scope, u) {
  const all = Object.values(db.users);
  let pool = all;
  if (scope === 'friends') {
    const ids = new Set([u.id, ...Object.keys(u.opponents || {})]);
    pool = all.filter(x => ids.has(x.id));
  }
  const rows = pool
    .filter(x => (x.rating_games || 0) > 0 || x.id === u.id)
    .sort((a, b) => b.rating - a.rating || (b.rating_games || 0) - (a.rating_games || 0))
    .slice(0, 100)
    .map((x, i) => ({
      rank: i + 1, id: x.id, name: x.name, avatar: avatarUrl(x.id), rating: x.rating,
      games: (x.stats.bot.w + x.stats.bot.l + x.stats.bot.d) + (x.stats.friend.w + x.stats.friend.l + x.stats.friend.d),
      rated_games: x.rating_games || 0,
      w: x.stats.bot.w + x.stats.friend.w, l: x.stats.bot.l + x.stats.friend.l, d: x.stats.bot.d + x.stats.friend.d,
      you: x.id === u.id,
    }));
  const you = rows.find(r => r.you) || null;
  return { rows, you };
}

export function recordPuzzle(u, pid) {
  u.puzzles_ids = u.puzzles_ids || [];
  if (!u.puzzles_ids.includes(pid)) { u.puzzles_ids.push(pid); u.puzzles_solved = u.puzzles_ids.length; }
  const fresh = checkAchievements(u, {});
  save();
  return fresh;
}
export function recordLesson(u, lid) {
  u.lessons_ids = u.lessons_ids || [];
  if (!u.lessons_ids.includes(lid)) { u.lessons_ids.push(lid); u.lessons_done = u.lessons_ids.length; }
  const fresh = checkAchievements(u, {});
  save();
  return fresh;
}

// Пользователь без создания записи (для аватаров и публичных данных).
export const peekUser = id => db.users[String(id)] || null;

// Ссылка на фото из initData клиента (валидируется вызывающей стороной).
export function setPhotoUrl(u, url) {
  if (u.photo_url === url) return false;
  u.photo_url = url; save(); return true;
}

export const listGames = u => Object.values(db.games).filter(g => g.user === u.id).sort((a, b) => b.ts - a.ts);
export const getGame = id => db.games[id];

export function unlockAnalysis(u, gameId) {
  const g = db.games[gameId];
  if (!g || g.user !== u.id) return { ok: false, error: 'game not found' };
  // Обучение бесплатное: партии с ботом и «вдвоём рядом» разбираются без кредитов.
  if (g.mode === 'bot' || g.mode === 'local') { g.analyzed = true; save(); return { ok: true, game: g, free: true }; }
  if (g.analyzed || isPremium(u)) { g.analyzed = true; save(); return { ok: true, game: g }; }
  if (u.analysis_credits <= 0) return { ok: false, error: 'no credits' };
  u.analysis_credits--; g.analyzed = true; save();
  return { ok: true, game: g };
}

export function publicUser(u) {
  return {
    id: u.id, name: u.name, avatar: avatarUrl(u.id),
    premium_until: u.premium_until, premium: isPremium(u),
    hints: isPremium(u) ? '∞' : u.hints,
    analysis_credits: isPremium(u) ? '∞' : u.analysis_credits,
    owned: isPremium(u) ? [...new Set([...u.owned, ...PREMIUM_GRANTS])] : u.owned,
    stats: u.stats,
    rating: u.rating ?? 1200, rating_games: u.rating_games || 0,
    win_streak: u.win_streak || 0, best_streak: u.best_streak || 0,
    achievements: u.achievements || [],
    puzzles_solved: u.puzzles_solved || 0, lessons_done: u.lessons_done || 0,
  };
}

// ── Турниры ──────────────────────────────────────────────────────────
export function putTournament(t) {
  db.tournaments ||= {};
  db.tournaments[t.id] = t;
  // история ограничена: 60 последних турниров
  const keys = Object.keys(db.tournaments);
  if (keys.length > 60) {
    const old = keys.map(k => db.tournaments[k]).sort((a, b) => a.created - b.created).slice(0, keys.length - 60);
    for (const o of old) delete db.tournaments[o.id];
  }
  save();
  return t;
}
export function getTournament(id) { return db.tournaments?.[String(id || '').toUpperCase()] || null; }
export function allTournaments() { return Object.values(db.tournaments || {}); }
