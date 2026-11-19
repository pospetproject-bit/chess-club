// Web Worker: поиск хода бота и анализ партии без блокировки UI.
import { bestMove, analyzeFen } from './engine.js';
import { Chess } from '../vendor/chess.js';

self.onmessage = e => {
  const { id, type } = e.data;
  try {
    if (type === 'move') {
      const r = bestMove(e.data.fen, e.data.level, e.data.budget || null);
      self.postMessage({
        id, type: 'move',
        move: r ? { from: r.move.from, to: r.move.to, promotion: r.move.promotion, san: r.move.san } : null,
        score: r?.score ?? 0, depth: r?.depth ?? 0, nodes: r?.nodes ?? 0, ms: Math.round(r?.ms ?? 0),
      });
    } else if (type === 'analyze') {
      // fens: позиция перед каждым ходом + финальная; moves: сыгранные ходы
      const { fens, budget = 260, maxDepth = 3 } = e.data;
      const rows = [];
      for (let i = 0; i < fens.length; i++) {
        const r = analyzeFen(fens[i], { maxDepth, budget });
        const chess = new Chess(fens[i]);
        const turn = chess.turn();
        rows.push({
          score: r.score, turn,
          best: r.best ? { from: r.best.from, to: r.best.to, promotion: r.best.promotion, san: r.best.san } : null,
          depth: r.depth,
        });
        self.postMessage({ id, type: 'analyze_progress', i, total: fens.length });
      }
      self.postMessage({ id, type: 'analyze_done', rows });
    } else if (type === 'hint') {
      const r = bestMove(e.data.fen, 'hard', 700);
      self.postMessage({ id, type: 'hint', move: r ? { from: r.move.from, to: r.move.to, promotion: r.move.promotion } : null });
    }
  } catch (err) {
    self.postMessage({ id, type: 'error', message: String(err?.message || err) });
  }
};
