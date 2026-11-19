// Проверка в реальном браузере: аватары + возврат в партию после «вылета».
const puppeteer = require('puppeteer');
const BASE = 'http://127.0.0.1:3000';
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const b = await puppeteer.launch({ args: ['--no-sandbox', '--disable-dev-shm-usage'], protocolTimeout: 30000 });
  const errs = [];
  const mk = async () => {
    const ctx = await b.createBrowserContext(); // отдельный профиль = отдельный игок
    const p = await ctx.newPage();
    p.on('pageerror', e => errs.push(e.message));
    await p.setViewport({ width: 420, height: 900, deviceScaleFactor: 2 });
    return p;
  };
  const click = (pg, sel) => pg.evaluate(s => { const e = document.querySelector(s); if (!e) throw new Error('нет элемента ' + s); e.click(); }, sel);
  const txt = (pg, sel) => pg.evaluate(s => document.querySelector(s)?.textContent || '', sel);
  const clickSq = (pg, sq) => pg.evaluate(s => {
    const el = document.querySelector(`.screen.active .sq[data-sq="${s}"]`);
    if (!el) throw new Error('нет клетки ' + s);
    const r = el.getBoundingClientRect();
    const o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, pointerId: 1, pointerType: 'mouse', isPrimary: true, button: 0, buttons: 1 };
    el.dispatchEvent(new PointerEvent('pointerdown', o));
    el.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
  }, sq);
  const move = async (pg, from, to) => { await clickSq(pg, from); await sleep(250); await clickSq(pg, to); await sleep(800); };
  const info = pg => pg.evaluate(() => ({
    screen: document.querySelector('.screen.active')?.id,
    status: document.querySelector('.screen.active .status-line')?.textContent || '',
    moves: document.querySelectorAll('.screen.active .movelist .mv').length,
    bars: [...document.querySelectorAll('.screen.active .player-bar .pname')].map(n => n.textContent),
    ava: [...document.querySelectorAll('.screen.active .player-bar .avatar img')].map(i => i.getAttribute('src')?.slice(0, 24)),
  }));

  const A = await mk(), B = await mk();
  await A.goto(BASE, { waitUntil: 'domcontentloaded' });
  await B.goto(BASE, { waitUntil: 'domcontentloaded' });
  await sleep(1500);

  await click(A, '#btn-friend'); await sleep(400);
  await click(A, '#color-choice .choice[data-v="w"]');
  await click(A, '#create-btn'); await sleep(900);
  const code = (await txt(A, '.room-code')).trim();
  console.log('комната:', code);

  await click(B, '#btn-friend'); await sleep(400);
  await B.evaluate(c => { document.querySelector('#join-code').value = c; }, code);
  await click(B, '#join-btn'); await sleep(1500);
  console.log('A:', JSON.stringify(await info(A)));
  console.log('B:', JSON.stringify(await info(B)));

  await move(A, 'e2', 'e4');
  console.log('ходов у B после e4:', (await info(B)).moves);
  await A.screenshot({ path: 'shots/friend-avatars.png' });

  // «ВЫЛЕТ»: B полностью перезагружает мини-апп
  await B.reload({ waitUntil: 'domcontentloaded' });
  await sleep(3000);
  const back = await info(B);
  console.log('B после перезагрузки:', JSON.stringify(back));
  console.log('сессия в localStorage:', await B.evaluate(() => localStorage.getItem('cc_friend_session')));
  await B.screenshot({ path: 'shots/friend-reconnect.png' });

  // B продолжает партию после возврата
  await move(B, 'e7', 'e5');
  console.log('ходов у A после ответа B:', (await info(A)).moves);

  // жёсткий обрыв сокета у A (как при потере сети)
  await A.evaluate(() => {
    const kill = () => { for (const w of window.__wsList || []) try { w.close(); } catch {} };
    if (!window.__wsPatched) {
      window.__wsPatched = true; window.__wsList = [];
      const Orig = window.WebSocket;
      window.WebSocket = function (...a) { const w = new Orig(...a); window.__wsList.push(w); return w; };
      window.WebSocket.prototype = Orig.prototype;
    }
    kill();
  });
  await sleep(5000);
  console.log('A после обрыва связи:', JSON.stringify(await info(A)));
  await move(A, 'g1', 'f3');
  console.log('ходов у B после авто-реконнекта A:', (await info(B)).moves);

  // рейтинг с аватарками
  await click(A, '#tabbar .tab[data-tab="rating"]'); await sleep(1500);
  await A.screenshot({ path: 'shots/rating-avatars.png' });
  console.log('аватары в рейтинге:', JSON.stringify(await A.evaluate(() => {
    const imgs = [...document.querySelectorAll('.lb-ava img')];
    return { rows: document.querySelectorAll('.lb-row').length, imgs: imgs.length, loaded: imgs.filter(i => i.complete && i.naturalWidth > 0).length };
  })));
  console.log('JS errors:', errs);
  await b.close();
})().catch(e => console.log('FAIL:', e.message.slice(0, 200)));
