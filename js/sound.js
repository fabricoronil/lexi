/*
 * sound.js — efectos cortos generados con WebAudio (sin archivos de audio).
 * Todo es sintetizado así el repo no carga assets de sonido de por medio ni
 * depende de conexión para sonar bien offline. Usa osciladores en capas
 * (fundamental + armónicos suaves), un filtro paso-bajo por voz y un
 * delay/eco corto compartido para dar cuerpo sin sonar a beep de juguete.
 */

let ctx = null;
let enabled = true;
let master = null;
let delayNode = null;
let delayGain = null;

function getCtx() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 1;
    master.connect(ctx.destination);

    // Eco corto y sutil compartido por todas las voces: da aire sin ensuciar.
    delayNode = ctx.createDelay(0.5);
    delayNode.delayTime.value = 0.15;
    delayGain = ctx.createGain();
    delayGain.gain.value = 0.16;
    delayNode.connect(delayGain);
    delayGain.connect(delayNode);
    delayGain.connect(master);
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

/**
 * Una voz: oscilador principal + un armónico una octava (o quinta) arriba
 * mucho más suave, pasados por un filtro paso-bajo que se va cerrando —
 * eso es lo que da la sensación de "pluck" orgánico en vez de un tono plano.
 */
function voice(freq, start, dur, { type = 'sine', peak = 0.15, glideTo = null, harmonic = 2, harmonicMix = 0.22, cutoff = 5200, toDelay = 0.22 } = {}) {
  const c = getCtx();
  if (!c || !enabled) return;

  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(cutoff, start);
  filter.frequency.exponentialRampToValueAtTime(Math.max(300, cutoff * 0.35), start + dur);
  filter.Q.value = 0.7;

  const gain = c.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);

  filter.connect(gain);
  gain.connect(master);
  if (toDelay > 0) {
    const send = c.createGain();
    send.gain.value = toDelay;
    gain.connect(send);
    send.connect(delayNode);
  }

  const osc = c.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  if (glideTo) osc.frequency.exponentialRampToValueAtTime(glideTo, start + dur);
  osc.connect(filter);
  osc.start(start);
  osc.stop(start + dur + 0.03);

  if (harmonicMix > 0) {
    const osc2 = c.createOscillator();
    osc2.type = type;
    osc2.frequency.setValueAtTime(freq * harmonic, start);
    if (glideTo) osc2.frequency.exponentialRampToValueAtTime(glideTo * harmonic, start + dur);
    const g2 = c.createGain();
    g2.gain.value = harmonicMix;
    osc2.connect(g2).connect(filter);
    osc2.start(start);
    osc2.stop(start + dur + 0.03);
  }
}

/** Un golpe de ruido filtrado muy corto — da textura de "clic" orgánico. */
function click(start, dur = 0.02, { cutoff = 2600, peak = 0.05 } = {}) {
  const c = getCtx();
  if (!c || !enabled) return;
  const n = c.createBuffer(1, c.sampleRate * dur, c.sampleRate);
  const data = n.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = c.createBufferSource();
  src.buffer = n;
  const filter = c.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.value = cutoff;
  const gain = c.createGain();
  gain.gain.setValueAtTime(peak, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  src.connect(filter).connect(gain).connect(master);
  src.start(start);
}

export function playTap() {
  const c = getCtx();
  if (!c || !enabled) return;
  voice(660, c.currentTime, 0.05, { type: 'sine', peak: 0.08, harmonicMix: 0.12, toDelay: 0 });
}

export function playAgain() {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  voice(210, t, 0.26, { type: 'sine', peak: 0.13, glideTo: 130, harmonic: 1.5, harmonicMix: 0.15, cutoff: 900, toDelay: 0.1 });
}

export function playHard() {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  voice(392, t, 0.12, { type: 'triangle', peak: 0.11, harmonic: 1.5, harmonicMix: 0.18, cutoff: 2200 });
}

export function playGood() {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  voice(523.25, t, 0.12, { type: 'sine', peak: 0.13, harmonicMix: 0.2, cutoff: 3400 });
  voice(783.99, t + 0.07, 0.2, { type: 'sine', peak: 0.14, harmonicMix: 0.24, cutoff: 4200 });
}

export function playEasy() {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  voice(523.25, t, 0.1, { type: 'sine', peak: 0.12, harmonicMix: 0.2, cutoff: 3600 });
  voice(659.25, t + 0.06, 0.1, { type: 'sine', peak: 0.13, harmonicMix: 0.22, cutoff: 4000 });
  voice(1046.5, t + 0.12, 0.24, { type: 'sine', peak: 0.15, harmonic: 1.5, harmonicMix: 0.26, cutoff: 5200 });
}

export function playComplete() {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    voice(f, t + i * 0.1, 0.26, { type: 'triangle', peak: 0.12, harmonicMix: 0.2, cutoff: 4200, toDelay: 0.26 });
  });
}

export function playStreak() {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  voice(659.25, t, 0.14, { type: 'triangle', peak: 0.12, harmonicMix: 0.22 });
  voice(830.61, t + 0.08, 0.14, { type: 'triangle', peak: 0.13, harmonicMix: 0.22 });
  voice(987.77, t + 0.16, 0.32, { type: 'triangle', peak: 0.15, harmonic: 1.5, harmonicMix: 0.28, cutoff: 5600, toDelay: 0.3 });
}

/** Correcto en un ejercicio: dos notas ascendentes cortas, más discreto que playGood. */
export function playCorrect() {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  voice(587.33, t, 0.09, { type: 'sine', peak: 0.11, harmonicMix: 0.18, cutoff: 3200 });
  voice(880, t + 0.055, 0.16, { type: 'sine', peak: 0.13, harmonicMix: 0.22, cutoff: 4000 });
}

/** Incorrecto en un ejercicio: un "thud" corto y grave, sin ser desagradable. */
export function playWrong() {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  voice(196, t, 0.16, { type: 'sine', peak: 0.1, glideTo: 140, harmonicMix: 0.08, cutoff: 700, toDelay: 0 });
  click(t, 0.015, { cutoff: 1200, peak: 0.03 });
}

/** Pasar de página / avanzar (ej. siguiente pregunta de un texto). */
export function playFlip() {
  const c = getCtx();
  if (!c || !enabled) return;
  click(c.currentTime, 0.03, { cutoff: 1800, peak: 0.045 });
  voice(440, c.currentTime, 0.05, { type: 'sine', peak: 0.06, harmonicMix: 0.1, cutoff: 2600, toDelay: 0 });
}
