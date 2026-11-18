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

const WELCOME = `♟ <b>Шахматный Клуб</b> — шахматы прямо в Telegram!

• Игра с ботом: лёгкий, средний и сложный уровни
• Игра с друзьями по ссылке-приглашению
• Разбор партий с оценкой каждого хода
• Интерактивные курсы и задача дня
• Красивые доски и фигуры в магазине

Жми «Открыть» и играй! 🎮`;

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
        reply_markup: playKeyboard(code),
      });
    } else {
      await tgApi('sendMessage', { chat_id: chatId, text: WELCOME, parse_mode: 'HTML', reply_markup: playKeyboard() });
    }
  } else if (text.startsWith('/help')) {
    await tgApi('sendMessage', {
      chat_id: chatId, parse_mode: 'HTML',
      text: `Как играть:\n1. Откройте мини-апп кнопкой в /start\n2. «С ботом» — выберите уровень\n3. «С другом» — создайте комнату и отправьте ссылку другу\n\nПокупки оплачиваются Telegram Stars ⭐. Вопросы по оплате: /paysupport`,
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
      reply_markup: playKeyboard(),
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
