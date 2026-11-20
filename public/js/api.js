// API-клиент: идентификация (Telegram initData или демо-id), покупки, энтайтлменты.
import { initData, inTelegram, tgUser, tgPhotoUrl, openInvoice, userName, haptic } from './tg.js';
import { store, toast, modal, confirmModal, sleep } from './util.js';
import { goal } from './metrics.js';

let demoId = store.get('demo_id');
if (!demoId) { demoId = Math.random().toString(36).slice(2, 12); store.set('demo_id', demoId); }

export const state = { config: null, me: null };

async function req(path, opts = {}) {
  const headers = { 'Content-Type': 'application/json', ...(opts.headers || {}) };
  if (inTelegram) headers['x-tg-init-data'] = initData;
  else {
    headers['x-demo-id'] = demoId;
    const nm = store.get('demo_name') || 'Гость';
    headers['x-demo-name'] = encodeURIComponent(nm);
  }
  const r = await fetch('/api' + path, { ...opts, headers, body: opts.body ? JSON.stringify(opts.body) : undefined });
  if (!r.ok) {
    let msg = 'Ошибка сети'; try { msg = (await r.json()).error || msg; } catch {}
    throw new Error(msg);
  }
  return r.json();
}

export async function init() {
  state.config = await req('/config');
  await refreshMe();
  // фото профиля из initData — второй источник аватара (Bot API видит не все фото)
  if (inTelegram && state.me?.avatar) {
    req('/me/photo', { method: 'POST', body: { url: tgPhotoUrl || '' } }).catch(() => {});
  }
}

export async function refreshMe() {
  const r = await req('/me');
  state.me = r.user;
  return state.me;
}

export const myName = () => userName() || store.get('demo_name') || 'Гость';
export const myId = () => inTelegram ? String(tgUser.id) : 'demo-' + demoId;

// ключи: 'no_ads' | 'analysis' | 'hints' | 'board:x' | 'pieces:x' | 'lessons:x' | 'puzzles:all'
export function has(key) {
  const me = state.me;
  if (!me) return false;
  if (key === 'analysis') return me.premium || me.analysis_credits === '∞' || me.analysis_credits > 0;
  if (key === 'hints') return me.premium || me.hints === '∞' || me.hints > 0;
  return me.premium || me.owned.includes(key);
}
export const isPremium = () => !!state.me?.premium;
export const noAds = () => has('no_ads');
export const priceOf = id => state.config?.catalog.find(p => p.id === id)?.stars ?? '?';

// Покупка: в Telegram — реальный Stars-инвойс, в демо — тестовое подтверждение.
async function purchaseInner(productId) {
  const p = state.config.catalog.find(x => x.id === productId);
  if (!p) return false;
  if (inTelegram && !state.config.demoMode) {
    try {
      const { url } = await req('/invoice', { method: 'POST', body: { product: productId } });
      const status = await openInvoice(url);
      if (status === 'paid') {
        // бот активирует покупку по successful_payment; подождём немного
        for (let i = 0; i < 6; i++) { await sleep(900); await refreshMe(); if (ownsProduct(p)) break; }
        toast(`✅ «${p.title}» активирован!`, 'ok'); haptic('success');
        return true;
      }
      if (status === 'cancelled') toast('Покупка отменена');
      else if (status === 'pending') toast('Платёж обрабатывается…');
      else toast('Не удалось оплатить', 'err');
      return false;
    } catch (e) { toast('Ошибка: ' + e.message, 'err'); return false; }
  }
  // демо-режим
  const ok = await confirmModal(`${p.title} — ${p.stars} ⭐`,
    `${p.desc}<br><br><b>Демо-режим:</b> вне Telegram покупки симулируются бесплатно, чтобы вы могли всё протестировать. В Telegram здесь откроется оплата Telegram Stars.`,
    `Купить за ${p.stars} ⭐ (демо)`);
  if (!ok) return false;
  try {
    const r = await req('/demo-purchase', { method: 'POST', body: { product: productId } });
    state.me = r.user;
    toast(`✅ «${p.title}» активирован (демо)`, 'ok'); haptic('success');
    return true;
  } catch (e) { toast(e.message, 'err'); return false; }
}

// успешная покупка — одна цель в Метрике для всех товаров (магазин, курсы, задачи, подсказки)
export async function purchase(productId) {
  const ok = await purchaseInner(productId);
  if (ok) {
    const p = state.config?.catalog?.find(x => x.id === productId);
    goal('purchase', { sku: productId, stars: p?.stars || 0 });
  }
  return ok;
}

function ownsProduct(p) {
  const me = state.me;
  if (p.type === 'premium') return me.premium;
  if (p.credit) return true; // кредиты не проверить по owned — считаем успешным после paid
  return (p.grants || []).every(g => me.owned.includes(g));
}

export const api = {
  useHint: () => req('/hints/use', { method: 'POST' }),
  rewardHint: () => req('/hints/reward', { method: 'POST' }),
  saveGame: g => req('/games', { method: 'POST', body: g }),
  games: () => req('/games'),
  unlockAnalysis: gameId => req('/analysis/unlock', { method: 'POST', body: { gameId } }),
  leaderboard: scope => req('/leaderboard?scope=' + (scope || 'all')),
  puzzleSolved: id => req('/puzzles/solved', { method: 'POST', body: { id } }),
  lessonDone: id => req('/lessons/done', { method: 'POST', body: { id } }),
  tournaments: () => req('/tournaments'),
};
