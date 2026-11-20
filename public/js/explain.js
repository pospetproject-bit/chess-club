// Объяснения к разбору партии: почему ход плохой/хороший, почему мат, шах или пат.
// Всё считается локально на chess.js — без сервера и без интернета.
import { Chess } from '../vendor/chess.js';

const NOM = { p: 'пешка', n: 'конь', b: 'слон', r: 'ладья', q: 'ферзь', k: 'король' };
const ACC = { p: 'пешку', n: 'коня', b: 'слона', r: 'ладью', q: 'ферзя', k: 'короля' };
const VAL = { p: 100, n: 300, b: 315, r: 500, q: 900, k: 0 };
const CENTER = new Set(['d4', 'e4', 'd5', 'e5']);
const BIG_CENTER = new Set(['c4', 'd4', 'e4', 'f4', 'c5', 'd5', 'e5', 'f5']);
const MATE = 10000;

const other = c => (c === 'w' ? 'b' : 'w');
const rankOf = sq => Number(sq[1]);
const fileOf = sq => sq.charCodeAt(0) - 97;
const pieceName = (t, sq) => `${NOM[t]} на ${sq}`;
const pAt = (chess, sq) => chess.get(sq) || null;
const money = cp => (Math.abs(cp) / 100).toFixed(1).replace('.', ',');

function kingSquare(chess, color) {
  for (const row of chess.board()) for (const p of row) if (p && p.type === 'k' && p.color === color) return p.square;
  return null;
}

function neighbours(sq) {
  const f = fileOf(sq), r = rankOf(sq), out = [];
  for (let df = -1; df <= 1; df++) for (let dr = -1; dr <= 1; dr++) {
    if (!df && !dr) continue;
    const nf = f + df, nr = r + dr;
    if (nf >= 0 && nf < 8 && nr >= 1 && nr <= 8) out.push('abcdefgh'[nf] + nr);
  }
  return out;
}

// Кто атакует поле (список фигур с полями)
function attackersOf(chess, sq, byColor) {
  return (chess.attackers(sq, byColor) || []).map(a => ({ sq: a, piece: pAt(chess, a) })).filter(x => x.piece);
}

// Висящие фигуры: атакованы и не защищены (или атакованы более дешёвой фигурой)
function hanging(chess, color) {
  const out = [];
  for (const row of chess.board()) for (const p of row) {
    if (!p || p.color !== color || p.type === 'k') continue;
    const at = attackersOf(chess, p.square, other(color));
    if (!at.length) continue;
    const def = attackersOf(chess, p.square, color);
    const cheapest = Math.min(...at.map(a => VAL[a.piece.type]));
    if (!def.length || cheapest < VAL[p.type]) out.push({ sq: p.square, type: p.type, value: VAL[p.type], by: at[0] });
  }
  return out.sort((a, b) => b.value - a.value);
}

// Вилка: фигура с хода атакует две и более ценные цели
function forkTargets(chess, sq, mover) {
  const piece = pAt(chess, sq);
  if (!piece) return [];
  const targets = [];
  for (const row of chess.board()) for (const t of row) {
    if (!t || t.color === mover) continue;
    if (t.type !== 'k' && VAL[t.type] < 300) continue;
    if ((chess.attackers(t.square, mover) || []).includes(sq)) targets.push(t);
  }
  return targets;
}

// Связка: дальнобойная фигура держит вражескую фигуру на линии к королю
function pinFrom(chess, from, mover) {
  const p = pAt(chess, from);
  if (!p || !['b', 'r', 'q'].includes(p.type)) return null;
  const king = kingSquare(chess, other(mover));
  if (!king) return null;
  const df = Math.sign(fileOf(king) - fileOf(from)), dr = Math.sign(rankOf(king) - rankOf(from));
  const diag = Math.abs(fileOf(king) - fileOf(from)) === Math.abs(rankOf(king) - rankOf(from));
  const straight = fileOf(king) === fileOf(from) || rankOf(king) === rankOf(from);
  if (p.type === 'b' && !diag) return null;
  if (p.type === 'r' && !straight) return null;
  if (!diag && !straight) return null;
  let f = fileOf(from) + df, r = rankOf(from) + dr, screen = null;
  while (f >= 0 && f < 8 && r >= 1 && r <= 8) {
    const sq = 'abcdefgh'[f] + r;
    if (sq === king) return screen;
    const occ = pAt(chess, sq);
    if (occ) {
      if (occ.color === mover || screen) return null;
      screen = { sq, type: occ.type };
    }
    f += df; r += dr;
  }
  return null;
}

// Признаки хода: что он делает полезного или опасного
function moveFeatures(fenBefore, move, fenAfter) {
  const before = new Chess(fenBefore), after = new Chess(fenAfter);
  const mover = move.color, enemy = other(mover);
  const f = [];
  if (move.captured) f.push({ kind: 'capture', text: `забирает ${ACC[move.captured]} на ${move.to}${VAL[move.captured] >= 300 ? ` (это ${money(VAL[move.captured])} пешки)` : ''}` });
  if (move.promotion) f.push({ kind: 'promo', text: `пешка превращается в ${ACC[move.promotion]}` });
  if (move.flags?.includes('k') || move.flags?.includes('q')) f.push({ kind: 'castle', text: 'рокировка: король уходит из центра под защиту пешек, ладья вступает в игру' });
  if (after.isCheckmate()) f.push({ kind: 'mate', text: 'ставит мат' });
  else if (after.isCheck()) f.push({ kind: 'check', text: 'даёт шах — соперник обязан защищаться' });
  if (['n', 'b'].includes(move.piece) && rankOf(move.from) === (mover === 'w' ? 1 : 8)) f.push({ kind: 'dev', text: `развивает ${ACC[move.piece]} в игру` });
  if (move.piece === 'p' && CENTER.has(move.to)) f.push({ kind: 'center', text: 'занимает центр — оттуда фигуры контролируют больше полей' });
  else if (BIG_CENTER.has(move.to) && ['n', 'b'].includes(move.piece)) f.push({ kind: 'center', text: 'ставит фигуру ближе к центру' });
  const fork = forkTargets(after, move.to, mover);
  if (fork.length >= 2) f.push({ kind: 'fork', text: `вилка: одновременно атакует ${fork.slice(0, 3).map(t => pieceName(t.type, t.square)).join(' и ')}` });
  const pin = pinFrom(after, move.to, mover);
  if (pin) f.push({ kind: 'pin', text: `связывает ${ACC[pin.type]} на ${pin.sq} — она не может уйти, за ней король` });
  const hang = hanging(after, mover);
  if (hang.length) f.push({ kind: 'hang', text: `${pieceName(hang[0].type, hang[0].sq)} остаётся без защиты и под ударом`, bad: true, hang: hang[0] });
  const wasHanging = hanging(before, mover);
  const saved = wasHanging.filter(w => !hang.some(h => h.sq === w.sq) && !(after.attackers(w.sq, enemy) || []).length);
  if (saved.length) f.push({ kind: 'save', text: `уводит из-под удара ${ACC[saved[0].type]} (${saved[0].sq})` });
  const defendedNow = wasHanging.filter(w => hang.every(h => h.sq !== w.sq) && (after.attackers(w.sq, mover) || []).length);
  if (defendedNow.length) f.push({ kind: 'defend', text: `защищает ${ACC[defendedNow[0].type]} на ${defendedNow[0].sq}` });
  const movedAttacked = (after.attackers(move.to, enemy) || []).length > 0;
  const movedDefended = (after.attackers(move.to, mover) || []).length > 0;
  if (movedAttacked && !movedDefended && move.piece !== 'k') f.push({ kind: 'under', text: `${NOM[move.piece]} на ${move.to} стоит под ударом и никем не защищена`, bad: true });
  if (move.piece === 'k' && !move.flags?.includes('k') && !move.flags?.includes('q')) f.push({ kind: 'king', text: 'король идёт пешком — право на рокировку потеряно', bad: true });
  if (move.piece === 'q' && rankOf(move.from) === (mover === 'w' ? 1 : 8) && !move.captured) f.push({ kind: 'earlyqueen', text: 'ранний вывод ферзя — его будут гонять с темпом', bad: true });
  return f;
}

// Почему именно мат: кто шахует, куда деваться королю
export function explainMate(fenAfter, mover) {
  const c = new Chess(fenAfter);
  const loser = other(mover);
  const king = kingSquare(c, loser);
  if (!king) return { title: 'Мат', lines: [] };
  const checkers = attackersOf(c, king, mover);
  const lines = [];
  const first = checkers[0];
  if (first) lines.push(`Шахует ${pieceName(first.piece.type, first.sq)}${checkers.length > 1 ? ` (двойной шах ещё и от ${pieceName(checkers[1].piece.type, checkers[1].sq)})` : ''}.`);

  const own = [], covered = [], guarded = [];
  for (const sq of neighbours(king)) {
    const occ = pAt(c, sq);
    if (occ && occ.color === loser) own.push(`${sq} — своя ${NOM[occ.type]}`);
    else if (occ && occ.color === mover && (c.attackers(sq, mover) || []).length) guarded.push(`${sq} (${NOM[occ.type]} защищена, не забрать)`);
    else if ((c.attackers(sq, mover) || []).length) covered.push(sq);
  }
  if (own.length) lines.push(`Свои же фигуры отнимают у короля поля: ${own.join(', ')}.`);
  if (covered.length) lines.push(`Свободные поля отхода ${covered.join(', ')} простреливаются.`);
  if (guarded.length) lines.push(`Забрать фигуры соперника рядом нельзя: ${guarded.join(', ')}.`);

  // паттерны
  let pattern = null;
  const backRank = loser === 'w' ? 1 : 8;
  const smothered = first?.piece.type === 'n' && neighbours(king).every(sq => pAt(c, sq)?.color === loser);
  if (smothered) pattern = 'Это «спёртый мат»: конь шахует, а король замурован собственными фигурами — единственный мат, от которого нельзя закрыться.';
  else if (rankOf(king) === backRank && first && ['r', 'q'].includes(first.piece.type) && rankOf(first.sq) === backRank)
    pattern = 'Классический мат по последней горизонтали: король заперт своими пешками. Лечится заранее — сделай «форточку» (h3/h6) или уведи ладью на защиту.';
  else if (first?.piece.type === 'q' && neighbours(king).includes(first.sq))
    pattern = 'Мат ферзём в упор: ферзь стоит рядом с королём и защищён своей фигурой, поэтому забрать его нельзя.';
  else if (checkers.some(x => x.piece.type === 'r') && checkers.some(x => x.piece.type === 'n'))
    pattern = 'Мат ладьёй и конём: конь держит поля отхода, ладья добивает по линии.';
  if (pattern) lines.push(pattern);

  if (first && !(c.attackers(first.sq, loser) || []).length) lines.push(`Забрать ${ACC[first.piece.type]} некому.`);
  if (first && ['b', 'r', 'q'].includes(first.piece.type)) lines.push('Перекрыть линию шаха тоже нечем — мат.');
  return { title: 'Мат', lines };
}

export function explainCheck(fenAfter, mover) {
  const c = new Chess(fenAfter);
  const king = kingSquare(c, other(mover));
  const checkers = king ? attackersOf(c, king, mover) : [];
  const lines = [];
  if (checkers[0]) lines.push(`Шахует ${pieceName(checkers[0].piece.type, checkers[0].sq)}.`);
  const replies = c.moves({ verbose: true });
  const kingMoves = replies.filter(m => m.piece === 'k').map(m => m.to);
  const blocks = replies.filter(m => m.piece !== 'k' && !m.captured).length;
  const captures = replies.filter(m => m.captured).length;
  lines.push(`Защититься можно так: ${kingMoves.length ? `уйти королём на ${[...new Set(kingMoves)].join(', ')}` : 'уйти королём некуда'}${blocks ? `, закрыть шах фигурой (${blocks} способа)` : ''}${captures ? `, забрать атакующую фигуру (${captures} способа)` : ''}.`);
  return { title: 'Шах', lines };
}

export function explainStalemate(fenAfter) {
  const c = new Chess(fenAfter);
  const side = c.turn();
  const king = kingSquare(c, side);
  const lines = ['Пат — это ничья: король НЕ под шахом, но ни одной законной фигуры для хода нет.'];
  if (king) {
    const blocked = neighbours(king).map(sq => {
      const occ = pAt(c, sq);
      if (occ && occ.color === side) return `${sq} занята своей ${NOM[occ.type]}`;
      if ((c.attackers(sq, other(side)) || []).length) return `${sq} под ударом`;
      return null;
    }).filter(Boolean);
    if (blocked.length) lines.push(`Королю некуда идти: ${blocked.join('; ')}.`);
  }
  const others = [];
  for (const row of c.board()) for (const p of row) if (p && p.color === side && p.type !== 'k') others.push(p);
  if (!others.length) lines.push('Других фигур у стороны нет — ходить просто нечем.');
  else lines.push(`Остальные фигуры (${others.map(p => NOM[p.type]).join(', ')}) заблокированы или связаны: любой их ход открыл бы короля.`);
  lines.push('Совет: если выигрываешь — всегда оставляй сопернику хотя бы один ход, иначе победа превращается в ничью.');
  return { title: 'Пат — ничья', lines };
}

export function explainEnd({ fen, reason, result, playerColor }) {
  const c = new Chess(fen);
  const youWin = result === playerColor;
  const draw = result === 'draw';
  const who = draw ? 'Ничья' : youWin ? 'Победа' : 'Поражение';
  if (reason === 'checkmate') {
    const mover = other(c.turn());
    const m = explainMate(fen, mover);
    return { title: `${who}: мат`, lines: m.lines, tone: draw ? 'draw' : youWin ? 'win' : 'loss' };
  }
  if (reason === 'stalemate') return { title: `${who}: пат`, lines: explainStalemate(fen).lines, tone: 'draw' };
  if (reason === 'material') {
    const left = [];
    for (const row of c.board()) for (const p of row) if (p && p.type !== 'k') left.push(`${NOM[p.type]} (${p.color === 'w' ? 'бел' : 'чёрн'})`);
    return { title: `${who}: недостаточно материала`, lines: [
      left.length ? `На доске осталось: ${left.join(', ')}.` : 'Остались только короли.',
      'Таким набором фигур заматовать невозможно по правилам — ничья фиксируется автоматически.',
      'Совет: перед разменом последней пешки проверь, останется ли у тебя матующий материал.',
    ], tone: 'draw' };
  }
  if (reason === 'repetition') return { title: `${who}: троекратное повторение`, lines: ['Одна и та же позиция возникла три раза при том же очередности хода — ничья по правилам.', 'Если позиция выгодна тебе, не повторяй ходы: меняй план. Если хуже — повторение спасает.'], tone: 'draw' };
  if (reason === 'fifty') return { title: `${who}: правило 50 ходов`, lines: ['50 ходов подряд не было ни взятий, ни ходов пешками — ничья.', 'Чтобы реализовать перевес, нужно продвигать пешки или менять фигуры.'], tone: 'draw' };
  if (reason === 'resign') return { title: `${who}: сдача`, lines: [youWin ? 'Соперник сдался — обычно это делают, когда материал потерян безнадёжно или мат неизбежен.' : 'Ты сдался. Иногда это разумно, но проверь: не было ли патовых ресурсов или контригры.'], tone: youWin ? 'win' : 'loss' };
  if (reason === 'timeout') return { title: `${who}: время`, lines: ['У одной из сторон закончилось время на часах — техническое поражение.', 'Совет: в цейтноте делай простые безопасные ходы, а не самый сложный вариант.'], tone: youWin ? 'win' : 'loss' };
  if (reason === 'abandon') return { title: `${who}: соперник вышел`, lines: ['Игрок не вернулся в партию за 3 минуты — засчитано техническое поражение.'], tone: youWin ? 'win' : 'loss' };
  if (reason === 'agreement') return { title: 'Ничья по соглашению', lines: ['Обе стороны согласились на ничью.'], tone: 'draw' };
  return { title: who, lines: [], tone: draw ? 'draw' : youWin ? 'win' : 'loss' };
}

function hasMateIn1(chess, color) {
  if (chess.turn() !== color) return false;
  for (const m of chess.moves({ verbose: true })) {
    chess.move(m);
    const mate = chess.isCheckmate();
    chess.undo();
    if (mate) return true;
  }
  return false;
}

const mateIn = score => Math.max(1, Math.ceil((MATE - Math.abs(score)) / 2));

// Главное: объяснение конкретного хода
export function explainMove({ fenBefore, fenAfter, move, best, scoreBefore, scoreAfter, cls, loss, reply }) {
  const mover = move.color;
  const feats = moveFeatures(fenBefore, move, fenAfter);
  const good = feats.filter(f => !f.bad), bad = feats.filter(f => f.bad);
  const after = new Chess(fenAfter);
  const lines = [];
  let title;

  if (after.isCheckmate()) {
    const m = explainMate(fenAfter, mover);
    return { title: 'Мат!', tone: 'best', lines: m.lines, better: null };
  }
  if (after.isStalemate()) {
    const s = explainStalemate(fenAfter);
    return { title: 'Пат — ничья', tone: 'inaccuracy', lines: s.lines, better: best ? { san: best.san, lines: ['Вместо пата можно было продолжить игру этим ходом.'] } : null };
  }

  const missedMate = scoreBefore > MATE - 200 && scoreAfter < MATE - 200;
  const lostToMate = scoreAfter < -(MATE - 200);

  if (cls === 'blunder' || cls === 'mistake') {
    title = cls === 'blunder' ? '?? Зевок' : '? Ошибка';
    if (missedMate) lines.push(`Ты упустил форсированный мат (был мат в ${mateIn(scoreBefore)}).`);
    if (lostToMate) lines.push(`После этого хода соперник матует в ${mateIn(scoreAfter)} — защита уже не помогает.`);
    for (const b of bad) lines.push(b.text + '.');
    const hang = hanging(after, mover)[0];
    if (hang && !bad.length) lines.push(`${pieceName(hang.type, hang.sq)} осталась без защиты — соперник забирает её.`);
    if (reply) {
      const repAfter = new Chess(fenAfter);
      let repMove = null;
      try { repMove = repAfter.move(reply.san || reply); } catch { repMove = null; }
      if (repMove) {
        if (repAfter.isCheckmate()) lines.push(`Наказание: ${repMove.san} — мат, партия проиграна.`);
        else if (repMove.captured) lines.push(`Соперник отвечает ${repMove.san} и забирает ${ACC[repMove.captured]} на ${repMove.to}.`);
        else if (repAfter.isCheck()) lines.push(`Соперник отвечает ${repMove.san} с шахом и перехватывает инициативу.`);
        else lines.push(`Сильнейший ответ соперника — ${repMove.san}.`);
      }
    }
    if (lostToMate) lines.push('Итог: соперник получает форсированный мат — партия проиграна.');
    else if (!lines.length) lines.push(`Позиция ухудшилась примерно на ${money(loss)} пешки: ход не решает главных задач позиции.`);
    else lines.push(`Итог: потеря около ${money(loss)} пешки по оценке движка.`);
  } else if (cls === 'inaccuracy') {
    title = '?! Неточность';
    if (bad.length) lines.push(bad[0].text + '.');
    lines.push(`Ход играбельный, но точность теряется: около ${money(loss)} пешки. Есть план сильнее.`);
  } else if (cls === 'book') {
    title = '📖 Теория';
    lines.push('Это известный дебютный ход — так играют в этой позиции по теории.');
    if (good.length) lines.push('Идея: ' + good.map(g => g.text).join('; ') + '.');
  } else if (cls === 'best') {
    title = '★ Лучший ход';
    if (scoreAfter > MATE - 200) lines.push(`Ты нашёл форсированный мат в ${mateIn(scoreAfter)} — отлично!`);
    if (good.length) lines.push('Почему силён: ' + good.map(g => g.text).join('; ') + '.');
    else lines.push('Движок считает его сильнейшим: он лучше всего решает задачи позиции.');
    if (bad.length) lines.push('Но будь внимателен: ' + bad[0].text + '.');
  } else {
    title = '✓ Хороший ход';
    if (good.length) lines.push(good.map(g => g.text.charAt(0).toUpperCase() + g.text.slice(1)).join('. ') + '.');
    else lines.push('Крепкий ход: позиция сохраняется, ошибок нет.');
    if (bad.length) lines.push('Нюанс: ' + bad[0].text + '.');
  }

  let better = null;
  if (best && cls !== 'best' && cls !== 'book') {
    const c = new Chess(fenBefore);
    let bm = null;
    try { bm = c.move(best.san || best); } catch { bm = null; }
    if (bm) {
      const bf = moveFeatures(fenBefore, bm, c.fen());
      const bl = bf.filter(x => !x.bad).map(x => x.text);
      const lines2 = [bl.length ? 'Идея: ' + bl.join('; ') + '.' : 'Движок считает этот ход точнее: он решает задачи позиции без ослаблений.'];
      const enemy = other(mover);
      if (hasMateIn1(after, enemy) && !hasMateIn1(c, enemy)) lines2.unshift('Главное: этот ход предотвращает мат в 1 ход.');
      if (scoreBefore > MATE - 200) lines2.unshift(`Этот ход вёл к мату в ${mateIn(scoreBefore)}.`);
      better = { san: bm.san, lines: lines2 };
    }
  }
  const tone = cls === 'best' ? 'best' : cls === 'good' ? 'good' : cls === 'book' ? 'book' : cls;
  return { title, tone, lines, better };
}

// Итоги партии: ключевые моменты и персональные советы
export function summarize(annotated, endInfo, playerColor) {
  const mine = annotated.filter(a => a.mover === playerColor);
  const blunders = mine.filter(a => a.cls === 'blunder');
  const mistakes = mine.filter(a => a.cls === 'mistake');
  const bests = mine.filter(a => a.cls === 'best');
  const missed = annotated.filter(a => a.mover === playerColor && a.scoreBefore > MATE - 200 && a.cls !== 'best');
  const gifts = annotated.filter(a => a.mover !== playerColor && (a.cls === 'blunder' || a.cls === 'mistake'));
  const punished = gifts.filter(g => {
    const next = annotated[g.i + 1];
    return next && next.mover === playerColor && (next.cls === 'best' || next.cls === 'good');
  });

  const moments = [];
  const no = i => (i % 2 === 0 ? `${i / 2 + 1}.` : `${Math.floor(i / 2) + 1}…`);
  for (const a of [...blunders, ...mistakes].slice(0, 6)) {
    moments.push({ i: a.i, tone: a.cls, text: `${no(a.i)} ${a.m.san} — ${a.expl?.lines?.[0] || 'потеря позиции'}` });
  }
  for (const a of missed.slice(0, 2)) moments.push({ i: a.i, tone: 'missed', text: `${no(a.i)} ${a.m.san} — упущен мат, лучше было ${a.best?.san || 'форсировать'}` });
  for (const a of bests.slice(0, 3)) moments.push({ i: a.i, tone: 'best', text: `${no(a.i)} ${a.m.san} — ${a.expl?.lines?.[0] || 'сильнейший ход'}` });
  moments.sort((x, y) => x.i - y.i);

  const tips = [];
  const mateAllowed = mine.filter(a => a.expl?.lines?.some(l => /матует|форсированный мат — партия проиграна/.test(l))).length;
  if (mateAllowed) tips.push('Ты пропустил мат соперника. Перед каждым ходом сначала смотри его шахи и взятия — особенно угрозы по последней горизонтали и на f7/f2.');
  const hungCount = mine.filter(a => a.expl?.lines?.some(l => /без защиты|под ударом/.test(l))).length;
  if (hungCount >= 2) tips.push(`Фигуры подставлялись ${hungCount} раз. Перед каждым ходом спрашивай себя: «что соперник может взять после моего хода?»`);
  if (missed.length) tips.push('Был форсированный мат, но ты его не нашёл. Проверяй сначала шахи, взятия и угрозы — это форсирующие ходы.');
  if (gifts.length && punished.length < gifts.length / 2) tips.push(`Соперник ошибся ${gifts.length} раз, а ты использовал ${punished.length}. После каждого его хода ищи, что он подставил.`);
  const castle = mine.find(a => a.m.flags?.includes('k') || a.m.flags?.includes('q'));
  if (!castle && mine.length >= 10) tips.push('Ты не рокировался. Король в центре — главная причина быстрых поражений; рокируйся в первые 8–10 ходов.');
  const earlyQ = mine.filter(a => a.i < 12 && a.m.piece === 'q' && !a.m.captured).length;
  if (earlyQ >= 2) tips.push('Ферзь вышел слишком рано и его гоняли с темпом. Сначала развивай коней и слонов.');
  const acc = mine.length ? Math.round(mine.reduce((s, a) => s + a.acc, 0) / mine.length) : 100;
  if (acc >= 85 && !blunders.length) tips.push('Отличная точность — зевков нет. Дальше расти в расчёте вариантов на 2–3 хода вперёд.');
  if (!tips.length) tips.push('Партия ровная. Разбери ключевые моменты ниже и попробуй найти план сильнее в каждом из них.');

  return { moments, tips, accuracy: acc };
}
