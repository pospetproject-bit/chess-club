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
export function renderLearn() {
  const root = document.getElementById('learn-list');
  root.innerHTML = '';
  for (const pack of PACKS) {
    const lessons = LESSONS.filter(l => l.pack === pack.id);
    const doneCount = lessons.filter(l => done().includes(l.id)).length;
    const unlocked = pack.free || has('lessons:' + pack.id);
    const card = el('div', 'card pack-card');
    card.innerHTML = `
      <div class="p-ico">${pack.ico}</div>
      <div class="grow">
        <h3 style="margin:0">${pack.title} ${unlocked ? '' : '🔒'}</h3>
        <p class="muted">${pack.desc}</p>
        <p class="muted">${unlocked ? `Пройдено ${doneCount}/${lessons.length}` : `Открыть за ${pack.product ? priceOf(pack.product) : ''} ⭐ · входит в Премиум`}</p>
      </div>
      <div>${unlocked ? '→' : '<span class="badge gold">⭐</span>'}</div>`;
    card.onclick = async () => {
      if (!unlocked) {
        const ok = await purchase(pack.product);
        if (ok) renderLearn();
        return;
      }
      renderPack(pack);
    };
    root.appendChild(card);
  }
}

function priceOf(productId) {
  return window.__cc_config?.catalog.find(p => p.id === productId)?.stars ?? '?';
}

function renderPack(pack) {
  const root = document.getElementById('learn-list');
  root.innerHTML = `<div class="back-row"><button class="btn sm" id="pack-back">← Курсы</button><h2>${pack.ico} ${pack.title}</h2></div>`;
  root.querySelector('#pack-back').onclick = renderLearn;
  for (const l of LESSONS.filter(x => x.pack === pack.id)) {
    const item = el('div', 'lesson-item');
    const isDone = done().includes(l.id);
    item.innerHTML = `<span style="font-size:20px">${isDone ? '✅' : '📖'}</span><div class="grow"><b>${esc(l.title)}</b><div class="muted">${l.steps.length} шагов</div></div><span>${isDone ? '<span class="done">пройден</span>' : '→'}</span>`;
    item.onclick = () => startLesson(l);
    root.appendChild(item);
  }
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
    dots.innerHTML = lesson.steps.map((_, i) => `<i class="${i < idx ? 'done' : i === idx ? 'on' : ''}"></i>`).join('');
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
