// E2E: реальный headless Chrome кликает по приложению.
// Запуск: node tests/e2e.js  (сервер должен работать на :3000)
import puppeteer from 'puppeteer';
import { PUZZLES } from '../public/js/data-puzzles.js';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:3000';
let pass = 0, fail = 0;
const ok = (c, name) => { if (c) { pass++; console.log('  ✓', name); } else { fail++; console.error('  ✗ FAIL:', name); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ headless: 'shell', args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'] });

async function newPage(errors) {
  const p = await browser.newPage();
  await p.setViewport({ width: 420, height: 860 });
  p.on('pageerror', e => errors.push('pageerror: ' + e.message));
  p.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  return p;
}
const errors = [];
const page = await newPage(errors);
await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 30000 });

const clickSq = async (p, sq) => { await p.click(`.screen.active .sq[data-sq="${sq}"]`); await sleep(120); };
const visible = (p, sel) => p.$eval(sel, n => !!n && n.offsetParent !== null).catch(() => false);
const text = (p, sel) => p.$eval(sel, n => n.textContent).catch(() => '');

console.log('— Главная —');
ok(await visible(page, '#btn-bot'), 'главная отрендерилась, кнопка «С ботом» видна');
ok((await page.$$('#screen-home .mode-card')).length === 5, '5 режимов на главной (включая турнир)');
const homeOrder = await page.$$eval('#screen-home .mode-grid .mode-card', ns => ns.map(n => n.id));
ok(homeOrder.join(',') === 'btn-bot,btn-friend,btn-local,btn-learn-home', 'порядок сетки: бот, друг, вдвоём рядом, обучение');
ok(await page.evaluate(() => {
  const grid = document.querySelector('#screen-home .mode-grid');
  const t = document.getElementById('btn-tourney');
  const tip = document.getElementById('tip-card');
  return !grid.contains(t) && (grid.compareDocumentPosition(t) & Node.DOCUMENT_POSITION_FOLLOWING) &&
    (t.compareDocumentPosition(tip) & Node.DOCUMENT_POSITION_FOLLOWING);
}), '«Турнир» — под сеткой режимов и над советом дня');
const gapHome = await page.evaluate(() => {
  const t = document.getElementById('btn-tourney').getBoundingClientRect();
  const tip = document.getElementById('tip-card').getBoundingClientRect();
  return Math.round(tip.top - t.bottom);
});
ok(gapHome >= 12, `«Совет дня» не наползает на «Турнир» (зазор ${gapHome}px)`);
ok(await visible(page, '#daily-card .daily-card'), 'карточка задачи дня');

console.log('— Партия с ботом —');
await page.click('#btn-bot');
await sleep(300);
ok(await visible(page, '.modal #start-bot'), 'модалка настройки партии');
await page.click('#lvl-choice .choice[data-v="easy"]');
await page.click('#start-bot');
await sleep(500);
ok((await page.$$('#screen-game .piece')).length === 32, '32 фигуры на доске');
await clickSq(page, 'e2');
ok((await page.$$('#screen-game .dot')).length === 2, 'подсветка легальных ходов e3/e4');
await clickSq(page, 'e4');
await page.waitForFunction(() => document.querySelectorAll('#screen-game .movelist .mv').length >= 2, { timeout: 15000 });
ok(true, 'бот ответил на 1.e4');
const sanList = await text(page, '#screen-game .movelist');
ok(sanList.includes('e4'), 'список ходов содержит e4');
// отмена хода
await page.click('[data-id="undo"]');
await sleep(300);
ok((await page.$$('#screen-game .movelist .mv')).length === 0, 'отмена хода откатила оба полухода');
// ещё ход и сдача
await clickSq(page, 'd2'); await clickSq(page, 'd4');
await page.waitForFunction(() => document.querySelectorAll('#screen-game .movelist .mv').length >= 2, { timeout: 15000 });
await page.click('[data-id="resign"]');
await sleep(250);
await page.click('.modal [data-a="yes"]');
await sleep(600);
ok(await visible(page, '.result-title'), 'модалка результата после сдачи');
ok((await text(page, '.result-title')).includes('Поражение'), 'результат — поражение');
await page.click('#result-buttons .btn:last-child'); // на главную
await sleep(500);

console.log('— Магазин и покупка (демо) —');
await page.click('#tabbar [data-tab="store"]');
await sleep(400);
ok(await visible(page, '#buy-premium'), 'премиум-баннер в магазине');
ok((await page.$$('#screen-store .store-card')).length >= 10, 'карточки досок и фигур отрендерены');
await page.click('#buy-premium');
await sleep(300);
await page.click('.modal [data-a="yes"]');
await sleep(700);
ok((await text(page, '#screen-store')).includes('Премиум активен'), 'премиум куплен и активен');
// применить премиум-доску
const boardBtns = await page.$$('#screen-store .store-card .btn');
let applied = false;
for (const b of boardBtns) {
  const t = await b.evaluate(n => n.textContent);
  if (t.includes('Применить')) { await b.click(); applied = true; break; }
}
await sleep(300);
ok(applied, 'доска применена из магазина');

console.log('— Уроки —');
await page.click('#tabbar [data-tab="learn"]');
await sleep(300);
await page.click('#learn-list .pack-card'); // Основы
await sleep(300);
await page.click('#learn-list .lesson-item'); // первый урок
await sleep(400);
ok(await visible(page, '#ls-text'), 'плеер урока открыт');
await page.click('#ls-next'); // первый шаг — текст, читаем и дальше
await sleep(250);
await clickSq(page, 'd4'); await clickSq(page, 'e4'); // ожидаемый ход урока b1
await sleep(1200);
const lessonText = await text(page, '#ls-text');
ok(lessonText.includes('Шах') || lessonText.includes('Отлично'), 'урок продвинулся после верного хода');

console.log('— Задача дня —');
await page.click('#ls-back'); // из урока обратно к курсам (таббар скрыт на экране урока)
await sleep(300);
await page.click('#tabbar [data-tab="puzzles"]');
await sleep(300);
const daily = PUZZLES[Math.floor(Date.now() / 86400000) % PUZZLES.length];
await page.click('#puzzle-daily .daily-card');
await sleep(400);
ok(await visible(page, '#pz-board .board'), 'доска задачи открыта');
for (let i = 0; i < daily.solution.length; i += 2) {
  const u = daily.solution[i];
  await clickSq(page, u.slice(0, 2)); await clickSq(page, u.slice(2, 4));
  await sleep(800);
}
await sleep(900);
ok((await text(page, '.result-title')).includes('решена'), 'задача дня решена, модалка успеха');
await page.click('.modal [data-a="list"]').catch(() => {});
await sleep(300);

console.log('— Игра с другом (две вкладки) —');
await page.click('#tabbar [data-tab="home"]');
await sleep(300);
await page.click('#btn-friend');
await sleep(300);
await page.click('#create-btn');
await page.waitForSelector('.room-code', { timeout: 8000 });
const code = (await text(page, '.room-code')).trim();
ok(code.length === 5, 'комната создана, код ' + code);
const ctx2 = await browser.createBrowserContext(); // отдельный профиль = другой игрок
const page2 = await ctx2.newPage();
await page2.setViewport({ width: 420, height: 860 });
page2.on('pageerror', e => errors.push('pageerror2: ' + e.message));
page2.on('console', m => { if (m.type() === 'error') errors.push('console2: ' + m.text()); });
await page2.goto(BASE + '/#join=' + code, { waitUntil: 'networkidle0' });
await sleep(1200);
ok(await visible(page2, '#screen-room .board'), 'второй игрок автоматически вошёл по deep-link');
await page.waitForFunction(() => document.querySelectorAll('#screen-room .piece').length === 32, { timeout: 8000 });
// ход белых (создатель — случайный цвет; найдём, у кого ход)
const mover = await page.$eval('#screen-room .status-line', n => n.textContent.includes('Ваш ход')) ? page : page2;
const other = mover === page ? page2 : page;
await clickSq(mover, 'e2'); await clickSq(mover, 'e4');
await sleep(800);
const otherMoves = await text(other, '#screen-room .movelist');
ok(otherMoves.includes('e4'), 'ход синхронизирован второму игроку');
const myStatus = await text(other, '#screen-room .status-line');
ok(myStatus.includes('Ваш ход'), 'у второго игрока теперь его ход');
// ничья по соглашению
await mover.click('[data-id="draw"]');
await sleep(250);
await mover.click('.modal [data-a="yes"]');
await sleep(500);
await other.click('#draw-yes');
await sleep(800);
ok((await text(mover, '.result-title')).includes('Ничья'), 'ничья по соглашению зафиксирована');
await page2.close();

console.log('— Разбор партии (премиум) —');
await page.click('#result-buttons .btn:last-child'); // домой
// может появиться демо-реклама после 2-й завершённой партии
await sleep(600);
const adBtn = await page.$('#ad-close');
if (adBtn) {
  await page.waitForFunction(() => !document.querySelector('#ad-close')?.disabled, { timeout: 8000 });
  await page.click('#ad-close');
  ok(true, 'демо-реклама показана и закрыта');
}
await sleep(500);
await page.click('#tabbar [data-tab="profile"]');
await sleep(800);
ok((await page.$$('#history .history-item')).length >= 2, 'история партий в профиле');
await page.click('#history .history-item [data-an]');
await page.waitForFunction(() => document.querySelector('.acc-cards') !== null, { timeout: 120000 });
ok(true, 'разбор посчитан: карточки точности появились');
const accText = await text(page, '.acc-cards');
ok(/%/.test(accText), 'точность сторон показана');
ok((await page.$$('#an-moves .mv-row')).length >= 1, 'размеченный список ходов');
await page.click('#nav-first');
await sleep(300);
ok(await visible(page, '#an-board .board'), 'доска разбора с навигацией');
const gapAn = await page.evaluate(() => {
  const nav = document.querySelector('.an-nav').getBoundingClientRect();
  const ex = document.getElementById('an-explain').getBoundingClientRect();
  return Math.round(ex.top - nav.bottom);
});
ok(gapAn >= 12, `карточка разбора хода не наползает на плеер (зазор ${gapAn}px)`);
ok(await page.$eval('#an-moves', n => getComputedStyle(n).overflowY === 'auto'), 'список ходов прокручивается внутри себя, а не растягивает страницу');
const scrollBefore = await page.evaluate(() => {
  const nav = document.querySelector('.an-nav');
  window.scrollTo(0, Math.max(0, Math.round(nav.getBoundingClientRect().top + window.scrollY - 480)));
  return window.scrollY;
});
await sleep(200);
for (const sel of ['#nav-last', '#nav-first', '#nav-next', '#nav-prev']) {
  await page.evaluate(s => document.querySelector(s).click(), sel);
  await sleep(250);
}
const scrollAfter = await page.evaluate(() => window.scrollY);
ok(Math.abs(scrollAfter - scrollBefore) <= 1, `плеер не сдвигает страницу (${scrollBefore} → ${scrollAfter})`);

console.log('— Обучение: каталог курсов —');
await page.evaluate(() => document.querySelector('#tabbar [data-tab="learn"]').click());
await sleep(700);
ok((await page.$$('#learn-list .pack-card')).length === 17, '17 курсов в каталоге');
ok((await page.$$('#learn-list .chip')).length === 6, 'фильтры разделов на месте');
const bundleTxt = await text(page, '#learn-list .bundle-card');
ok(bundleTxt ? (/149/.test(bundleTxt) && /103/.test(bundleTxt)) : true,
  bundleTxt ? 'пакет всех курсов: 149⭐ за 103 урока' : 'премиум — пакет курсов не предлагается');
await page.evaluate(() => [...document.querySelectorAll('#learn-list .chip')].find(c => c.textContent === 'Эндшпиль').click());
await sleep(400);
ok((await page.$$('#learn-list .pack-card')).length === 3, 'фильтр «Эндшпиль» показывает 3 курса');
await page.evaluate(() => [...document.querySelectorAll('#learn-list .chip')].find(c => c.textContent === 'Все').click());
await sleep(400);
await page.evaluate(() => [...document.querySelectorAll('#learn-list .pack-card')].find(n => n.textContent.includes('Матовые')).click());
await sleep(500);
await page.evaluate(() => document.querySelector('.modal [data-a=yes]')?.click());
await sleep(1200);
ok((await page.$$('#learn-list .lesson-item')).length === 8, 'покупка курса открывает 8 уроков');
await page.evaluate(() => document.querySelector('#learn-list .lesson-item').click());
await sleep(900);
ok(await visible(page, '#ls-board .board'), 'урок открылся с доской');
ok((await text(page, '#ls-text')).length > 20, 'текст урока показан');

console.log('— Турниры —');
await page.evaluate(() => window.__cc_nav('home'));
await sleep(500);
ok(await visible(page, '#btn-tourney'), 'кнопка «Турнир» на главной');
await page.evaluate(() => document.querySelector('#btn-tourney').click());
await sleep(700);
ok(await visible(page, '#tr-create'), 'лобби турниров открылось');
await page.evaluate(() => {
  document.querySelector('#tr-name').value = 'E2E Кубок';
  document.querySelector('#tr-size .choice[data-v="8"]').click();
  document.querySelector('#tr-tc .choice[data-v="none"]').click();
});
await page.evaluate(() => document.querySelector('#tr-create').click());
await sleep(1500);
const tcode = await text(page, '.tour-code.big');
ok(/^T[A-Z0-9]{4}$/.test(tcode), 'турнир создан, код показан: ' + tcode);
ok((await page.$$('.tp-row')).length === 8, 'список участников на 8 мест');
ok(await visible(page, '#t-share'), 'кнопка приглашения друзей');
// второй игрок заходит по коду в отдельном контексте
const tctx = await browser.createBrowserContext();
const tp2 = await tctx.newPage();
await tp2.setViewport({ width: 420, height: 900 });
tp2.on('pageerror', e => errors.push('tp2: ' + e.message));
await tp2.goto(BASE, { waitUntil: 'networkidle2' });
await tp2.evaluate(() => { localStorage.setItem('cc_demo_id', JSON.stringify('e2e-tour-2')); localStorage.setItem('cc_demo_name', JSON.stringify('Соперник')); });
await tp2.reload({ waitUntil: 'networkidle2' });
await sleep(900);
await tp2.evaluate(async c => { const { openTournament } = await import('/js/tourney.js'); openTournament(c, true); }, tcode);
await sleep(1500);
ok(/2\/8/.test(await text(tp2, '.tour-head .th-row')), 'второй игрок видит турнир и счёт 2/8');
await page.evaluate(() => document.querySelector('#t-start')?.click());
await sleep(1500);
ok((await page.$$('.br-col')).length === 3, 'сетка на 8: три раунда');
ok((await page.$$('.br-match')).length === 7, 'в сетке 7 матчей (4+2+1)');
ok((await page.$$('.br-slot.win')).length >= 1, 'проходы (bye) отмечены как победы');
await sleep(300);
ok(await visible(page, '#t-play') || await visible(tp2, '#t-play'), 'кнопка «Играть» у готовой пары');
await tctx.close();

console.log('— Ошибки консоли —');
const realErrors = errors.filter(e => !e.includes('favicon') && !e.includes('telegram.org') && !e.includes('net::ERR'));
ok(realErrors.length === 0, 'нет JS-ошибок на страницах' + (realErrors.length ? ': ' + realErrors.slice(0, 5).join(' | ') : ''));

await browser.close();
console.log(`\nE2E итог: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
