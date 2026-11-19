// Достижения: красивые SVG-бейджи (медальоны с глифами), сетка в профиле,
// модалка разблокировки. Никаких эмодзи — только векторная графика.
import { el, esc, modal, toast } from './util.js';
import { state } from './api.js';
import { sound } from './sound.js';

let bid = 0;
const TIERS = {
  bronze: { a: '#e0a06a', b: '#8c5a2b', ring: '#5e3a1a', glyph: '#f0c090' },
  silver: { a: '#e8edf4', b: '#8d97a6', ring: '#5a6472', glyph: '#eef2f8' },
  gold:   { a: '#ffe9a8', b: '#d19a2f', ring: '#8a6410', glyph: '#ffe9a8' },
};
const LOCKED = { a: '#4a5266', b: '#2a3140', ring: '#1c2230', glyph: '#6b7488' };

// Линейные глифы в системе координат 24×24 (elegante line-icons).
const GLYPHS = {
  flag: '<path d="M6 21V4"/><path d="M6 4h11l-2.5 3.5L17 11H6"/>',
  trophy: '<path d="M8 4h8v4a4 4 0 0 1-8 0z"/><path d="M8 5H5a3 3 0 0 0 3 4"/><path d="M16 5h3a3 3 0 0 1-3 4"/><path d="M12 12v4"/><path d="M9 20h6"/><path d="M10 16h4v4h-4z"/>',
  medal: '<circle cx="12" cy="15" r="5"/><path d="M9 3l3 7 3-7"/><path d="M7 3h10"/>',
  crown: '<path d="M4 18h16"/><path d="M4 18L3 8l5 3 4-6 4 6 5-3-1 10z"/>',
  board: '<rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 4v16M16 4v16M4 8h16M4 16h16"/>',
  flame: '<path d="M12 3c1 4 5 5.5 5 10a5 5 0 0 1-10 0c0-3 2-4.5 3-7 .8 2 2 2.5 2-3z"/>',
  bolt: '<path d="M13 2L5 13h5l-1 9 8-11h-5z"/>',
  gear: '<circle cx="12" cy="12" r="3.4"/><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5 5l2.1 2.1M16.9 16.9L19 19M19 5l-2.1 2.1M7.1 16.9L5 19"/>',
  handshake: '<path d="M2 11l4-5 4 2 4-2 4 5"/><path d="M6 11l4 4 2-1 2 1 4-4"/><path d="M10 8l-2 3 2 2"/>',
  chart: '<path d="M4 4v16h16"/><path d="M8 16v-5M12 16V7M16 16v-3"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z"/>',
  diamond: '<path d="M12 3l7 6-7 12-7-12z"/><path d="M5 9h14"/><path d="M12 3l-3 6 3 12 3-12z"/>',
  puzzle: '<path d="M5 4h6v3a2 2 0 1 0 2 0V4h6v6h-3a2 2 0 1 0 0 2h3v6h-6v-3a2 2 0 1 0-2 0v3H5v-6h3a2 2 0 1 0 0-2H5z"/>',
  cap: '<path d="M2 9l10-5 10 5-10 5z"/><path d="M6 11.5V16c0 2 12 2 12 0v-4.5"/><path d="M22 9v6"/>',
  gem: '<path d="M6 3h12l4 6-10 12L2 9z"/><path d="M2 9h20"/><path d="M9 3L7 9l5 12 5-12-2-6"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/>',
};

export function badgeSVG(ach, { locked = false, size = 72 } = {}) {
  const t = locked ? LOCKED : (TIERS[ach.tier] || TIERS.bronze);
  const id = 'ab' + (++bid);
  const glyph = GLYPHS[ach.icon] || GLYPHS.star;
  return `<svg viewBox="0 0 100 100" width="${size}" height="${size}" class="ach-badge${locked ? ' locked' : ''}" role="img" aria-label="${esc(ach.title)}">
    <defs>
      <linearGradient id="${id}m" x1="0" y1="0" x2="0.6" y2="1">
        <stop offset="0" stop-color="${t.a}"/><stop offset="0.5" stop-color="${t.b}"/><stop offset="1" stop-color="${t.ring}"/>
      </linearGradient>
      <radialGradient id="${id}i" cx="0.5" cy="0.38" r="0.75">
        <stop offset="0" stop-color="#232c40"/><stop offset="1" stop-color="#121826"/>
      </radialGradient>
    </defs>
    <path d="M37 86 L32 99 L43 94 L50 99 L57 94 L68 99 L63 86 Z" fill="url(#${id}m)" opacity="${locked ? .5 : .95}"/>
    <circle cx="50" cy="48" r="44" fill="url(#${id}m)"/>
    <circle cx="50" cy="48" r="44" fill="none" stroke="${t.ring}" stroke-width="1.6"/>
    <circle cx="50" cy="48" r="36" fill="url(#${id}i)"/>
    <circle cx="50" cy="48" r="36" fill="none" stroke="${t.glyph}" stroke-opacity="${locked ? .25 : .55}" stroke-width="1.2"/>
    <g transform="translate(30.4 28.4) scale(1.63)" fill="none" stroke="${t.glyph}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" color="${t.glyph}" opacity="${locked ? .6 : 1}">${glyph}</g>
    ${locked ? '' : `<circle cx="34" cy="30" r="2.2" fill="#fff" opacity=".55"/>`}
  </svg>`;
}

export const unlockedIds = me => new Set((me?.achievements || []).map(a => a.id));

// Сетка достижений в профиле
export function renderAchievementsGrid(container, me) {
  const all = state.config?.achievements || [];
  const have = unlockedIds(me);
  container.innerHTML = '';
  const head = el('div', 'ach-head', `<h3 style="margin:0">Достижения</h3><span class="badge gold">${have.size} / ${all.length}</span>`);
  container.appendChild(head);
  const grid = el('div', 'ach-grid');
  for (const a of all) {
    const locked = !have.has(a.id);
    const cell = el('div', 'ach-cell' + (locked ? ' locked' : ''));
    cell.innerHTML = `${badgeSVG(a, { locked, size: 64 })}<div class="ach-name">${esc(a.title)}</div><div class="ach-desc">${esc(a.desc)}</div>`;
    grid.appendChild(cell);
  }
  container.appendChild(grid);
}

// Неблокирующее объявление (тост с бейджем) — для задач/уроков.
export function announceAchievements(fresh) {
  if (!fresh?.length) return;
  sound.coin();
  for (const a of fresh) {
    toast(`<span class="toast-ach">${badgeSVG(a, { size: 30 })}<span><b>${esc(a.title)}</b><br><span class="muted" style="font-size:11px">достижение получено</span></span></span>`, 'ok', 4200);
  }
}

// Модалка разблокировки (после партии/задачи/урока)
export function showAchievements(fresh) {
  if (!fresh?.length) return;
  sound.coin();
  const m = modal(`
    <div class="ach-modal-title">Новое достижение!</div>
    <div class="ach-modal-list">
      ${fresh.map(a => `<div class="ach-pop">${badgeSVG(a, { size: 84 })}<div><b>${esc(a.title)}</b><div class="muted">${esc(a.desc)}</div></div></div>`).join('')}
    </div>
    <button class="btn primary block" id="ach-ok" style="margin-top:12px">Отлично!</button>`);
  m.root.querySelector('#ach-ok').onclick = () => m.close();
  return m;
}
