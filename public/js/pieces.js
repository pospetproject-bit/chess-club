// SVG-фигуры: собственная отрисовка, 4 набора с РАЗНОЙ скульптурой.
// classic — плоская геометрия (бесплатно); ivory — резная «слоновая кость»;
// neon — киберпанк со свечением; crystal — гранёные полупрозрачные самоцветы.
// Единый viewBox 0 0 100 100. Каждая семья фигур — функция (p) => svgInner.
let gid = 0;

// ── Классика / Неон: плоская геометрия ──────────────────────
const SHAPES = {
  p: p => `
    <circle cx="50" cy="29" r="13" fill="${p.f}" stroke="${p.s}" stroke-width="3.5"/>
    <path d="M43 41 h14 l7 26 h-28 z" fill="${p.f}" stroke="${p.s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M32 67 h36 v7 h-36 z" fill="${p.f}" stroke="${p.s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M27 74 h46 v8 h-46 z" fill="${p.f}" stroke="${p.s}" stroke-width="3.5" stroke-linejoin="round"/>`,
  r: p => `
    <path d="M30 16 h10 v7 h7 v-7 h6 v7 h7 v-7 h10 v16 h-40 z" fill="${p.f}" stroke="${p.s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M37 32 h26 l3 34 h-32 z" fill="${p.f}" stroke="${p.s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M31 66 h38 v8 h-38 z" fill="${p.f}" stroke="${p.s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M26 74 h48 v8 h-48 z" fill="${p.f}" stroke="${p.s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M40 42 h20" stroke="${p.d}" stroke-width="2.5" opacity=".55"/>`,
  n: p => `
    <path d="M31 82 h42 v-5 c0-3-2-5-5-5 h-2 c5-8 8-17 8-27 0-15-9-26-22-29 l-3-8 -5 7 -7-2 2 8 c-6 4-11 10-13 17 l-7 13 c-2 3 0 7 3 8 l8 2 6-7 5 2 c-2 8-8 14-14 17 -2 1-4 3-4 6 z"
      fill="${p.f}" stroke="${p.s}" stroke-width="3.5" stroke-linejoin="round"/>
    <circle cx="46" cy="29" r="2.7" fill="${p.d}"/>
    <path d="M60 30 c4 5 6 12 6 19" stroke="${p.d}" stroke-width="2.5" fill="none" opacity=".55"/>
    <path d="M27 74 h48 v8 h-48 z" fill="${p.f}" stroke="${p.s}" stroke-width="3.5" stroke-linejoin="round"/>`,
  b: p => `
    <circle cx="50" cy="13" r="4.5" fill="${p.f}" stroke="${p.s}" stroke-width="3"/>
    <path d="M50 18 C60 27 64 36 64 44 C64 53 58 59 50 59 C42 59 36 53 36 44 C36 36 40 27 50 18 Z" fill="${p.f}" stroke="${p.s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M50 30 L57 41" stroke="${p.d}" stroke-width="3" stroke-linecap="round"/>
    <path d="M38 59 h24 v6 h-24 z" fill="${p.f}" stroke="${p.s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M33 65 h34 l4 9 h-42 z" fill="${p.f}" stroke="${p.s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M27 74 h46 v8 h-46 z" fill="${p.f}" stroke="${p.s}" stroke-width="3.5" stroke-linejoin="round"/>`,
  q: p => `
    <path d="M29 46 L24 21 L38 33 L50 15 L62 33 L76 21 L71 46 Z" fill="${p.f}" stroke="${p.s}" stroke-width="3.5" stroke-linejoin="round"/>
    <circle cx="24" cy="18" r="4" fill="${p.f}" stroke="${p.s}" stroke-width="3"/>
    <circle cx="50" cy="12" r="4" fill="${p.f}" stroke="${p.s}" stroke-width="3"/>
    <circle cx="76" cy="18" r="4" fill="${p.f}" stroke="${p.s}" stroke-width="3"/>
    <path d="M31 46 h38 l-4 20 h-30 z" fill="${p.f}" stroke="${p.s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M32 66 h36 v8 h-36 z" fill="${p.f}" stroke="${p.s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M26 74 h48 v8 h-48 z" fill="${p.f}" stroke="${p.s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M38 53 h24" stroke="${p.d}" stroke-width="2.5" opacity=".55"/>`,
  k: p => `
    <path d="M47 7 h6 v7 h7 v6 h-7 v7 h-6 v-7 h-7 v-6 h7 z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M32 42 C36 32 43 28 50 28 C57 28 64 32 68 42 L64 66 H36 Z" fill="${p.f}" stroke="${p.s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M37 52 h26" stroke="${p.d}" stroke-width="2.5" opacity=".55"/>
    <path d="M32 66 h36 v8 h-36 z" fill="${p.f}" stroke="${p.s}" stroke-width="3.5" stroke-linejoin="round"/>
    <path d="M26 74 h48 v8 h-48 z" fill="${p.f}" stroke="${p.s}" stroke-width="3.5" stroke-linejoin="round"/>`,
};

// ── Слоновая кость: резные точёные фигуры (Staunton) ────────
// Другой силуэт: кольца-проточки, гранёные базы, корона с шариками,
// митра с прорезью, detailed конь. Тёплая кость / чёрное дерево.
const IVORY = {
  p: p => `
    <circle cx="50" cy="25" r="11" fill="${p.f}" stroke="${p.s}" stroke-width="3"/>
    <path d="M39 37 h22 v4 h-22 z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M42 41 C40 51 38 59 34 67 h32 C62 59 60 51 58 41 z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M40 53 h20" stroke="${p.line}" stroke-width="1.6" opacity=".6"/>
    <path d="M30 67 h40 l3 7 h-46 z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M26 74 h48 v7 h-48 z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M28 77.5 h44" stroke="${p.line}" stroke-width="1.4" opacity=".55"/>`,
  r: p => `
    <path d="M30 14 h8 v6 h6 v-6 h6 v6 h6 v-6 h6 v6 h6 v-6 h8 v14 h-46 z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M34 28 h32 v5 h-32 z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M37 33 h26 l3 33 h-32 z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M39 44 h22 M40 55 h20" stroke="${p.line}" stroke-width="1.6" opacity=".6"/>
    <path d="M31 66 h38 l3 8 h-44 z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M26 74 h48 v7 h-48 z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>`,
  n: p => `
    <path d="M34 80 h40 v-4 c0-3-2-5-5-5 h-3 c6-9 9-19 9-29 0-14-8-25-20-28 l-2-7 -5 6 -6-2 1 7 c-7 4-12 11-14 19 l-8 12 c-2 3 0 7 3 8 l9 2 5-7 6 2 c-3 8-9 14-15 17 -2 1-3 3-3 5 z"
      fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="45" cy="28" r="2.5" fill="${p.d}"/>
    <circle cx="30" cy="52" r="1.6" fill="${p.d}"/>
    <path d="M58 26 c5 6 7 14 7 22 M52 24 c4 5 6 12 6 19" stroke="${p.line}" stroke-width="1.8" fill="none" opacity=".6"/>
    <path d="M27 74 h46 v7 h-46 z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M29 77.5 h42" stroke="${p.line}" stroke-width="1.4" opacity=".55"/>`,
  b: p => `
    <circle cx="50" cy="11" r="4" fill="${p.f}" stroke="${p.s}" stroke-width="2.5"/>
    <path d="M50 16 C61 26 65 36 65 45 C65 54 58 60 50 60 C42 60 35 54 35 45 C35 36 39 26 50 16 Z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M50 28 L58 42" stroke="${p.d}" stroke-width="3" stroke-linecap="round"/>
    <path d="M44 47 C46 52 54 52 56 47" stroke="${p.line}" stroke-width="1.6" fill="none" opacity=".6"/>
    <path d="M39 60 h22 v5 h-22 z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M42 65 h16 l3 8 h-22 z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M28 73 h44 l3 7 h-50 z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M25 80 h50 v4 h-50 z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>`,
  q: p => `
    <path d="M30 44 L26 20 L39 32 L50 14 L61 32 L74 20 L70 44 Z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>
    <circle cx="26" cy="17" r="3.5" fill="${p.f}" stroke="${p.s}" stroke-width="2.5"/>
    <circle cx="50" cy="11" r="3.5" fill="${p.f}" stroke="${p.s}" stroke-width="2.5"/>
    <circle cx="74" cy="17" r="3.5" fill="${p.f}" stroke="${p.s}" stroke-width="2.5"/>
    <path d="M32 44 h36 l-4 22 h-28 z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M42 46 l-2 18 M50 46 v18 M58 46 l2 18" stroke="${p.line}" stroke-width="1.5" opacity=".5"/>
    <path d="M33 66 h34 v6 h-34 z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M27 72 h46 l3 8 h-52 z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M24 80 h52 v4 h-52 z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>`,
  k: p => `
    <path d="M47 6 h6 v6 h6 v6 h-6 v6 h-6 v-6 h-6 v-6 h6 z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M34 40 C38 30 44 26 50 26 C56 26 62 30 66 40 L62 44 H38 Z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M38 44 h24 l-3 22 h-18 z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M44 46 l-1 18 M50 46 v18 M56 46 l1 18" stroke="${p.line}" stroke-width="1.5" opacity=".5"/>
    <path d="M33 66 h34 v6 h-34 z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M27 72 h46 l3 8 h-52 z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>
    <path d="M24 80 h52 v4 h-52 z" fill="${p.f}" stroke="${p.s}" stroke-width="3" stroke-linejoin="round"/>`,
};

// ── Хрусталь: гранёные полупрозрачные самоцветы ─────────────
// Угловатый low-poly силуэт, линии граней и белые блики.
const CRYSTAL = {
  p: p => `
    <path d="M50 14 L62 24 L58 38 L42 38 L38 24 Z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M50 14 L62 24 L50 27 Z" fill="${p.facet}" opacity=".38"/>
    <path d="M50 14 L50 38 M38 24 L62 24" stroke="${p.line}" stroke-width="1.3" opacity=".55"/>
    <path d="M43 38 L57 38 L60 66 L40 66 Z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M43 38 L50 38 L48 66 L40 66 Z" fill="${p.facet}" opacity=".2"/>
    <path d="M32 66 L68 66 L72 79 L28 79 Z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M32 66 L50 66 L48 79 L28 79 Z" fill="${p.facet}" opacity=".16"/>`,
  r: p => `
    <path d="M30 16 L40 16 L40 22 L46 22 L46 16 L54 16 L54 22 L60 22 L60 16 L70 16 L70 30 L30 30 Z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M30 16 L50 16 L50 30 L30 30 Z" fill="${p.facet}" opacity=".22"/>
    <path d="M36 30 L64 30 L60 66 L40 66 Z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M36 30 L50 30 L48 66 L40 66 Z" fill="${p.facet}" opacity=".2"/>
    <path d="M50 30 L50 66" stroke="${p.line}" stroke-width="1.3" opacity=".5"/>
    <path d="M30 66 L70 66 L74 80 L26 80 Z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M30 66 L50 66 L48 80 L26 80 Z" fill="${p.facet}" opacity=".16"/>`,
  n: p => `
    <path d="M34 80 L72 80 L72 74 L66 70 L72 50 L70 30 L58 18 L52 12 L48 20 L40 18 L42 26 L30 40 L24 52 L30 56 L38 50 L44 54 L38 66 L34 72 Z"
      fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M52 12 L58 18 L50 32 L48 20 Z" fill="${p.facet}" opacity=".35"/>
    <path d="M58 18 L52 42 L66 70 M42 26 L44 54" stroke="${p.line}" stroke-width="1.3" fill="none" opacity=".5"/>
    <path d="M45 27 l3 2 -3 2 -3-2 z" fill="${p.d}"/>`,
  b: p => `
    <path d="M50 8 L54 13 L50 18 L46 13 Z" fill="${p.f}" stroke="${p.s}" stroke-width="2"/>
    <path d="M50 18 L64 40 L58 60 L42 60 L36 40 Z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M50 18 L64 40 L50 45 Z" fill="${p.facet}" opacity=".35"/>
    <path d="M50 26 L58 42" stroke="${p.d}" stroke-width="2.6" stroke-linecap="round"/>
    <path d="M50 18 L50 60 M36 40 L64 40" stroke="${p.line}" stroke-width="1.2" opacity=".45"/>
    <path d="M44 60 L56 60 L58 70 L42 70 Z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M30 70 L70 70 L74 80 L26 80 Z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M30 70 L50 70 L48 80 L26 80 Z" fill="${p.facet}" opacity=".16"/>`,
  q: p => `
    <path d="M30 44 L26 20 L40 32 L50 12 L60 32 L74 20 L70 44 Z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M26 15 l4 3 -4 3 -4-3 z M50 7 l4 3 -4 3 -4-3 z M74 15 l4 3 -4 3 -4-3 z" fill="${p.f}" stroke="${p.s}" stroke-width="1.8"/>
    <path d="M30 44 L50 12 L50 44 Z" fill="${p.facet}" opacity=".25"/>
    <path d="M32 44 L68 44 L62 66 L38 66 Z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M32 44 L50 44 L46 66 L38 66 Z" fill="${p.facet}" opacity=".2"/>
    <path d="M50 44 L50 66 M32 44 L44 66 M68 44 L56 66" stroke="${p.line}" stroke-width="1.2" opacity=".45"/>
    <path d="M28 66 L72 66 L76 80 L24 80 Z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M28 66 L50 66 L48 80 L24 80 Z" fill="${p.facet}" opacity=".16"/>`,
  k: p => `
    <path d="M47 6 L53 6 L53 12 L59 12 L59 18 L53 18 L53 24 L47 24 L47 18 L41 18 L41 12 L47 12 Z" fill="${p.f}" stroke="${p.s}" stroke-width="2.2" stroke-linejoin="round"/>
    <path d="M47 6 L53 6 L53 12 L47 12 Z" fill="${p.facet}" opacity=".35"/>
    <path d="M36 42 L40 30 L50 26 L60 30 L64 42 Z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M36 42 L50 26 L50 42 Z" fill="${p.facet}" opacity=".25"/>
    <path d="M38 42 L62 42 L58 66 L42 66 Z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M38 42 L50 42 L48 66 L42 66 Z" fill="${p.facet}" opacity=".2"/>
    <path d="M50 42 L50 66" stroke="${p.line}" stroke-width="1.2" opacity=".45"/>
    <path d="M28 66 L72 66 L76 80 L24 80 Z" fill="${p.f}" stroke="${p.s}" stroke-width="2.5" stroke-linejoin="round"/>
    <path d="M28 66 L50 66 L48 80 L24 80 Z" fill="${p.facet}" opacity=".16"/>`,
};

const FAMILIES = { classic: SHAPES, neon: SHAPES, ivory: IVORY, crystal: CRYSTAL };

export const PIECE_SETS = [
  { id: 'classic', name: 'Классика', free: true },
  { id: 'ivory', name: 'Слоновая кость', free: false },
  { id: 'neon', name: 'Неон', free: false },
  { id: 'crystal', name: 'Хрусталь', free: false },
];

function palette(set, color) {
  const id = 'pg' + (++gid);
  const grad = (stops, diag = false, op = 1) =>
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="${diag ? 1 : 0}" y2="1">${stops.map(([o, c]) => `<stop offset="${o}" stop-color="${c}" stop-opacity="${op}"/>`).join('')}</linearGradient></defs>`;
  switch (set) {
    case 'neon': {
      const stroke = color === 'w' ? '#3ee7ff' : '#ff5fd9';
      return { f: color === 'w' ? '#0e1a2f' : '#20102b', s: stroke, d: stroke, line: stroke, facet: '#fff', glow: stroke, defs: '' };
    }
    case 'ivory': {
      const stops = color === 'w' ? [[0, '#fdf6e6'], [0.55, '#f0e2c2'], [1, '#d8c197']] : [[0, '#7a5c3e'], [0.55, '#543c27'], [1, '#2e2015']];
      const stroke = color === 'w' ? '#8a6d3f' : '#160e07';
      return { f: `url(#${id})`, s: stroke, d: color === 'w' ? '#9a7c4a' : '#d8b78a',
        line: color === 'w' ? '#b99b6b' : '#8a6a48', facet: '#fff', glow: null, shadow: true, defs: grad(stops) };
    }
    case 'crystal': {
      const stops = color === 'w' ? [[0, '#f2fbff'], [0.5, '#cfe6f7'], [1, '#9cc4e8']] : [[0, '#b79cff'], [0.5, '#8f76d6'], [1, '#4a3585']];
      const stroke = color === 'w' ? '#5b86b0' : '#2a1f52';
      return { f: `url(#${id})`, s: stroke, d: color === 'w' ? '#3f6f9f' : '#e6d8ff',
        line: color === 'w' ? '#7fa8cf' : '#c9b6ff', facet: '#ffffff',
        glow: color === 'w' ? '#bfe0ff' : '#a98bff', defs: grad(stops, true, 0.94) };
    }
    default:
      return color === 'w'
        ? { f: '#f6edda', s: '#4a3b28', d: '#4a3b28', line: '#4a3b28', facet: '#fff', glow: null, defs: '' }
        : { f: '#4e433a', s: '#17120d', d: '#a08b6f', line: '#a08b6f', facet: '#fff', glow: null, defs: '' };
  }
}

export function pieceSVG(type, color, set = 'classic') {
  const p = palette(set, color);
  const shapes = FAMILIES[set] || SHAPES;
  const style = p.glow ? ` style="filter:drop-shadow(0 0 3px ${p.glow})"`
    : p.shadow ? ` style="filter:drop-shadow(0 1px 1px rgba(0,0,0,.35))"` : '';
  return `<svg viewBox="0 0 100 100"${style}>${p.defs}<g>${shapes[type](p)}${p.spark || ''}</g></svg>`;
}

export const PIECE_NAMES = { p: 'пешка', n: 'конь', b: 'слон', r: 'ладья', q: 'ферзь', k: 'король' };
export const PIECE_VALUES = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };
