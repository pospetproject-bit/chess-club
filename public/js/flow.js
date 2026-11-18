// Общие флоу: реклама между партиями, модалка результата.
import { store, modal, el } from './util.js';
import { noAds } from './api.js';
import { showInterstitial } from './tg.js';

// Межстраничная реклама после каждой 2-й завершённой партии (если не куплено «Без рекламы»)
export async function maybeShowAd() {
  if (noAds()) return;
  const n = (store.get('games_since_ad', 0) || 0) + 1;
  if (n >= 2) {
    store.set('games_since_ad', 0);
    try { await showInterstitial(); } catch {}
  } else store.set('games_since_ad', n);
}

export function gameResultModal({ emoji, title, sub, buttons = [] }) {
  const m = modal(`
    <div class="result-emoji">${emoji}</div>
    <div class="result-title">${title}</div>
    <div class="result-sub">${sub}</div>
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
