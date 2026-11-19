// Мост к Telegram WebApp: initData, хаптики, инвойсы Stars, реклама Adsgram, шаринг.
import { toast, modal, sleep } from './util.js';
import { adOutcome } from './ads-result.js';

const tg = window.Telegram?.WebApp || null;
export const inTelegram = !!(tg && tg.initData);
export const tgUser = tg?.initDataUnsafe?.user || null;
export const initData = tg?.initData || '';
export const startParam = tg?.initDataUnsafe?.start_param || '';
export const tgPhotoUrl = tg?.initDataUnsafe?.user?.photo_url || null;

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
const ADS_SDK_URL = 'https://sad.adsgram.ai/js/sad.min.js';
let adsControllers = { interstitial: null, rewarded: null };
let adsgramIds = { interstitial: null, rewarded: null };
let adsReady = null;
let sdkState = 'idle';        // idle | loading | ready | failed
let sdkAttempts = 0;
let sdkLoadMs = 0;
let lastAdError = null;
let lastAdResult = null;
let adBusy = false;
let lastRewardAt = 0;

function logAd(msg, data) {
  try { console.log('[ads]', msg, data || ''); } catch {}
}

// Загрузка SDK с повторной попыткой (мобильная сеть часто рвёт первый запрос).
function loadAdsSdk() {
  sdkAttempts++;
  sdkState = 'loading';
  const t0 = Date.now();
  logAd('SDK load attempt ' + sdkAttempts);
  return new Promise(resolve => {
    let settled = false;
    const done = () => { if (!settled) { settled = true; resolve(); } };
    const s = document.createElement('script');
    s.async = true;
    s.src = ADS_SDK_URL + (sdkAttempts > 1 ? `?r=${Date.now()}` : '');
    s.onload = () => {
      sdkLoadMs = Date.now() - t0;
      try {
        if (adsgramIds.interstitial && window.Adsgram) adsControllers.interstitial = window.Adsgram.init({ blockId: adsgramIds.interstitial });
        if (adsgramIds.rewarded && window.Adsgram) adsControllers.rewarded = window.Adsgram.init({ blockId: adsgramIds.rewarded });
      } catch (e) { lastAdError = 'init: ' + (e?.message || e); logAd('init error', lastAdError); }
      sdkState = window.Adsgram ? 'ready' : 'failed';
      logAd('SDK ' + sdkState + ' за ' + sdkLoadMs + ' мс');
      done();
    };
    s.onerror = () => {
      sdkState = 'failed';
      lastAdError = 'SDK не загрузился (сеть / VPN / блокировщик рекламы?)';
      logAd('SDK load error');
      done();
    };
    document.head.appendChild(s);
    setTimeout(() => { if (!settled) { sdkState = 'failed'; lastAdError = 'SDK: таймаут загрузки'; logAd('SDK timeout'); done(); } }, 20000);
  });
}

export function initAds(cfg) {
  adsgramIds = cfg || {};
  if (!inTelegram || (!adsgramIds.interstitial && !adsgramIds.rewarded)) return;
  adsReady = loadAdsSdk();
}

// Ждём готовности SDK до 15 с и, если не вышло, пробуем ещё раз.
async function ensureAds() {
  if (!inTelegram) return false;
  if (sdkState === 'ready') return true;
  if (sdkState !== 'loading') adsReady = loadAdsSdk();
  const hint = setTimeout(() => toast('Загружаю рекламу…', '', 2500), 800);
  await Promise.race([adsReady, sleep(15000)]);
  if (sdkState !== 'ready') { adsReady = loadAdsSdk(); await Promise.race([adsReady, sleep(15000)]); }
  clearTimeout(hint);
  return sdkState === 'ready';
}

// Демо-показ «рекламы» только ВНЕ Telegram (превью/тесты).
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
  if (!inTelegram) return demoAd('interstitial', 3);
  if (adBusy || !adsgramIds.interstitial) return false;
  adBusy = true;
  try {
    if (!(await ensureAds()) || !adsControllers.interstitial) { logAd('interstitial: SDK не готов'); return false; }
    let r;
    try { r = await adsControllers.interstitial.show(); } catch (e) { r = e; }
    const o = adOutcome(r);
    lastAdResult = o.raw;
    logAd('interstitial', lastAdResult);
    if (!o.ok) lastAdError = 'interstitial: ' + (lastAdResult?.description || '');
    return o.ok;
  } finally { adBusy = false; }
}

export async function showRewarded() {
  if (!inTelegram) return demoAd('rewarded', 5);
  if (adBusy) { toast('Реклама уже запускается…'); return false; }
  if (Date.now() - lastRewardAt < 8000) { toast('Подожди несколько секунд перед новой рекламой'); return false; }
  if (!adsgramIds.rewarded) { toast('Реклама за награду не настроена', 'err'); return false; }
  adBusy = true;
  try {
    if (!(await ensureAds()) || !adsControllers.rewarded) {
      lastAdError = 'rewarded: SDK не готов (' + sdkState + ')';
      toast('Не удалось загрузить рекламу. Проверь интернет/VPN и попробуй ещё раз', 'err', 4500);
      return false;
    }
    let r;
    try { r = await adsControllers.rewarded.show(); } catch (e) { r = e; }
    const o = adOutcome(r);
    lastAdResult = o.raw;
    logAd('rewarded', lastAdResult);
    if (o.ok) { lastRewardAt = Date.now(); lastAdError = null; haptic('success'); return true; }
    lastAdError = 'rewarded: ' + (lastAdResult?.description || '');
    if (!o.silent) toast(o.msg, o.err ? 'err' : '', 4500);
    return false;
  } finally { adBusy = false; }
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
