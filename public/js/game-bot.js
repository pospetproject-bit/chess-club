// Партия с ботом: уровни, подсказки (монетизация), отмена хода, сохранение/возобновление.
import { Chess } from '../vendor/chess.js';
import { BoardView } from './board.js';
import { renderGameShell, setPlayerBar, setMoveList, capturedFromFen, kingSquare } from './game-ui.js';
import { askMove, askHint } from './ai.js';
import { sound } from './sound.js';
import { store, toast, modal, confirmModal, el, esc } from './util.js';
import { state, has, isPremium, api, purchase, myName, refreshMe } from './api.js';
import { haptic, showRewarded } from './tg.js';
import { maybeShowAd, gameResultModal } from './flow.js';

export const BOT_LEVELS = {
  easy: { name: 'Новичок Бобик', avatar: '🐣', sub: 'лёгкий · зевает фигуры' },
  medium: { name: 'Клубный Кеша', avatar: '🦉', sub: 'средний · играет солидно' },
  hard: { name: 'Профессор Грок', avatar: '🦾', sub: 'сложный · считает глубоко' },
};

let current = null;

export function hasSavedBotGame() {
  const s = store.get('bot_game');
  return s && s.moves?.length > 0 && !s.over;
}

export function startBotGame({ level, color, resume = false } = {}) {
  if (current) current.destroy();
  current = new BotGame({ level, color, resume });
  return current;
}

class BotGame {
  constructor({ level, color, resume }) {
    const saved = resume ? store.get('bot_game') : null;
    this.level = saved?.level || level || 'medium';
    this.color = saved?.color || (color === 'random' ? (Math.random() < 0.5 ? 'w' : 'b') : color) || 'w';
    this.chess = new Chess();
    this.over = false; this.thinking = false; this.hintArrow = null;
    this.gameServerId = null;
    if (saved) for (const uci of saved.moves) {
      try { this.chess.move({ from: uci.slice(0, 2), to: uci.slice(2, 4), promotion: uci[4] || 'q' }); } catch {}
    }
    this.buildUI();
    this.update(true);
    if (!this.over && this.chess.turn() !== this.color) this.botTurn();
  }

  buildUI() {
    const bot = BOT_LEVELS[this.level];
    const root = document.getElementById('game-root');
    this.ui = renderGameShell(root, {
      title: `С ботом · ${this.level === 'easy' ? 'лёгкий' : this.level === 'medium' ? 'средний' : 'сложный'}`,
      onBack: () => this.exit(),
      controls: [
        { id: 'hint', label: '💡 Подсказка', onClick: () => this.hint() },
        { id: 'undo', label: '↩️ Отменить', onClick: () => this.undo() },
        { id: 'flip', label: '🔁 Перевернуть', onClick: () => { this.board.flip(); this.update(); } },
        { id: 'resign', label: '🏳️ Сдаться', onClick: () => this.resign() },
      ],
    });
    this.board = new BoardView(this.ui.holder, {
      orientation: this.color,
      turnFn: () => this.over || this.thinking ? 'none' : this.color,
      legalFn: sq => this.over || this.thinking ? [] : this.chess.moves({ square: sq, verbose: true }),
      onMove: (from, to, promo) => this.playerMove(from, to, promo),
    });
    this.updateHintBtn();
  }

  updateHintBtn() {
    const me = state.me;
    const n = me?.premium ? '∞' : me?.hints ?? 0;
    this.ui.btn_hint.innerHTML = `💡 Подсказка <span class="badge gold" style="margin-left:4px">${n}</span>`;
  }

  hl() {
    const hist = this.chess.history({ verbose: true });
    const last = hist.length ? [hist[hist.length - 1].from, hist[hist.length - 1].to] : null;
    const check = this.chess.inCheck() ? kingSquare(this.chess, this.chess.turn()) : null;
    return { last, check };
  }

  update(initial = false) {
    const fen = this.chess.fen();
    const hist = this.chess.history({ verbose: true });
    const last = hist.length ? hist[hist.length - 1] : null;
    this.board.setPosition(fen, { lastMove: last, animate: !initial && !!last });
    this.board.rememberHL(this.hl());
    if (this.hintArrow) this.board.setArrows([this.hintArrow]);
    const { capturedBy, diff } = capturedFromFen(fen);
    const bot = BOT_LEVELS[this.level];
    const myC = this.color, botC = myC === 'w' ? 'b' : 'w';
    const turn = this.chess.turn();
    setPlayerBar(this.ui.barTop, {
      name: bot.name, avatar: bot.avatar, thinking: this.thinking,
      captured: capturedBy[botC], capturedColor: myC, matDiff: botC === 'w' ? diff : -diff,
      isTurn: !this.over && turn === botC, pieceSet: this.board.set,
    });
    setPlayerBar(this.ui.barBottom, {
      name: myName(), avatar: '🙂',
      captured: capturedBy[myC], capturedColor: botC, matDiff: myC === 'w' ? diff : -diff,
      isTurn: !this.over && turn === myC, pieceSet: this.board.set,
    });
    setMoveList(this.ui.movelist, this.chess.history());
    this.ui.status.className = 'status-line' + (this.chess.inCheck() && !this.over ? ' check' : '');
    this.ui.status.textContent = this.over ? 'Партия окончена'
      : this.chess.inCheck() ? (turn === myC ? 'Шах! Защитите короля' : 'Шах боту!')
      : turn === myC ? 'Ваш ход' : 'Бот думает…';
    this.ui.btn_undo.disabled = this.thinking || this.over || this.chess.history().length < (this.color === 'w' ? 1 : 2);
    this.ui.btn_hint.disabled = this.thinking || this.over || turn !== myC;
    this.ui.btn_resign.disabled = this.over;
    this.saveState();
  }

  saveState() {
    const hist = this.chess.history({ verbose: true });
    store.set('bot_game', {
      level: this.level, color: this.color, over: this.over, ts: Date.now(),
      moves: hist.map(m => m.from + m.to + (m.promotion || '')),
    });
  }

  async playerMove(from, to, promo) {
    if (this.over || this.thinking || this.chess.turn() !== this.color) return false;
    let mv; try { mv = this.chess.move({ from, to, promotion: promo || 'q' }); } catch { return false; }
    this.hintArrow = null; this.board.setArrows([]);
    mv.captured ? sound.capture() : sound.move();
    if (this.chess.inCheck()) sound.check();
    haptic('light');
    this.update();
    if (this.checkEnd()) return true;
    this.botTurn();
    return true;
  }

  async botTurn() {
    this.thinking = true; this.update();
    const t0 = Date.now();
    let r = null;
    try { r = await askMove(this.chess.fen(), this.level); } catch (e) { console.error(e); }
    const wait = Math.max(0, 500 - (Date.now() - t0));
    await new Promise(res => setTimeout(res, wait));
    this.thinking = false;
    if (!r?.move) { // фолбэк: первый легальный ход
      const ms = this.chess.moves({ verbose: true });
      if (ms.length) r = { move: ms[0] };
    }
    if (r?.move && !this.over) {
      const mv = this.chess.move({ from: r.move.from, to: r.move.to, promotion: r.move.promotion || 'q' });
      mv.captured ? sound.capture() : sound.move();
      if (this.chess.inCheck()) sound.check();
      this.update();
      this.checkEnd();
    } else this.update();
  }

  checkEnd() {
    const c = this.chess;
    let result = null, reason = '';
    if (c.isCheckmate()) { result = c.turn() === 'w' ? 'b' : 'w'; reason = 'мат'; }
    else if (c.isStalemate()) { result = 'draw'; reason = 'пат'; }
    else if (c.isInsufficientMaterial()) { result = 'draw'; reason = 'недостаточно материала'; }
    else if (c.isThreefoldRepetition()) { result = 'draw'; reason = 'троекратное повторение'; }
    else if (c.isDrawByFiftyMoves()) { result = 'draw'; reason = 'правило 50 ходов'; }
    if (result) { this.finish(result, reason); return true; }
    return false;
  }

  async finish(result, reason) {
    this.over = true; this.update();
    const win = result === this.color, draw = result === 'draw';
    sound.end(win); haptic(win ? 'success' : draw ? 'warning' : 'error');
    try {
      const r = await api.saveGame({ mode: 'bot', difficulty: this.level, result, player_color: this.color, pgn: this.chess.pgn() });
      this.gameServerId = r.game?.id;
    } catch {}
    refreshMe().catch(() => {});
    const emoji = win ? '🏆' : draw ? '🤝' : '😔';
    const title = win ? 'Победа!' : draw ? 'Ничья' : 'Поражение';
    gameResultModal({
      emoji, title, sub: `${BOT_LEVELS[this.level].name} · ${reason}`,
      buttons: [
        { label: '📊 Разбор партии', cls: 'primary', onClick: async () => { await maybeShowAd(); const { openAnalysisFlow } = await import('./analysis.js'); openAnalysisFlow({ pgn: this.chess.pgn(), gameId: this.gameServerId, playerColor: this.color, title: 'Разбор партии с ботом' }); } },
        { label: '🔄 Реванш', cls: 'green', onClick: () => startBotGame({ level: this.level, color: this.color === 'w' ? 'b' : 'w' }) },
        { label: '🏠 На главную', onClick: async () => { await maybeShowAd(); const { nav } = await import('./main.js'); nav('home'); } },
      ],
    });
  }

  async hint() {
    if (this.over || this.thinking) return;
    if (!has('hints')) { this.offerHints(); return; }
    try {
      const r = await api.useHint();
      if (!r.ok) { this.offerHints(); return; }
      state.me = r.user; this.updateHintBtn();
    } catch {}
    const r = await askHint(this.chess.fen());
    if (r?.move) {
      this.hintArrow = { from: r.move.from, to: r.move.to, color: 'rgba(76,175,125,.9)' };
      this.board.setArrows([this.hintArrow]);
      toast('💡 Лучший ход показан стрелкой');
    }
  }

  offerHints() {
    const m = modal(`<h3>💡 Подсказки закончились</h3>
      <p class="muted" style="line-height:1.5">Подсказка показывает лучший ход стрелкой. Получите ещё:</p>
      <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
        <button class="btn green block" data-a="ad">🎬 Посмотреть рекламу → +1 подсказка</button>
        <button class="btn block" data-a="buy">Купить 20 подсказок — 49 ⭐</button>
        <button class="btn primary block" data-a="premium">♛ Премиум — безлимитные подсказки</button>
      </div>`);
    m.root.querySelector('[data-a=ad]').onclick = async () => {
      m.close();
      const done = await showRewarded();
      if (done) {
        try {
          const r = await api.rewardHint();
          if (r.ok) { state.me = r.user; this.updateHintBtn(); toast('🎁 +1 подсказка!', 'ok'); sound.coin(); }
          else toast('Лимит рекламных подсказок на сегодня (5)', 'err');
        } catch (e) { toast(e.message, 'err'); }
      }
    };
    m.root.querySelector('[data-a=buy]').onclick = async () => { m.close(); if (await purchase('hints_20')) { this.updateHintBtn(); } };
    m.root.querySelector('[data-a=premium]').onclick = async () => { m.close(); if (await purchase('premium_30d')) { this.updateHintBtn(); } };
  }

  undo() {
    if (this.thinking || this.over) return;
    const h = this.chess.history();
    if (!h.length) return;
    // откатываем до хода игрока
    this.chess.undo();
    if (this.chess.turn() !== this.color && this.chess.history().length) this.chess.undo();
    this.hintArrow = null; this.board.setArrows([]);
    this.board.setPosition(this.chess.fen());
    this.update(true);
    sound.click();
  }

  async resign() {
    if (this.over) return;
    if (await confirmModal('Сдаться?', 'Партия будет засчитана как поражение.', 'Сдаться')) {
      this.finish(this.color === 'w' ? 'b' : 'w', 'сдача');
    }
  }

  exit() {
    const { nav } = window.__cc_nav ? { nav: window.__cc_nav } : {};
    if (nav) nav('home'); else location.hash = '';
  }

  destroy() { this.over = true; }
}
