// Задачи: одна бесплатная «задача дня» + премиум-библиотека. Стрик за ежедневные решения.
import { Chess } from '../vendor/chess.js';
import { BoardView } from './board.js';
import { el, esc, toast, modal, store } from './util.js';
import { has, purchase, priceOf, api } from './api.js';
import { announceAchievements } from './achievements.js';
import { sound } from './sound.js';
import { kingSquare } from './game-ui.js';

// solution: чередование ходов игрока и автоответов соперника (uci)
import { PUZZLES } from './data-puzzles.js';
export { PUZZLES };

const todayStr = () => new Date().toISOString().slice(0, 10);
const dayNum = () => Math.floor(Date.now() / 86400000);
export const dailyPuzzle = () => PUZZLES[dayNum() % PUZZLES.length];
const solved = () => store.get('puzzles_solved', []);
const streak = () => store.get('puzzle_streak', { day: '', count: 0 });

export function renderPuzzles() {
  const daily = dailyPuzzle();
  const st = streak();
  const dailySolved = solved().includes(daily.id + ':' + todayStr());
  const dRoot = document.getElementById('puzzle-daily');
  dRoot.innerHTML = '';
  const card = el('div', 'card daily-card');
  card.innerHTML = `
    <div class="big">${dailySolved ? '✅' : '🧩'}</div>
    <div class="grow">
      <h3 style="margin:0">Задача дня ${dailySolved ? '<span class="badge green">решена</span>' : '<span class="badge gold">бесплатно</span>'}</h3>
      <p class="muted">${daily.theme} · рейтинг ~${daily.rating}</p>
    </div>
    <div style="text-align:center"><div style="font-size:20px;font-weight:800;color:var(--accent)">🔥 ${st.count}</div><div class="muted" style="font-size:10px">стрик</div></div>`;
  card.onclick = () => startPuzzle(daily, true);
  dRoot.appendChild(card);

  const root = document.getElementById('puzzle-list');
  root.innerHTML = `<h3 style="margin:14px 0 8px">Библиотека задач ${has('puzzles:all') ? '' : '🔒'}</h3>`;
  if (!has('puzzles:all')) {
    const banner = el('div', 'card');
    banner.innerHTML = `<p class="muted" style="line-height:1.5">Откройте все ${PUZZLES.length} задач (мат в 1–2 хода, вилки, связки, сквозные удары) — или решайте по одной бесплатной задаче каждый день.</p>
      <button class="btn primary block" id="pz-unlock">Открыть все задачи — ${priceOf('puzzles_pack')} ⭐</button>`;
    banner.querySelector('#pz-unlock').onclick = async () => { if (await purchase('puzzles_pack')) renderPuzzles(); };
    root.appendChild(banner);
  }
  const grid = el('div', 'store-grid');
  for (const p of PUZZLES) {
    const unlocked = has('puzzles:all') || p.id === daily.id;
    const isSolved = solved().some(s => s.startsWith(p.id + ':'));
    const c = el('div', 'store-card');
    c.style.cursor = 'pointer';
    c.innerHTML = `<div class="s-title">${isSolved ? '✅' : unlocked ? '🧩' : '🔒'} ${esc(p.title)}</div>
      <div class="s-desc">${p.theme} · ~${p.rating}</div>`;
    c.onclick = () => {
      if (!unlocked) { purchase('puzzles_pack').then(ok => ok && renderPuzzles()); return; }
      startPuzzle(p, p.id === daily.id);
    };
    grid.appendChild(c);
  }
  root.appendChild(grid);
}

export function startPuzzle(puzzle, isDaily = false) {
  window.__cc_show('puzzle');
  const chess = new Chess(puzzle.fen);
  const orientation = puzzle.fen.split(' ')[1];
  let stepIdx = 0, fails = 0, usedHint = false;
  const root = document.getElementById('puzzle-root');
  root.innerHTML = `
    <div class="back-row"><button class="btn sm" id="pz-back">← Задачи</button><h2>🧩 ${esc(puzzle.title)}</h2></div>
    <p class="muted" style="text-align:center">${puzzle.theme} · ход ${orientation === 'w' ? 'белых' : 'чёрных'} · рейтинг ~${puzzle.rating}</p>
    <div id="pz-board"></div>
    <p class="status-line" id="pz-status">Найдите лучший ход!</p>
    <div class="btn-row" style="margin-top:8px">
      <button class="btn" id="pz-hint">💡 Подсказка</button>
      <button class="btn" id="pz-retry">↺ Сначала</button>
    </div>`;
  root.querySelector('#pz-back').onclick = () => { window.__cc_nav('puzzles'); };
  const board = new BoardView(root.querySelector('#pz-board'), {
    orientation,
    turnFn: () => chess.turn() === orientation && stepIdx < puzzle.solution.length ? orientation : 'none',
    legalFn: sq => chess.moves({ square: sq, verbose: true }),
    onMove: (from, to, promo) => {
      const expect = puzzle.solution[stepIdx];
      const uci = from + to + (promo || '');
      const ok = uci === expect || (expect.length === 4 && from + to === expect);
      if (!ok) {
        fails++;
        board.shake(); sound.error();
        root.querySelector('#pz-status').textContent = fails >= 2 ? 'Не то… Попробуйте подсказку 💡' : 'Неверный ход. Попробуйте ещё!';
        return false;
      }
      const mv = chess.move({ from, to, promotion: promo || 'q' });
      mv.captured ? sound.capture() : sound.move();
      board.setPosition(chess.fen(), { lastMove: { from, to, promotion: promo }, animate: true });
      board.setArrows([]);
      board.rememberHL({ last: [from, to], check: chess.inCheck() ? kingSquare(chess, chess.turn()) : null });
      stepIdx++;
      if (stepIdx >= puzzle.solution.length) { win(); return true; }
      // автоответ соперника
      setTimeout(() => {
        const r = puzzle.solution[stepIdx];
        const rm = chess.move({ from: r.slice(0, 2), to: r.slice(2, 4), promotion: r[4] || 'q' });
        sound.move();
        board.setPosition(chess.fen(), { lastMove: { from: rm.from, to: rm.to }, animate: true });
        board.rememberHL({ last: [rm.from, rm.to], check: chess.inCheck() ? kingSquare(chess, chess.turn()) : null });
        stepIdx++;
        root.querySelector('#pz-status').textContent = 'Соперник ответил. Продолжайте!';
        if (stepIdx >= puzzle.solution.length) win();
      }, 550);
      root.querySelector('#pz-status').textContent = 'Верно! ✨';
      return true;
    },
  });
  root.querySelector('#pz-hint').onclick = () => {
    const e = puzzle.solution[stepIdx];
    if (!e) return;
    usedHint = true;
    board.setArrows([{ from: e.slice(0, 2), to: e.slice(2, 4), color: 'rgba(76,175,125,.9)' }]);
  };
  root.querySelector('#pz-retry').onclick = () => startPuzzle(puzzle, isDaily);
  board.setPosition(chess.fen());

  function win() {
    sound.end(true);
    const s = solved();
    const key = puzzle.id + ':' + todayStr();
    if (!s.includes(key)) { s.push(key); store.set('puzzles_solved', s.slice(-200)); }
    api.puzzleSolved(puzzle.id).then(r => announceAchievements(r.new_achievements)).catch(() => {});
    if (isDaily) {
      const st = streak();
      const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
      if (st.day !== todayStr()) {
        const count = st.day === yesterday ? st.count + 1 : 1;
        store.set('puzzle_streak', { day: todayStr(), count });
      }
    }
    const nextIdx = (PUZZLES.findIndex(p => p.id === puzzle.id) + 1) % PUZZLES.length;
    const next = PUZZLES[nextIdx];
    setTimeout(() => {
      const m = modal(`<div class="result-emoji">🎉</div><div class="result-title">Задача решена!</div>
        <div class="result-sub">${esc(puzzle.title)}${usedHint ? ' · с подсказкой' : ' · без подсказок 💪'}${isDaily ? ` · стрик 🔥 ${streak().count}` : ''}</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${has('puzzles:all') ? '<button class="btn green block" data-a="next">Следующая задача →</button>' : `<button class="btn primary block" data-a="unlock">Открыть все задачи — ${priceOf('puzzles_pack')} ⭐</button>`}
          <button class="btn block" data-a="list">К списку задач</button>
        </div>`);
      m.root.querySelector('[data-a=list]').onclick = () => { m.close(); window.__cc_nav('puzzles'); };
      const nx = m.root.querySelector('[data-a=next]');
      if (nx) nx.onclick = () => { m.close(); startPuzzle(next); };
      const un = m.root.querySelector('[data-a=unlock]');
      if (un) un.onclick = async () => { m.close(); if (await purchase('puzzles_pack')) startPuzzle(next); else window.__cc_nav('puzzles'); };
    }, 700);
  }
}
