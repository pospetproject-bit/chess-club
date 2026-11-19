// Шахматный Клуб — сервер: статика мини-аппа, REST API, WebSocket-комнаты, бот.
import express from 'express';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { CATALOG, byId } from './catalog.js';
import { ACHIEVEMENTS } from './achievements.js';
import { delta, scoreOf, K_FRIEND } from './rating.js';
import * as db from './db.js';
import { verifyInitData, createStarsInvoice, BOT_TOKEN, DEMO_MODE } from './telegram.js';
import { getAvatar, checkAvatarSig, fallbackAvatar, isSafePhotoUrl, invalidateAvatar } from './avatars.js';
import { startBot } from './bot.js';
import { RoomManager } from './rooms.js';

await db.initDb();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 3000);
const app = express();
app.use(express.json({ limit: '100kb' }));
app.disable('x-powered-by');

// --- аватары: публичный, но подписанный HMAC URL (картинки не могут слать заголовки авторизации) ---
app.get('/avatar/:id', async (req, res) => {
  const id = String(req.params.id).slice(0, 64);
  if (!checkAvatarSig(id, req.query.s)) return res.status(403).end();
  try {
    const u = db.peekUser(id);
    const { buf, mime } = await getAvatar(id, u?.name || '?', u?.photo_url || null);
    res.set('Content-Type', mime);
    res.set('Cache-Control', 'public, max-age=86400');
    res.send(buf);
  } catch {
    const { buf, mime } = fallbackAvatar('?');
    res.set('Content-Type', mime).send(buf);
  }
});

// --- авторизация: initData из Telegram или демо-идентификатор ---
app.use('/api', (req, res, next) => {
  const initData = req.get('x-tg-init-data');
  const tgUser = verifyInitData(initData);
  if (tgUser) {
    req.user = db.getUser(tgUser.id, [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' '));
    req.tgUser = tgUser;
  } else if (DEMO_MODE) {
    const demoId = String(req.get('x-demo-id') || '').slice(0, 64);
    if (!demoId) return res.status(401).json({ error: 'no identity' });
    req.user = db.getUser('demo-' + demoId, req.get('x-demo-name') ? decodeURIComponent(req.get('x-demo-name')).slice(0, 40) : 'Гость');
  } else {
    return res.status(401).json({ error: 'invalid initData' });
  }
  next();
});

app.get('/api/config', (req, res) => {
  res.json({
    demoMode: DEMO_MODE,
    botUsername: process.env.BOT_USERNAME || null,
    appShortName: process.env.APP_SHORT_NAME || null,
    adsgram: {
      interstitial: process.env.ADSGRAM_INTERSTITIAL_ID || null,
      rewarded: process.env.ADSGRAM_REWARDED_ID || null,
    },
    catalog: CATALOG,
    achievements: ACHIEVEMENTS,
    support: process.env.SUPPORT_USERNAME || null,
    ownerId: process.env.OWNER_ID || '455839789',
  });
});

app.get('/api/me', (req, res) => res.json({ user: db.publicUser(req.user) }));

// Клиент присылает photo_url из initData — так аватар виден даже у тех,
// чьи фото скрыты настройками приватности от ботов.
app.post('/api/me/photo', (req, res) => {
  const url = String(req.body?.url || '').slice(0, 500);
  if (!url) { // фото в Telegram убрали — чистим кэш и ссылку
    if (db.setPhotoUrl(req.user, null)) invalidateAvatar(req.user.id);
    return res.json({ ok: true, cleared: true });
  }
  if (!isSafePhotoUrl(url)) return res.status(400).json({ error: 'bad photo url' });
  if (db.setPhotoUrl(req.user, url)) invalidateAvatar(req.user.id);
  res.json({ ok: true });
});

// Создать инвойс Stars. Покупка активируется ботом по successful_payment.
app.post('/api/invoice', async (req, res) => {
  const p = byId[req.body?.product];
  if (!p) return res.status(400).json({ error: 'unknown product' });
  if (!BOT_TOKEN) return res.status(400).json({ error: 'payments unavailable in demo', demo: true });
  try {
    const url = await createStarsInvoice({
      title: p.title, description: p.desc, stars: p.stars,
      payload: `${p.id}:${req.user.id}`,
    });
    res.json({ url });
  } catch (e) { res.status(502).json({ error: e.message }); }
});

// Демо-покупка (только когда нет BOT_TOKEN / DEMO_MODE=1) — чтобы всё
// можно было протестировать без Telegram. В продакшене недоступна.
app.post('/api/demo-purchase', (req, res) => {
  if (!DEMO_MODE) return res.status(403).json({ error: 'disabled' });
  const r = db.grant(req.user.id, req.body?.product, 'demo');
  if (!r.ok) return res.status(400).json(r);
  res.json({ user: db.publicUser(r.user) });
});

app.post('/api/hints/use', (req, res) => {
  res.json({ ok: db.useHint(req.user), user: db.publicUser(req.user) });
});

// Награда за просмотр rewarded-рекламы (до 5 в день).
app.post('/api/hints/reward', (req, res) => {
  res.json({ ok: db.addRewardedHint(req.user), user: db.publicUser(req.user) });
});

app.post('/api/games', (req, res) => {
  const g = db.saveGame(req.user, req.body || {});
  res.json({ game: g });
});
app.get('/api/games', (req, res) => res.json({ games: db.listGames(req.user) }));

// Таблица лидеров: ?scope=all (по умолчанию) или friends
app.get('/api/leaderboard', (req, res) => {
  const scope = req.query.scope === 'friends' ? 'friends' : 'all';
  res.json(db.leaderboard(scope, req.user));
});

// Прогресс обучения/задач — для достижений
app.post('/api/puzzles/solved', (req, res) => {
  const fresh = db.recordPuzzle(req.user, String(req.body?.id || '').slice(0, 20));
  res.json({ ok: true, new_achievements: fresh, user: db.publicUser(req.user) });
});
app.post('/api/lessons/done', (req, res) => {
  const fresh = db.recordLesson(req.user, String(req.body?.id || '').slice(0, 20));
  res.json({ ok: true, new_achievements: fresh, user: db.publicUser(req.user) });
});

app.post('/api/analysis/unlock', (req, res) => {
  const r = db.unlockAnalysis(req.user, req.body?.gameId);
  res.json({ ...r, user: db.publicUser(req.user) });
});

app.get('/healthz', (req, res) => res.send('ok'));

// --- статика мини-аппа ---
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h', index: 'index.html' }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));

const server = http.createServer(app);

// --- WebSocket комнаты ---
const wss = new WebSocketServer({ server, path: '/ws' });
const rooms = new RoomManager(({ pgn, result, reason, rated, players }) => {
  // сохраняем завершённую партию обоим реальным пользователям + Elo (zero-sum)
  const uw = players.w?.id ? db.getUser(players.w.id, players.w.name) : null;
  const ub = players.b?.id ? db.getUser(players.b.id, players.b.name) : null;
  const dW = rated && uw && ub ? delta(uw.rating, ub.rating, scoreOf(result, 'w'), K_FRIEND) : 0;
  for (const c of ['w', 'b']) {
    const p = players[c]; const u = c === 'w' ? uw : ub;
    if (p?.id && u) {
      const opp = c === 'w' ? players.b : players.w;
      db.saveGame(u, {
        mode: 'friend', result, player_color: c, pgn, rated,
        rating_delta: rated ? (c === 'w' ? dW : -dW) : 0,
        opponent: opp?.id ? { id: opp.id, name: opp.name } : null,
      });
    }
  }
});
wss.on('connection', ws => rooms.attach(ws));
setInterval(() => { wss.clients.forEach(ws => { if (!ws.isAlive) return ws.terminate(); ws.isAlive = false; ws.ping(); }); }, 30000);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[server] Шахматный Клуб на http://0.0.0.0:${PORT} (demo=${DEMO_MODE})`);
});

for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    console.log(`[server] ${sig} — сохраняю данные и выключаюсь`);
    await db.flushDb();
    process.exit(0);
  });
}

startBot();
