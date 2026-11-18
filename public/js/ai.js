// Обёртка над воркером движка с фолбэком на главный поток.
let worker = null, seq = 0;
const pending = new Map();
let workerBroken = false;

function ensureWorker() {
  if (worker || workerBroken) return worker;
  try {
    worker = new Worker(new URL('./ai-worker.js', import.meta.url), { type: 'module' });
    worker.onmessage = e => {
      const p = pending.get(e.data.id);
      if (!p) return;
      if (e.data.type === 'analyze_progress') { p.onProgress?.(e.data); return; }
      pending.delete(e.data.id);
      clearTimeout(p.timer);
      if (e.data.type === 'error') p.reject(new Error(e.data.message));
      else p.resolve(e.data);
    };
    worker.onerror = e => {
      workerBroken = true; worker = null;
      for (const [id, p] of pending) { clearTimeout(p.timer); p.reject(new Error('worker failed')); }
      pending.clear();
    };
  } catch { workerBroken = true; worker = null; }
  return worker;
}

async function mainThread(payload) {
  const eng = await import('./engine.js');
  const { Chess } = await import('../vendor/chess.js');
  if (payload.type === 'move' || payload.type === 'hint') {
    const r = eng.bestMove(payload.fen, payload.type === 'hint' ? 'hard' : payload.level, payload.type === 'hint' ? 700 : payload.budget || null);
    return { type: payload.type, move: r ? { from: r.move.from, to: r.move.to, promotion: r.move.promotion, san: r.move.san } : null };
  }
  if (payload.type === 'analyze') {
    const rows = [];
    for (let i = 0; i < payload.fens.length; i++) {
      const r = eng.analyzeFen(payload.fens[i], { maxDepth: payload.maxDepth || 3, budget: payload.budget || 260 });
      const turn = new Chess(payload.fens[i]).turn();
      rows.push({ score: r.score, turn, best: r.best ? { from: r.best.from, to: r.best.to, promotion: r.best.promotion, san: r.best.san } : null, depth: r.depth });
      payload.onProgress?.({ i, total: payload.fens.length });
      await new Promise(r2 => setTimeout(r2, 0));
    }
    return { type: 'analyze_done', rows };
  }
}

export function ask(payload, { onProgress = null, timeout = 30000 } = {}) {
  const w = ensureWorker();
  if (!w) return mainThread({ ...payload, onProgress });
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      mainThread({ ...payload, onProgress }).then(resolve, reject);
    }, timeout);
    pending.set(id, { resolve, reject, timer, onProgress });
    w.postMessage({ ...payload, id });
  });
}

export const askMove = (fen, level) => ask({ type: 'move', fen, level }, { timeout: 12000 });
export const askHint = fen => ask({ type: 'hint', fen }, { timeout: 8000 });
export const askAnalysis = (fens, onProgress) =>
  ask({ type: 'analyze', fens, budget: 260, maxDepth: 3 }, { onProgress, timeout: 600000 });
