// Общая оболочка игрового экрана: бары игроков, доска, статус, кнопки, список ходов.
import { el, esc, fmtClock } from './util.js';
import { pieceSVG, PIECE_VALUES } from './pieces.js';
import { parseFenPieces } from './board.js';

const INITIAL = { p: 8, n: 2, b: 2, r: 2, q: 1, k: 1 };

export function capturedFromFen(fen) {
  const counts = { w: {}, b: {} };
  for (const p of Object.values(parseFenPieces(fen))) counts[p.c][p.t] = (counts[p.c][p.t] || 0) + 1;
  const capturedBy = { w: [], b: [] }; // фигуры, которые СЪЕЛ игрок данного цвета
  let diff = { w: 0, b: 0 };
  for (const c of ['w', 'b']) {
    const enemy = c === 'w' ? 'b' : 'w';
    for (const t of ['q', 'r', 'b', 'n', 'p']) {
      const missing = Math.max(0, INITIAL[t] - (counts[enemy][t] || 0));
      for (let i = 0; i < missing; i++) capturedBy[c].push(t);
      diff[c] += missing * PIECE_VALUES[t];
    }
  }
  return { capturedBy, diff: diff.w - diff.b };
}

export function renderGameShell(root, { title, onBack, controls = [], chat = false, onChat = null }) {
  root.innerHTML = '';
  const back = el('div', 'back-row');
  const backBtn = el('button', 'btn sm', '← Выйти');
  backBtn.onclick = onBack;
  back.append(backBtn, el('h2', '', esc(title)));
  const barTop = el('div', 'player-bar');
  const holder = el('div');
  const barBottom = el('div', 'player-bar');
  const status = el('div', 'status-line');
  const controlsEl = el('div', 'game-controls');
  const movelist = el('div', 'movelist');
  const refs = { backBtn, barTop, barBottom, holder, status, controlsEl, movelist };
  for (const c of controls) {
    const b = el('button', 'btn', c.label);
    b.dataset.id = c.id;
    b.onclick = () => c.onClick();
    controlsEl.appendChild(b);
    refs['btn_' + c.id] = b;
  }
  root.append(back, barTop, holder, barBottom, status, controlsEl, movelist);
  if (chat) {
    const chatRow = el('div', 'chat-row');
    for (const phrase of ['Привет! 👋', 'Удачи! 🍀', 'Хорошая игра! 🤝', 'Ого! 😮']) {
      const b = el('button', 'btn sm ghost', phrase);
      b.onclick = () => onChat?.(phrase);
      b.dataset.phrase = phrase;
      chatRow.appendChild(b);
    }
    root.appendChild(chatRow);
    refs.chatRow = chatRow;
  }
  return refs;
}

export function setPlayerBar(bar, { name, avatar, captured = [], matDiff = 0, clock = null, isTurn = false, pieceSet = 'classic', capturedColor = 'b', thinking = false }) {
  bar.classList.toggle('turn', isTurn);
  const capHtml = captured.map(t => pieceSVG(t, capturedColor, pieceSet)).join('');
  bar.innerHTML = `
    <div class="avatar">${avatar}</div>
    <div style="min-width:0">
      <div class="pname">${esc(name)}${thinking ? ' <span class="thinking">думает…</span>' : ''}</div>
      <div class="captured">${capHtml}${matDiff > 0 ? `<span class="matdiff">+${matDiff}</span>` : ''}</div>
    </div>
    ${clock !== null ? `<div class="clock${clock < 30000 ? ' low' : ''}">${fmtClock(clock)}</div>` : ''}`;
}

export function setMoveList(movelist, sans, currentIdx = null) {
  movelist.innerHTML = '';
  sans.forEach((san, i) => {
    if (i % 2 === 0) movelist.appendChild(el('span', 'mvnum', (i / 2 + 1) + '.'));
    const m = el('span', 'mv' + (currentIdx === i ? ' current' : ''), esc(san));
    movelist.appendChild(m);
  });
  movelist.scrollTop = movelist.scrollHeight;
}

export function kingSquare(chess, color) {
  for (const row of chess.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
  return null;
}
