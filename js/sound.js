/*
 * sound.js — efectos cortos generados con WebAudio (sin archivos de audio).
 * Todo es sintetizado así el repo no carga assets de sonido de por medio.
 */

let ctx = null;
let enabled = true;

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

export function setEnabled(v) {
  enabled = v;
}

export function unlock() {
  if (enabled) getCtx();
}

function tone(freq, start, dur, { type = 'sine', peak = 0.16, glideTo = null } = {}) {
  const c = getCtx();
  if (!c || !enabled) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc.connect(gain).connect(c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

export function playTap() {
  const c = getCtx();
  if (!c || !enabled) return;
  tone(520, c.currentTime, 0.05, { type: 'sine', peak: 0.07 });
}

export function playAgain() {
  const c = getCtx();
  if (!c || !enabled) return;
  tone(220, c.currentTime, 0.16, { type: 'sine', peak: 0.11, glideTo: 160 });
}

export function playHard() {
  const c = getCtx();
  if (!c || !enabled) return;
  tone(330, c.currentTime, 0.1, { type: 'sine', peak: 0.1 });
}

export function playGood() {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  tone(523.25, t, 0.1, { type: 'sine', peak: 0.13 });
  tone(783.99, t + 0.07, 0.16, { type: 'sine', peak: 0.13 });
}

export function playEasy() {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  tone(523.25, t, 0.09, { type: 'sine', peak: 0.13 });
  tone(659.25, t + 0.06, 0.09, { type: 'sine', peak: 0.13 });
  tone(1046.5, t + 0.12, 0.2, { type: 'sine', peak: 0.14 });
}

export function playComplete() {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    tone(f, t + i * 0.09, 0.22, { type: 'triangle', peak: 0.12 });
  });
}

export function playStreak() {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  tone(659.25, t, 0.12, { type: 'triangle', peak: 0.12 });
  tone(987.77, t + 0.09, 0.24, { type: 'triangle', peak: 0.14 });
}
