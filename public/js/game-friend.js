// Игра с другом: лобби (создать/войти по коду), WebSocket-партия с часами,
// ничья/сдача/реванш, быстрые фразы. Плюс режим «вдвоём на одном устройстве».
import { Chess } from '../vendor/chess.js';
import { BoardView } from './board.js';
import { renderGameShell, setPlayerBar, setMoveList, capturedFromFen, kingSquare } from './game-ui.js';
import { sound } from './sound.js';
import { store, toast, modal, confirmModal, el, esc, fmtClock, copyText } from './util.js';
import { state as apiState, api, myId, myName } from './api.js';
import { haptic, shareInvite, inviteLink } from './tg.js';
import { maybeShowAd, gameResultModal } from './flow.js';

const REASONS = { checkmate: 'мат', resign: 'сдача', timeout: 'время', agreement: 'соглашение', stalemate: 'пат', material: 'недостаточно материала', repetition: 'повторение', fifty: 'правило 50 ходов', abandon: 'соперник покинул партию' };
const TC_OPTIONS = [['none', 'Без часов'], ['3+2', '3 мин + 2 с'], ['5+0', '5 мин'], ['10+0', '10 мин']];

// ---------- лобби ----------
export function openFriendLobby(prefillCode = '') {
  const root = document.getElementById('room-root');
  root.innerHTML = `
    <div class="back-row"><button class="btn sm" id="lobby-back">← Назад</button><h2>⚔️ Игра с другом</h2></div>
    <div class="card">
      <h3>Создать комнату</h3>
      <p class="muted">Создайте комнату и отправьте другу ссылку-приглашение.</p>
      <div class="choice-row" id="color-choice">
        <button class="choice sel" data-v="random"><span class="c-ico">🎲</span>Случайно</button>
        <button class="choice" data-v="w"><span class="c-ico">♙</span>Белые</button>
        <button class="choice" data-v="b"><span class="c-ico">♟</span>Чёрные</button>
      </div>
      <div class="choice-row" id="tc-choice" style="flex-wrap:wrap">
        ${TC_OPTIONS.map(([v, l], i) => `<button class="choice${i === 0 ? ' sel' : ''}" data-v="${v}" style="min-width:45%">${l}</button>`).join('')}
      </div>
      <button class="btn primary block" id="create-btn">Создать комнату</button>
    </div>
    <div class="card">
      <h3>Присоединиться по коду</h3>
      <input type="text" id="join-code" maxlength="5" placeholder="КОД" value="${esc(prefillCode)}">
      <button class="btn green block" id="join-btn" style="margin-top:10px">Войти в комнату</button>
    </div>`;
  root.querySelector('#lobby-back').onclick = () => window.__cc_nav('home');
  let color = 'random', tc = 'none';
  const bindChoice = (id, cb) => root.querySelectorAll(`#${id} .choice`).forEach(b => b.onclick = () => {
    root.querySelectorAll(`#${id} .choice`).forEach(x => x.classList.remove('sel'));
    b.classList.add('sel'); cb(b.dataset.v); sound.click();
  });
  bindChoice('color-choice', v => color = v);
  bindChoice('tc-choice', v => tc = v);
  root.querySelector('#create-btn').onclick = () => createRoom({ color, tc });
  root.querySelector('#join-btn').onclick = () => {
    const code = root.querySelector('#join-code').value.trim().toUpperCase();
    if (code.length < 4) { toast('Введите код комнаты', 'err'); return; }
    joinRoom(code);
  };
  if (prefillCode) setTimeout(() => joinRoom(prefillCode), 300);
}

// ---------- соединение ----------
class Conn {
  constructor(onMsg, onStatus, initial = null) {
    this.onMsg = onMsg; this.onStatus = onStatus;
    this.closed = false; this.tries = 0; this.joinInfo = null;
    this.initial = initial; // первое сообщение — отправится после открытия сокета
    this.connect();
  }
  connect() {
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    this.ws = new WebSocket(`${proto}://${location.host}/ws`);
    this.ws.onopen = () => {
      this.tries = 0; this.onStatus('online');
      const first = this.joinInfo || this.initial;
      if (first) this.send(first); // реконнект в комнату или создание
    };
    this.ws.onmessage = e => { try { this.onMsg(JSON.parse(e.data)); } catch (err) { console.error('ws handler:', err); } };
    this.ws.onclose = () => {
      if (this.closed) return;
      this.onStatus('reconnecting');
      if (++this.tries <= 6) setTimeout(() => this.connect(), 1500);
      else this.onStatus('offline');
    };
    this.ws.onerror = () => {};
  }
  send(m) { if (this.ws?.readyState === 1) this.ws.send(JSON.stringify(m)); }
  close() { this.closed = true; try { this.send({ t: 'leave' }); this.ws.close(); } catch {} }
}

let activeConn = null;

function createRoom({ color, tc }) {
  const root = document.getElementById('room-root');
  let game = null;
  const conn = new Conn(m => {
    if (m.t === 'created') {
      conn.joinInfo = { t: 'join', code: m.code, userId: myId(), name: myName() };
      showWaiting(m.code);
    } else if (m.t === 'state') {
      if (m.status === 'waiting') return;
      if (!game) { game = new FriendGame(conn, m); activeConn = conn; }
      else game.onState(m);
    } else if (m.t === 'error') {
      toast(m.message, 'err');
      if (m.fatal) { conn.close(); openFriendLobby(); }
      else if (game) conn.send({ t: 'sync' });
    } else if (m.t === 'chat') showChatBubble(m.text);
    else if (m.t === 'opponent_disconnected') game?.onOpponentDisconnect(m.grace);
    else if (m.t === 'opponent_reconnected') game?.onOpponentReconnect();
    else if (m.t === 'clock') game?.onClock(m);
  }, s => game?.onConnStatus(s), { t: 'create', userId: myId(), name: myName(), color, tc });
  activeConn = conn;

  function showWaiting(code) {
    const link = inviteLink(code, apiState.config);
    root.innerHTML = `
      <div class="back-row"><button class="btn sm" id="w-back">← Отмена</button><h2>Комната создана</h2></div>
      <div class="card" style="text-align:center">
        <p class="muted">Код комнаты</p>
        <div class="room-code">${code}</div>
        <div class="waiting-anim"><i></i><i></i><i></i></div>
        <p class="muted">Ждём соперника… Отправьте другу приглашение:</p>
        <div style="display:flex;flex-direction:column;gap:8px;margin-top:12px">
          <button class="btn primary block" id="w-share">📨 Отправить другу в Telegram</button>
          <button class="btn block" id="w-copy">🔗 Скопировать ссылку</button>
        </div>
      </div>`;
    root.querySelector('#w-back').onclick = () => { conn.close(); openFriendLobby(); };
    root.querySelector('#w-share').onclick = () => shareInvite(code, apiState.config);
    root.querySelector('#w-copy').onclick = async () => { await copyText(link); toast('Ссылка скопирована', 'ok'); };
  }
}

function joinRoom(code) {
  let game = null;
  const conn = new Conn(m => {
    if (m.t === 'joined') {
      conn.joinInfo = { t: 'join', code: m.code, userId: myId(), name: myName() };
    } else if (m.t === 'state') {
      if (!game) { game = new FriendGame(conn, m); activeConn = conn; }
      else game.onState(m);
    } else if (m.t === 'error') {
      toast(m.message, 'err');
      if (m.fatal) { conn.close(); openFriendLobby(); }
      else if (game) conn.send({ t: 'sync' });
    } else if (m.t === 'chat') showChatBubble(m.text);
    else if (m.t === 'opponent_disconnected') game?.onOpponentDisconnect(m.grace);
    else if (m.t === 'opponent_reconnected') game?.onOpponentReconnect();
    else if (m.t === 'clock') game?.onClock(m);
  }, s => game?.onConnStatus(s), { t: 'join', code, userId: myId(), name: myName() });
  activeConn = conn;
  conn.joinInfo = { t: 'join', code, userId: myId(), name: myName() };
}

function showChatBubble(text) {
  const b = el('div', 'chat-bubble', esc(text));
  document.body.appendChild(b);
  sound.click();
  setTimeout(() => b.remove(), 2500);
}

// ---------- партия ----------
class FriendGame {
  constructor(conn, st) {
    this.conn = conn;
    this.you = st.you;
    this.mirror = new Chess(st.fen);
    this.legal = st.legal || [];
    this.resultShown = false;
    this.clockVals = st.clocks;
    this.disconnTimer = null;
    this.buildUI();
    this.onState(st, true);
  }

  buildUI() {
    this.ui = renderGameShell(document.getElementById('room-root'), {
      title: '⚔️ Партия с другом',
      onBack: () => this.exit(),
      chat: true,
      onChat: text => this.conn.send({ t: 'chat', text }),
      controls: [
        { id: 'draw', label: '🤝 Ничья', onClick: () => this.offerDraw() },
        { id: 'flip', label: '🔁 Перевернуть', onClick: () => { this.board.flip(); this.refresh(); } },
        { id: 'resign', label: '🏳️ Сдаться', onClick: () => this.resign() },
      ],
    });
    this.board = new BoardView(this.ui.holder, {
      orientation: this.you,
      turnFn: () => this.st?.status === 'active' ? this.you : 'none',
      legalFn: sq => this.legal.filter(m => m.from === sq),
      onMove: (from, to, promo) => this.sendMove(from, to, promo),
    });
  }

  sendMove(from, to, promo) {
    if (this.st?.status !== 'active' || this.mirror.turn() !== this.you) return false;
    let mv; try { mv = this.mirror.move({ from, to, promotion: promo || 'q' }); } catch { return false; }
    this.conn.send({ t: 'move', from, to, promotion: promo });
    mv.captured ? sound.capture() : sound.move();
    haptic('light');
    this.board.setPosition(this.mirror.fen(), { lastMove: { from, to, promotion: promo }, animate: true });
    return true;
  }

  onState(st, initial = false) {
    const prevStatus = this.st?.status;
    this.st = st;
    this.legal = st.legal || [];
    if (st.you !== this.you) { // реванш со сменой цвета
      this.you = st.you;
      this.board.orientation = st.you;
      this.board._buildSquares();
    }
    if (st.status === 'active' && prevStatus === 'over') { this.resultShown = false; this.rematchBtn = null; }
    this.mirror = new Chess(st.fen);
    this.board.setPosition(st.fen, { lastMove: st.lastMove, animate: !initial });
    this.clockVals = st.clocks || this.clockVals;
    this.refresh();
    if (st.status === 'over' && !this.resultShown) this.showResult();
    if (st.status === 'active' && st.check && st.turn === this.you) sound.check();
  }

  refresh() {
    const st = this.st; if (!st) return;
    const enemy = this.you === 'w' ? 'b' : 'w';
    const { capturedBy, diff } = capturedFromFen(st.fen);
    const names = c => st.players?.[c]?.name || (c === this.you ? myName() : 'Соперник');
    const online = c => st.players?.[c]?.online !== false;
    const clocks = this.clockVals;
    const turn = st.turn;
    setPlayerBar(this.ui.barTop, {
      name: names(enemy) + (online(enemy) ? '' : ' ⚠️ офлайн'), avatar: '👤',
      captured: capturedBy[enemy], capturedColor: this.you, matDiff: enemy === 'w' ? diff : -diff,
      clock: st.tc !== 'none' && clocks ? clocks[enemy] : null,
      isTurn: st.status === 'active' && turn === enemy, pieceSet: this.board.set,
    });
    setPlayerBar(this.ui.barBottom, {
      name: names(this.you), avatar: '🙂',
      captured: capturedBy[this.you], capturedColor: enemy, matDiff: this.you === 'w' ? diff : -diff,
      clock: st.tc !== 'none' && clocks ? clocks[this.you] : null,
      isTurn: st.status === 'active' && turn === this.you, pieceSet: this.board.set,
    });
    const checkSq = st.check ? kingSquare(this.mirror, turn) : null;
    this.board.rememberHL({ last: st.lastMove ? [st.lastMove.from, st.lastMove.to] : null, check: checkSq });
    setMoveList(this.ui.movelist, st.moves);
    this.ui.btn_draw.disabled = st.status !== 'active';
    this.ui.btn_resign.disabled = st.status !== 'active';
    // статус-строка
    const s = this.ui.status;
    s.className = 'status-line' + (st.check && st.status === 'active' ? ' check' : '');
    if (st.status === 'waiting') s.textContent = 'Ждём соперника…';
    else if (st.status === 'over') s.textContent = `Партия окончена: ${REASONS[st.reason] || ''}`;
    else if (st.drawOffer && st.drawOffer !== this.you) {
      s.innerHTML = `Соперник предлагает ничью <button class="btn sm green" id="draw-yes">Принять</button> <button class="btn sm" id="draw-no">Отклонить</button>`;
      s.querySelector('#draw-yes').onclick = () => this.conn.send({ t: 'accept_draw' });
      s.querySelector('#draw-no').onclick = () => this.conn.send({ t: 'decline_draw' });
    }
    else if (st.drawOffer === this.you) s.textContent = 'Вы предложили ничью — ждём ответ…';
    else if (st.rematch?.includes(this.you)) s.textContent = 'Реванш: ждём согласия соперника…';
    else if (st.rematch?.length) s.innerHTML = `Соперник хочет реванш! <button class="btn sm green" id="re-yes">Играть</button>`;
    else s.textContent = st.check ? (turn === this.you ? 'Шах! Ваш ход' : 'Шах сопернику!') : turn === this.you ? 'Ваш ход' : 'Ход соперника…';
    const reYes = s.querySelector('#re-yes');
    if (reYes) reYes.onclick = () => this.conn.send({ t: 'rematch' });
  }

  onClock(m) {
    this.clockVals = { w: m.w, b: m.b };
    const enemy = this.you === 'w' ? 'b' : 'w';
    for (const [bar, c] of [[this.ui.barTop, enemy], [this.ui.barBottom, this.you]]) {
      const cEl = bar.querySelector('.clock');
      if (cEl) { cEl.textContent = fmtClock(this.clockVals[c]); cEl.classList.toggle('low', this.clockVals[c] < 30000); }
    }
  }

  onOpponentDisconnect(grace) {
    clearInterval(this.disconnTimer);
    let left = grace;
    const upd = () => {
      this.ui.status.className = 'status-line check';
      const mm = Math.floor(left / 60), ss = String(left % 60).padStart(2, '0');
      this.ui.status.textContent = `Соперник отключился. Ждём переподключения: ${mm}:${ss}…`;
    };
    upd();
    this.disconnTimer = setInterval(() => { if (--left <= 0) clearInterval(this.disconnTimer); else upd(); }, 1000);
  }
  onOpponentReconnect() { clearInterval(this.disconnTimer); toast('Соперник снова в игре', 'ok'); this.refresh(); }
  onConnStatus(s) {
    if (s === 'reconnecting') toast('Связь потеряна, переподключаемся…');
    if (s === 'offline') toast('Нет связи с сервером', 'err');
  }

  async offerDraw() {
    if (this.st?.status !== 'active') return;
    if (await confirmModal('Предложить ничью?', 'Соперник сможет принять или отклонить предложение.', 'Предложить')) {
      this.conn.send({ t: 'offer_draw' });
    }
  }
  async resign() {
    if (this.st?.status !== 'active') return;
    if (await confirmModal('Сдаться?', 'Партия будет засчитана как поражение.', 'Сдаться')) this.conn.send({ t: 'resign' });
  }

  showResult() {
    this.resultShown = true;
    const st = this.st;
    const win = st.result === this.you, draw = st.result === 'draw';
    sound.end(win); haptic(win ? 'success' : draw ? 'warning' : 'error');
    const emoji = win ? '🏆' : draw ? '🤝' : '😔';
    const title = win ? 'Победа!' : draw ? 'Ничья' : 'Поражение';
    const pgnSans = st.moves.join(' ');
    gameResultModal({
      emoji, title, sub: REASONS[st.reason] || '',
      buttons: [
        { label: '🔄 Реванш (смена цвета)', cls: 'green', onClick: () => { this.conn.send({ t: 'rematch' }); toast('Предложение реванша отправлено'); } },
        { label: '📊 Разбор партии', cls: 'primary', onClick: async () => {
          await maybeShowAd();
          const { openAnalysisFlow } = await import('./analysis.js');
          let gameId = null;
          try {
            const { games } = await api.games();
            const g = games.find(x => x.mode === 'friend' && x.pgn.replace(/\s+/g, ' ').trim().includes(pgnSans.slice(0, 60)) && Date.now() - x.ts < 600000);
            gameId = g?.id;
          } catch {}
          openAnalysisFlow({ pgn: pgnSans, gameId, playerColor: this.you, title: 'Разбор партии с другом' });
        } },
        { label: '🏠 На главную', onClick: async () => { await maybeShowAd(); this.conn.close(); window.__cc_nav('home'); } },
      ],
    });
  }

  async exit() {
    if (this.st?.status === 'active') {
      const ok = await confirmModal('Выйти из партии?', 'У вас будет 3 минуты на возвращение, иначе засчитается поражение.', 'Выйти');
      if (!ok) return;
    }
    this.conn.close();
    window.__cc_nav('home');
  }
}

export function leaveActiveRoom() { if (activeConn) { activeConn.close(); activeConn = null; } }

// ---------- вдвоём на одном устройстве ----------
export function startLocalGame() {
  const chess = new Chess();
  let over = false;
  const autoflip = () => store.get('autoflip', true);
  const ui = renderGameShell(document.getElementById('game-root'), {
    title: '📱 Вдвоём рядом',
    onBack: () => window.__cc_nav('home'),
    controls: [
      { id: 'undo', label: '↩️ Отменить', onClick: () => { if (!over && chess.history().length) { chess.undo(); board.setPosition(chess.fen()); if (autoflip()) board.flip(); refresh(); } } },
      { id: 'flip', label: '🔁 Перевернуть', onClick: () => { board.flip(); refresh(); } },
      { id: 'finish', label: '🏁 Завершить', onClick: async () => {
        const m = modal(`<h3>Завершить партию</h3><div style="display:flex;flex-direction:column;gap:8px;margin-top:10px">
          <button class="btn block" data-r="w">Победили белые</button>
          <button class="btn block" data-r="b">Победили чёрные</button>
          <button class="btn block" data-r="draw">Ничья</button></div>`);
        m.root.querySelectorAll('[data-r]').forEach(b => b.onclick = () => { m.close(); finish(b.dataset.r, 'по договорённости'); });
      } },
    ],
  });
  const board = new BoardView(ui.holder, {
    orientation: 'w',
    turnFn: () => over ? 'none' : 'both',
    legalFn: sq => over ? [] : chess.moves({ square: sq, verbose: true }),
    onMove: (from, to, promo) => {
      let mv; try { mv = chess.move({ from, to, promotion: promo || 'q' }); } catch { return false; }
      mv.captured ? sound.capture() : sound.move();
      if (chess.inCheck()) sound.check();
      const hist = chess.history({ verbose: true });
      const last = hist[hist.length - 1];
      board.setPosition(chess.fen(), { lastMove: last, animate: true });
      if (autoflip()) board.flip();
      refresh();
      checkEnd();
      return true;
    },
  });
  function refresh() {
    const { capturedBy, diff } = capturedFromFen(chess.fen());
    const bottomColor = board.orientation, topColor = bottomColor === 'w' ? 'b' : 'w';
    const turn = chess.turn();
    setPlayerBar(ui.barTop, { name: topColor === 'w' ? 'Белые' : 'Чёрные', avatar: topColor === 'w' ? '♙' : '♟', captured: capturedBy[topColor], capturedColor: bottomColor, matDiff: topColor === 'w' ? diff : -diff, isTurn: !over && turn === topColor, pieceSet: board.set });
    setPlayerBar(ui.barBottom, { name: bottomColor === 'w' ? 'Белые' : 'Чёрные', avatar: bottomColor === 'w' ? '♙' : '♟', captured: capturedBy[bottomColor], capturedColor: topColor, matDiff: bottomColor === 'w' ? diff : -diff, isTurn: !over && turn === bottomColor, pieceSet: board.set });
    const hist = chess.history({ verbose: true });
    const last = hist.length ? hist[hist.length - 1] : null;
    board.rememberHL({ last: last ? [last.from, last.to] : null, check: chess.inCheck() ? kingSquare(chess, turn) : null });
    setMoveList(ui.movelist, chess.history());
    ui.status.className = 'status-line' + (chess.inCheck() && !over ? ' check' : '');
    ui.status.textContent = over ? 'Партия окончена' : chess.inCheck() ? `Шах! Ход ${turn === 'w' ? 'белых' : 'чёрных'}` : `Ход ${turn === 'w' ? 'белых' : 'чёрных'}`;
    ui.btn_undo.disabled = over || !chess.history().length;
  }
  function checkEnd() {
    let result = null, reason = '';
    if (chess.isCheckmate()) { result = chess.turn() === 'w' ? 'b' : 'w'; reason = 'мат'; }
    else if (chess.isStalemate()) { result = 'draw'; reason = 'пат'; }
    else if (chess.isInsufficientMaterial()) { result = 'draw'; reason = 'недостаточно материала'; }
    else if (chess.isThreefoldRepetition()) { result = 'draw'; reason = 'повторение'; }
    else if (chess.isDrawByFiftyMoves()) { result = 'draw'; reason = 'правило 50 ходов'; }
    if (result) finish(result, reason);
  }
  async function finish(result, reason) {
    if (over) return;
    over = true; refresh();
    sound.end(true);
    try { await api.saveGame({ mode: 'local', result, player_color: 'w', pgn: chess.pgn() }); } catch {}
    gameResultModal({
      emoji: result === 'draw' ? '🤝' : '🏆',
      title: result === 'draw' ? 'Ничья' : result === 'w' ? 'Победили белые!' : 'Победили чёрные!',
      sub: reason,
      buttons: [
        { label: '🔄 Новая партия', cls: 'green', onClick: () => startLocalGame() },
        { label: '🏠 На главную', onClick: async () => { await maybeShowAd(); window.__cc_nav('home'); } },
      ],
    });
  }
  board.setPosition(chess.fen());
  refresh();
}
