// Шахматный движок: оценка (материал + piece-square tables) и
// negamax с alpha-beta, quiescence и итеративным углублением.
import { Chess } from '../vendor/chess.js';

const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
export const MATE = 10000;

// prettier-ignore
const PST = {
  p: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0],
  n: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50],
  b: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20],
  r: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0],
  q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20],
  k: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20],
  kEnd: [
    -50,-40,-30,-20,-20,-30,-40,-50,
    -30,-20,-10,  0,  0,-10,-20,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 30, 40, 40, 30,-10,-30,
    -30,-10, 20, 30, 30, 20,-10,-30,
    -30,-30,  0,  0,  0,  0,-30,-30,
    -50,-30,-30,-30,-30,-30,-30,-50],
};

// Оценка с точки зрения белых (сантипешки)
export function evaluate(chess) {
  const board = chess.board();
  let score = 0, phase = 0, bishops = { w: 0, b: 0 };
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (!p) continue;
    if (p.type !== 'p' && p.type !== 'k') phase += VAL[p.type];
    if (p.type === 'b') bishops[p.color]++;
  }
  const endgame = phase < 1500;
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (!p) continue;
    const idx = p.color === 'w' ? r * 8 + c : (7 - r) * 8 + c;
    const table = p.type === 'k' && endgame ? PST.kEnd : PST[p.type];
    const v = VAL[p.type] + table[idx];
    score += p.color === 'w' ? v : -v;
  }
  if (bishops.w >= 2) score += 30;
  if (bishops.b >= 2) score -= 30;
  return score + (chess.turn() === 'w' ? 8 : -8);
}

const orderScore = m =>
  (m.captured ? 10 * VAL[m.captured] - VAL[m.piece] : 0) + (m.promotion ? 900 : 0);

class Timeout extends Error {}

class Searcher {
  constructor(chess, deadline) { this.c = chess; this.deadline = deadline; this.nodes = 0; }
  checkTime() {
    if ((++this.nodes & 255) === 0 && performance.now() > this.deadline) throw new Timeout();
  }
  quiesce(alpha, beta, ply) {
    this.checkTime();
    const stand = (this.c.turn() === 'w' ? 1 : -1) * evaluate(this.c);
    if (stand >= beta) return beta;
    if (stand > alpha) alpha = stand;
    if (ply > 12) return alpha;
    const caps = this.c.moves({ verbose: true }).filter(m => m.captured).sort((a, b) => orderScore(b) - orderScore(a));
    for (const m of caps) {
      this.c.move(m);
      const s = -this.quiesce(-beta, -alpha, ply + 1);
      this.c.undo();
      if (s >= beta) return beta;
      if (s > alpha) alpha = s;
    }
    return alpha;
  }
  negamax(depth, alpha, beta, ply, useQ) {
    this.checkTime();
    const moves = this.c.moves({ verbose: true });
    if (!moves.length) return this.c.inCheck() ? -MATE + ply : 0;
    if (depth <= 0) return useQ ? this.quiesce(alpha, beta, ply) : (this.c.turn() === 'w' ? 1 : -1) * evaluate(this.c);
    moves.sort((a, b) => orderScore(b) - orderScore(a));
    let best = -Infinity;
    for (const m of moves) {
      this.c.move(m);
      const s = -this.negamax(depth - 1, -beta, -alpha, ply + 1, useQ);
      this.c.undo();
      if (s > best) best = s;
      if (s > alpha) alpha = s;
      if (alpha >= beta) break;
    }
    return best;
  }
  root(moves, depth, useQ) {
    let best = null, bestScore = -Infinity;
    const scored = [];
    let alpha = -Infinity;
    for (const m of moves) {
      this.c.move(m);
      const s = -this.negamax(depth - 1, -Infinity, -alpha, 1, useQ);
      this.c.undo();
      scored.push({ m, s });
      if (s > bestScore) { bestScore = s; best = m; }
      if (s > alpha) alpha = s;
    }
    scored.sort((a, b) => b.s - a.s);
    return { best, bestScore, scored };
  }
}

const LEVELS = {
  easy:   { maxDepth: 1, budget: 400,  noise: 130, randomChance: 0.30, topK: 3, useQ: false },
  medium: { maxDepth: 2, budget: 900,  noise: 35,  randomChance: 0.05, topK: 2, useQ: true },
  hard:   { maxDepth: 4, budget: 2200, noise: 0,   randomChance: 0,    topK: 1, useQ: true },
};

// Лучший ход для бота. Возвращает {move, score, depth, nodes, ms}
export function bestMove(fen, level = 'medium', budgetOverride = null) {
  const cfg = LEVELS[level] || LEVELS.medium;
  const chess = new Chess(fen);
  const t0 = performance.now();
  const moves = chess.moves({ verbose: true });
  if (!moves.length) return null;
  if (Math.random() < cfg.randomChance) {
    const m = moves[Math.floor(Math.random() * moves.length)];
    return { move: m, score: 0, depth: 0, nodes: 1, ms: 0, random: true };
  }
  const searcher = new Searcher(chess, t0 + (budgetOverride || cfg.budget));
  let result = null;
  let ordered = moves.sort((a, b) => orderScore(b) - orderScore(a));
  for (let d = 1; d <= cfg.maxDepth; d++) {
    try {
      const r = searcher.root(ordered, d, cfg.useQ);
      result = { ...r, depth: d };
      // следующий проход — с PV-ходом впереди
      ordered = r.scored.map(x => x.m);
      if (r.bestScore > MATE - 100) break;
    } catch (e) { if (e instanceof Timeout) break; throw e; }
  }
  if (!result) {
    const m = ordered[0];
    return { move: m, score: 0, depth: 0, nodes: searcher.nodes, ms: performance.now() - t0 };
  }
  // шум для лёгких уровней: выбираем среди почти равных ходов
  let pick = result.best;
  if (cfg.noise > 0) {
    const jittered = result.scored.map(x => ({ m: x.m, s: x.s + (Math.random() * 2 - 1) * cfg.noise }));
    jittered.sort((a, b) => b.s - a.s);
    const k = Math.min(cfg.topK, jittered.length);
    pick = jittered[Math.floor(Math.random() * k)].m;
  }
  return { move: pick, score: result.bestScore, depth: result.depth, nodes: searcher.nodes, ms: performance.now() - t0 };
}

// Анализ позиции: оценка (с точки зрения стороны, чей ход) + лучший ход
export function analyzeFen(fen, { maxDepth = 3, budget = 300 } = {}) {
  const chess = new Chess(fen);
  const moves = chess.moves({ verbose: true });
  if (!moves.length) {
    const s = chess.inCheck() ? -MATE : 0;
    return { score: s, best: null, depth: 0 };
  }
  const t0 = performance.now();
  const searcher = new Searcher(chess, t0 + budget);
  let ordered = moves.sort((a, b) => orderScore(b) - orderScore(a));
  let result = { best: ordered[0], bestScore: 0, depth: 0 };
  for (let d = 1; d <= maxDepth; d++) {
    try {
      const r = searcher.root(ordered, d, true);
      result = { ...r, depth: d };
      ordered = r.scored.map(x => x.m);
      if (Math.abs(r.bestScore) > MATE - 100) break;
    } catch (e) { if (e instanceof Timeout) break; throw e; }
  }
  return { score: result.bestScore, best: result.best, depth: result.depth };
}
