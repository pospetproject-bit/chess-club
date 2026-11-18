// Комнаты для игры с другом. Сервер-authoritative: ходы проверяет chess.js,
// часы считает сервер. Протокол — JSON поверх WebSocket.
import { Chess } from '../public/vendor/chess.js';

const TIME_CONTROLS = { none: null, '3+2': { base: 180000, inc: 2000 }, '5+0': { base: 300000, inc: 0 }, '10+0': { base: 600000, inc: 0 } };
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const genCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

export class RoomManager {
  constructor(onGameEnd) {
    this.rooms = new Map();
    this.onGameEnd = onGameEnd || (() => {});
    setInterval(() => this.tick(), 1000);
    setInterval(() => this.cleanup(), 60000);
  }

  attach(ws) {
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    ws.on('message', raw => {
      let m; try { m = JSON.parse(raw); } catch { return; }
      try { this.handle(ws, m); } catch (e) { this.send(ws, { t: 'error', message: e.message }); }
    });
    ws.on('close', () => this.onLeave(ws));
  }

  send(ws, m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

  handle(ws, m) {
    switch (m.t) {
      case 'create': {
        const code = genCode();
        const color = m.color === 'b' ? 'b' : m.color === 'w' ? 'w' : (Math.random() < 0.5 ? 'w' : 'b');
        const room = {
          code, chess: new Chess(), status: 'waiting',
          tc: TIME_CONTROLS[m.tc] ?? null, tcName: m.tc || 'none',
          players: { [color]: { id: String(m.userId), name: String(m.name || 'Игрок').slice(0, 40), ws } },
          clocks: null, turnStart: 0, moves: [], lastMove: null,
          result: null, resultReason: null, drawOffer: null, rematch: new Set(),
          created: Date.now(), endedAt: 0,
        };
        this.rooms.set(code, room);
        ws.roomCode = code; ws.userId = String(m.userId);
        this.send(ws, { t: 'created', code, color });
        this.broadcastState(room);
        break;
      }
      case 'join': {
        const room = this.rooms.get(String(m.code || '').toUpperCase());
        if (!room) return this.send(ws, { t: 'error', message: 'Комната не найдена. Проверьте код.', fatal: true });
        const uid = String(m.userId);
        // реконнект игрока (только если его сокет мёртв — нельзя угнать активную сессию)
        for (const c of ['w', 'b']) {
          const p = room.players[c];
          if (p && p.id === uid) {
            if (p.ws && p.ws.readyState === 1 && p.ws !== ws) {
              return this.send(ws, { t: 'error', message: 'Этот аккаунт уже играет в комнате с другого устройства.', fatal: true });
            }
            p.ws = ws; p.name = String(m.name || p.name).slice(0, 40); p.disconnectedAt = 0;
            ws.roomCode = room.code; ws.userId = uid;
            this.send(ws, { t: 'joined', code: room.code, color: c });
            this.broadcast(room, { t: 'opponent_reconnected' });
            this.broadcastState(room);
            return;
          }
        }
        if (room.status !== 'waiting') return this.send(ws, { t: 'error', message: 'В этой комнате уже идёт партия.', fatal: true });
        const free = room.players.w ? 'b' : 'w';
        room.players[free] = { id: uid, name: String(m.name || 'Игрок').slice(0, 40), ws };
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
        const room = this.roomOf(ws); if (!room || room.status !== 'over') return;
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
        pgn: room.chess.pgn(), result, reason,
        players: { w: { id: room.players.w?.id, name: room.players.w?.name }, b: { id: room.players.b?.id, name: room.players.b?.name } },
      });
    } catch (e) { console.error('[rooms] onGameEnd', e); }
  }

  tick() {
    const now = Date.now();
    for (const room of this.rooms.values()) {
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
        if (p?.disconnectedAt && now - p.disconnectedAt > 60000) {
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
    if (room.status === 'waiting' || explicit && room.status !== 'active') { this.rooms.delete(room.code); return; }
    if (room.status === 'active') {
      p.disconnectedAt = Date.now();
      this.broadcast(room, { t: 'opponent_disconnected', grace: 60 });
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
      check: c.inCheck(), clocks, tc: room.tcName,
      players: { w: room.players.w && { name: room.players.w.name, online: !!room.players.w.ws }, b: room.players.b && { name: room.players.b.name, online: !!room.players.b.ws } },
      result: room.result, reason: room.resultReason,
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
      const idle = r.status === 'over' ? now - r.endedAt > 600000 : now - r.created > 3600000;
      const empty = !r.players.w?.ws && !r.players.b?.ws && (r.status === 'waiting' || r.status === 'over');
      if (idle || empty && now - r.created > 120000) this.rooms.delete(code);
    }
  }
}
