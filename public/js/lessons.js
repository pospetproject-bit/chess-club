// Обучение: интерактивные уроки. Шаг = текст + ожидаемый ход игрока (+автоответ).
// Все последовательности ходов проверены тестами (tests/run.js).
import { Chess } from '../vendor/chess.js';
import { BoardView } from './board.js';
import { el, esc, toast, modal, store } from './util.js';
import { has, purchase, isPremium, api } from './api.js';
import { sound } from './sound.js';
import { kingSquare } from './game-ui.js';

import { PACKS, LESSONS } from './data-lessons.js';
import { announceAchievements } from './achievements.js';
export { PACKS, LESSONS };

const done = () => store.get('lessons_done', []);

// ---------- экран списка курсов ----------
const GROUPS = [
  { id: 'all', title: 'Все' },
  { id: 'base', title: 'Основы' },
  { id: 'openings', title: 'Дебюты' },
  { id: 'tactics', title: 'Тактика' },
  { id: 'endgame', title: 'Эндшпиль' },
  { id: 'practice', title: 'Мастерство' },
];
let learnGroup = 'all';

export function renderLearn() {
  const root = document.getElementById('learn-list');
  root.innerHTML = '';
  const d = done();
  const total = LESSONS.length;
  const passed = LESSONS.filter(l => d.includes(l.id)).length;
  const paidPacks = PACKS.filter(p => !p.free);
  const ownedAll = isPremium() || paidPacks.every(p => has('lessons:' + p.id));

  // сводка прогресса
  const head = el('div', 'card learn-head');
  head.innerHTML = `
    <div class="lh-row"><b>${passed}</b><span class="muted">из ${total} уроков пройдено</span>
      <span class="grow"></span><span class="muted">${PACKS.length} курсов</span></div>
    <div class="bar"><i style="width:${Math.round(passed / total * 100)}%"></i></div>`;
  root.appendChild(head);

  // пакет всех курсов
  if (!ownedAll) {
    const bundle = window.__cc_config?.catalog.find(p => p.id === 'lessons_all');
    const sum = paidPacks.reduce((a, p) => a + priceOf(p.product), 0);
    const banner = el('div', 'card bundle-card');
    banner.innerHTML = `
      <div class="grow">
        <h3 style="margin:0 0 4px">Все курсы навсегда</h3>
        <p class="muted">${paidPacks.length} курсов · ${total} уроков. По одному — ${sum}⭐, пакетом — ${bundle?.stars ?? 149}⭐.</p>
      </div>
      <button class="btn gold sm" id="buy-all">${bundle?.stars ?? 149} ⭐</button>`;
    banner.querySelector('#buy-all').onclick = async (e) => {
      e.stopPropagation();
      const ok = await purchase('lessons_all');
      if (ok) renderLearn();
    };
    root.appendChild(banner);
  }

  // фильтр по разделам
  const chips = el('div', 'chips');
  for (const g of GROUPS) {
    const c = el('button', 'chip' + (learnGroup === g.id ? ' on' : ''));
    c.textContent = g.title;
    c.onclick = () => { learnGroup = g.id; renderLearn(); };
    chips.appendChild(c);
  }
  root.appendChild(chips);

  for (const pack of PACKS) {
    if (learnGroup !== 'all' && pack.group !== learnGroup) continue;
    const lessons = LESSONS.filter(l => l.pack === pack.id);
    const doneCount = lessons.filter(l => d.includes(l.id)).length;
    const unlocked = pack.free || isPremium() || has('lessons:' + pack.id);
    const card = el('div', 'card pack-card' + (unlocked ? '' : ' locked'));
    card.innerHTML = `
      <div class="p-ico">${pack.ico}</div>
      <div class="grow">
        <h3 style="margin:0">${esc(pack.title)}</h3>
        <p class="muted">${esc(pack.desc)}</p>
        <div class="pack-meta">
          <span class="muted">${lessons.length} уроков</span>
          ${unlocked
            ? `<span class="muted">· пройдено ${doneCount}/${lessons.length}</span>`
            : `<span class="badge gold">${priceOf(pack.product)} ⭐</span>`}
        </div>
        ${unlocked ? `<div class="bar sm"><i style="width:${Math.round(doneCount / lessons.length * 100)}%"></i></div>` : ''}
      </div>
      <div class="p-arrow">${unlocked ? '→' : '🔒'}</div>`;
    card.onclick = async () => {
      if (!unlocked) {
        const ok = await purchase(pack.product);
        if (ok) renderPack(pack);
        return;
      }
      renderPack(pack);
    };
    root.appendChild(card);
  }
}

function priceOf(productId) {
  return window.__cc_config?.catalog.find(p => p.id === productId)?.stars ?? 19;
}

function renderPack(pack) {
  const root = document.getElementById('learn-list');
  const lessons = LESSONS.filter(x => x.pack === pack.id);
  const d = done();
  const doneCount = lessons.filter(l => d.includes(l.id)).length;
  root.innerHTML = `<div class="back-row"><button class="btn sm" id="pack-back">← Курсы</button><h2>${pack.ico} ${esc(pack.title)}</h2></div>
    <div class="card learn-head"><div class="lh-row"><b>${doneCount}</b><span class="muted">из ${lessons.length} уроков</span></div>
    <div class="bar"><i style="width:${Math.round(doneCount / lessons.length * 100)}%"></i></div>
    <p class="muted" style="margin:8px 0 0">${esc(pack.desc)}</p></div>`;
  root.querySelector('#pack-back').onclick = renderLearn;
  lessons.forEach((l, i) => {
    const item = el('div', 'lesson-item');
    const isDone = d.includes(l.id);
    item.innerHTML = `<span class="li-num${isDone ? ' done' : ''}">${isDone ? '✓' : i + 1}</span>
      <div class="grow"><b>${esc(l.title)}</b><div class="muted">${l.steps.filter(s => s.expect).length} ходов · ${l.steps.length} шагов</div></div>
      <span>${isDone ? '<span class="done">пройден</span>' : '→'}</span>`;
    item.onclick = () => startLesson(l);
    root.appendChild(item);
  });
}

// ---------- плеер урока ----------
export function startLesson(lesson) {
  window.__cc_show('lesson');
  const chess = new Chess(lesson.fen);
  let idx = 0;
  const root = document.getElementById('lesson-root');
  root.innerHTML = `
    <div class="back-row"><button class="btn sm" id="ls-back">← Назад</button></div>
    <div id="ls-board"></div>
    <div class="progress-dots" id="ls-dots"></div>
    <div class="lesson-text" id="ls-text"></div>
    <div class="btn-row">
      <button class="btn" id="ls-hint">💡 Показать ход</button>
      <button class="btn primary" id="ls-next" style="display:none">Далее →</button>
    </div>`;
  root.querySelector('#ls-back').onclick = () => { window.__cc_show('learn'); renderPack(PACKS.find(p => p.id === lesson.pack)); };
  const orientation = lesson.fen.split(' ')[1] === 'b' ? 'b' : 'w';
  const board = new BoardView(root.querySelector('#ls-board'), {
    orientation,
    turnFn: () => {
      const st = lesson.steps[idx];
      return st?.expect && chess.turn() === orientation ? orientation : 'none';
    },
    legalFn: sq => {
      const st = lesson.steps[idx];
      return st?.expect ? chess.moves({ square: sq, verbose: true }) : [];
    },
    onMove: (from, to, promo) => {
      const st = lesson.steps[idx];
      if (!st?.expect) return false;
      const uci = from + to + (promo || '');
      const ok = uci === st.expect || (st.expect.length === 4 && from + to === st.expect);
      if (!ok) {
        board.shake(); sound.error();
        toast('Не этот ход — попробуйте ещё раз 😉');
        return false;
      }
      const mv = chess.move({ from, to, promotion: promo || 'q' });
      mv.captured ? sound.capture() : sound.move();
      board.setPosition(chess.fen(), { lastMove: { from, to, promotion: promo }, animate: true });
      board.setArrows([]);
      advance();
      return true;
    },
  });

  function applyReply(reply) {
    const mv = chess.move({ from: reply.slice(0, 2), to: reply.slice(2, 4), promotion: reply[4] || 'q' });
    sound.move();
    board.setPosition(chess.fen(), { lastMove: { from: mv.from, to: mv.to }, animate: true });
  }

  function advance() {
    idx++;
    // авто-ходы подряд (reply без expect)
    while (idx < lesson.steps.length && lesson.steps[idx].reply && !lesson.steps[idx].expect) {
      const st = lesson.steps[idx];
      setTimeout(() => applyReply(st.reply), 450);
      idx++;
    }
    render();
    if (idx >= lesson.steps.length) complete();
  }

  function render() {
    const st = lesson.steps[idx];
    if (!st) return;
    if (st.reply && !st.expect) { /* уже применён в advance */ }
    board.setPosition(chess.fen());
    const hist = chess.history({ verbose: true });
    board.rememberHL({ last: hist.length ? [hist[hist.length - 1].from, hist[hist.length - 1].to] : null, check: chess.inCheck() ? kingSquare(chess, chess.turn()) : null, hl: st.hl || [] });
    root.querySelector('#ls-text').innerHTML = esc(st.text);
    const dots = root.querySelector('#ls-dots');
    if (lesson.steps.length > 16) {
      dots.className = 'lesson-progress';
      dots.innerHTML = `<span class="muted">Шаг ${Math.min(idx + 1, lesson.steps.length)} из ${lesson.steps.length}</span>
        <div class="bar sm"><i style="width:${Math.round(idx / lesson.steps.length * 100)}%"></i></div>`;
    } else {
      dots.className = 'progress-dots';
      dots.innerHTML = lesson.steps.map((_, i) => `<i class="${i < idx ? 'done' : i === idx ? 'on' : ''}"></i>`).join('');
    }
    const nextBtn = root.querySelector('#ls-next');
    nextBtn.style.display = st.expect ? 'none' : '';
    nextBtn.onclick = () => { sound.click(); advance(); };
    root.querySelector('#ls-hint').style.display = st.expect ? '' : 'none';
    root.querySelector('#ls-hint').onclick = () => {
      const e = st.expect;
      board.setArrows([{ from: e.slice(0, 2), to: e.slice(2, 4), color: 'rgba(76,175,125,.9)' }]);
    };
  }

  function complete() {
    const d = done();
    if (!d.includes(lesson.id)) { d.push(lesson.id); store.set('lessons_done', d); }
    api.lessonDone(lesson.id).then(r => announceAchievements(r.new_achievements)).catch(() => {});
    sound.end(true);
    const packLessons = LESSONS.filter(l => l.pack === lesson.pack);
    const next = packLessons[packLessons.findIndex(l => l.id === lesson.id) + 1];
    setTimeout(() => {
      const m = modal(`<div class="result-emoji">🎓</div><div class="result-title">Урок пройден!</div>
        <div class="result-sub">${esc(lesson.title)}</div>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${next ? '<button class="btn green block" data-a="next">Следующий урок →</button>' : ''}
          <button class="btn block" data-a="list">К списку уроков</button>
        </div>`);
      m.root.querySelector('[data-a=list]').onclick = () => { m.close(); window.__cc_show('learn'); renderPack(PACKS.find(p => p.id === lesson.pack)); };
      if (next) m.root.querySelector('[data-a=next]').onclick = () => { m.close(); startLesson(next); };
    }, 600);
  }

  // первый шаг может быть авто-ходом
  board.setPosition(chess.fen());
  render();
}
