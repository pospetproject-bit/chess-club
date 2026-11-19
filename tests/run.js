// Тесты: контент (уроки/задачи), движок, каталог, API + WebSocket-комнаты.
import { Chess } from '../public/vendor/chess.js';
import { LESSONS, PACKS } from '../public/js/data-lessons.js';
import { PUZZLES } from '../public/js/data-puzzles.js';
import { bestMove, analyzeFen } from '../public/js/engine.js';
import { CATALOG, byId, PREMIUM_GRANTS } from '../server/catalog.js';
import { adOutcome } from '../public/js/ads-result.js';
import { spawn } from 'node:child_process';
import WebSocket from 'ws';

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; }
  else { fail++; console.error('  ✗ FAIL:', name); }
};
const uciMove = (chess, uci) => chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' });

console.log('— Контент: уроки —');
for (const l of LESSONS) {
  const chess = new Chess(l.fen);
  let valid = true, err = '';
  try {
    for (const st of l.steps) {
      if (st.expect) uciMove(chess, st.expect);
      if (st.reply) uciMove(chess, st.reply);
    }
  } catch (e) { valid = false; err = e.message; }
  ok(valid, `урок ${l.id} «${l.title}» — все ходы легальны ${err}`);
  ok(PACKS.some(p => p.id === l.pack), `урок ${l.id} — пакет существует`);
}
// матовые уроки действительно заканчиваются матом
for (const id of ['b2', 't4', 'e2', 'e3']) {
  const l = LESSONS.find(x => x.id === id);
  const chess = new Chess(l.fen);
  for (const st of l.steps) { if (st.expect) uciMove(chess, st.expect); if (st.reply) uciMove(chess, st.reply); }
  ok(chess.isCheckmate(), `урок ${id} заканчивается матом`);
}
// рокировка в b3
{
  const l = LESSONS.find(x => x.id === 'b3');
  const chess = new Chess(l.fen);
  const mv = uciMove(chess, 'e1g1');
  ok(mv.san === 'O-O', 'b3: e1g1 — это рокировка O-O');
}

console.log('— Контент: задачи —');
for (const p of PUZZLES) {
  const chess = new Chess(p.fen);
  const orientation = p.fen.split(' ')[1];
  let valid = true, err = '';
  try {
    for (let i = 0; i < p.solution.length; i++) {
      const expectedTurn = i % 2 === 0 ? orientation : (orientation === 'w' ? 'b' : 'w');
      if (chess.turn() !== expectedTurn) throw new Error(`ход ${i}: не та сторона`);
      uciMove(chess, p.solution[i]);
    }
  } catch (e) { valid = false; err = e.message; }
  ok(valid, `задача ${p.id} «${p.title}» — решение легально ${err}`);
  if (p.theme.startsWith('мат')) ok(chess.isCheckmate(), `задача ${p.id} заканчивается матом`);
}
// в мате-в-2 первый ход не должен быть пата/мата сразу, а ответ — легальным единственным разумным
{
  const p = PUZZLES.find(x => x.id === 'p7');
  const chess = new Chess(p.fen);
  uciMove(chess, p.solution[0]);
  ok(!chess.isStalemate() && !chess.isCheckmate(), 'p7: первый ход — не пат и не мат');
  const replies = chess.moves();
  ok(replies.length === 1, 'p7: у чёрных единственный ответ (' + replies.join(',') + ')');
}

console.log('— Движок —');
{
  const r = bestMove('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'hard', 800);
  ok(r && r.move, 'hard: находит ход из начальной позиции');
  const chess = new Chess();
  const legal = chess.moves({ verbose: true }).some(m => m.from === r.move.from && m.to === r.move.to);
  ok(legal, 'hard: ход легален');
}
{
  const r = bestMove('6k1/5ppp/8/8/8/8/8/4R2K w - - 0 1', 'hard', 1500);
  ok(r.move.from === 'e1' && r.move.to === 'e8', 'hard: находит мат в 1 (Re8#)');
}
{
  const r = bestMove('6k1/5ppp/8/8/8/8/8/4R2K w - - 0 1', 'easy', 400);
  ok(r && r.move, 'easy: возвращает ход');
}
{
  // не должен зевать ферзя без причины: простой выигрыш ферзя
  const r = bestMove('4k3/8/8/3q4/4P3/8/8/4K3 w - - 0 1', 'hard', 1200);
  ok(r.move.from === 'e4' && r.move.to === 'd5', 'hard: забирает висящего ферзя e4xd5');
}
{
  const a = analyzeFen('6k1/5ppp/8/8/8/8/8/4R2K w - - 0 1', { maxDepth: 3, budget: 800 });
  ok(a.score > 9000, 'analyze: видит мат (score > 9000)');
}

console.log('— Каталог —');
ok(CATALOG.every(p => Number.isInteger(p.stars) && p.stars > 0), 'все цены — целые положительные Stars');
ok(new Set(CATALOG.map(p => p.id)).size === CATALOG.length, 'id товаров уникальны');
ok(CATALOG.filter(p => p.type === 'premium').length === 1, 'ровно один премиум-продукт');
ok(PREMIUM_GRANTS.includes('no_ads'), 'премиум отключает рекламу');

console.log('— Реклама: разбор ответов Adsgram —');
{
  const R = d => ({ description: d, state: 'destroy', error: false, done: true });
  ok(adOutcome(R('The banner was viewed to the end')).ok, 'rewarded: досмотрел → награда');
  ok(!adOutcome({ description: 'The banner was skipped', done: false }).ok, 'rewarded: пропустил → без награды');
  const anti = adOutcome({ description: 'Антифрод: подозрительная активность, награда не засчитана.', done: true });
  ok(!anti.ok, 'rewarded: антифрод не даёт награду даже при done=true');
  const noFill = adOutcome({ description: 'No banner data to show', done: false });
  ok(!noFill.ok && /Свободных роликов/.test(noFill.msg), 'rewarded: нет рекламы → понятное сообщение');
  ok(!adOutcome({ description: 'Упс! В данный момент нет доступной рекламы. Попробуйте ещё раз чуть позже 🙏' }).ok, 'rewarded: русский no-fill распознан');
  ok(adOutcome({ description: 'The user is trying to watch several ads in a row.', error: true }).silent, 'rewarded: слишком часто → без дубля тоста (SDK сам показывает alert)');
  ok(adOutcome({ description: 'Attempt to call show when an ad is being shown', error: true }).silent, 'rewarded: повторный show → тихо');
  const rend = adOutcome({ description: 'Error during render ad', error: true });
  ok(rend.err && /Обнови Telegram/.test(rend.msg), 'rewarded: ошибка рендера → совет обновить Telegram');
  const play = adOutcome({ description: 'Error during playing ad', error: true });
  ok(play.err && /энергосбережение/.test(play.msg), 'rewarded: видео не играет → совет про энергосбережение/VPN');
  ok(!adOutcome(undefined).ok && adOutcome(undefined).err, 'rewarded: пустой ответ → ошибка, а не награда');
  ok(adOutcome(R('The banner was viewed to the end')).raw.description === 'The banner was viewed to the end', 'rewarded: сырой ответ сохранён для диагностики');
  ok(adOutcome({ description: 'The interstitial banner was viewed to the end or closed', done: true }).ok, 'interstitial: закрытие засчитывается');
}

console.log('— Рейтинг и достижения —');
{
  const { delta, expected } = await import('../server/rating.js');
  const { ACHIEVEMENTS } = await import('../server/achievements.js');
  const dbm = await import('../server/db.js');
  ok(Math.abs(expected(1200, 1200) - 0.5) < 1e-9, 'Elo: равные рейтинги → ожидание 0.5');
  ok(delta(1200, 1200, 1, 32) === 16, 'Elo: победа над равным +16 (K=32)');
  ok(delta(1200, 1200, 0, 32) === -16, 'Elo: поражение над равным −16');
  ok(delta(1200, 1200, 0.5, 32) === 0, 'Elo: ничья над равным 0');
  ok(delta(1200, 1600, 1, 32) > 16, 'Elo: победа над сильным даёт больше очков');
  const u1 = dbm.getUser('t1', 'A'), u2 = dbm.getUser('t2', 'B');
  const g1 = dbm.saveGame(u1, { mode: 'friend', result: 'w', player_color: 'w', pgn: '1.e4', rated: true, rating_delta: 16, opponent: { id: 't2', name: 'B' } });
  const g2 = dbm.saveGame(u2, { mode: 'friend', result: 'w', player_color: 'b', pgn: '1.e4', rated: true, rating_delta: -16, opponent: { id: 't1', name: 'A' } });
  ok(g1.rating_delta === 16 && u1.rating === 1216, 'рейтинг применяется к победителю');
  ok(u2.rating === 1184, 'рейтинг списывается у проигравшего');
  ok(g1.new_achievements.some(a => a.id === 'first_win'), 'ачивка «Первая победа» выдана');
  ok(g1.new_achievements.some(a => a.id === 'friend_win'), 'ачивка «Дружеский счёт» выдана');
  ok(u1.opponents['t2'] && u2.opponents['t1'], 'оппоненты записаны (для вкладки Друзья)');
  const lb = dbm.leaderboard('all', u1);
  ok(lb.rows[0].id === 't1' && lb.rows[0].rating === 1216, 'лидерборд: лидер первый');
  const lbf = dbm.leaderboard('friends', u2);
  ok(lbf.rows.some(r => r.id === 't1'), 'вкладка Друзья содержит оппонента');
  ok(new Set(ACHIEVEMENTS.map(a => a.id)).size === ACHIEVEMENTS.length, 'id достижений уникальны');
  const casual = dbm.saveGame(u1, { mode: 'bot', result: 'w', player_color: 'w', pgn: '1.e4', rated: false });
  ok(casual.rating_delta === 0 && u1.rating === 1216, 'нерейтинговая партия не меняет рейтинг');
}

// ---------- сервер ----------
console.log('— Сервер: API + WebSocket —');
// чистое состояние БД для детерминированных тестов (персистентность — фича, не баг)
import fs from 'node:fs';
try { fs.unlinkSync(new URL('../data/db.json', import.meta.url)); } catch {}
if (process.env.DATABASE_URL) {
  const { default: pg } = await import('pg');
  const p = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await p.query('DELETE FROM cc_state').catch(() => {});
  await p.end();
}
const PORT = 3199;
const child = spawn('node', ['server/index.js'], { env: { ...process.env, PORT: String(PORT), DEMO_MODE: '1', BOT_TOKEN: '' }, stdio: ['ignore', 'pipe', 'pipe'] });
let serverLog = '';
child.stdout.on('data', d => serverLog += d);
child.stderr.on('data', d => serverLog += d);
const base = `http://127.0.0.1:${PORT}`;

async function waitServer() {
  for (let i = 0; i < 50; i++) {
    try { const r = await fetch(base + '/healthz'); if (r.ok) return true; } catch {}
    await new Promise(r => setTimeout(r, 200));
  }
  return false;
}

const H = { 'Content-Type': 'application/json', 'x-demo-id': 'tester1' };
const j = async (path, opts = {}) => {
  const r = await fetch(base + path, { ...opts, headers: H, body: opts.body ? JSON.stringify(opts.body) : undefined });
  return { status: r.status, data: await r.json().catch(() => null) };
};

try {
  ok(await waitServer(), 'сервер стартовал');
  const cfg = await j('/api/config');
  ok(cfg.status === 200 && cfg.data.demoMode === true, 'config: demoMode=true');
  ok(cfg.data.catalog.length === CATALOG.length, 'config: каталог отдаётся');
  const me0 = await j('/api/me');
  ok(me0.data.user.hints === 3 && me0.data.user.analysis_credits === 1, 'me: стартовые подарки (3 подсказки, 1 разбор)');
  // покупка премиума (демо)
  const buy = await j('/api/demo-purchase', { method: 'POST', body: { product: 'premium_30d' } });
  ok(buy.data.user.premium === true, 'демо-покупка премиума активируется');
  ok(buy.data.user.owned.includes('board:emerald'), 'премиум открывает доски');
  // подсказки при премиуме не тратятся
  const hint = await j('/api/hints/use', { method: 'POST' });
  ok(hint.data.ok && hint.data.user.hints === '∞', 'премиум: подсказки безлимита');
  // партия + разбор
  const g = await j('/api/games', { method: 'POST', body: { mode: 'bot', difficulty: 'easy', result: 'w', player_color: 'w', pgn: '1. e4 e5 2. Qh5 Nc6 3. Bc4 Nf6 4. Qxf7#' } });
  ok(g.data.game?.id, 'партия сохраняется');
  const un = await j('/api/analysis/unlock', { method: 'POST', body: { gameId: g.data.game.id } });
  ok(un.data.ok && un.data.game.analyzed, 'разбор разблокирован (премиум)');
  const games = await j('/api/games');
  ok(games.data.games.length >= 1, 'история партий отдаётся');
  // второй пользователь без премиума: кредиты тратятся
  const H2 = { ...H, 'x-demo-id': 'tester2' };
  const j2 = async (path, opts = {}) => {
    const r = await fetch(base + path, { ...opts, headers: H2, body: opts.body ? JSON.stringify(opts.body) : undefined });
    return r.json();
  };
  const g2 = await j2('/api/games', { method: 'POST', body: { mode: 'bot', result: 'b', player_color: 'w', pgn: '1. f3 e5 2. g4 Qh4#' } });
  const un2 = await j2('/api/analysis/unlock', { method: 'POST', body: { gameId: g2.game.id } });
  ok(un2.ok && un2.user.analysis_credits === 0, 'кредит разбора списывается');
  const un3 = await j2('/api/analysis/unlock', { method: 'POST', body: { gameId: g2.game.id } });
  ok(un3.ok, 'повторный разбор той же партии бесплатен');
  const me2 = await j2('/api/me');
  ok(me2.user.stats.bot.l === 1, 'статистика поражений считается');

  // --- WebSocket: две клиентовые руки ---
  const wsUrl = `ws://127.0.0.1:${PORT}/ws`;
  const mkClient = id => new Promise(res => {
    const ws = new WebSocket(wsUrl);
    const inbox = [];
    const waiters = [];
    ws.on('message', raw => {
      const m = JSON.parse(raw);
      const i = waiters.findIndex(w => w.pred(m));
      if (i >= 0) { const w = waiters.splice(i, 1)[0]; w.res(m); }
      else inbox.push(m);
    });
    ws.on('open', () => res({
      ws, id,
      send: m => ws.send(JSON.stringify(m)),
      wait: (pred, ms = 10000) => new Promise((resolve, reject) => {
        const k = inbox.findIndex(pred);
        if (k >= 0) return resolve(inbox.splice(k, 1)[0]);
        const t = setTimeout(() => reject(new Error('ws wait timeout: ' + id)), ms);
        waiters.push({ pred, res: m => { clearTimeout(t); resolve(m); } });
      }),
    }));
  });
  const A = await mkClient('A'), B = await mkClient('B');
  A.send({ t: 'create', userId: 'ua', name: 'Аня', color: 'w', tc: '5+0' });
  const created = await A.wait(m => m.t === 'created');
  ok(created.code?.length === 5, 'комната создана с кодом');
  B.send({ t: 'join', code: created.code, userId: 'ub', name: 'Боря' });
  const stA = await A.wait(m => m.t === 'state' && m.status === 'active');
  const stB = await B.wait(m => m.t === 'state' && m.status === 'active');
  ok(stA.you === 'w' && stB.you === 'b', 'цвета назначены верно');
  ok(stA.clocks?.w > 299000 && stA.clocks?.w <= 300000, 'часы 5+0 установлены');
  // нелегальный ход от B (не его ход)
  B.send({ t: 'move', from: 'e7', to: 'e5' });
  const errB = await B.wait(m => m.t === 'error');
  ok(/не ваш ход/i.test(errB.message), 'ход не в свою очередь отклонён');
  // легальный e2e4 от A
  A.send({ t: 'move', from: 'e2', to: 'e4' });
  const st2 = await B.wait(m => m.t === 'state' && m.turn === 'b' && m.moves.length === 1);
  ok(st2.moves[0] === 'e4', 'ход e4 принят и разослан');
  ok(st2.legal.some(m => m.from === 'e7' && m.to === 'e5'), 'B получил легальные ходы');
  // нелегальный ход по правилам
  B.send({ t: 'move', from: 'e7', to: 'e4' });
  const err2 = await B.wait(m => m.t === 'error');
  ok(/невозможный/i.test(err2.message), 'нелегальный ход отклонён сервером');
  // ничья по соглашению
  B.send({ t: 'move', from: 'e7', to: 'e5' });
  await A.wait(m => m.t === 'state' && m.turn === 'w' && m.moves.length === 2);
  A.send({ t: 'offer_draw' });
  const stDraw = await B.wait(m => m.t === 'state' && m.drawOffer === 'w');
  ok(stDraw.drawOffer === 'w', 'предложение ничьей дошло');
  B.send({ t: 'accept_draw' });
  const over = await A.wait(m => m.t === 'state' && m.status === 'over' && m.reason === 'agreement');
  ok(over.result === 'draw' && over.reason === 'agreement', 'ничья зафиксирована');
  // реванш со сменой цвета
  A.send({ t: 'rematch' });
  B.send({ t: 'rematch' });
  const reA = await A.wait(m => m.t === 'state' && m.status === 'active' && m.moves.length === 0);
  ok(reA.you === 'b', 'реванш: цвета поменялись');
  // сдача
  B.send({ t: 'resign' });
  const over2 = await A.wait(m => m.t === 'state' && m.status === 'over' && m.reason === 'resign');
  ok(over2.result === 'b' && over2.reason === 'resign', 'сдача после реванша: result=b (победа A)');
  A.ws.close(); B.ws.close();

  // --- Аватары Telegram ---
  const { avatarUrl, checkAvatarSig, fallbackAvatar, getAvatar } = await import('../server/avatars.js');
  const avUrl = avatarUrl('455839789');
  ok(/^\/avatar\/455839789\?s=[0-9a-f]{16}$/.test(avUrl), 'аватар: подписанный URL');
  ok(checkAvatarSig('455839789', avUrl.split('s=')[1]), 'аватар: верная подпись проходит');
  ok(!checkAvatarSig('455839789', '0'.repeat(16)), 'аватар: поддельная подпись отсекается');
  ok(!checkAvatarSig('111', avUrl.split('s=')[1]), 'аватар: подпись не подходит другому id');
  const fb = fallbackAvatar('Никита');
  ok(fb.mime === 'image/svg+xml' && fb.buf.toString().includes('Н'), 'аватар: запасной кружок с буквой');
  ok((await getAvatar('demo-x', 'Пётр')).ok === false, 'аватар: без фото отдаётся запасной вариант');
  const meAv = await j('/api/me');
  ok(/^\/avatar\//.test(meAv.data.user.avatar || ''), 'профиль: ссылка на аватар приходит');
  const lbAv = await j('/api/leaderboard?scope=all');
  ok((lbAv.data.rows || []).length > 0 && (lbAv.data.rows || []).every(r => /^\/avatar\//.test(r.avatar || '')), 'рейтинг: аватары у всех строк');
  const { isSafePhotoUrl } = await import('../server/avatars.js');
  ok(isSafePhotoUrl('https://t.me/i/userpic/320/abc.jpg'), 'аватар: ссылка на CDN Telegram разрешена');
  ok(!isSafePhotoUrl('https://evil.com/x.jpg') && !isSafePhotoUrl('http://t.me/i/userpic/1.jpg') && !isSafePhotoUrl('https://t.me/other/1.jpg'), 'аватар: чужие адреса отклоняются (защита от SSRF)');
  ok((await j('/api/me/photo', { method: 'POST', body: { url: 'https://evil.com/x.jpg' } })).status === 400, 'аватар: сервер не принимает левую ссылку');
  ok((await j('/api/me/photo', { method: 'POST', body: { url: '' } })).data.cleared === true, 'аватар: пустая ссылка снимает фото');
  const avRes = await fetch(base + meAv.data.user.avatar);
  ok(avRes.status === 200 && /image\//.test(avRes.headers.get('content-type') || ''), 'аватар отдаётся картинкой');
  ok((await fetch(base + '/avatar/demo-tester1?s=deadbeefdeadbeef')).status === 403, 'аватар без верной подписи закрыт');

  // --- Возврат в партию после вылета ---
  const C = await mkClient('C'), D = await mkClient('D');
  C.send({ t: 'create', userId: 'uc', name: 'Вера', color: 'w', tc: 'none' });
  const cr2 = await C.wait(m => m.t === 'created');
  D.send({ t: 'join', code: cr2.code, userId: 'ud', name: 'Глеб' });
  await C.wait(m => m.t === 'state' && m.status === 'active');
  await D.wait(m => m.t === 'state' && m.status === 'active');
  // «вылет»: старый сокет ещё висит, игрок открывает приложение заново
  const C2 = await mkClient('C2');
  C2.send({ t: 'join', code: cr2.code, userId: 'uc', name: 'Вера' });
  const back = await C2.wait(m => m.t === 'joined');
  ok(back.color === 'w', 'вылет: тот же аккаунт вернулся на своё место');
  ok((await C.wait(m => m.t === 'replaced')).t === 'replaced', 'вылет: старому сокету приходит «replaced»');
  const stBack = await C2.wait(m => m.t === 'state' && m.status === 'active');
  ok(stBack.you === 'w' && !!stBack.fen, 'вылет: состояние партии восстановлено');
  C2.send({ t: 'move', from: 'e2', to: 'e4' });
  ok((await D.wait(m => m.t === 'state' && m.moves.length === 1)).turn === 'b', 'вылет: ходы после возврата работают');
  const E = await mkClient('E');
  E.send({ t: 'join', code: cr2.code, userId: 'zz', name: 'Чужой' });
  const errE = await E.wait(m => m.t === 'error');
  ok(errE.fatal && /уже идёт партия/.test(errE.message), 'чужой аккаунт в идущую партию не пускают');
  // комната ожидания переживает вылет создателя
  const F = await mkClient('F');
  F.send({ t: 'create', userId: 'uf', name: 'Дана', color: 'b' });
  const crF = await F.wait(m => m.t === 'created');
  F.ws.close();
  await new Promise(r => setTimeout(r, 400));
  const F2 = await mkClient('F2');
  F2.send({ t: 'join', code: crF.code, userId: 'uf', name: 'Дана' });
  ok((await F2.wait(m => m.t === 'joined')).color === 'b', 'комната ожидания жива после вылета создателя');
  for (const cl of [C, C2, D, E, F2]) { try { cl.ws.close(); } catch {} }
} catch (e) {
  fail++; console.error('  ✗ FAIL: серверный тест —', e.message);
  console.error(serverLog.slice(-2000));
} finally {
  child.kill('SIGTERM'); // graceful: сервер сбрасывает данные перед выходом
  await new Promise(r => { child.on('exit', r); setTimeout(r, 2000); });
}

console.log(`\nИтог: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
