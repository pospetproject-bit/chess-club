// Магазин: премиум, разборы/подсказки, курсы, доски, фигуры, отключение рекламы.
import { el, esc, toast, store } from './util.js';
import { state, has, isPremium, purchase } from './api.js';
import { pieceSVG, PIECE_SETS } from './pieces.js';
import { sound } from './sound.js';

const BOARD_THEMES = [
  { id: 'classic', name: 'Классика', free: true },
  { id: 'green', name: 'Турнирная', free: true },
  { id: 'blue', name: 'Океан', free: true },
  { id: 'emerald', name: 'Изумруд', product: 'board_emerald' },
  { id: 'marble', name: 'Мрамор', product: 'board_marble' },
  { id: 'midnight', name: 'Полночь', product: 'board_midnight' },
  { id: 'sakura', name: 'Сакура', product: 'board_sakura' },
];

function miniBoard(theme, set) {
  let squares = '';
  for (let r = 0; r < 4; r++) for (let f = 0; f < 8; f++) {
    squares += `<div class="${(r + f) % 2 === 0 ? 'light' : 'dark'}" style="background:var(--sq-${(r + f) % 2 === 0 ? 'light' : 'dark'})"></div>`;
  }
  const row1 = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'].map(t => pieceSVG(t, 'b', set)).join('');
  const row2 = Array(8).fill(pieceSVG('p', 'b', set)).join('');
  const row3 = Array(8).fill(pieceSVG('p', 'w', set)).join('');
  const row4 = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'].map(t => pieceSVG(t, 'w', set)).join('');
  return `<div class="mini-board board" data-theme="${theme}" style="box-shadow:none;border-radius:9px">
    <div class="mb-squares">${squares}</div>
    <div class="mb-pieces">${row1}${row2}${row3}${row4}</div>
  </div>`;
}

const price = id => state.config?.catalog.find(p => p.id === id)?.stars ?? '?';

function buyBtn(productId, ownedKey, applyLabel, onApply) {
  if (ownedKey && has(ownedKey)) {
    const b = el('button', 'btn sm green block', applyLabel || '✓ Куплено');
    if (onApply) b.onclick = onApply;
    else { b.disabled = true; }
    return b;
  }
  const b = el('button', 'btn sm primary block', `${price(productId)} ⭐`);
  b.onclick = async () => { if (await purchase(productId)) { sound.coin(); renderStore(); } };
  return b;
}

export function renderStore() {
  const root = document.getElementById('store-content');
  root.innerHTML = '';
  const me = state.me;

  // --- премиум ---
  if (isPremium()) {
    const until = new Date(me.premium_until).toLocaleDateString('ru-RU');
    root.appendChild(el('div', 'premium-banner', `<h3>♛ Премиум активен</h3><p class="muted" style="color:#d8cdb2">Действует до ${until}. Всё включено: доски, фигуры, курсы, задачи, безлимитный разбор и подсказки, без рекламы.</p>`));
  } else {
    const banner = el('div', 'premium-banner');
    banner.innerHTML = `<h3>♛ Премиум — всё включено</h3>
      <ul>
        <li>Все премиум-доски и наборы фигур</li>
        <li>Безлимитный разбор партий и подсказки</li>
        <li>Все курсы и вся библиотека задач</li>
        <li>Никакой рекламы</li>
      </ul>
      <button class="btn primary block" id="buy-premium">Оформить за ${price('premium_30d')} ⭐ / 30 дней</button>`;
    banner.querySelector('#buy-premium').onclick = async () => { if (await purchase('premium_30d')) renderStore(); };
    root.appendChild(banner);
  }

  const section = (title, sub = '') => {
    const s = el('div', 'store-section');
    s.appendChild(el('h3', '', title));
    if (sub) s.appendChild(el('p', 'muted', sub));
    root.appendChild(s);
    return s;
  };
  const wideCard = (s, { ico, title, desc, product, ownedKey, extra = '' }) => {
    const c = el('div', 'card');
    c.style.display = 'flex'; c.style.gap = '12px'; c.style.alignItems = 'center';
    const info = el('div', '', `<h3 style="margin:0">${ico} ${title}</h3><p class="muted" style="line-height:1.45">${desc}</p>${extra}`);
    info.style.flex = '1';
    const btnWrap = el('div');
    btnWrap.style.minWidth = '110px';
    btnWrap.appendChild(buyBtn(product, ownedKey, '✓ Активно'));
    c.append(info, btnWrap);
    s.appendChild(c);
  };

  // --- анализ и подсказки ---
  const s1 = section('📊 Разбор партий и подсказки', `Сейчас у вас: разборов — ${me?.analysis_credits ?? 0}, подсказок — ${me?.hints ?? 0}`);
  wideCard(s1, { ico: '🔍', title: 'Разбор 1 партии', desc: 'График оценки, точность сторон, зевки и лучшие ходы.', product: 'analysis_1' });
  wideCard(s1, { ico: '📦', title: '10 разборов', desc: 'Пакет со скидкой 48% — для тех, кто растёт всерьёз.', product: 'analysis_10', extra: '<span class="badge green">выгодно</span>' });
  wideCard(s1, { ico: '💡', title: '20 подсказок', desc: 'Лучший ход стрелкой в партии с ботом. +1 бесплатно за просмотр рекламы.', product: 'hints_20' });

  // --- обучение ---
  const s2 = section('🎓 Обучение');
  wideCard(s2, { ico: '🚀', title: 'Курс «Дебюты»', desc: 'Итальянская, сицилианская, ферзевый гамбит — ход за ходом.', product: 'lessons_openings', ownedKey: 'lessons:openings' });
  wideCard(s2, { ico: '⚡', title: 'Курс «Тактика»', desc: 'Вилки, связки, сквозные удары, матовые конструкции.', product: 'lessons_tactics', ownedKey: 'lessons:tactics' });
  wideCard(s2, { ico: '👑', title: 'Курс «Эндшпиль»', desc: 'Правило квадрата, маты ферзём и ладьёй.', product: 'lessons_endgame', ownedKey: 'lessons:endgame' });
  wideCard(s2, { ico: '🎁', title: 'Все курсы', desc: 'Три курса одним пакетом со скидкой.', product: 'lessons_all', ownedKey: 'lessons:openings', extra: '<span class="badge green">−16%</span>' });
  wideCard(s2, { ico: '🧩', title: 'Тактика+ (12 задач)', desc: 'Вся библиотека задач. Задача дня — всегда бесплатно.', product: 'puzzles_pack', ownedKey: 'puzzles:all' });

  // --- доски ---
  const s3 = section('🎨 Доски', 'Применяются мгновенно во всех режимах');
  const g3 = el('div', 'store-grid');
  const curBoard = store.get('board', 'classic');
  for (const t of BOARD_THEMES) {
    const c = el('div', 'store-card');
    const owned = t.free || has('board:' + t.id);
    c.innerHTML = `${miniBoard(t.id, 'classic')}<div class="s-title">${t.name} ${curBoard === t.id ? '<span class="badge blue">выбрана</span>' : ''}</div>`;
    if (owned) {
      const b = el('button', 'btn sm block ' + (curBoard === t.id ? 'green' : ''), curBoard === t.id ? '✓ Используется' : 'Применить');
      b.onclick = () => { store.set('board', t.id); toast(`Доска «${t.name}» применена`, 'ok'); renderStore(); };
      c.appendChild(b);
    } else c.appendChild(buyBtn(t.product, 'board:' + t.id));
    g3.appendChild(c);
  }
  s3.appendChild(g3);
  const packB = el('div', 'card');
  packB.style.cssText = 'display:flex;align-items:center;gap:12px;margin-top:10px';
  packB.innerHTML = `<div style="flex:1"><h3 style="margin:0">🎁 Все премиум-доски</h3><p class="muted">4 доски со скидкой 29%</p></div>`;
  const pbWrap = el('div'); pbWrap.style.minWidth = '110px';
  pbWrap.appendChild(buyBtn('boards_pack', 'board:emerald'));
  packB.appendChild(pbWrap);
  s3.appendChild(packB);

  // --- фигуры ---
  const s4 = section('♞ Наборы фигур');
  const g4 = el('div', 'store-grid');
  const curSet = store.get('pieces', 'classic');
  for (const t of PIECE_SETS) {
    const c = el('div', 'store-card');
    const owned = t.free || has('pieces:' + t.id);
    c.innerHTML = `${miniBoard('green', t.id)}<div class="s-title">${t.name} ${curSet === t.id ? '<span class="badge blue">выбраны</span>' : ''}</div>`;
    if (owned) {
      const b = el('button', 'btn sm block ' + (curSet === t.id ? 'green' : ''), curSet === t.id ? '✓ Используются' : 'Применить');
      b.onclick = () => { store.set('pieces', t.id); toast(`Фигуры «${t.name}» применены`, 'ok'); renderStore(); };
      c.appendChild(b);
    } else c.appendChild(buyBtn('pieces_' + t.id, 'pieces:' + t.id));
    g4.appendChild(c);
  }
  s4.appendChild(g4);
  const packP = el('div', 'card');
  packP.style.cssText = 'display:flex;align-items:center;gap:12px;margin-top:10px';
  packP.innerHTML = `<div style="flex:1"><h3 style="margin:0">🎁 Все премиум-фигуры</h3><p class="muted">3 набора со скидкой 18%</p></div>`;
  const ppWrap = el('div'); ppWrap.style.minWidth = '110px';
  ppWrap.appendChild(buyBtn('pieces_pack', 'pieces:neon'));
  packP.appendChild(ppWrap);
  s4.appendChild(packP);

  // --- без рекламы ---
  const s5 = section('🚫 Комфорт');
  wideCard(s5, { ico: '🚫', title: 'Без рекламы — навсегда', desc: 'Убирает рекламные показы между партиями. Разовая покупка.', product: 'no_ads', ownedKey: 'no_ads' });

  root.appendChild(el('p', 'muted', 'Оплата — Telegram Stars ⭐. Возвраты и вопросы: команда поддержки в боте (/paysupport). Покупки привязаны к вашему Telegram-аккаунту.'));
}
