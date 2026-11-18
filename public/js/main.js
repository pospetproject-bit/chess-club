// Главный модуль: роутер, главная, профиль, настройка партии с ботом.
import { $, $$, el, esc, store, toast, modal, fmtDate, copyText } from './util.js';
import * as api from './api.js';
import { inTelegram, startParam, initAds, backButton, haptic } from './tg.js';
import { sound } from './sound.js';
import { startBotGame, hasSavedBotGame, BOT_LEVELS } from './game-bot.js';
import { openFriendLobby, startLocalGame, leaveActiveRoom } from './game-friend.js';
import { renderLearn } from './lessons.js';
import { renderPuzzles, dailyPuzzle, startPuzzle } from './puzzles.js';
import { renderStore } from './store.js';
import { openAnalysisFlow } from './analysis.js';

const MAIN_SCREENS = ['home', 'learn', 'puzzles', 'store', 'profile'];
let currentScreen = 'home';

export function show(name) {
  $$('.screen').forEach(s => s.classList.remove('active'));
  $('#screen-' + name)?.classList.add('active');
  $('#tabbar').classList.toggle('hidden', !MAIN_SCREENS.includes(name));
  currentScreen = name;
  window.scrollTo(0, 0);
}

export function nav(tab) {
  backButton(false, () => {});
  if (tab === 'home') renderHome();
  if (tab === 'learn') renderLearn();
  if (tab === 'puzzles') renderPuzzles();
  if (tab === 'store') renderStore();
  if (tab === 'profile') renderProfile();
  show(tab);
  $$('#tabbar .tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
}

window.__cc_nav = nav;
window.__cc_show = show;

// ---------- главная ----------
const TIPS = [
  '<b>Совет дня:</b> в дебюте развивайте коней и слонов, рокируйтесь и не выводите ферзя слишком рано.',
  '<b>Совет дня:</b> перед каждым ходом спрашивайте себя: «Что угрожает соперник?»',
  '<b>Совет дня:</b> ладьи любят открытые линии, кони — форпосты в центре.',
  '<b>Совет дня:</b> связаны фигуры? Атакуйте их пешками!',
  '<b>Совет дня:</b> решайте задачу дня каждый день — тактическое зрение растёт быстрее всего.',
  '<b>Совет дня:</b> в эндшпиле король — активная фигура. Ведите его в центр!',
  '<b>Совет дня:</b> проиграв партию — разберите её. Ошибки — лучшие учителя! 😉',
];

function renderHome() {
  const me = api.state.me;
  const chip = $('#premium-chip');
  chip.innerHTML = '';
  if (api.isPremium()) chip.appendChild(el('span', 'premium-chip', '♛ Премиум'));
  else {
    const c = el('span', 'premium-chip', '♛ Премиум');
    c.onclick = () => nav('store');
    chip.appendChild(c);
  }
  // продолжить партию
  const rc = $('#resume-card');
  rc.innerHTML = '';
  if (hasSavedBotGame()) {
    const s = store.get('bot_game');
    const card = el('div', 'card daily-card');
    card.innerHTML = `<div class="big">⏳</div><div class="grow"><h3 style="margin:0">Незаконченная партия</h3><p class="muted">С ботом · ${BOT_LEVELS[s.level]?.name || ''} · ${s.moves.length} полуходов</p></div><button class="btn sm danger" id="rc-drop">✕</button>`;
    card.onclick = e => {
      if (e.target.id === 'rc-drop') { store.del('bot_game'); renderHome(); return; }
      startBotGame({ resume: true }); show('game');
    };
    rc.appendChild(card);
  }
  // задача дня
  const dc = $('#daily-card');
  const p = dailyPuzzle();
  const solvedToday = store.get('puzzles_solved', []).includes(p.id + ':' + new Date().toISOString().slice(0, 10));
  const st = store.get('puzzle_streak', { count: 0 });
  const card = el('div', 'card daily-card');
  card.innerHTML = `<div class="big">${solvedToday ? '✅' : '🧩'}</div><div class="grow"><h3 style="margin:0">Задача дня</h3><p class="muted">${p.theme} · бесплатно${st.count ? ` · стрик 🔥 ${st.count}` : ''}</p></div><div>→</div>`;
  card.onclick = () => { nav('puzzles'); startPuzzle(p, true); };
  dc.innerHTML = ''; dc.appendChild(card);
  $('#tip-card').innerHTML = TIPS[Math.floor(Date.now() / 86400000) % TIPS.length];
}

// ---------- настройка партии с ботом ----------
function botSetup() {
  let level = store.get('last_level', 'medium');
  let color = store.get('last_color', 'w');
  const m = modal(`
    <h3>🤖 Партия с ботом</h3>
    <p class="muted">Выберите соперника:</p>
    <div class="choice-row" id="lvl-choice" style="flex-direction:column">
      ${Object.entries(BOT_LEVELS).map(([id, b]) => `
        <button class="choice${id === level ? ' sel' : ''}" data-v="${id}" style="display:flex;align-items:center;gap:10px;text-align:left">
          <span style="font-size:24px">${b.avatar}</span>
          <span><b>${b.name}</b><br><span class="muted">${b.sub}</span></span>
        </button>`).join('')}
    </div>
    <p class="muted">Ваш цвет:</p>
    <div class="choice-row" id="clr-choice">
      <button class="choice${color === 'w' ? ' sel' : ''}" data-v="w"><span class="c-ico">♙</span>Белые</button>
      <button class="choice${color === 'b' ? ' sel' : ''}" data-v="b"><span class="c-ico">♟</span>Чёрные</button>
      <button class="choice${color === 'random' ? ' sel' : ''}" data-v="random"><span class="c-ico">🎲</span>Случайно</button>
    </div>
    <button class="btn primary block" id="start-bot" style="margin-top:10px">Начать партию</button>`);
  const bind = (id, cb) => m.root.querySelectorAll(`#${id} .choice`).forEach(b => b.onclick = () => {
    m.root.querySelectorAll(`#${id} .choice`).forEach(x => x.classList.remove('sel'));
    b.classList.add('sel'); cb(b.dataset.v); sound.click();
  });
  bind('lvl-choice', v => level = v);
  bind('clr-choice', v => color = v);
  m.root.querySelector('#start-bot').onclick = () => {
    store.set('last_level', level); store.set('last_color', color);
    m.close();
    startBotGame({ level, color });
    show('game');
    backButton(true, () => { nav('home'); });
  };
}

// ---------- профиль ----------
async function renderProfile() {
  const root = $('#profile-content');
  const me = api.state.me;
  const name = api.myName();
  const stats = me?.stats || { bot: { w: 0, l: 0, d: 0 }, friend: { w: 0, l: 0, d: 0 } };
  root.innerHTML = `
    <div class="profile-head">
      <div class="avatar-big">${esc(name[0]?.toUpperCase() || '♟')}</div>
      <div>
        <h3 style="margin:0">${esc(name)} ${api.isPremium() ? '<span class="badge gold">♛ Премиум</span>' : ''}</h3>
        <p class="muted">${inTelegram ? 'Telegram-аккаунт' : 'Демо-профиль (вне Telegram)'} · 💡 ${me?.hints ?? 0} · 📊 ${me?.analysis_credits ?? 0}</p>
        ${!inTelegram ? '<button class="btn sm ghost" id="edit-name">✏️ Изменить имя</button>' : ''}
      </div>
    </div>
    <h3>Статистика</h3>
    <div class="stats-grid">
      <div class="stat-cell"><div class="v" style="color:var(--green)">${stats.bot.w}</div><div class="k">побед с ботом</div></div>
      <div class="stat-cell"><div class="v">${stats.bot.d}</div><div class="k">ничьих</div></div>
      <div class="stat-cell"><div class="v" style="color:var(--red)">${stats.bot.l}</div><div class="k">поражений</div></div>
    </div>
    <p class="muted">С друзьями: ${stats.friend.w} побед · ${stats.friend.d} ничьих · ${stats.friend.l} поражений</p>
    <h3 style="margin-top:14px">Настройки</h3>
    <div id="settings"></div>
    <h3 style="margin-top:14px">История партий</h3>
    <div id="history"><div class="spinner"></div></div>`;
  root.querySelector('#edit-name')?.addEventListener('click', () => {
    const m = modal(`<h3>Ваше имя</h3><input type="text" id="nm" maxlength="24" style="text-transform:none;letter-spacing:normal" value="${esc(store.get('demo_name', 'Гость'))}"><button class="btn primary block" id="nm-save" style="margin-top:10px">Сохранить</button>`);
    m.root.querySelector('#nm-save').onclick = async () => {
      store.set('demo_name', m.root.querySelector('#nm').value.trim() || 'Гость');
      m.close(); await api.refreshMe().catch(() => {}); renderProfile();
    };
  });
  const settings = [
    ['sound', '🔊 Звуки', true],
    ['coords', '🔤 Координаты на доске', true],
    ['autoflip', '🔁 Автоповорот (вдвоём рядом)', true],
  ];
  const sBox = root.querySelector('#settings');
  for (const [key, label, def] of settings) {
    const row = el('div', 'setting-row', `<span>${label}</span>`);
    const sw = el('button', 'switch' + (store.get(key, def) ? ' on' : ''));
    sw.onclick = () => { store.set(key, !store.get(key, def)); sw.classList.toggle('on'); sound.click(); };
    row.appendChild(sw);
    sBox.appendChild(row);
  }
  // история
  try {
    const { games } = await api.api.games();
    const h = root.querySelector('#history');
    h.innerHTML = '';
    if (!games.length) h.innerHTML = '<p class="muted">Пока пусто — сыграйте первую партию!</p>';
    for (const g of games.slice(0, 30)) {
      const modeIco = g.mode === 'bot' ? '🤖' : g.mode === 'friend' ? '⚔️' : '📱';
      const modeName = g.mode === 'bot' ? `Бот · ${g.difficulty === 'easy' ? 'лёгкий' : g.difficulty === 'medium' ? 'средний' : 'сложный'}` : g.mode === 'friend' ? 'С другом' : 'Вдвоём рядом';
      const win = g.result === g.player_color, draw = g.result === 'draw';
      const badge = draw ? '<span class="badge blue">ничья</span>' : win ? '<span class="badge green">победа</span>' : '<span class="badge red">поражение</span>';
      const item = el('div', 'history-item');
      item.innerHTML = `<span style="font-size:19px">${modeIco}</span>
        <div class="grow"><b>${modeName}</b> ${badge}<div class="h-sub">${fmtDate(g.ts)}</div></div>
        <button class="btn sm ${g.analyzed ? '' : 'primary'}" data-an>${g.analyzed ? '📊 Разбор' : '📊 Разобрать'}</button>
        <button class="btn sm ghost" data-pgn>📋</button>`;
      item.querySelector('[data-an]').onclick = () => openAnalysisFlow({ pgn: g.pgn, gameId: g.id, playerColor: g.player_color, title: 'Разбор партии' });
      item.querySelector('[data-pgn]').onclick = async () => { await copyText(g.pgn); toast('PGN скопирован', 'ok'); };
      h.appendChild(item);
    }
  } catch (e) {
    root.querySelector('#history').innerHTML = `<p class="muted">Не удалось загрузить историю: ${esc(e.message)}</p>`;
  }
}

// ---------- старт ----------
async function boot() {
  $$('#tabbar .tab').forEach(b => b.onclick = () => { sound.click(); nav(b.dataset.tab); });
  $('#btn-bot').onclick = botSetup;
  $('#btn-friend').onclick = () => { openFriendLobby(); show('room'); };
  $('#btn-local').onclick = () => { startLocalGame(); show('game'); };
  $('#btn-learn-home').onclick = () => nav('learn');
  try {
    await api.init();
    window.__cc_config = api.state.config;
    initAds(api.state.config.adsgram);
  } catch (e) {
    toast('Сервер недоступен: ' + e.message, 'err', 5000);
  }
  renderHome();
  show('home');
  // deep link приглашения
  const hashJoin = location.hash.match(/join=([A-Z0-9]{4,6})/i)?.[1];
  const joinCode = (startParam || '').startsWith('join_') ? startParam.slice(5) : hashJoin;
  if (joinCode) {
    openFriendLobby(joinCode.toUpperCase());
    show('room');
  }
}

boot();
