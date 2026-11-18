// SVG-фигуры: собственная отрисовка, 4 набора (classic — бесплатный,
// neon / gold / space — премиум). Единый viewBox 0 0 100 100.
let gid = 0;

const SHAPES = {
  p: (f, s, d) => `
    <circle cx="50" cy="29" r="13" fill="${f}" stroke="${s}" stroke-width="3.5"/>
    <path d="M43 41 h14 l7 26 h-28 z" fill="${f}" stroke="${s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M32 67 h36 v7 h-36 z" fill="${f}" stroke="${s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M27 74 h46 v8 h-46 z" fill="${f}" stroke="${s}" stroke-width="3.5" stroke-linejoin="round"/>`,
  r: (f, s, d) => `
    <path d="M30 16 h10 v7 h7 v-7 h6 v7 h7 v-7 h10 v16 h-40 z" fill="${f}" stroke="${s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M37 32 h26 l3 34 h-32 z" fill="${f}" stroke="${s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M31 66 h38 v8 h-38 z" fill="${f}" stroke="${s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M26 74 h48 v8 h-48 z" fill="${f}" stroke="${s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M40 42 h20" stroke="${d}" stroke-width="2.5" opacity=".55"/>`,
  n: (f, s, d) => `
    <path d="M31 82 h42 v-5 c0-3-2-5-5-5 h-2 c5-8 8-17 8-27 0-15-9-26-22-29 l-3-8 -5 7 -7-2 2 8 c-6 4-11 10-13 17 l-7 13 c-2 3 0 7 3 8 l8 2 6-7 5 2 c-2 8-8 14-14 17 -2 1-4 3-4 6 z"
      fill="${f}" stroke="${s}" stroke-width="3.5" stroke-linejoin="round"/>
    <circle cx="46" cy="29" r="2.7" fill="${d}"/>
    <path d="M60 30 c4 5 6 12 6 19" stroke="${d}" stroke-width="2.5" fill="none" opacity=".55"/>
    <path d="M27 74 h48 v8 h-48 z" fill="${f}" stroke="${s}" stroke-width="3.5" stroke-linejoin="round"/>`,
  b: (f, s, d) => `
    <circle cx="50" cy="13" r="4.5" fill="${f}" stroke="${s}" stroke-width="3"/>
    <path d="M50 18 C60 27 64 36 64 44 C64 53 58 59 50 59 C42 59 36 53 36 44 C36 36 40 27 50 18 Z" fill="${f}" stroke="${s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M50 30 L57 41" stroke="${d}" stroke-width="3" stroke-linecap="round"/>
    <path d="M38 59 h24 v6 h-24 z" fill="${f}" stroke="${s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M33 65 h34 l4 9 h-42 z" fill="${f}" stroke="${s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M27 74 h46 v8 h-46 z" fill="${f}" stroke="${s}" stroke-width="3.5" stroke-linejoin="round"/>`,
  q: (f, s, d) => `
    <path d="M29 46 L24 21 L38 33 L50 15 L62 33 L76 21 L71 46 Z" fill="${f}" stroke="${s}" stroke-width="3.5" stroke-linejoin="round"/>
    <circle cx="24" cy="18" r="4" fill="${f}" stroke="${s}" stroke-width="3"/>
    <circle cx="50" cy="12" r="4" fill="${f}" stroke="${s}" stroke-width="3"/>
    <circle cx="76" cy="18" r="4" fill="${f}" stroke="${s}" stroke-width="3"/>
    <path d="M31 46 h38 l-4 20 h-30 z" fill="${f}" stroke="${s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M32 66 h36 v8 h-36 z" fill="${f}" stroke="${s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M26 74 h48 v8 h-48 z" fill="${f}" stroke="${s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M38 53 h24" stroke="${d}" stroke-width="2.5" opacity=".55"/>`,
  k: (f, s, d) => `
    <path d="M47 7 h6 v7 h7 v6 h-7 v7 h-6 v-7 h-7 v-6 h7 z" fill="${f}" stroke="${s}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M32 42 C36 32 43 28 50 28 C57 28 64 32 68 42 L64 66 H36 Z" fill="${f}" stroke="${s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M37 52 h26" stroke="${d}" stroke-width="2.5" opacity=".55"/>
    <path d="M32 66 h36 v8 h-36 z" fill="${f}" stroke="${s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M26 74 h48 v8 h-48 z" fill="${f}" stroke="${s}" stroke-width="3.5" stroke-linejoin="round"/>`,
};

export const PIECE_SETS = [
  { id: 'classic', name: 'Классика', free: true },
  { id: 'neon', name: 'Неон', free: false },
  { id: 'gold', name: 'Золото', free: false },
  { id: 'space', name: 'Космос', free: false },
];

function palette(set, color) {
  const id = 'pg' + (++gid);
  switch (set) {
    case 'neon': {
      const stroke = color === 'w' ? '#3ee7ff' : '#ff5fd9';
      return { f: color === 'w' ? '#0e1a2f' : '#20102b', s: stroke, d: stroke, glow: stroke, defs: '' };
    }
    case 'gold': {
      const stops = color === 'w' ? ['#ffedb0', '#e0a92e'] : ['#eef1f6', '#93a0b0'];
      const stroke = color === 'w' ? '#7a5a10' : '#3c4654';
      return { f: `url(#${id})`, s: stroke, d: stroke, glow: null,
        defs: `<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${stops[0]}"/><stop offset="1" stop-color="${stops[1]}"/></linearGradient></defs>` };
    }
    case 'space': {
      const stops = color === 'w' ? ['#d6c8ff', '#8b64ff'] : ['#44548c', '#161e38'];
      const stroke = color === 'w' ? '#2d1b69' : '#9db9ff';
      return { f: `url(#${id})`, s: stroke, d: color === 'w' ? '#2d1b69' : '#cfe0ff', glow: color === 'w' ? '#a98bff' : null,
        defs: `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${stops[0]}"/><stop offset="1" stop-color="${stops[1]}"/></linearGradient></defs>`,
        spark: `<circle cx="63" cy="24" r="1.8" fill="#fff" opacity=".9"/><circle cx="35" cy="50" r="1.3" fill="#fff" opacity=".7"/>` };
    }
    default:
      return color === 'w'
        ? { f: '#f6edda', s: '#4a3b28', d: '#4a3b28', glow: null, defs: '' }
        : { f: '#4e433a', s: '#17120d', d: '#a08b6f', glow: null, defs: '' };
  }
}

export function pieceSVG(type, color, set = 'classic') {
  const p = palette(set, color);
  const style = p.glow ? ` style="filter:drop-shadow(0 0 3px ${p.glow})"` : '';
  return `<svg viewBox="0 0 100 100"${style}>${p.defs}<g>${SHAPES[type](p.f, p.s, p.d)}${p.spark || ''}</g></svg>`;
}

export const PIECE_NAMES = { p: 'пешка', n: 'конь', b: 'слон', r: 'ладья', q: 'ферзь', k: 'король' };
export const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
