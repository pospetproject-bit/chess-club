// Интеграция с Telegram Bot API: проверка initData, вызовы API, инвойсы Stars.
import crypto from 'node:crypto';

export const BOT_TOKEN = process.env.BOT_TOKEN || '';
export const DEMO_MODE = process.env.DEMO_MODE ? process.env.DEMO_MODE === '1' : !BOT_TOKEN;

export async function tgApi(method, payload = {}) {
  const r = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const j = await r.json();
  if (!j.ok) throw new Error(`Telegram ${method}: ${j.description}`);
  return j.result;
}

// Валидация initData по алгоритму Telegram (HMAC-SHA256).
// https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app
export function verifyInitData(initData) {
  if (!initData || !BOT_TOKEN) return null;
  try {
    const params = new URLSearchParams(initData);
    const hash = params.get('hash');
    if (!hash) return null;
    params.delete('hash');
    const dataCheck = [...params.entries()]
      .map(([k, v]) => `${k}=${v}`).sort().join('\n');
    const secret = crypto.createHmac('sha256', 'WebAppData').update(BOT_TOKEN).digest();
    const calc = crypto.createHmac('sha256', secret).update(dataCheck).digest('hex');
    if (calc !== hash) return null;
    const authDate = Number(params.get('auth_date') || 0) * 1000;
    if (Date.now() - authDate > 86400_000) return null; // сутки
    return JSON.parse(params.get('user') || 'null');
  } catch { return null; }
}

// Инвойс в Telegram Stars (XTR). provider_token для XTR — пустая строка.
export async function createStarsInvoice({ title, description, payload, stars }) {
  return tgApi('createInvoiceLink', {
    title, description, payload,
    provider_token: '', currency: 'XTR',
    prices: [{ label: title, amount: stars }],
  });
}

export const APP_TABS = ['home', 'learn', 'puzzles', 'rating', 'store', 'profile'];

export function webappButtonUrl(startParam = '') {
  // Прямой HTTPS-адрес мини-аппа (продакшен) или t.me deep link.
  // startParam: 'join_CODE' — приглашение в партию; имя вкладки — открыть нужный экран.
  const direct = process.env.WEBAPP_URL;
  const bot = process.env.BOT_USERNAME;
  const short = process.env.APP_SHORT_NAME;
  let hash = '', sa = '';
  if (startParam.startsWith('join_')) { hash = '#join=' + startParam.slice(5); sa = startParam; }
  else if (APP_TABS.includes(startParam)) { hash = '#tab=' + startParam; sa = startParam; }
  if (direct) return direct + hash;
  if (bot && short) return `https://t.me/${bot}/${short}${sa ? `?startapp=${sa}` : ''}`;
  return null;
}
