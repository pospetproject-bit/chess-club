// Экран «Рейтинг»: таблица лидеров (все игроки / друзья) + твоя карточка.
import { el, esc } from './util.js';
import { api, state, myId } from './api.js';
import { sound } from './sound.js';

let scope = 'all';

export async function renderRating() {
  const root = document.getElementById('rating-content');
  root.innerHTML = `<div class="spinner"></div>`;
  let data;
  try { data = await api.leaderboard(scope); }
  catch (e) { root.innerHTML = `<p class="muted">Не удалось загрузить рейтинг: ${esc(e.message)}</p>`; return; }
  const me = state.me;
  root.innerHTML = '';

  // твоя карточка
  const you = data.you;
  const card = el('div', 'card rating-me');
  card.innerHTML = `
    <div class="rm-rating"><div class="rm-num">${me?.rating ?? 1200}</div><div class="rm-lbl">твой рейтинг</div></div>
    <div class="rm-stats">
      <div><b>${you ? '#' + you.rank : '—'}</b><span>место</span></div>
      <div><b>${me?.rating_games ?? 0}</b><span>рейт. партий</span></div>
      <div><b>${me?.best_streak ?? 0}</b><span>лучшая серия</span></div>
    </div>`;
  root.appendChild(card);

  // вкладки
  const tabs = el('div', 'seg-tabs');
  for (const [id, label] of [['all', 'Все игроки'], ['friends', 'Друзья']]) {
    const b = el('button', 'seg' + (scope === id ? ' on' : ''), label);
    b.onclick = () => { scope = id; sound.click(); renderRating(); };
    tabs.appendChild(b);
  }
  root.appendChild(tabs);

  const rows = data.rows || [];
  if (!rows.length) {
    root.appendChild(el('p', 'muted', scope === 'friends'
      ? 'Пока пусто. Сыграй с другом — и он появится здесь.'
      : 'Пока никто не сыграл рейтинговую партию. Будь первым!'));
    return;
  }
  const table = el('div', 'lb-table');
  table.innerHTML = `<div class="lb-row lb-head"><span class="lb-rank">#</span><span class="lb-name">Игрок</span><span class="lb-rating">Рейтинг</span><span class="lb-games">Партии</span><span class="lb-wl">П/Н/П</span></div>`;
  for (const r of rows) {
    const row = el('div', 'lb-row' + (r.you ? ' me' : '') + (r.rank <= 3 ? ' top' + r.rank : ''));
    row.innerHTML = `
      <span class="lb-rank">${r.rank}</span>
      <span class="lb-name"><span class="lb-ava">${esc((r.name || '?')[0].toUpperCase())}${r.avatar ? `<img class="ava-img" src="${esc(r.avatar)}" alt="" onerror="this.remove()">` : ''}</span><span class="lb-nm">${esc(r.name)}${r.you ? ' <i class="lb-you">вы</i>' : ''}</span></span>
      <span class="lb-rating">${r.rating}</span>
      <span class="lb-games">${r.games}</span>
      <span class="lb-wl"><i class="w">${r.w}</i>/<i class="d">${r.d}</i>/<i class="l">${r.l}</i></span>`;
    table.appendChild(row);
  }
  root.appendChild(table);
  root.appendChild(el('p', 'muted lb-note', 'Рейтинг Elo: победа приносит очки, поражение — отнимает, ничья — небольшой сдвиг к центру. Играй рейтинговые партии с другом или ботом, чтобы подняться в таблице.'));
}
