// Турниры: лобби (создать/войти/мои турниры) и живая сетка на выбывание.
import { Conn, joinRoomByCode } from './game-friend.js';
import { api, state as apiState, myId, myName } from './api.js';
import { el, esc, toast, copyText, confirmModal } from './util.js';
import { tourLink, shareTour, haptic } from './tg.js';
import { sound } from './sound.js';

const TC = [['none', 'Без часов'], ['3+2', '3 мин + 2 с'], ['5+0', '5 мин'], ['10+0', '10 мин']];
const STATUS = { registration: 'Идёт набор', running: 'Турнир идёт', finished: 'Завершён', cancelled: 'Отменён' };
let conn = null;
let lastState = null;

export function closeTourneyConn() { if (conn) { conn.detach(); try { conn.ws?.close(); } catch {} conn = null; } }

// ---------- лобби ----------
export async function openTourneyLobby() {
  closeTourneyConn();
  window.__cc_show('tourney');
  const root = document.getElementById('tourney-root');
  root.innerHTML = `
    <div class="back-row"><button class="btn sm" id="tr-back">← Назад</button><h2>🏆 Турниры</h2></div>
    <div class="card">
      <h3>Создать турнир</h3>
      <p class="muted">Сетка на выбывание: проиграл — вылетел. Приглашайте друзей по ссылке.</p>
      <input type="text" id="tr-name" maxlength="40" placeholder="Название (например, Кубок класса)">
      <p class="muted" style="margin:12px 0 6px">Количество игроков</p>
      <div class="choice-row" id="tr-size">
        ${[4, 8, 16].map((n, i) => `<button class="choice${i === 0 ? ' sel' : ''}" data-v="${n}">${n}</button>`).join('')}
      </div>
      <p class="muted" style="margin:12px 0 6px">Шахматные часы</p>
      <div class="choice-row" id="tr-tc" style="flex-wrap:wrap">
        ${TC.map(([v, l]) => `<button class="choice${v === '5+0' ? ' sel' : ''}" data-v="${v}" style="min-width:45%">${l}</button>`).join('')}
      </div>
      <div class="setting-row" style="border:0;padding:8px 2px"><span>Рейтинговые партии (Elo)</span><button class="switch on" id="tr-rated" aria-label="рейтинговые"></button></div>
      <button class="btn primary block" id="tr-create">Создать турнир</button>
    </div>
    <div class="card">
      <h3>Войти по коду</h3>
      <input type="text" id="tr-code" maxlength="5" placeholder="TXXXX" style="text-transform:uppercase">
      <button class="btn green block" id="tr-join" style="margin-top:10px">Присоединиться</button>
    </div>
    <div id="tr-mine"></div>`;
  root.querySelector('#tr-back').onclick = () => window.__cc_nav('home');
  let size = 4, tc = '5+0', rated = true;
  const bind = (id, cb) => root.querySelectorAll(`#${id} .choice`).forEach(b => b.onclick = () => {
    root.querySelectorAll(`#${id} .choice`).forEach(x => x.classList.remove('sel'));
    b.classList.add('sel'); cb(b.dataset.v); sound.click();
  });
  bind('tr-size', v => size = Number(v));
  bind('tr-tc', v => tc = v);
  const rsw = root.querySelector('#tr-rated');
  rsw.onclick = () => { rated = !rated; rsw.classList.toggle('on', rated); sound.click(); };
  root.querySelector('#tr-create').onclick = () => {
    const name = root.querySelector('#tr-name').value.trim() || 'Турнир клуба';
    createTournament({ name, size, tc, rated });
  };
  root.querySelector('#tr-join').onclick = () => {
    const code = root.querySelector('#tr-code').value.trim().toUpperCase();
    if (code.length < 4) { toast('Введите код турнира', 'err'); return; }
    openTournament(code, true);
  };
  renderMine();
}

async function renderMine() {
  const box = document.getElementById('tr-mine');
  if (!box) return;
  let items = [];
  try { items = (await api.tournaments()).items || []; } catch { box.innerHTML = ''; return; }
  if (!items.length) { box.innerHTML = '<div class="card"><p class="muted" style="margin:0">Ваших турниров пока нет. Создайте первый — это бесплатно.</p></div>'; return; }
  box.innerHTML = '<h3 class="sect-title">Мои турниры</h3>';
  for (const t of items) {
    const card = el('div', 'card tour-item');
    const my = t.myMatch;
    const sub = t.status === 'finished'
      ? (t.champion ? 'Победитель: ' + esc(t.champion) : 'Завершён')
      : `${STATUS[t.status]} · ${t.players}/${t.size} игроков`;
    card.innerHTML = `
      <div class="grow"><b>${esc(t.name)}</b>
        <div class="muted">${sub}</div>
        ${my ? `<div class="tour-mine">Ваша пара: ${esc(my.opponent || '—')} · ${my.status === 'active' ? 'партия идёт' : 'готовы играть'}</div>` : ''}
      </div>
      <span class="tour-code">${t.id}</span>`;
    card.onclick = () => openTournament(t.id);
    box.appendChild(card);
  }
}

// ---------- создание / просмотр ----------
function createTournament({ name, size, tc, rated }) {
  closeTourneyConn();
  window.__cc_show('tourney');
  document.getElementById('tourney-root').innerHTML = '<div class="card"><p class="muted" style="margin:0">Создаём турнир…</p></div>';
  conn = new Conn(onMsg, () => {}, { t: 't_create', userId: myId(), name: myName(), title: name, size, tc, rated });
}

export function openTournament(id, join = false) {
  closeTourneyConn();
  window.__cc_show('tourney');
  const root = document.getElementById('tourney-root');
  root.innerHTML = '<div class="card"><p class="muted" style="margin:0">Подключаемся к турниру…</p></div>';
  conn = new Conn(onMsg, s => { if (s === 'reconnecting') toast('Связь потеряна, переподключаемся…'); },
    { t: join ? 't_join' : 't_watch', id, userId: myId(), name: myName() });
  conn.tourId = id;
}

function onMsg(m) {
  if (m.t === 't_created') { toast('Турнир создан 🏆', 'ok'); return; }
  if (m.t === 't_state') { lastState = m; renderTournament(m); return; }
  if (m.t === 't_room') {
    haptic('success');
    closeTourneyConn();
    joinRoomByCode(m.code);
    window.__cc_show('room');
    return;
  }
  if (m.t === 'error') toast(m.message || 'Ошибка', 'err');
}

function avatarTag(p, cls = '') {
  if (!p) return `<span class="br-av empty"></span>`;
  return p.avatar
    ? `<img class="br-av ${cls}" src="${esc(p.avatar)}" alt="" loading="lazy">`
    : `<span class="br-av ${cls}">${esc((p.name || '?').slice(0, 1).toUpperCase())}</span>`;
}

function renderTournament(t) {
  const root = document.getElementById('tourney-root');
  const me = t.you;
  const link = tourLink(t.id, apiState.config);
  const my = t.myMatch;
  const canStart = t.isOwner && t.status === 'registration' && t.players.length >= 2;

  let html = `
    <div class="back-row"><button class="btn sm" id="t-back">← Турниры</button><h2>${esc(t.name)}</h2></div>
    <div class="card tour-head">
      <div class="th-row">
        <span class="tour-code big">${t.id}</span>
        <span class="badge ${t.status === 'running' ? 'green' : t.status === 'finished' ? 'gold' : ''}">${STATUS[t.status] || t.status}</span>
        <span class="grow"></span>
        <span class="muted">${t.players.length}/${t.size}</span>
      </div>
      <p class="muted" style="margin:8px 0 0">${t.tc === 'none' ? 'Без часов' : t.tc} · ${t.rated ? 'рейтинговые партии' : 'без рейтинга'} · ничья → переигровка</p>
      ${t.status === 'registration' ? `
        <div class="btn-row" style="margin-top:12px">
          <button class="btn primary sm" id="t-share">📨 Пригласить</button>
          <button class="btn sm" id="t-copy">🔗 Ссылка</button>
        </div>` : ''}
    </div>`;

  if (t.status === 'registration') {
    html += `<div class="card"><h3>Участники</h3><div class="tour-players">
      ${t.players.map(p => `<div class="tp-row">${avatarTag(p)}<span class="grow">${esc(p.name)}${p.id === me ? ' <span class="muted">(вы)</span>' : ''}</span><span class="muted">${p.rating}</span></div>`).join('')}
      ${Array.from({ length: Math.max(0, t.size - t.players.length) }, () => '<div class="tp-row empty"><span class="br-av empty"></span><span class="grow muted">свободное место</span></div>').join('')}
    </div>
    ${canStart ? '<button class="btn green block" id="t-start" style="margin-top:12px">Начать турнир</button>'
      : t.isOwner ? '<p class="muted" style="margin:12px 0 0">Нужно минимум 2 игрока. Отправьте друзьям ссылку.</p>'
      : '<p class="muted" style="margin:12px 0 0">Ждём, когда организатор запустит турнир.</p>'}
    ${t.isOwner ? '<button class="btn block danger sm" id="t-cancel" style="margin-top:8px">Отменить турнир</button>'
      : t.players.some(p => p.id === me) ? '<button class="btn block sm" id="t-leave" style="margin-top:8px">Покинуть турнир</button>' : ''}
    </div>`;
  }

  if (my && t.status === 'running') {
    html += `<div class="card tour-play">
      <div class="grow"><b>Ваша пара</b><div class="muted">соперник: ${esc(my.opponent?.name || '—')}${my.games ? ` · переигровка ${my.games + 1}` : ''}</div></div>
      <button class="btn green" id="t-play">${my.status === 'active' ? 'Вернуться в партию' : 'Играть'}</button>
    </div>`;
  }

  // статус игрока: прошёл дальше и ждёт соперника / выбыл
  if (t.status === 'running' && !my && me) {
    const flat = t.rounds.flat();
    const lost = flat.find(m => m.status === 'over' && m.winner && m.winner !== me && (m.a?.id === me || m.b?.id === me));
    const pending = flat.find(m => m.status !== 'over' && (m.a?.id === me || m.b?.id === me));
    if (pending) {
      const side = pending.a?.id === me ? 'b' : 'a';
      const src = t.rounds[pending.round - 1]?.[pending.idx * 2 + (side === 'a' ? 0 : 1)];
      const who = src ? [src.a?.name, src.b?.name].filter(Boolean).join(' — ') : '';
      html += `<div class="card tour-wait"><b>Вы прошли дальше</b>
        <div class="muted">${esc(t.roundTitles[pending.round] || '')}: соперник определится в паре ${esc(who || '…')}</div></div>`;
    } else if (lost) {
      html += `<div class="card tour-wait"><b>Вы выбыли</b>
        <div class="muted">${esc(t.roundTitles[lost.round] || '')} · следите за сеткой — турнир продолжается</div></div>`;
    }
  }

  if (t.rounds?.length) {
    const h = Math.max(300, t.rounds[0].length * 82);
    html += `<div class="bracket-wrap"><div class="bracket" style="height:${h}px">`;
    t.rounds.forEach((row, r) => {
      html += `<div class="br-col"><div class="br-title">${esc(t.roundTitles[r] || '')}</div>`;
      for (const m of row) {
        const winA = m.winner && m.a?.id === m.winner;
        const winB = m.winner && m.b?.id === m.winner;
        const cls = ['br-match'];
        if (m.mine) cls.push('mine');
        if (m.status === 'active') cls.push('live');
        if (m.status === 'over') cls.push('done');
        const slot = (p, win, side) => {
          const lose = m.status === 'over' && m.winner && p && p.id !== m.winner;
          const ph = r === 0 ? 'проход' : 'победитель пары ' + (m.idx * 2 + (side === 'a' ? 1 : 2));
          return `<div class="br-slot${win ? ' win' : ''}${lose ? ' lose' : ''}">
            ${avatarTag(p)}<span class="br-name">${p ? esc(p.name) : `<i class="muted">${ph}</i>`}</span>
            ${win ? '<span class="br-mark">✓</span>' : ''}</div>`;
        };
        const foot = m.status === 'active' ? '<div class="br-foot live">идёт партия</div>'
          : m.status === 'ready' ? '<div class="br-foot">ждём игроков</div>'
          : m.tiebreak ? '<div class="br-foot">тай-брейк по рейтингу</div>'
          : (m.games?.length > 1 && m.status === 'over') ? `<div class="br-foot">партий: ${m.games.length}</div>` : '';
        const body = (!m.a && !m.b)
          ? '<div class="br-slot"><span class="br-av empty"></span><span class="br-name"><i class="muted">нет участников</i></span></div>'
          : slot(m.a, winA, 'a') + slot(m.b, winB, 'b');
        html += `<div class="${cls.join(' ')}">${body}${foot}</div>`;
      }
      html += '</div>';
    });
    html += '</div></div>';
  }

  if (t.status === 'finished' && t.champion) {
    html += `<div class="card champ-card">
      <div class="champ-cup"><svg viewBox="0 0 24 24" width="46" height="46" fill="none" stroke="#d4af37" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v4.5a5 5 0 0 1-10 0z"/><path d="M7 5.5H4v1.5a3.5 3.5 0 0 0 3.5 3.5"/><path d="M17 5.5h3V7a3.5 3.5 0 0 1-3.5 3.5"/><path d="M12 13.5v3.5"/><path d="M8.5 20.5h7"/><path d="M9.5 17h5l1 3.5h-7z"/></svg></div>
      ${avatarTag(t.champion, 'big')}
      <div class="champ-name">${esc(t.champion.name)}</div>
      <div class="muted">победитель турнира</div>
      ${t.champion.id === me ? '<div class="champ-you">Это вы! Поздравляем 🎉</div>' : ''}
    </div>`;
  }
  if (t.status === 'cancelled') html += '<div class="card"><p class="muted" style="margin:0">Турнир отменён организатором.</p></div>';

  root.innerHTML = html;
  root.querySelector('#t-back').onclick = () => openTourneyLobby();
  root.querySelector('#t-share')?.addEventListener('click', () => shareTour(t.id, t.name, apiState.config));
  root.querySelector('#t-copy')?.addEventListener('click', async () => { await copyText(link); toast('Ссылка скопирована', 'ok'); });
  root.querySelector('#t-start')?.addEventListener('click', () => { sound.click(); conn?.send({ t: 't_start', id: t.id, userId: myId(), name: myName() }); });
  root.querySelector('#t-play')?.addEventListener('click', () => { sound.click(); conn?.send({ t: 't_play', id: t.id, userId: myId(), name: myName() }); });
  root.querySelector('#t-leave')?.addEventListener('click', async () => {
    if (await confirmModal('Покинуть турнир?', 'Место освободится для другого игрока.', 'Покинуть')) {
      conn?.send({ t: 't_leave', id: t.id, userId: myId(), name: myName() });
      openTourneyLobby();
    }
  });
  root.querySelector('#t-cancel')?.addEventListener('click', async () => {
    if (await confirmModal('Отменить турнир?', 'Участники увидят, что турнир отменён.', 'Отменить')) {
      conn?.send({ t: 't_cancel', id: t.id, userId: myId(), name: myName() });
    }
  });
}

// Баннер на главной: если моя пара готова
export async function renderTourneyBanner(holder) {
  if (!holder) return;
  holder.innerHTML = '';
  let items = [];
  try { items = (await api.tournaments()).items || []; } catch { return; }
  const active = items.find(t => t.status === 'running' && t.myMatch) || items.find(t => t.status === 'registration');
  if (!active) return;
  const card = el('div', 'card daily-card tour-banner');
  const sub = active.myMatch
    ? `Пара готова: ${esc(active.myMatch.opponent || '—')}`
    : `${STATUS[active.status]} · ${active.players}/${active.size}`;
  card.innerHTML = `<div class="big">🏆</div><div class="grow"><h3 style="margin:0">${esc(active.name)}</h3><p class="muted">${sub}</p></div><span>→</span>`;
  card.onclick = () => openTournament(active.id);
  holder.appendChild(card);
}
