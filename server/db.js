// Хранилище: JSON-файл локально или Postgres (Neon) в продакшене.
// В продакшене задайте DATABASE_URL — покупки и история переживут рестарты.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { byId, PREMIUM_GRANTS } from './catalog.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
const FILE = path.join(ROOT, 'db.json');
const DATABASE_URL = process.env.DATABASE_URL || '';

let db = { users: {}, games: {}, purchases: [] };
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
    };
    save();
  }
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
  db.games[id] = {
    id, user: u.id, mode: g.mode, difficulty: g.difficulty || null,
    result: g.result, player_color: g.player_color || 'w',
    pgn: String(g.pgn || '').slice(0, 20000), ts: Date.now(), analyzed: false,
  };
  const s = g.mode === 'friend' ? u.stats.friend : u.stats.bot;
  const pc = g.player_color || 'w';
  if (g.result === 'draw') s.d++;
  else if (g.result === pc) s.w++; else s.l++;
  // ограничим историю 60 партиями на пользователя
  const mine = Object.values(db.games).filter(x => x.user === u.id).sort((a, b) => b.ts - a.ts);
  for (const old of mine.slice(60)) delete db.games[old.id];
  save();
  return db.games[id];
}

export const listGames = u => Object.values(db.games).filter(g => g.user === u.id).sort((a, b) => b.ts - a.ts);
export const getGame = id => db.games[id];

export function unlockAnalysis(u, gameId) {
  const g = db.games[gameId];
  if (!g || g.user !== u.id) return { ok: false, error: 'game not found' };
  if (g.analyzed || isPremium(u)) { g.analyzed = true; save(); return { ok: true, game: g }; }
  if (u.analysis_credits <= 0) return { ok: false, error: 'no credits' };
  u.analysis_credits--; g.analyzed = true; save();
  return { ok: true, game: g };
}

export function publicUser(u) {
  return {
    id: u.id, name: u.name,
    premium_until: u.premium_until, premium: isPremium(u),
    hints: isPremium(u) ? '∞' : u.hints,
    analysis_credits: isPremium(u) ? '∞' : u.analysis_credits,
    owned: isPremium(u) ? [...new Set([...u.owned, ...PREMIUM_GRANTS])] : u.owned,
    stats: u.stats,
  };
}
