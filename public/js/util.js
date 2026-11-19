// Утилиты: DOM, хранилище, модалки, тосты
export const $ = sel => document.querySelector(sel);
export const $$ = sel => [...document.querySelectorAll(sel)];

export function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html !== undefined) n.innerHTML = html;
  return n;
}

export const store = {
  get(k, d = null) { try { const v = localStorage.getItem('cc_' + k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('cc_' + k, JSON.stringify(v)); } catch {} },
  del(k) { try { localStorage.removeItem('cc_' + k); } catch {} },
};

export function toast(msg, type = '', ms = 2600) {
  const t = el('div', 'toast ' + type, msg);
  $('#toast-root').appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; setTimeout(() => t.remove(), 320); }, ms);
}

// Модалка-bottom sheet. Возвращает {close, root}
export function modal(html, { dismissable = true } = {}) {
  const back = el('div', 'modal-back');
  const box = el('div', 'modal');
  box.innerHTML = (dismissable ? '<button class="close-x">✕</button>' : '') + html;
  back.appendChild(box);
  $('#modal-root').appendChild(back);
  const close = () => { back.remove(); };
  if (dismissable) {
    box.querySelector('.close-x').onclick = close;
    back.addEventListener('click', e => { if (e.target === back) close(); });
  }
  return { close, root: box };
}

export function confirmModal(title, text, okLabel = 'Подтвердить') {
  return new Promise(resolve => {
    const m = modal(`<h3>${title}</h3><p class="muted" style="font-size:14px;line-height:1.5">${text}</p>
      <div class="btn-row" style="margin-top:14px">
        <button class="btn" data-a="no">Отмена</button>
        <button class="btn primary" data-a="yes">${okLabel}</button>
      </div>`);
    m.root.querySelector('[data-a=no]').onclick = () => { m.close(); resolve(false); };
    m.root.querySelector('[data-a=yes]').onclick = () => { m.close(); resolve(true); };
  });
}

export const fmtDate = ts => new Date(ts).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }) + ' ' + new Date(ts).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
export const fmtClock = ms => {
  ms = Math.max(0, ms);
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const sleep = ms => new Promise(r => setTimeout(r, ms));

export function copyText(text) {
  if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text).then(() => true).catch(() => fallbackCopy(text));
  return Promise.resolve(fallbackCopy(text));
}
function fallbackCopy(text) {
  const ta = document.createElement('textarea');
  ta.value = text; document.body.appendChild(ta); ta.select();
  let ok = false; try { ok = document.execCommand('copy'); } catch {}
  ta.remove(); return ok;
}
