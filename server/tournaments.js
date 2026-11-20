// Турниры на выбывание (single elimination): 4 / 8 / 16 игроков.
// Сетка живёт на сервере, партии играются в обычных комнатах RoomManager.
// Ничья → переигровка со сменой цвета (до 2 раз), затем тай-брейк по рейтингу.
import { avatarUrl } from './avatars.js';
import * as db from './db.js';

const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genId = () => 'T' + Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');
export const SIZES = [4, 8, 16];
const MAX_GAMES = 3;           // основная партия + 2 переигровки
const NOSHOW_MS = 5 * 60000;   // 5 минут на то, чтобы оба вошли в партию
const REG_TTL = 6 * 3600000;   // незапущенный турнир живёт 6 часов

// ── чистая логика сетки (покрыта тестами) ────────────────────────────
// Классический посев: 1-й сеется с последним, 2-й с предпоследним и т.д.
export function seedOrder(size) {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    const next = [];
    for (const s of order) { next.push(s, n + 1 - s); }
    order = next;
  }
  return order;
}

export function roundsCount(size) { return Math.log2(size); }

export function roundTitle(size, round) {
  const left = roundsCount(size) - round;
  if (left === 1) return 'Финал';
  if (left === 2) return 'Полуфинал';
  if (left === 3) return '1/4 финала';
  return '1/' + Math.pow(2, left - 1) + ' финала';
}

// players: [{id,name,rating}] — сеются по рейтингу, пустые места = проход (bye)
export function makeBracket(players, size) {
  const seeded = [...players].sort((a, b) => (b.rating || 1200) - (a.rating || 1200));
  const order = seedOrder(size);
  const slot = seed => seeded[seed - 1] ? { ...seeded[seed - 1] } : null;
  const rounds = [];
  const first = [];
  for (let i = 0; i < size; i += 2) {
    first.push(newMatch(0, i / 2, slot(order[i]), slot(order[i + 1])));
  }
  rounds.push(first);
  for (let r = 1; r < roundsCount(size); r++) {
    const row = [];
    for (let i = 0; i < first.length / Math.pow(2, r); i++) row.push(newMatch(r, i, null, null));
    rounds.push(row);
  }
  return rounds;
}

export function newMatch(round, idx, a, b) {
  return { id: `r${round}m${idx}`, round, idx, a, b, status: 'pending', winner: null, games: [], roomCode: null, readyAt: 0 };
}

// Куда попадает победитель матча
export function nextSlot(round, idx) {
  return { round: round + 1, idx: Math.floor(idx / 2), side: idx % 2 === 0 ? 'a' : 'b' };
}

// Матч с одним игроком (или пустой) — проход без игры
export function byeWinner(m) {
  if (m.a && !m.b) return m.a;
  if (!m.a && m.b) return m.b;
  return null; // оба пусты — ветка пустая
}

export function matchPlayable(m) { return !!(m.a && m.b) && m.status !== 'over'; }

// ── менеджер ─────────────────────────────────────────────────────────
export class TournamentManager {
  constructor(rooms) {
    this.rooms = rooms;
    this.watchers = new Map(); // id → Set<ws>
    setInterval(() => this.tick(), 30000);
  }

  all() { return db.allTournaments(); }
  get(id) { return db.getTournament(String(id || '').toUpperCase()); }

  handle(ws, m) {
    const who = this.rooms.auth(m);
    if (!who) return this.rooms.send(ws, { t: 'error', message: 'Не удалось подтвердить аккаунт. Откройте игру через бота.' });
    ws.userId = who.id; ws.userName = who.name;
    switch (m.t) {
      case 't_create': return this.create(ws, who, m);
      case 't_join': return this.join(ws, who, m);
      case 't_watch': return this.watch(ws, who, m);
      case 't_start': return this.start(ws, who, m);
      case 't_play': return this.play(ws, who, m);
      case 't_leave': return this.leave(ws, who, m);
      case 't_cancel': return this.cancel(ws, who, m);
      case 't_list': return this.rooms.send(ws, { t: 't_list', items: this.summaries(who.id) });
    }
  }

  create(ws, who, m) {
    const size = SIZES.includes(Number(m.size)) ? Number(m.size) : 4;
    const name = String(m.title || m.name || 'Турнир клуба').slice(0, 40).trim() || 'Турнир клуба';
    const u = db.getUser(who.id, who.name);
    const t = {
      id: genId(), name, size, ownerId: who.id,
      tc: ['none', '3+2', '5+0', '10+0'].includes(m.tc) ? m.tc : '5+0',
      rated: m.rated !== false,
      status: 'registration', created: Date.now(), startedAt: 0, finishedAt: 0,
      players: [{ id: who.id, name: who.name.slice(0, 40), rating: u?.rating ?? 1200 }],
      rounds: [], champion: null,
    };
    db.putTournament(t);
    this.subscribe(ws, t.id);
    this.rooms.send(ws, { t: 't_created', id: t.id });
    this.push(t);
  }

  join(ws, who, m) {
    const t = this.get(m.id);
    if (!t) return this.rooms.send(ws, { t: 'error', message: 'Турнир не найден. Проверьте код.' });
    this.subscribe(ws, t.id);
    if (t.players.some(p => p.id === who.id)) return this.pushOne(t, ws);
    if (t.status !== 'registration') return this.rooms.send(ws, { t: 'error', message: 'Турнир уже начался — присоединиться нельзя.' });
    if (t.players.length >= t.size) return this.rooms.send(ws, { t: 'error', message: 'Все места заняты.' });
    const u = db.getUser(who.id, who.name);
    t.players.push({ id: who.id, name: who.name.slice(0, 40), rating: u?.rating ?? 1200 });
    db.putTournament(t);
    this.push(t);
  }

  watch(ws, who, m) {
    const t = this.get(m.id);
    if (!t) return this.rooms.send(ws, { t: 'error', message: 'Турнир не найден. Проверьте код.' });
    this.subscribe(ws, t.id);
    this.pushOne(t, ws);
  }

  leave(ws, who, m) {
    const t = this.get(m.id);
    if (!t || t.status !== 'registration') return;
    if (t.ownerId === who.id) return this.cancel(ws, who, m);
    t.players = t.players.filter(p => p.id !== who.id);
    db.putTournament(t);
    this.push(t);
  }

  cancel(ws, who, m) {
    const t = this.get(m.id);
    if (!t || t.ownerId !== who.id) return;
    t.status = 'cancelled'; t.finishedAt = Date.now();
    db.putTournament(t);
    this.push(t);
  }

  start(ws, who, m) {
    const t = this.get(m.id);
    if (!t) return;
    if (t.ownerId !== who.id) return this.rooms.send(ws, { t: 'error', message: 'Запустить турнир может только организатор.' });
    if (t.status !== 'registration') return;
    if (t.players.length < 2) return this.rooms.send(ws, { t: 'error', message: 'Нужно минимум 2 игрока.' });
    t.rounds = makeBracket(t.players, t.size);
    t.status = 'running'; t.startedAt = Date.now();
    // проходы (bye) проставляем сразу
    for (const m0 of t.rounds[0]) {
      if (!matchPlayable(m0)) {
        m0.status = 'over';
        const w = byeWinner(m0);
        m0.winner = w?.id || null;
        this.advance(t, m0, w);
      }
    }
    this.markReady(t);
    db.putTournament(t);
    this.push(t);
  }

  markReady(t) {
    for (const row of t.rounds) for (const m of row) {
      if (matchPlayable(m) && m.status === 'pending') { m.status = 'ready'; m.readyAt = Date.now(); }
    }
  }

  advance(t, match, winner) {
    const { round, idx, side } = nextSlot(match.round, match.idx);
    if (round >= t.rounds.length) { // финал
      t.champion = winner ? { ...winner } : null;
      t.status = 'finished'; t.finishedAt = Date.now();
      return;
    }
    const next = t.rounds[round][idx];
    next[side] = winner ? { ...winner } : null;
    // если обе ветки-источника уже решены и соперника нет — это проход (bye) дальше
    if (this.slotResolved(t, round, idx, 'a') && this.slotResolved(t, round, idx, 'b')) {
      if (!next.a || !next.b) {
        const w = next.a || next.b || null;
        next.status = 'over'; next.winner = w?.id || null;
        this.advance(t, next, w);
      }
    }
  }

  // Слот «resolved», если породивший его матч завершён
  slotResolved(t, round, idx, side) {
    if (round === 0) return true;
    const src = t.rounds[round - 1][idx * 2 + (side === 'a' ? 0 : 1)];
    return src?.status === 'over';
  }

  play(ws, who, m) {
    const t = this.get(m.id);
    if (!t || t.status !== 'running') return this.rooms.send(ws, { t: 'error', message: 'Турнир не идёт.' });
    this.subscribe(ws, t.id);
    const match = this.myMatch(t, who.id);
    if (!match) return this.rooms.send(ws, { t: 'error', message: 'Сейчас у вас нет пары в сетке.' });
    if (match.status === 'over') return this.rooms.send(ws, { t: 'error', message: 'Эта пара уже сыграна.' });
    if (!match.roomCode || !this.rooms.rooms.get(match.roomCode)) {
      const gameNo = match.games.length;
      // чётная партия — a белыми, нечётная — меняемся
      const w = gameNo % 2 === 0 ? match.a : match.b;
      const b = gameNo % 2 === 0 ? match.b : match.a;
      const room = this.rooms.createMatchRoom({
        w, b, tc: t.tc, rated: t.rated,
        meta: { tournament: t.id, match: match.id },
      });
      match.roomCode = room.code; match.status = 'active'; match.readyAt = Date.now();
      db.putTournament(t);
      this.push(t);
    }
    const room = this.rooms.rooms.get(match.roomCode);
    const color = room.players.w?.id === who.id ? 'w' : 'b';
    this.rooms.send(ws, { t: 't_room', id: t.id, code: room.code, color });
  }

  myMatch(t, uid) {
    for (const row of t.rounds) for (const m of row) {
      if (m.status !== 'over' && (m.a?.id === uid || m.b?.id === uid) && m.a && m.b) return m;
    }
    return null;
  }

  // вызывается из RoomManager при завершении партии
  onRoomEnd({ code, meta, result, reason }) {
    if (!meta?.tournament) return;
    const t = this.get(meta.tournament);
    if (!t || t.status !== 'running') return;
    const match = t.rounds.flat().find(m => m.id === meta.match);
    if (!match || match.status === 'over') return;
    const room = this.rooms.rooms.get(code);
    const wId = room?.players.w?.id, bId = room?.players.b?.id;
    match.games.push({ code, result, reason, w: wId, b: bId });
    match.roomCode = null;

    if (result === 'draw' && match.games.length < MAX_GAMES) {
      match.status = 'ready'; match.readyAt = Date.now(); // переигровка со сменой цвета
      db.putTournament(t);
      this.push(t);
      return;
    }
    let winner = null;
    if (result === 'w') winner = match.a?.id === wId ? match.a : match.b;
    else if (result === 'b') winner = match.a?.id === bId ? match.a : match.b;
    else { // ничья после всех переигровок — тай-брейк по рейтингу
      const ra = match.a?.rating ?? 1200, rb = match.b?.rating ?? 1200;
      winner = ra === rb ? (Math.random() < 0.5 ? match.a : match.b) : (ra > rb ? match.a : match.b);
      match.tiebreak = true;
    }
    match.status = 'over'; match.winner = winner?.id || null; match.reason = reason;
    this.advance(t, match, winner);
    this.markReady(t);
    db.putTournament(t);
    this.push(t);
  }

  tick() {
    const now = Date.now();
    for (const t of this.all()) {
      if (t.status === 'registration' && now - t.created > REG_TTL) {
        t.status = 'cancelled'; t.finishedAt = now; db.putTournament(t); this.push(t); continue;
      }
      if (t.status !== 'running') continue;
      for (const row of t.rounds) for (const m of row) {
        if (m.status !== 'active' || !m.roomCode) continue;
        const room = this.rooms.rooms.get(m.roomCode);
        if (!room) { m.status = 'ready'; m.roomCode = null; continue; }
        if (room.status !== 'waiting') continue;
        if (now - m.readyAt < NOSHOW_MS) continue;
        // неявка: проходит тот, кто зашёл в партию; если никто — старший посев
        const inW = !!room.players.w?.ws, inB = !!room.players.b?.ws;
        let winner;
        if (inW && !inB) winner = room.players.w.id === m.a?.id ? m.a : m.b;
        else if (inB && !inW) winner = room.players.b.id === m.a?.id ? m.a : m.b;
        else winner = (m.a?.rating ?? 1200) >= (m.b?.rating ?? 1200) ? m.a : m.b;
        m.games.push({ code: room.code, result: 'noshow', reason: 'noshow' });
        m.status = 'over'; m.winner = winner?.id || null; m.reason = 'noshow'; m.roomCode = null;
        this.rooms.rooms.delete(room.code);
        this.advance(t, m, winner);
        this.markReady(t);
        db.putTournament(t);
        this.push(t);
      }
    }
  }

  // ── подписки и рассылка ────────────────────────────────────────────
  subscribe(ws, id) {
    if (!this.watchers.has(id)) this.watchers.set(id, new Set());
    this.watchers.get(id).add(ws);
    ws.tourId = id;
  }

  pushOne(t, ws) { this.rooms.send(ws, this.state(t, ws.userId)); }

  push(t) {
    const set = this.watchers.get(t.id);
    if (!set) return;
    for (const ws of [...set]) {
      if (ws.readyState !== 1) { set.delete(ws); continue; }
      this.rooms.send(ws, this.state(t, ws.userId));
    }
  }

  person(p) { return p ? { id: p.id, name: p.name, rating: p.rating, avatar: avatarUrl(p.id) } : null; }

  state(t, uid) {
    const my = uid ? this.myMatch(t, uid) : null;
    return {
      t: 't_state', id: t.id, name: t.name, size: t.size, tc: t.tc, rated: t.rated,
      status: t.status, ownerId: t.ownerId, created: t.created,
      players: t.players.map(p => this.person(p)),
      rounds: t.rounds.map((row, r) => row.map(m => ({
        id: m.id, round: r, idx: m.idx, a: this.person(m.a), b: this.person(m.b),
        status: m.status, winner: m.winner, games: m.games.map(g => ({ result: g.result, reason: g.reason })),
        tiebreak: !!m.tiebreak, mine: !!(uid && (m.a?.id === uid || m.b?.id === uid)),
      }))),
      roundTitles: t.rounds.map((_, r) => roundTitle(t.size, r)),
      champion: this.person(t.champion),
      you: uid || null, isOwner: t.ownerId === uid,
      myMatch: my ? { id: my.id, status: my.status, opponent: this.person(my.a?.id === uid ? my.b : my.a), games: my.games.length } : null,
    };
  }

  summaries(uid) {
    return this.all()
      .filter(t => t.players.some(p => p.id === uid) && t.status !== 'cancelled')
      .sort((a, b) => b.created - a.created)
      .slice(0, 12)
      .map(t => {
        const my = this.myMatch(t, uid);
        return {
          id: t.id, name: t.name, size: t.size, status: t.status, players: t.players.length,
          created: t.created, champion: t.champion?.name || null,
          myMatch: my ? { status: my.status, opponent: my.a?.id === uid ? my.b?.name : my.a?.name } : null,
          isOwner: t.ownerId === uid,
        };
      });
  }
}
