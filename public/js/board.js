// Компонент доски: рендер, анимация ходов, drag&drop + tap-tap, промо-пикер,
// подсветки, стрелки, координаты, переворот.
import { pieceSVG } from './pieces.js';
import { store, el } from './util.js';

const FILES = 'abcdefgh';
export const sqToXY = (sq, orient) => {
  const f = FILES.indexOf(sq[0]), r = 8 - Number(sq[1]);
  return orient === 'w' ? { x: f, y: r } : { x: 7 - f, y: 7 - r };
};
const xyToSq = (x, y, orient) => orient === 'w' ? FILES[x] + (8 - y) : FILES[7 - x] + (y + 1);

export function parseFenPieces(fen) {
  const map = {};
  const rows = fen.split(' ')[0].split('/');
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (/\d/.test(ch)) { f += Number(ch); continue; }
      map[FILES[f] + (8 - r)] = { t: ch.toLowerCase(), c: ch === ch.toLowerCase() ? 'b' : 'w' };
      f++;
    }
  }
  return map;
}

export class BoardView {
  constructor(container, opts = {}) {
    this.opts = opts;
    this.orientation = opts.orientation || 'w';
    this.theme = opts.theme || store.get('board', 'classic');
    this.set = opts.set || store.get('pieces', 'classic');
    this.coords = opts.coordinates ?? store.get('coords', true);
    this.interactive = opts.interactive !== false;
    this.legalFn = opts.legalFn || (() => []);
    this.turnFn = opts.turnFn || (() => 'w');
    this.onMove = opts.onMove || (() => true);
    this.sel = null; this.dots = [];
    this._map = {}; this._drag = null; this._promo = null;

    container.innerHTML = '';
    this.outer = el('div', 'board-outer');
    this.board = el('div', 'board');
    this.board.dataset.theme = this.theme;
    this.squaresEl = el('div', 'squares');
    this.trailEl = el('div', 'trail-layer');
    this.piecesEl = el('div', 'pieces-layer');
    this.arrowsEl = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.arrowsEl.setAttribute('class', 'arrows-layer');
    this.arrowsEl.setAttribute('viewBox', '0 0 800 800');
    this.fxEl = el('div', 'fx-layer');
    this.board.append(this.squaresEl, this.trailEl, this.piecesEl, this.arrowsEl, this.fxEl);
    this.outer.appendChild(this.board);
    container.appendChild(this.outer);
    this._buildSquares();
    this._applyThemeFx();
    this._bind();
  }

  _buildSquares() {
    this.squaresEl.innerHTML = '';
    this.sqEls = {};
    for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) {
      const sq = xyToSq(x, y, this.orientation);
      const light = (FILES.indexOf(sq[0]) + Number(sq[1])) % 2 === 1;
      const d = el('div', 'sq ' + (light ? 'light' : 'dark'));
      d.dataset.sq = sq;
      if (this.coords) {
        const col = light ? 'var(--sq-dark)' : 'var(--sq-light)';
        if (y === 7) d.appendChild(el('span', 'coord file', sq[0])).style.color = col;
        if (x === 0) d.appendChild(el('span', 'coord rank', sq[1])).style.color = col;
      }
      this.squaresEl.appendChild(d);
      this.sqEls[sq] = d;
    }
  }

  _pieceNode(t, c) {
    const n = el('div', 'piece');
    n.innerHTML = pieceSVG(t, c, this.set);
    n.dataset.t = t; n.dataset.c = c;
    return n;
  }
  _place(node, sq) {
    const { x, y } = sqToXY(sq, this.orientation);
    node.style.transform = `translate(${x * 100}%, ${y * 100}%)`;
    node.dataset.sq = sq;
  }

  setPosition(fen, { lastMove = null, animate = false } = {}) {
    this.fen = fen;
    const target = parseFenPieces(fen);
    if (animate && lastMove && this._tryAnimate(lastMove, target)) { this._verify(target); return; }
    this._rebuild(target);
  }

  _rebuild(target) {
    this.piecesEl.innerHTML = '';
    this._map = {};
    for (const [sq, p] of Object.entries(target)) {
      const node = this._pieceNode(p.t, p.c);
      this._place(node, sq);
      this.piecesEl.appendChild(node);
      this._map[sq] = { ...p, node };
    }
  }

  _tryAnimate(lm, target) {
    const from = this._map[lm.from], to = this._map[lm.to];
    if (!from) return false;
    this._spawnTrail(lm.from, lm.to, from.t);
    // взятие (в т.ч. en passant)
    if (to) to.node.remove();
    if (from.t === 'p' && lm.from[0] !== lm.to[0] && !to) {
      const epSq = lm.to[0] + lm.from[1];
      if (this._map[epSq]) { this._map[epSq].node.remove(); delete this._map[epSq]; }
    }
    // рокировка — двигаем и ладью
    if (from.t === 'k' && Math.abs(FILES.indexOf(lm.from[0]) - FILES.indexOf(lm.to[0])) === 2) {
      const rank = lm.from[1];
      const kingside = FILES.indexOf(lm.to[0]) > FILES.indexOf(lm.from[0]);
      const rFrom = (kingside ? 'h' : 'a') + rank, rTo = (kingside ? 'f' : 'd') + rank;
      const rook = this._map[rFrom];
      if (rook) { this._place(rook.node, rTo); this._map[rTo] = rook; delete this._map[rFrom]; }
    }
    // превращение
    if (from.t === 'p' && (lm.to[1] === '8' || lm.to[1] === '1')) {
      const promo = lm.promotion || target[lm.to]?.t || 'q';
      from.node.innerHTML = pieceSVG(promo, from.c, this.set);
      from.t = promo; from.node.dataset.t = promo;
    }
    this._place(from.node, lm.to);
    this._map[lm.to] = from;
    delete this._map[lm.from];
    return true;
  }

  _verify(target) {
    const keys = new Set([...Object.keys(target), ...Object.keys(this._map)]);
    for (const sq of keys) {
      const a = target[sq], b = this._map[sq];
      if (!a || !b || a.t !== b.t || a.c !== b.c) { this._rebuild(target); return; }
    }
  }

  setHighlights({ last = null, check = null, hl = [] } = {}) {
    for (const d of Object.values(this.sqEls)) d.classList.remove('last', 'check', 'hl', 'sel');
    this.piecesEl.parentElement.querySelectorAll('.dot').forEach(n => n.remove());
    if (last) for (const sq of last) this.sqEls[sq]?.classList.add('last');
    if (check) this.sqEls[check]?.classList.add('check');
    for (const sq of hl) this.sqEls[sq]?.classList.add('hl');
    if (this.sel) {
      this.sqEls[this.sel]?.classList.add('sel');
      for (const sq of this.dots) {
        const dot = el('div', 'dot' + (this._map[sq] ? ' capture' : ''));
        this.sqEls[sq]?.appendChild(dot);
      }
    }
  }

  setArrows(arrows = []) {
    const ns = 'http://www.w3.org/2000/svg';
    this.arrowsEl.innerHTML = `<defs><marker id="ah" viewBox="0 0 10 10" refX="7" refY="5" markerWidth="4.2" markerHeight="4.2" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 z" fill="context-stroke"/></marker></defs>`;
    for (const a of arrows) {
      const p1 = sqToXY(a.from, this.orientation), p2 = sqToXY(a.to, this.orientation);
      const line = document.createElementNS(ns, 'line');
      line.setAttribute('x1', p1.x * 100 + 50); line.setAttribute('y1', p1.y * 100 + 50);
      line.setAttribute('x2', p2.x * 100 + 50); line.setAttribute('y2', p2.y * 100 + 50);
      line.setAttribute('stroke', a.color || 'rgba(91,141,239,.85)');
      line.setAttribute('stroke-width', '16'); line.setAttribute('stroke-linecap', 'round');
      line.setAttribute('marker-end', 'url(#ah)'); line.setAttribute('opacity', '.85');
      this.arrowsEl.appendChild(line);
    }
  }

  clearSelection() { this.sel = null; this.dots = []; }

  _sqFromEvent(e) {
    const r = this.board.getBoundingClientRect();
    const x = Math.floor((e.clientX - r.left) / r.width * 8);
    const y = Math.floor((e.clientY - r.top) / r.height * 8);
    if (x < 0 || x > 7 || y < 0 || y > 7) return null;
    return xyToSq(x, y, this.orientation);
  }

  _bind() {
    this.board.addEventListener('pointerdown', e => {
      if (!this.interactive || this._promo) return;
      const sq = this._sqFromEvent(e);
      if (!sq) return;
      const p = this._map[sq];
      const allowed = this.turnFn();
      const canPick = p && (allowed === 'both' || p.c === allowed) && this.legalFn(sq).length > 0;
      if (canPick) {
        this.sel = sq;
        this.dots = [...new Set(this.legalFn(sq).map(m => m.to))];
        this._drag = { id: e.pointerId, startX: e.clientX, startY: e.clientY, node: p.node, sq, moved: false };
        try { this.board.setPointerCapture(e.pointerId); } catch {}
        this._refreshHL();
        e.preventDefault();
      } else if (this.sel && this.dots.includes(sq)) {
        this._attempt(this.sel, sq);
      } else {
        this.clearSelection(); this._refreshHL();
      }
    });
    this.board.addEventListener('pointermove', e => {
      const d = this._drag;
      if (!d || e.pointerId !== d.id) return;
      if (!d.moved && Math.hypot(e.clientX - d.startX, e.clientY - d.startY) < 7) return;
      d.moved = true;
      d.node.classList.add('dragging');
      const r = this.board.getBoundingClientRect();
      const w = r.width / 8;
      d.node.style.transform = `translate(${e.clientX - r.left - w / 2}px, ${e.clientY - r.top - w / 2}px)`;
    });
    const up = e => {
      const d = this._drag;
      if (!d || e.pointerId !== d.id) return;
      this._drag = null;
      d.node.classList.remove('dragging');
      if (d.moved) {
        const sq = this._sqFromEvent(e);
        if (sq && this.dots.includes(sq)) { this._attempt(d.sq, sq); }
        else { this._place(d.node, d.sq); }
      }
    };
    this.board.addEventListener('pointerup', up);
    this.board.addEventListener('pointercancel', e => {
      const d = this._drag; if (!d) return;
      this._drag = null; d.node.classList.remove('dragging'); this._place(d.node, d.sq);
    });
  }

  _refreshHL() { this.opts.onHighlightRefresh ? this.opts.onHighlightRefresh() : this.setHighlights(this._lastHL || {}); }
  rememberHL(hl) { this._lastHL = hl; this.setHighlights(hl); }

  async _attempt(from, to) {
    const moves = this.legalFn(from).filter(m => m.to === to);
    if (!moves.length) { this._place(this._map[from].node, from); return; }
    let promo = null;
    if (moves.some(m => m.promotion)) promo = await this._pickPromo(to, this._map[from].c);
    if (promo === null && moves.some(m => m.promotion)) { this._place(this._map[from].node, from); return; }
    this.clearSelection();
    const ok = await this.onMove(from, to, promo || undefined);
    if (!ok && this._map[from]) this._place(this._map[from].node, from);
    this._refreshHL();
  }

  _pickPromo(toSq, color) {
    return new Promise(resolve => {
      const { x } = sqToXY(toSq, this.orientation);
      const picker = el('div', 'promo-picker');
      const w = this.board.getBoundingClientRect().width / 8;
      picker.style.width = w + 'px';
      picker.style.left = (x * w) + 'px';
      const topSide = (this.orientation === 'w') === (toSq[1] === '8');
      picker.style[topSide ? 'top' : 'bottom'] = '0';
      const finish = val => {
        document.removeEventListener('pointerdown', off, true);
        picker.remove();
        this._promo = null;
        resolve(val);
      };
      const off = ev => { if (!picker.contains(ev.target)) finish(null); };
      for (const t of ['q', 'r', 'b', 'n']) {
        const b = el('button');
        b.style.height = w + 'px';
        b.innerHTML = pieceSVG(t, color, this.set);
        b.onclick = ev => { ev.stopPropagation(); finish(t); };
        picker.appendChild(b);
      }
      this.board.appendChild(picker);
      this._promo = picker;
      setTimeout(() => document.addEventListener('pointerdown', off, true), 50);
    });
  }

  flip() {
    this.orientation = this.orientation === 'w' ? 'b' : 'w';
    this._buildSquares();
    if (this.fen) this._rebuild(parseFenPieces(this.fen));
    this._refreshHL();
  }
  setTheme(theme) { this.theme = theme; this.board.dataset.theme = theme; this._applyThemeFx(); }
  setSet(set) { this.set = set; if (this.fen) this._rebuild(parseFenPieces(this.fen)); }

  // ── Фирменные эффекты премиум-досок ──────────────────────
  // Сакура — падающие лепестки; Полночь — мерцающие звёзды.
  _applyThemeFx() {
    if (!this.fxEl) return;
    this.fxEl.innerHTML = '';
    if (this.theme === 'sakura') {
      for (let i = 0; i < 8; i++) {
        const p = el('div', 'petal');
        p.style.left = (Math.random() * 100) + '%';
        p.style.animationDuration = (6 + Math.random() * 5) + 's';
        p.style.animationDelay = (-Math.random() * 8) + 's';
        p.style.setProperty('--sway', (20 + Math.random() * 40) + 'px');
        p.style.setProperty('--spin', (Math.random() * 360) + 'deg');
        this.fxEl.appendChild(p);
      }
    } else if (this.theme === 'midnight') {
      for (let i = 0; i < 16; i++) {
        const s = el('div', 'star');
        s.style.left = (Math.random() * 96 + 2) + '%';
        s.style.top = (Math.random() * 96 + 2) + '%';
        s.style.animationDuration = (2 + Math.random() * 3) + 's';
        s.style.animationDelay = (-Math.random() * 4) + 's';
        const sz = (1.5 + Math.random() * 2.5) + 'px';
        s.style.width = sz; s.style.height = sz;
        this.fxEl.appendChild(s);
      }
    }
  }

  // Изумруд — светящийся след хода (путь фигуры, включая «Г» коня).
  _trailPath(fromSq, toSq, type) {
    const f = FILES.indexOf(fromSq[0]), r = Number(fromSq[1]);
    const tf = FILES.indexOf(toSq[0]), tr = Number(toSq[1]);
    const cells = [fromSq];
    if (type === 'n') {
      cells.push(FILES[f] + tr); // угол буквы «Г»
    } else if (type !== 'k' && type !== 'p') {
      const df = Math.sign(tf - f), dr = Math.sign(tr - r);
      let cf = f + df, cr = r + dr;
      while (cf !== tf || cr !== tr) { cells.push(FILES[cf] + cr); cf += df; cr += dr; }
    }
    cells.push(toSq);
    return [...new Set(cells)];
  }
  _spawnTrail(fromSq, toSq, type) {
    if (this.theme !== 'emerald' || !this.trailEl) return;
    clearTimeout(this._trailTimer);
    this.trailEl.innerHTML = '';
    const cells = this._trailPath(fromSq, toSq, type);
    cells.forEach((sq, i) => {
      const { x, y } = sqToXY(sq, this.orientation);
      const c = el('div', 'trail-cell');
      c.style.left = (x * 12.5) + '%';
      c.style.top = (y * 12.5) + '%';
      c.style.animationDelay = (i * 70) + 'ms';
      this.trailEl.appendChild(c);
    });
    this._trailTimer = setTimeout(() => { this.trailEl.innerHTML = ''; }, cells.length * 70 + 1000);
  }

  shake() { this.board.classList.remove('board-shake'); void this.board.offsetWidth; this.board.classList.add('board-shake'); }
}
