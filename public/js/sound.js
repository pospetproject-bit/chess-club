// Синтезированные звуки через WebAudio — без внешних файлов.
import { store } from './util.js';

let ctx = null;
const enabled = () => store.get('sound', true);

function ac() {
  if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch {} }
  if (ctx?.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

function tone(freq, dur, type = 'sine', gain = 0.12, when = 0) {
  const c = ac(); if (!c) return;
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(0, c.currentTime + when);
  g.gain.linearRampToValueAtTime(gain, c.currentTime + when + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + when + dur);
  o.connect(g).connect(c.destination);
  o.start(c.currentTime + when); o.stop(c.currentTime + when + dur + 0.05);
}

function noise(dur, gain = 0.1) {
  const c = ac(); if (!c) return;
  const len = c.sampleRate * dur, buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(); src.buffer = buf;
  const g = c.createGain(); g.gain.value = gain;
  const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 900;
  src.connect(f).connect(g).connect(c.destination); src.start();
}

export const sound = {
  move() { if (enabled()) { noise(0.06, 0.18); tone(220, 0.07, 'sine', 0.05); } },
  capture() { if (enabled()) { noise(0.1, 0.26); tone(140, 0.12, 'triangle', 0.12); } },
  check() { if (enabled()) { tone(660, 0.12, 'square', 0.06); tone(880, 0.16, 'square', 0.05, 0.1); } },
  end(win) {
    if (!enabled()) return;
    if (win) { tone(523, .15, 'sine', .1); tone(659, .15, 'sine', .1, .13); tone(784, .3, 'sine', .12, .26); }
    else { tone(392, .2, 'sine', .1); tone(311, .35, 'sine', .1, .18); }
  },
  click() { if (enabled()) tone(440, 0.04, 'sine', 0.04); },
  error() { if (enabled()) tone(180, 0.15, 'sawtooth', 0.06); },
  coin() { if (enabled()) { tone(988, .09, 'sine', .09); tone(1319, .22, 'sine', .09, .08); } },
};
