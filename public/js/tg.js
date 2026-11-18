// Мост к Telegram WebApp: initData, хаптики, инвойсы Stars, реклама Adsgram, шаринг.
import { toast, modal, sleep } from './util.js';

const tg = window.Telegram?.WebApp || null;
export const inTelegram = !!(tg && tg.initData);
export const tgUser = tg?.initDataUnsafe?.user || null;
export const initData = tg?.initData || '';
export const startParam = tg?.initDataUnsafe?.start_param || '';

if (tg) {
  try {
    tg.ready(); tg.expand();
    tg.setHeaderColor?.('#0f1420'); tg.setBackgroundColor?.('#0f1420');
    tg.disableVerticalSwipes?.();
  } catch {}
}

export function haptic(kind = 'light') {
  try {
    if (!tg?.HapticFeedback) return;
    if (['success', 'error', 'warning'].includes(kind)) tg.HapticFeedback.notificationOccurred(kind);
    else tg.HapticFeedback.impactOccurred(kind);
  } catch {}
}

// ---------- реклама (Adsgram — официальный партнёр Telegram Mini Apps) ----------
let adsControllers = { interstitial: null, rewarded: null };
let adsgramIds = { interstitial: null, rewarded: null };
let adsLoaded = false;

export function initAds(cfg) {
  adsgramIds = cfg || {};
  if (!inTelegram || (!adsgramIds.interstitial && !adsgramIds.rewarded)) return;
  const s = document.createElement('script');
  s.src = 'https://sad.adsgram.ai/js/ad.js';
  s.onload = () => {
    try {
      if (adsgramIds.interstitial && window.Adsgram) adsControllers.interstitial = window.Adsgram.init({ blockId: adsgramIds.interstitial });
      if (adsgramIds.rewarded && window.Adsgram) adsControllers.rewarded = window.Adsgram.init({ blockId: adsgramIds.rewarded });
      adsLoaded = true;
    } catch (e) { console.warn('Adsgram init', e); }
  };
  document.head.appendChild(s);
}

// Демо-показ «рекламы», когда SDK недоступен (превью вне Telegram)
async function demoAd(kind, seconds = 3) {
  return new Promise(resolve => {
    const m = modal(`<h3>${kind === 'rewarded' ? '🎬 Реклама за награду' : '📺 Реклама'}</h3>
      <div class="ad-demo">Здесь показывается реклама Adsgram.<br>Вне Telegram — демо-заглушка.</div>
      <button class="btn block" disabled id="ad-close">Пропустить через ${seconds}…</button>`, { dismissable: false });
    let left = seconds;
    const btn = m.root.querySelector('#ad-close');
    const iv = setInterval(() => {
      left--;
      if (left <= 0) { clearInterval(iv); btn.disabled = false; btn.textContent = kind === 'rewarded' ? 'Забрать награду 🎁' : 'Закрыть'; }
      else btn.textContent = `Пропустить через ${left}…`;
    }, 1000);
    btn.onclick = () => { m.close(); resolve(true); };
  });
}

export async function showInterstitial() {
  if (adsControllers.interstitial) {
    try { await adsControllers.interstitial.show(); return true; } catch { return false; }
  }
  return demoAd('interstitial', 3);
}

export async function showRewarded() {
  if (adsControllers.rewarded) {
    try { const r = await adsControllers.rewarded.show(); return !!r?.done; } catch { return false; }
  }
  return demoAd('rewarded', 5);
}

// ---------- оплата Stars ----------
// Возвращает 'paid' | 'cancelled' | 'failed' | 'pending'
export function openInvoice(url) {
  return new Promise(resolve => {
    if (!tg?.openInvoice) { resolve('failed'); return; }
    try {
      tg.openInvoice(url, status => resolve(status));
    } catch { resolve('failed'); }
  });
}

// ---------- шаринг ----------
export function inviteLink(code, config) {
  if (config?.botUsername && config?.appShortName)
    return `https://t.me/${config.botUsername}/${config.appShortName}?startapp=join_${code}`;
  return `${location.origin}${location.pathname}#join=${code}`;
}

export function shareInvite(code, config) {
  const link = inviteLink(code, config);
  const text = `⚔️ Сыграем в шахматы? Я жду тебя в комнате ${code} в «Шахматном Клубе»!`;
  const shareUrl = `https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`;
  if (tg?.openTelegramLink) tg.openTelegramLink(shareUrl);
  else window.open(shareUrl, '_blank');
}

export function backButton(show, handler) {
  try {
    if (!tg?.BackButton) return;
    if (show) { tg.BackButton.show(); tg.BackButton.onClick(handler); }
    else { tg.BackButton.hide(); tg.BackButton.offClick(handler); }
  } catch {}
}

export const userName = () => tgUser ? [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ') : null;
