// Комнаты для игры с другом. Сервер-authoritative: ходы проверяет chess.js,
// часы считает сервер. Протокол — JSON поверх WebSocket.
import { Chess } from '../public/vendor/chess.js';
import { verifyInitData, DEMO_MODE } from './telegram.js';
import { avatarUrl } from './avatars.js';

const TIME_CONTROLS = { none: null, '3+2': { base: 180000, inc: 2000 }, '5+0': { base: 300000, inc: 0 }, '10+0': { base: 600000, inc: 0 } };
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

export class RoomManager {
  constructor(onGameEnd) {
    this.rooms = new Map();
    this.sockets = new Set();
    this.onGameEnd = onGameEnd || (() => {});
    setInterval(() => this.tick(), 1000);
    setInterval(() => this.cleanup(), 60000);
    // Heartbeat: «мёртвые» после вылета сокеты отваливаются за ~40 с,
    // иначе сервер считает игрока онлайн и не пускает его обратно в партию.
    setInterval(() => this.heartbeat(), 20000);
  }

  heartbeat() {
    for (const ws of this.sockets) {
      if (ws.isAlive === false) { try { ws.terminate(); } catch {} this.sockets.delete(ws); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch {}
    }
  }

  // Личность берём из подписи Telegram initData, а не из того, что прислал клиент.
  auth(m) {
    const tgUser = verifyInitData(m?.initData);
    if (tgUser) return { id: String(tgUser.id), name: [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') || 'Игрок' };
    if (DEMO_MODE && m?.userId) return { id: String(m.userId).slice(0, 64), name: String(m.name || 'Игрок').slice(0, 40) };
    return null;
  }

  attach(ws) {
    this.sockets.add(ws);
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      try { this.handle(ws, m); } catch (e) { this.send(ws, { t: 'error', message: e.message }); }
    });
    ws.on('close', () => { this.sockets.delete(ws); this.onLeave(ws); });
  }

  send(ws, m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

  handle(ws, m) {
    if (typeof m.t === 'string' && m.t.startsWith('t_') && this.tournaments) return this.tournaments.handle(ws, m);
    switch (m.t) {
      case 'create': {
        const who = this.auth(m);
        if (!who) return this.send(ws, { t: 'error', message: 'Не удалось подтвердить аккаунт. Откройте игру через бота.', fatal: true });
        const code = genCode();
        const color = m.color === 'b' ? 'b' : m.color === 'w' ? 'w' : (Math.random() < 0.5 ? 'w' : 'b');
        const room = {
          code, chess: new Chess(), status: 'waiting',
          tc: TIME_CONTROLS[m.tc] ?? null, tcName: m.tc || 'none',
          rated: m.rated !== false,
          players: { [color]: { id: who.id, name: who.name.slice(0, 40), ws } },
          clocks: null, turnStart: 0, moves: [], lastMove: null,
          result: null, resultReason: null, drawOffer: null, rematch: new Set(),
          created: Date.now(), endedAt: 0,
        };
        this.rooms.set(code, room);
        ws.roomCode = code; ws.userId = who.id;
        this.send(ws, { t: 'created', code, color });
        this.broadcastState(room);
        break;
      }
      case 'join': {
        const room = this.rooms.get(String(m.code || '').toUpperCase());
        if (!room) return this.send(ws, { t: 'error', message: 'Комната не найдена. Проверьте код.', fatal: true });
        const who = this.auth(m);
        if (!who) return this.send(ws, { t: 'error', message: 'Не удалось подтвердить аккаунт. Откройте игру через бота.', fatal: true });
        const uid = who.id;
        // Возврат в партию: тот же подтверждённый аккаунт забирает своё место,
        // даже если старый сокет ещё «висит» после вылета Telegram.
        for (const c of ['w', 'b']) {
          const p = room.players[c];
          if (p && p.id === uid) {
            if (p.ws && p.ws !== ws) {
              this.send(p.ws, { t: 'replaced' });
              try { p.ws.terminate(); } catch {}
              this.sockets.delete(p.ws);
            }
            p.ws = ws; p.name = (who.name || p.name).slice(0, 40); p.disconnectedAt = 0;
            ws.roomCode = room.code; ws.userId = uid;
            this.send(ws, { t: 'joined', code: room.code, color: c });
            this.broadcast(room, { t: 'opponent_reconnected' });
            if (room.status === 'waiting' && room.players.w?.ws && room.players.b?.ws) this.start(room);
            else this.broadcastState(room);
            return;
          }
        }
        if (room.status !== 'waiting') return this.send(ws, { t: 'error', message: 'В этой комнате уже идёт партия.', fatal: true });
        const free = room.players.w ? 'b' : 'w';
        room.players[free] = { id: uid, name: who.name.slice(0, 40), ws };
        ws.roomCode = room.code; ws.userId = uid;
        this.send(ws, { t: 'joined', code: room.code, color: free });
        this.start(room);
        break;
      }
      case 'move': {
        const room = this.roomOf(ws); if (!room || room.status !== 'active') return;
        const color = this.colorOf(ws, room);
        if (!color || room.chess.turn() !== color) return this.send(ws, { t: 'error', message: 'Сейчас не ваш ход.' });
        let mv;
        try { mv = room.chess.move({ from: m.from, to: m.to, promotion: m.promotion || 'q' }); } catch { mv = null; }
        if (!mv) return this.send(ws, { t: 'error', message: 'Невозможный ход.' });
        if (room.tc) {
          const now = Date.now();
          room.clocks[color] -= now - room.turnStart;
          room.clocks[color] += room.tc.inc;
          room.turnStart = now;
        }
        room.moves.push(mv.san);
        room.lastMove = { from: mv.from, to: mv.to };
        room.drawOffer = null;
        this.checkGameOver(room);
        this.broadcastState(room);
        break;
      }
      case 'resign': {
        const room = this.roomOf(ws); if (!room || room.status !== 'active') return;
        const color = this.colorOf(ws, room);
        this.end(room, color === 'w' ? 'b' : 'w', 'resign');
        break;
      }
      case 'offer_draw': {
        const room = this.roomOf(ws); if (!room || room.status !== 'active') return;
        room.drawOffer = this.colorOf(ws, room);
        this.broadcastState(room);
        break;
      }
      case 'accept_draw': {
        const room = this.roomOf(ws); if (!room || room.status !== 'active' || !room.drawOffer) return;
        if (this.colorOf(ws, room) === room.drawOffer) return;
        this.end(room, 'draw', 'agreement');
        break;
      }
      case 'decline_draw': {
        const room = this.roomOf(ws); if (!room) return;
        room.drawOffer = null; this.broadcastState(room);
        break;
      }
      case 'rematch': {
        const room = this.roomOf(ws); if (!room || room.status !== 'over' || room.meta?.tournament) return;
        const color = this.colorOf(ws, room);
        room.rematch.add(color);
        if (room.rematch.size === 2) {
          const old = room.players;
          room.players = { w: old.b, b: old.w }; // меняемся цветами
          room.chess = new Chess(); room.moves = []; room.lastMove = null;
          room.result = null; room.resultReason = null; room.drawOffer = null; room.rematch = new Set();
          this.start(room);
        } else this.broadcastState(room);
        break;
      }
      case 'chat': {
        const room = this.roomOf(ws); if (!room) return;
        const phrases = ['Привет! 👋', 'Хорошая игра! 🤝', 'Удачи! 🍀', 'Ого! 😮', 'Спасибо за партию! ♟'];
        if (phrases.includes(m.text)) this.broadcast(room, { t: 'chat', from: this.colorOf(ws, room), text: m.text });
        break;
      }
      case 'sync': {
        const room = this.roomOf(ws); if (room) this.broadcastState(room);
        break;
      }
      case 'leave': this.onLeave(ws, true); break;
    }
  }

  // Комната турнирной пары: оба игрока известны заранее, сокеты придут позже.
  createMatchRoom({ w, b, tc, rated, meta }) {
    const code = genCode();
    const room = {
      code, chess: new Chess(), status: 'waiting',
      tc: TIME_CONTROLS[tc] ?? null, tcName: tc || 'none',
      rated: rated !== false,
      players: {
        w: { id: String(w.id), name: String(w.name || 'Игрок').slice(0, 40), ws: null },
        b: { id: String(b.id), name: String(b.name || 'Игрок').slice(0, 40), ws: null },
      },
      clocks: null, turnStart: 0, moves: [], lastMove: null,
      result: null, resultReason: null, drawOffer: null, rematch: new Set(),
      created: Date.now(), endedAt: 0, meta: meta || null,
    };
    this.rooms.set(code, room);
    return room;
  }

  start(room) {
    room.status = 'active';
    if (room.tc) { room.clocks = { w: room.tc.base, b: room.tc.base }; room.turnStart = Date.now(); }
    this.broadcast(room, { t: 'started' });
    this.broadcastState(room);
  }

  checkGameOver(room) {
    const c = room.chess;
    if (c.isCheckmate()) this.end(room, c.turn() === 'w' ? 'b' : 'w', 'checkmate');
    else if (c.isStalemate()) this.end(room, 'draw', 'stalemate');
    else if (c.isInsufficientMaterial()) this.end(room, 'draw', 'material');
    else if (c.isThreefoldRepetition()) this.end(room, 'draw', 'repetition');
    else if (c.isDrawByFiftyMoves()) this.end(room, 'draw', 'fifty');
  }

  end(room, result, reason) {
    if (room.status === 'over') return;
    room.status = 'over'; room.result = result; room.resultReason = reason; room.endedAt = Date.now();
    this.broadcastState(room);
    try {
      this.onGameEnd({
        code: room.code, meta: room.meta || null,
        pgn: room.chess.pgn(), result, reason, rated: room.rated,
        players: { w: { id: room.players.w?.id, name: room.players.w?.name }, b: { id: room.players.b?.id, name: room.players.b?.name } },
      });
    } catch (e) { console.error('[rooms] onGameEnd', e); }
  }

  tick() {
    const now = Date.now();
    for (const room of this.rooms.values()) {
      if (room.status === 'waiting') {
        if (room.meta?.tournament) continue; // ждём игроков сколько нужно (следит турнирный менеджер)
        const owner = room.players.w || room.players.b;
        if (owner?.disconnectedAt && now - owner.disconnectedAt > 180000) this.rooms.delete(room.code);
        continue;
      }
      if (room.status !== 'active') continue;
      if (room.tc) {
        const turn = room.chess.turn();
        const left = room.clocks[turn] - (now - room.turnStart);
        if (left <= 0) { this.end(room, turn === 'w' ? 'b' : 'w', 'timeout'); continue; }
        this.broadcast(room, { t: 'clock', w: turn === 'w' ? left : room.clocks.w, b: turn === 'b' ? left : room.clocks.b });
      }
      // forfeit при долгом дисконнекте
      for (const c of ['w', 'b']) {
        const p = room.players[c];
        if (p?.disconnectedAt && now - p.disconnectedAt > 180000) {
          this.end(room, c === 'w' ? 'b' : 'w', 'abandon');
        }
      }
    }
  }

  onLeave(ws, explicit = false) {
    const room = this.roomOf(ws); if (!room) return;
    const color = this.colorOf(ws, room);
    if (!color) return;
    const p = room.players[color];
    if (p.ws !== ws) return;
    p.ws = null;
    if (room.status === 'waiting') {
      if (room.meta?.tournament) return; // вышел из экрана — место в сетке сохраняется
      if (explicit) { this.rooms.delete(room.code); return; }
      p.disconnectedAt = Date.now(); // создатель вылетел — комната живёт ещё 3 минуты
      return;
    }
    if (explicit && room.status !== 'active') { this.rooms.delete(room.code); return; }
    if (room.status === 'active') {
      p.disconnectedAt = Date.now();
      this.broadcast(room, { t: 'opponent_disconnected', grace: 180 });
    }
    if (explicit) ws.roomCode = null;
  }

  roomOf(ws) { return ws.roomCode ? this.rooms.get(ws.roomCode) : null; }
  colorOf(ws, room) {
    for (const c of ['w', 'b']) if (room.players[c]?.id === ws.userId) return c;
    return null;
  }

  stateFor(room, color) {
    const c = room.chess;
    const now = Date.now();
    const clocks = room.tc && room.status === 'active'
      ? { w: room.clocks.w - (c.turn() === 'w' ? now - room.turnStart : 0), b: room.clocks.b - (c.turn() === 'b' ? now - room.turnStart : 0) }
      : room.clocks;
    return {
      t: 'state', code: room.code, status: room.status, you: color,
      fen: c.fen(), turn: c.turn(), moves: room.moves, lastMove: room.lastMove,
      check: c.inCheck(), clocks, tc: room.tcName, rated: room.rated,
      players: {
        w: room.players.w && { name: room.players.w.name, avatar: avatarUrl(room.players.w.id), online: !!room.players.w.ws },
        b: room.players.b && { name: room.players.b.name, avatar: avatarUrl(room.players.b.id), online: !!room.players.b.ws },
      },
      result: room.result, reason: room.resultReason, meta: room.meta || null,
      drawOffer: room.drawOffer, rematch: [...room.rematch],
      legal: room.status === 'active' && c.turn() === color ? c.moves({ verbose: true }).map(m => ({ from: m.from, to: m.to, promotion: m.promotion })) : [],
    };
  }

  broadcastState(room) {
    for (const c of ['w', 'b']) {
      const p = room.players[c];
      if (p?.ws) this.send(p.ws, this.stateFor(room, c));
    }
  }
  broadcast(room, m) { for (const c of ['w', 'b']) this.send(room.players[c]?.ws, m); }

  cleanup() {
    const now = Date.now();
    for (const [code, r] of this.rooms) {
      if (r.meta?.tournament) { if (now - r.created > 6 * 3600000) this.rooms.delete(code); continue; }
      if (r.status === 'over' && now - r.endedAt > 600000) { this.rooms.delete(code); continue; }
      if (now - r.created > 3600000) { this.rooms.delete(code); continue; }
      const anyWs = r.players.w?.ws || r.players.b?.ws;
      if (!anyWs) {
        const last = Math.max(r.players.w?.disconnectedAt || 0, r.players.b?.disconnectedAt || 0, r.created);
        if (now - last > 180000) this.rooms.delete(code);
      }
    }
  }
}
