// Аватары игроков: фото профиля из Telegram (Bot API getUserProfilePhotos) + кэш в памяти.
// URL подписывается HMAC, чтобы нельзя было перебором выкачать чужие фото по id.
import crypto from 'node:crypto';
import { BOT_TOKEN, tgApi } from './telegram.js';

const KEY = crypto.createHash('sha256').update('cc-avatar:' + (BOT_TOKEN || 'demo')).digest();
const cache = new Map();          // id -> { buf, mime, ts, ok }
const inflight = new Map();       // id -> Promise (не дёргаем Telegram дважды)
const TTL_OK = 24 * 3600 * 1000;  // сутки
const TTL_NO = 3600 * 1000;       // час для «фото нет»

export function avatarSig(id) {
  return crypto.createHmac('sha256', KEY).update(String(id)).digest('hex').slice(0, 16);
}

export function avatarUrl(id) {
  if (!id) return null;
  return `/avatar/${encodeURIComponent(String(id))}?s=${avatarSig(id)}`;
}

export function checkAvatarSig(id, sig) {
  const want = avatarSig(id);
  const got = String(sig || '');
  if (got.length !== want.length) return false;
  try { return crypto.timingSafeEqual(Buffer.from(want), Buffer.from(got)); } catch { return false; }
}

// Запасной вариант — красивый кружок с первой буквой имени (всегда отдаётся, даже без фото).
export function fallbackAvatar(name = '?') {
  const letter = (String(name).trim()[0] || '?').toUpperCase();
  const safe = letter.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const hue = [...String(name)].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 360, 7);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" width="96" height="96">
<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
<stop offset="0" stop-color="hsl(${hue},45%,32%)"/><stop offset="1" stop-color="hsl(${(hue + 40) % 360},50%,18%)"/>
</linearGradient></defs>
<rect width="96" height="96" rx="48" fill="url(#g)"/>
<text x="48" y="62" font-family="Segoe UI,Roboto,Helvetica,Arial,sans-serif" font-size="42" font-weight="600" fill="#e8ecf5" text-anchor="middle">${safe}</text>
</svg>`;
  return { buf: Buffer.from(svg, 'utf8'), mime: 'image/svg+xml', ok: false };
}

// photo_url из Telegram initData (бывает даже когда Bot API фото не отдаёт).
// Разрешаем только CDN Telegram — иначе это была бы дыра SSRF.
export function isSafePhotoUrl(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' && u.hostname === 't.me' && u.pathname.startsWith('/i/userpic/');
  } catch { return false; }
}

async function fetchPhotoUrl(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  if (!buf.length || buf.length > 400000) return null;
  const mime = /\.svg(\?|$)/i.test(url) ? 'image/svg+xml' : /\.png(\?|$)/i.test(url) ? 'image/png' : 'image/jpeg';
  return { buf, mime, ok: true };
}

async function fetchFromTelegram(id) {
  const photos = await tgApi('getUserProfilePhotos', { user_id: Number(id), limit: 1 });
  const sizes = photos?.result?.photos?.[0];
  if (!sizes?.length) return null;
  // берём средний размер (обычно 320×320) — хватает для retina-аватарки 40–72 px
  const pick = sizes.find(s => s.width >= 160 && s.width <= 400) || sizes[sizes.length - 1];
  const file = await tgApi('getFile', { file_id: pick.file_id });
  const filePath = file?.result?.file_path;
  if (!filePath) return null;
  const r = await fetch(`https://api.telegram.org/file/bot${BOT_TOKEN}/${filePath}`, { signal: AbortSignal.timeout(8000) });
  if (!r.ok) return null;
  const buf = Buffer.from(await r.arrayBuffer());
  const mime = /\.png$/i.test(filePath) ? 'image/png' : /\.webp$/i.test(filePath) ? 'image/webp' : 'image/jpeg';
  return { buf, mime, ok: true };
}

export async function getAvatar(id, name = '?', photoUrl = null) {
  const key = String(id);
  const hit = cache.get(key);
  if (hit && Date.now() - hit.ts < (hit.ok ? TTL_OK : TTL_NO)) return hit;
  if (!BOT_TOKEN || !/^\d+$/.test(key)) {
    const fb = { ...fallbackAvatar(name), ts: Date.now() };
    cache.set(key, fb);
    return fb;
  }
  if (inflight.has(key)) return inflight.get(key);
  const job = (async () => {
    let out;
    try {
      if (photoUrl && isSafePhotoUrl(photoUrl)) out = await fetchPhotoUrl(photoUrl);
      if (!out) out = await fetchFromTelegram(key);
    } catch { out = null; }
    const res = { ...(out || fallbackAvatar(name)), ts: Date.now() };
    cache.set(key, res);
    if (cache.size > 500) { // не растим память бесконечно
      const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts).slice(0, 100);
      for (const [k] of oldest) cache.delete(k);
    }
    return res;
  })().finally(() => inflight.delete(key));
  inflight.set(key, job);
  return job;
}

// Сброс кэша, когда пришла новая ссылка на фото.
export function invalidateAvatar(id) { cache.delete(String(id)); }

export const avatarCacheSize = () => cache.size;
