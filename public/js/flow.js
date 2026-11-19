// Общие флоу: реклама между партиями, модалка результата (рейтинг + ачивки).
import { store, modal, el, esc } from './util.js';
import { noAds } from './api.js';
import { showInterstitial } from './tg.js';
import { badgeSVG } from './achievements.js';

// Межстраничная реклама после каждой 2-й завершённой партии (если не куплено «Без рекламы»)
export async function maybeShowAd() {
  if (noAds()) return;
  const n = (store.get('games_since_ad', 0) || 0) + 1;
  if (n >= 2) {
    store.set('games_since_ad', 0);
    try { await showInterstitial(); } catch {}
  } else store.set('games_since_ad', n);
}

export function gameResultModal({ emoji, title, sub, buttons = [], ratingDelta = null, achievements = [] }) {
  let extra = '';
  if (ratingDelta !== null && ratingDelta !== undefined) {
    const cls = ratingDelta > 0 ? 'pos' : ratingDelta < 0 ? 'neg' : 'zero';
    const sign = ratingDelta > 0 ? '+' : '';
    extra += `<div class="rating-delta ${cls}"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 17l6-6 4 4 8-8"/><path d="M15 7h6v6"/></svg>${sign}${ratingDelta} рейтинга</div>`;
  }
  if (achievements?.length) {
    extra += `<div class="result-ach">${achievements.map(a => `<div class="ra-item">${badgeSVG(a, { size: 54 })}<span>${esc(a.title)}</span></div>`).join('')}</div>`;
  }
  const m = modal(`
    <div class="result-emoji">${emoji}</div>
    <div class="result-title">${title}</div>
    <div class="result-sub">${sub}</div>
    ${extra}
    <div id="result-buttons" style="display:flex;flex-direction:column;gap:8px"></div>
  `);
  const box = m.root.querySelector('#result-buttons');
  for (const b of buttons) {
    const btn = el('button', 'btn block ' + (b.cls || ''), b.label);
    btn.onclick = async () => { m.close(); await b.onClick?.(); };
    box.appendChild(btn);
  }
  return m;
}
