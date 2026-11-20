// Telegram-бот: long polling, /start (в т.ч. приглашения в партию),
// платежи Stars (pre_checkout + successful_payment), /paysupport, /terms.
import { tgApi, BOT_TOKEN, webappButtonUrl } from './telegram.js';
import { byId } from './catalog.js';
import { grant, getUser } from './db.js';

const SUPPORT = process.env.SUPPORT_USERNAME || 'your_support';
const TERMS_URL = process.env.TERMS_URL || '';

function playKeyboard(startParam = '') {
  const url = webappButtonUrl(startParam);
  const rows = [];
  if (url) rows.push([{ text: '♟ Открыть Шахматный Клуб', web_app: { url } }]);
  rows.push([{ text: 'ℹ️ Помощь', callback_data: 'help' }]);
  return { inline_keyboard: rows };
}

// Богатое меню бота: каждый раздел открывает нужную вкладку мини-аппа.
function menuKeyboard() {
  const b = (text, tab) => ({ text, web_app: { url: webappButtonUrl(tab) } });
  return {
    inline_keyboard: [
      [b('♟ Играть', 'home')],
      [{ text: '🏆 Турнир с друзьями', web_app: { url: webappButtonUrl('tourney') } }],
      [b('📊 Рейтинг', 'rating'), b('🎓 Уроки', 'learn')],
      [b('🧩 Задачи', 'puzzles'), b('⭐ Магазин', 'store')],
      [b('👤 Профиль', 'profile')],
      [{ text: 'ℹ️ Помощь', callback_data: 'help' }],
    ],
  };
}

const WELCOME = `♛ <b>Шахматный Клуб</b>
<i>Элегантные шахматы внутри Telegram</i>

♟ Партии с ботом и с друзьями по ссылке
🏆 Турниры на 4 / 8 / 16 игроков с живой сеткой
📊 Рейтинг Elo и таблица лидеров клуба
🔍 Разбор партий с ботом — бесплатно и словами: где ошибка и почему
🎓 17 курсов и 103 интерактивных урока
🎖 Достижения, премиум-доски и фигуры

Выберите раздел ниже — или откройте клуб и сыграйте первую партию. Ваш рейтинг уже ждёт.`;

const TAB_CMD = { '/play': 'home', '/rating': 'rating', '/learn': 'learn', '/puzzles': 'puzzles', '/store': 'store', '/profile': 'profile' };
const TAB_MSG = {
  home: '♟ <b>Играть</b> — партии с ботом трёх уровней и с друзьями.',
  rating: '🏆 <b>Рейтинг</b> — таблица лидеров клуба и твоё место в ней.',
  learn: '🎓 <b>Обучение</b> — интерактивные курсы: делай ходы прямо на доске.',
  puzzles: '🧩 <b>Задачи</b> — задача дня бесплатно и тактическая библиотека.',
  store: '⭐ <b>Магазин</b> — премиум-доски, фигуры, курсы и подписка.',
  profile: '👤 <b>Профиль</b> — статистика, достижения и история партий.',
};

export const BOT_DESCRIPTION = `♛ Шахматный Клуб — элегантные шахматы внутри Telegram.

♟ Партии с ботом трёх уровней и с друзьями по ссылке
🏆 Рейтинговые партии Elo и таблица лидеров клуба
⏱ Шахматные часы и разбор партий с оценкой каждого хода
🎓 Интерактивные курсы, задача дня и тактические задачи
🎖 Достижения, премиум-доски и фигуры

Откройте приложение и сыграйте первую партию — рейтинг ждёт.`;
export const BOT_SHORT_DESCRIPTION = 'Элегантные шахматы в Telegram: бот, друзья, рейтинг Elo, часы, разбор партий, курсы и задачи.';

async function handleMessage(msg) {
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const name = [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(' ') || 'Игрок';
  getUser(msg.from?.id, name);

  if (text.startsWith('/start')) {
    const param = text.split(' ')[1] || '';
    if (param.startsWith('join_')) {
      const code = param.slice(5);
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: `⚔️ <b>Вас пригласили в партию!</b>\nКомната: <code>${code}</code>\n\nОткройте приложение и присоединяйтесь — соперник уже ждёт.`,
        parse_mode: 'HTML',
        reply_markup: playKeyboard('join_' + code),
      });
    } else if (param.startsWith('tour_')) {
      const id = param.slice(5);
      await tgApi('sendMessage', {
        chat_id: chatId,
        text: `🏆 <b>Вас пригласили на турнир!</b>\nКод: <code>${id}</code>\n\nОткройте приложение — сетка и ваша пара уже ждут.`,
        parse_mode: 'HTML',
        reply_markup: playKeyboard('tour_' + id),
      });
    } else {
      await tgApi('sendMessage', { chat_id: chatId, text: WELCOME, parse_mode: 'HTML', reply_markup: menuKeyboard() });
    }
  } else if (text.startsWith('/tourney') || text.startsWith('/tournament')) {
    await tgApi('sendMessage', {
      chat_id: chatId, parse_mode: 'HTML',
      text: '🏆 <b>Турниры</b> — создайте кубок на 4, 8 или 16 игроков, отправьте друзьям ссылку и следите за сеткой: кто прошёл дальше, кто вылетел и кто чемпион.',
      reply_markup: { inline_keyboard: [[{ text: 'Открыть турниры', web_app: { url: webappButtonUrl('tourney') } }]] },
    });
  } else if (TAB_CMD[text.split(' ')[0]]) {
    const tab = TAB_CMD[text.split(' ')[0]];
    await tgApi('sendMessage', {
      chat_id: chatId, text: TAB_MSG[tab], parse_mode: 'HTML',
      reply_markup: { inline_keyboard: [[{ text: 'Открыть', web_app: { url: webappButtonUrl(tab) } }]] },
    });
  } else if (text.startsWith('/help')) {
    await tgApi('sendMessage', {
      chat_id: chatId, parse_mode: 'HTML',
      text: `Как играть:\n1. Откройте мини-апп кнопкой в /start\n2. «С ботом» — выберите уровень; разбор такой партии бесплатный\n3. «С другом» — создайте комнату и отправьте ссылку другу\n4. «Турнир» — кубок на 4/8/16 игроков с сеткой на выбывание\n5. «Уроки» — 17 курсов: основы бесплатно, остальные по 19 ⭐\n\nПокупки оплачиваются Telegram Stars ⭐. Вопросы по оплате: /paysupport`,
    });
  } else if (text.startsWith('/paysupport')) {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: `Вопросы по покупкам и возвраты: @${SUPPORT}. Укажите дату и название товара — поможем в течение 24 часов.`,
    });
  } else if (text.startsWith('/terms')) {
    await tgApi('sendMessage', {
      chat_id: chatId,
      text: TERMS_URL ? `Условия использования: ${TERMS_URL}` : 'Условия использования уточняйте у оператора бота.',
    });
  }
}

async function handlePreCheckout(q) {
  // payload: "productId:userId"
  const [productId, userId] = String(q.invoice_payload || '').split(':');
  const p = byId[productId];
  const ok = p && q.currency === 'XTR' && q.total_amount === p.stars && String(q.from.id) === String(userId);
  await tgApi('answerPreCheckoutQuery', {
    pre_checkout_query_id: q.id, ok: !!ok,
    error_message: ok ? undefined : 'Ошибка проверки заказа. Попробуйте ещё раз.',
  });
}

async function handlePayment(msg) {
  const pay = msg.successful_payment;
  const [productId, userId] = String(pay.invoice_payload || '').split(':');
  const res = grant(userId, productId, pay.telegram_payment_charge_id);
  const p = byId[productId];
  if (res.ok) {
    await tgApi('sendMessage', {
      chat_id: msg.chat.id, parse_mode: 'HTML',
      text: `✅ <b>${p.title}</b> — оплачено (${pay.total_amount} ⭐).\nПокупка уже активна в приложении. Спасибо, что поддерживаете проект! ♟`,
      reply_markup: menuKeyboard(),
    });
  }
}

export async function startBot() {
  if (!BOT_TOKEN) { console.log('[bot] BOT_TOKEN не задан — бот не запущен (демо-режим приложения).'); return; }
  try {
    const me = await tgApi('getMe');
    console.log(`[bot] запущен как @${me.username}`);
    if (!process.env.BOT_USERNAME) process.env.BOT_USERNAME = me.username;
    await tgApi('setChatMenuButton', { menu_button: { type: 'web_app', text: '♟ Играть', web_app: { url: webappButtonUrl() } } }).catch(() => {});
    await tgApi('setMyCommands', {
      commands: [
        { command: 'start', description: 'Главное меню клуба' },
        { command: 'play', description: 'Играть с ботом или другом' },
        { command: 'tourney', description: 'Турнир с друзьями: сетка на 4/8/16' },
        { command: 'rating', description: 'Рейтинг и таблица лидеров' },
        { command: 'learn', description: 'Интерактивные уроки' },
        { command: 'puzzles', description: 'Задача дня и тактика' },
        { command: 'store', description: 'Магазин: доски, фигуры, премиум' },
        { command: 'profile', description: 'Профиль и достижения' },
        { command: 'help', description: 'Как играть' },
        { command: 'paysupport', description: 'Поддержка по оплатам' },
        { command: 'terms', description: 'Условия использования' },
      ],
    }).catch(() => {});
    await tgApi('setMyDescription', { description: BOT_DESCRIPTION }).catch(() => {});
    await tgApi('setMyShortDescription', { short_description: BOT_SHORT_DESCRIPTION }).catch(() => {});
  } catch (e) { console.error('[bot] не удалось стартовать:', e.message); return; }

  let offset = 0;
  for (;;) {
    try {
      const updates = await tgApi('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query', 'pre_checkout_query'] });
      for (const u of updates) {
        offset = u.update_id + 1;
        try {
          if (u.pre_checkout_query) await handlePreCheckout(u.pre_checkout_query);
          else if (u.message?.successful_payment) await handlePayment(u.message);
          else if (u.message) await handleMessage(u.message);
          else if (u.callback_query?.data === 'help') {
            await tgApi('answerCallbackQuery', { callback_query_id: u.callback_query.id });
            await handleMessage({ chat: { id: u.callback_query.message.chat.id }, from: u.callback_query.from, text: '/help' });
          }
        } catch (e) { console.error('[bot] update error:', e.message); }
      }
    } catch (e) {
      console.error('[bot] polling error:', e.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}
