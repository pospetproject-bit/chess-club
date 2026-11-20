// Разбор партии (платная фича): график оценки, точность сторон,
// классификация ходов (лучший/хороший/неточность/ошибка/зевок), лучшие ходы.
import { Chess } from '../vendor/chess.js';
import { BoardView } from './board.js';
import { askAnalysis } from './ai.js';
import { el, esc, toast, modal, store } from './util.js';
import { state, has, isPremium, api, purchase, priceOf } from './api.js';
import { sound } from './sound.js';
import { explainMove, explainEnd, summarize } from './explain.js';

const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
const CLS = {
  best: { icon: '★', name: 'Лучший', color: '#4caf7d' },
  good: { icon: '✓', name: 'Хороший', color: '#8bc34a' },
  inaccuracy: { icon: '?!', name: 'Неточность', color: '#e8b64c' },
  mistake: { icon: '?', name: 'Ошибка', color: '#ff9040' },
  blunder: { icon: '??', name: 'Зевок', color: '#e05a5a' },
  book: { icon: '📖', name: 'Теория', color: '#8b94ab' },
};

// Книга первых ходов (чтобы не размечать теорию как ошибки)
const BOOK = new Set(['e2e4', 'd2d4', 'g1f3', 'c2c4', 'e7e5', 'c7c5', 'e7e6', 'd7d5', 'g8f6', 'b8c6', 'f1c4', 'f1b5', 'f8c5', 'f8b4', 'c7c6', 'd7d6', 'e2e3', 'd2d3']);

const winPct = cp => 50 + 50 * (2 / (1 + Math.exp(-0.00368208 * Math.max(-1000, Math.min(1000, cp)))) - 1);
const fmtEval = s => {
  if (Math.abs(s) >= 9990) return '#';                       // мат уже на доске
  if (Math.abs(s) > 9000) return (s > 0 ? '+M' : '−M') + Math.max(1, Math.ceil((10000 - Math.abs(s)) / 2));
  return (s > 0 ? '+' : '') + (s / 100).toFixed(1);
};

// Вход: проверка доступа → покупка → запуск анализа
export async function openAnalysisFlow({ pgn, gameId = null, playerColor = 'w', title = 'Разбор партии', free = false }) {
  // игра уже разблокирована?
  let unlocked = false;
  if (gameId) {
    try {
      const { games } = await api.games();
      const g = games.find(x => x.id === gameId);
      if (g?.analyzed) unlocked = true;
    } catch {}
  }
  if (!unlocked && free) {
    // бесплатные разборы (партии с ботом / вдвоём рядом) — просто помечаем на сервере
    if (gameId) { try { await api.unlockAnalysis(gameId); } catch {} }
    unlocked = true;
  }
  if (!unlocked) {
    if (has('analysis')) {
      if (gameId) {
        try {
          const r = await api.unlockAnalysis(gameId);
          unlocked = r.ok;
          if (r.user) state.me = r.user;
          if (!unlocked && r.error === 'no credits') unlocked = false;
        } catch { unlocked = isPremium(); }
      } else unlocked = isPremium(); // локальная игра без сервера — только премиум
    }
    if (!unlocked) { offerAnalysisPurchase({ pgn, gameId, playerColor, title, free }); return; }
  }
  runAnalysis({ pgn, gameId, playerColor, title, free });
}

function offerAnalysisPurchase(ctx) {
  const m = modal(`<h3>📊 Разбор партии</h3>
    <p class="muted" style="line-height:1.6">Движок объяснит каждый ход: где ошибка и почему, что было лучше, почему случился мат или пат.</p>
    <p class="muted" style="line-height:1.6;font-size:12px">💡 Партии <b>с ботом</b> и «вдвоём рядом» разбираются <b>бесплатно</b>. Платный разбор — только для партий с друзьями.</p>
    <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
      <button class="btn block" data-a="one">Разобрать эту партию — ${priceOf('analysis_1')} ⭐</button>
      <button class="btn block" data-a="ten">Пакет 10 разборов — ${priceOf('analysis_10')} ⭐ <span class="badge green">−48%</span></button>
      <button class="btn primary block" data-a="premium">♛ Премиум — безлимитный разбор</button>
    </div>`);
  const go = async id => {
    m.close();
    if (await purchase(id)) openAnalysisFlow(ctx);
  };
  m.root.querySelector('[data-a=one]').onclick = () => go('analysis_1');
  m.root.querySelector('[data-a=ten]').onclick = () => go('analysis_10');
  m.root.querySelector('[data-a=premium]').onclick = () => go('premium_30d');
}

async function runAnalysis({ pgn, gameId, playerColor, title }) {
  const root = document.getElementById('analysis-root');
  window.__cc_show('analysis');
  // восстанавливаем партию
  const chess = new Chess();
  let moves = [];
  try {
    if (/\[Event|\d+\.\s/.test(pgn)) chess.loadPgn(pgn);
    else { // просто список SAN
      for (const san of pgn.split(/\s+/).filter(s => s && !/^\d+\./.test(s))) chess.move(san);
    }
    moves = chess.history({ verbose: true });
  } catch (e) { toast('Не удалось прочитать партию', 'err'); window.__cc_nav('home'); return; }
  if (!moves.length) { toast('В партии нет ходов', 'err'); window.__cc_nav('home'); return; }

  const fens = [START_FEN];
  const replay = new Chess();
  for (const m of moves) { replay.move(m); fens.push(replay.fen()); }

  // кэш разбора
  const cacheKey = 'an_' + (gameId || pgn.slice(0, 120));
  let rows = store.get(cacheKey);

  root.innerHTML = `
    <div class="back-row"><button class="btn sm" id="an-back">← Назад</button><h2>📊 ${esc(title)}</h2></div>
    <div id="an-body"></div>`;
  root.querySelector('#an-back').onclick = () => window.__cc_nav('profile');
  const body = root.querySelector('#an-body');

  if (!rows) {
    body.innerHTML = `<div class="card" style="text-align:center">
      <div class="spinner"></div>
      <p class="muted">Движок анализирует партию… <span id="an-pct">0%</span></p>
      <div class="analysis-progress"><i id="an-bar" style="width:0%"></i></div>
      <p class="muted" style="font-size:11.5px">${moves.length} ходов · обычно занимает ${Math.max(5, Math.round(moves.length * 0.3))}–${Math.max(10, Math.round(moves.length * 0.6))} секунд</p>
    </div>`;
    try {
      const r = await askAnalysis(fens, p => {
        const pct = Math.round((p.i + 1) / p.total * 100);
        const bar = document.getElementById('an-bar'), pctEl = document.getElementById('an-pct');
        if (bar) bar.style.width = pct + '%';
        if (pctEl) pctEl.textContent = pct + '%';
      });
      rows = r.rows;
      store.set(cacheKey, rows);
    } catch (e) {
      body.innerHTML = `<div class="card">Не удалось проанализировать: ${esc(e.message)}</div>`;
      return;
    }
  }

  // классификация ходов
  const annotated = moves.map((m, i) => {
    const before = rows[i], after = rows[i + 1];
    const mover = before.turn;
    const scoreBefore = before.score;
    const scoreAfterMover = -after.score;
    let loss = Math.max(0, scoreBefore - scoreAfterMover);
    if (Math.abs(scoreBefore) > 9000 || Math.abs(after.score) > 9000) {
      // матовые оценки: упущенный мат = зевок, найденный мат = лучший
      if (scoreBefore > 9000 && scoreAfterMover < 9000) loss = 1000;
      else if (scoreAfterMover > 9000) loss = 0;
      else loss = Math.max(0, Math.min(loss, 100));
    }
    const playedUci = m.from + m.to;
    const bestUci = before.best ? before.best.from + before.best.to : null;
    const allowsMate = scoreAfterMover < -9000 && scoreBefore > -9000;   // подставил мат
    const missedMate = scoreBefore > 9000 && scoreAfterMover < 9000;      // упустил мат
    let cls;
    if (allowsMate) cls = 'blunder';
    else if (missedMate) cls = 'mistake';
    else if (i < 8 && BOOK.has(playedUci) && loss <= 40) cls = 'book';
    else if (bestUci === playedUci) cls = 'best';
    else if (loss <= 25) cls = 'good';
    else if (loss <= 60) cls = 'inaccuracy';
    else if (loss <= 150) cls = 'mistake';
    else cls = 'blunder';
    const drop = Math.max(0, winPct(scoreBefore) - winPct(scoreAfterMover));
    const acc = Math.max(0, Math.min(100, 103.1668 * Math.exp(-0.04354 * drop) - 3.1669));
    return { m, i, cls, loss, acc, mover, best: before.best, evalWhite: (after.turn === 'w' ? 1 : -1) * after.score, scoreBefore };
  });

  // объяснения словами: почему ход хорош/плох, что было лучше
  const lastFen = fens[fens.length - 1];
  const finalChess = new Chess(lastFen);
  const reason = finalChess.isCheckmate() ? 'checkmate'
    : finalChess.isStalemate() ? 'stalemate'
    : finalChess.isInsufficientMaterial() ? 'material'
    : finalChess.isThreefoldRepetition() ? 'repetition'
    : finalChess.isDrawByFiftyMoves() ? 'fifty' : null;
  const resultGuess = finalChess.isCheckmate() ? (finalChess.turn() === 'w' ? 'b' : 'w') : (reason ? 'draw' : null);
  annotated.forEach((a, i) => {
    try {
      a.expl = explainMove({
        fenBefore: fens[i], fenAfter: fens[i + 1], move: a.m, best: a.best,
        scoreBefore: a.scoreBefore, scoreAfter: (a.mover === 'w' ? 1 : -1) * a.evalWhite,
        cls: a.cls, loss: a.loss, reply: rows[i + 1]?.best || null,
      });
    } catch (e) { a.expl = { title: CLS[a.cls].name, tone: a.cls, lines: [], better: null }; }
  });
  const endInfo = reason ? explainEnd({ fen: lastFen, reason, result: resultGuess, playerColor }) : null;
  const summary = summarize(annotated, endInfo, playerColor);

  const accOf = c => {
    const list = annotated.filter(a => a.mover === c && a.cls !== 'book');
    return list.length ? Math.round(list.reduce((s, a) => s + a.acc, 0) / list.length) : 100;
  };
  const countOf = (c, cls) => annotated.filter(a => a.mover === c && a.cls === cls).length;

  // ---- UI ----
  body.innerHTML = `
    ${endInfo ? `<div class="card end-card ${endInfo.tone}">
      <h3 style="margin:0 0 6px">${esc(endInfo.title)}</h3>
      ${endInfo.lines.map(l => `<p class="muted" style="margin:4px 0;line-height:1.55;font-size:13px">${esc(l)}</p>`).join('')}
    </div>` : ''}
    <div class="acc-cards">
      <div class="acc-card"><div class="acc-v">${accOf('w')}%</div><div class="acc-k">Точность белых</div></div>
      <div class="acc-card"><div class="acc-v">${accOf('b')}%</div><div class="acc-k">Точность чёрных</div></div>
    </div>
    <div class="card" style="padding:10px 12px">
      <div style="display:flex;justify-content:space-between;font-size:12px" class="muted">
        <span>Белые: ★${countOf('w', 'best')} ?!${countOf('w', 'inaccuracy')} ?${countOf('w', 'mistake')} ??${countOf('w', 'blunder')}</span>
        <span>Чёрные: ★${countOf('b', 'best')} ?!${countOf('b', 'inaccuracy')} ?${countOf('b', 'mistake')} ??${countOf('b', 'blunder')}</span>
      </div>
      <svg class="eval-graph" id="eval-graph" viewBox="0 0 ${annotated.length * 10} 100" preserveAspectRatio="none"></svg>
      <div class="legend">${['best', 'good', 'inaccuracy', 'mistake', 'blunder'].map(k => `<span style="color:${CLS[k].color}">${CLS[k].icon} ${CLS[k].name}</span>`).join('')}</div>
    </div>
    <div class="eval-wrap">
      <div class="eval-bar" id="eval-bar"><div class="white-fill" id="eval-fill" style="height:50%"></div></div>
      <div style="flex:1" id="an-board"></div>
    </div>
    <div class="btn-row" style="margin-top:10px">
      <button class="btn sm" id="nav-first">⏮</button>
      <button class="btn sm" id="nav-prev">◀</button>
      <button class="btn sm" id="nav-next">▶</button>
      <button class="btn sm" id="nav-last">⏭</button>
      <button class="btn sm" id="copy-pgn">📋 PGN</button>
    </div>
    <div class="card explain-card" id="an-explain"></div>
    ${summary.moments.length ? `<div class="card">
      <h3 style="margin:0 0 8px">🔍 Ключевые моменты</h3>
      <div id="an-moments"></div>
    </div>` : ''}
    <div class="card">
      <h3 style="margin:0 0 8px">🎯 Над чем поработать</h3>
      ${summary.tips.map(t => `<p class="muted" style="margin:6px 0;line-height:1.55;font-size:13px">• ${esc(t)}</p>`).join('')}
    </div>
    <div class="card" style="padding:8px" id="an-moves"></div>`;

  const board = new BoardView(body.querySelector('#an-board'), { interactive: false, orientation: playerColor });
  const nav = { idx: annotated.length - 1 };
  const graph = body.querySelector('#eval-graph');
  const W = annotated.length * 10;
  const points = annotated.map((a, i) => {
    const cp = Math.max(-600, Math.min(600, a.evalWhite));
    return `${i * 10 + 5},${50 - cp / 600 * 48}`;
  }).join(' ');
  graph.innerHTML = `
    <line x1="0" y1="50" x2="${W}" y2="50" stroke="#2a3450" stroke-width="1"/>
    <polyline points="${points}" fill="none" stroke="#e8b64c" stroke-width="2"/>
    <line id="graph-cursor" x1="0" y1="0" x2="0" y2="100" stroke="#5b8def" stroke-width="2"/>`;

  const movesBox = body.querySelector('#an-moves');
  annotated.forEach(a => {
    const row = el('div', 'mv-row');
    row.innerHTML = `<span class="muted" style="width:26px">${a.i % 2 === 0 ? (a.i / 2 + 1) + '.' : ''}</span>
      <span class="mv-icon" style="color:${CLS[a.cls].color}">${CLS[a.cls].icon}</span>
      <b>${esc(a.m.san)}</b>
      <span class="mv-eval">${fmtEval(a.evalWhite)}</span>`;
    row.onclick = () => { nav.idx = a.i; show(); sound.click(); };
    movesBox.appendChild(row);
  });

  function show() {
    const a = annotated[nav.idx];
    const fen = fens[nav.idx + 1];
    board.setPosition(fen);
    board.rememberHL({ last: [a.m.from, a.m.to], check: null });
    const arrows = [];
    if (a.best && a.cls !== 'best' && a.cls !== 'book') arrows.push({ from: a.best.from, to: a.best.to, color: 'rgba(76,175,125,.9)' });
    board.setArrows(arrows);
    const cp = Math.max(-600, Math.min(600, a.evalWhite));
    body.querySelector('#eval-fill').style.height = (50 + cp / 600 * 48) + '%';
    const cursor = graph.querySelector('#graph-cursor');
    cursor.setAttribute('x1', nav.idx * 10 + 5); cursor.setAttribute('x2', nav.idx * 10 + 5);
    movesBox.querySelectorAll('.mv-row').forEach((r, i) => r.classList.toggle('current', i === nav.idx));
    movesBox.querySelectorAll('.mv-row')[nav.idx]?.scrollIntoView({ block: 'nearest' });
    const ex = body.querySelector('#an-explain');
    const e = a.expl || { title: CLS[a.cls].name, lines: [], better: null };
    const num = (a.i % 2 === 0 ? (a.i / 2 + 1) + '. ' : (a.i / 2 + 0.5 | 0) + '… ');
    ex.className = 'card explain-card ' + (e.tone || a.cls);
    ex.innerHTML = `
      <div class="ex-head">
        <span class="ex-badge" style="color:${CLS[a.cls].color}">${CLS[a.cls].icon} ${esc(String(e.title).replace(/^[★✓?!📖]+\s*/, ""))}</span>
        <b class="ex-move">${num}${esc(a.m.san)}</b>
        <span class="ex-eval muted">${fmtEval(a.scoreBefore)} → ${fmtEval((a.mover === 'w' ? 1 : -1) * a.evalWhite)}</span>
      </div>
      ${(e.lines || []).map(l => `<p class="ex-line">${esc(l)}</p>`).join('')}
      ${e.better ? `<div class="ex-better"><b>Лучше было ${esc(e.better.san)}</b> ${a.cls !== 'best' ? '<span class="muted">(зелёная стрелка на доске)</span>' : ''}
        ${(e.better.lines || []).map(l => `<p class="ex-line">${esc(l)}</p>`).join('')}</div>` : ''}`;
  }
  const momentsBox = body.querySelector('#an-moments');
  if (momentsBox) {
    summary.moments.forEach(mo => {
      const row = el('div', 'moment ' + mo.tone);
      row.innerHTML = `<span class="mo-dot"></span><span>${esc(mo.text)}</span>`;
      row.onclick = () => { nav.idx = mo.i; show(); sound.click(); body.querySelector('#an-board').scrollIntoView({ block: 'center', behavior: 'smooth' }); };
      momentsBox.appendChild(row);
    });
  }
  body.querySelector('#nav-first').onclick = () => { nav.idx = 0; show(); };
  body.querySelector('#nav-prev').onclick = () => { nav.idx = Math.max(0, nav.idx - 1); show(); };
  body.querySelector('#nav-next').onclick = () => { nav.idx = Math.min(annotated.length - 1, nav.idx + 1); show(); };
  body.querySelector('#nav-last').onclick = () => { nav.idx = annotated.length - 1; show(); };
  body.querySelector('#copy-pgn').onclick = async () => {
    const { copyText } = await import('./util.js');
    await copyText(chess.pgn()); toast('PGN скопирован', 'ok');
  };
  show();
}
