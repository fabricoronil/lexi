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
    master.gain.value = 1.45; // ganancia general — los efectos venían bastante bajos
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
  click(c.currentTime, 0.012, { cutoff: 2200, peak: 0.04 });
  voice(660, c.currentTime, 0.055, { type: 'sine', peak: 0.11, harmonicMix: 0.14, toDelay: 0 });
}

/**
 * Otra vez: un "buzz" corto y grave con un leve batido (dos frecuencias muy
 * cercanas sonando juntas), la textura clásica de "mal" — sin ser agresivo.
 */
export function playAgain() {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  voice(180, t, 0.22, { type: 'sawtooth', peak: 0.14, glideTo: 110, harmonicMix: 0, cutoff: 750, toDelay: 0 });
  voice(172, t, 0.22, { type: 'sawtooth', peak: 0.12, glideTo: 104, harmonicMix: 0, cutoff: 700, toDelay: 0 });
  click(t, 0.02, { cutoff: 900, peak: 0.05 });
}

/** Difícil: un tono medio con un pequeño vibrato — ni mal ni bien, un "mmh". */
export function playHard() {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  const osc = c.createOscillator();
  const lfo = c.createOscillator();
  const lfoGain = c.createGain();
  lfo.frequency.value = 22;
  lfoGain.gain.value = 8;
  lfo.connect(lfoGain).connect(osc.frequency);
  osc.type = 'triangle';
  osc.frequency.value = 350;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 1800;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, t);
  gain.gain.linearRampToValueAtTime(0.16, t + 0.015);
  gain.gain.setValueAtTime(0.16, t + 0.1);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
  osc.connect(filter).connect(gain).connect(master);
  lfo.start(t); osc.start(t);
  lfo.stop(t + 0.22); osc.stop(t + 0.22);
}

/**
 * Bien / Fácil: acordes ascendentes con un "combo" opcional (0, 1, 2…) que
 * transpone la nota hacia arriba cada vez que encadenás varias seguidas,
 * como el feedback de racha de Duolingo — sin volverse molesto (tope suave).
 */
function comboFactor(combo) {
  return Math.pow(1.035, Math.min(combo, 6));
}

export function playGood(combo = 0) {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  const f = comboFactor(combo);
  voice(523.25 * f, t, 0.12, { type: 'sine', peak: 0.18, harmonicMix: 0.24, cutoff: 3400 });
  voice(783.99 * f, t + 0.07, 0.22, { type: 'sine', peak: 0.2, harmonicMix: 0.3, cutoff: 4400 });
}

export function playEasy(combo = 0) {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  const f = comboFactor(combo);
  voice(523.25 * f, t, 0.1, { type: 'sine', peak: 0.16, harmonicMix: 0.24, cutoff: 3600 });
  voice(659.25 * f, t + 0.06, 0.1, { type: 'sine', peak: 0.18, harmonicMix: 0.26, cutoff: 4000 });
  voice(1046.5 * f, t + 0.12, 0.26, { type: 'sine', peak: 0.21, harmonic: 1.5, harmonicMix: 0.32, cutoff: 5600, toDelay: 0.3 });
  // sparkle: un par de notas muy altas y cortitas, de puro brillo.
  voice(1567.98 * f, t + 0.19, 0.14, { type: 'sine', peak: 0.09, harmonicMix: 0.14, cutoff: 6000, toDelay: 0.35 });
  voice(2093 * f, t + 0.24, 0.12, { type: 'sine', peak: 0.065, harmonicMix: 0.1, cutoff: 6500, toDelay: 0.35 });
}

export function playComplete() {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
    voice(f, t + i * 0.1, 0.26, { type: 'triangle', peak: 0.17, harmonicMix: 0.24, cutoff: 4200, toDelay: 0.26 });
  });
}

export function playStreak() {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  voice(659.25, t, 0.14, { type: 'triangle', peak: 0.17, harmonicMix: 0.26 });
  voice(830.61, t + 0.08, 0.14, { type: 'triangle', peak: 0.18, harmonicMix: 0.26 });
  voice(987.77, t + 0.16, 0.32, { type: 'triangle', peak: 0.2, harmonic: 1.5, harmonicMix: 0.32, cutoff: 5600, toDelay: 0.3 });
}

/** Correcto en un ejercicio: dos notas ascendentes cortas, más discreto que playGood. */
export function playCorrect() {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  voice(587.33, t, 0.09, { type: 'sine', peak: 0.15, harmonicMix: 0.22, cutoff: 3200 });
  voice(880, t + 0.055, 0.16, { type: 'sine', peak: 0.17, harmonicMix: 0.26, cutoff: 4000 });
}

/** Incorrecto en un ejercicio: un "thud" corto y grave, sin ser desagradable. */
export function playWrong() {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  voice(196, t, 0.16, { type: 'sine', peak: 0.14, glideTo: 140, harmonicMix: 0.1, cutoff: 750, toDelay: 0 });
  click(t, 0.015, { cutoff: 1200, peak: 0.045 });
}

/** Pasar de página / avanzar (ej. siguiente pregunta de un texto). */
export function playFlip() {
  const c = getCtx();
  if (!c || !enabled) return;
  click(c.currentTime, 0.03, { cutoff: 1800, peak: 0.06 });
  voice(440, c.currentTime, 0.05, { type: 'sine', peak: 0.09, harmonicMix: 0.12, cutoff: 2600, toDelay: 0 });
}

/** Tanda de ejercicios o texto de lectura terminado sin ningún error — la fanfarria grande. */
export function playPerfect() {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  [523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((f, i) => {
    voice(f, t + i * 0.075, 0.24, { type: 'triangle', peak: 0.16, harmonicMix: 0.26, cutoff: 4600, toDelay: 0.3 });
  });
  voice(2093, t + 0.42, 0.3, { type: 'sine', peak: 0.09, harmonicMix: 0.14, cutoff: 6500, toDelay: 0.4 });
}

/** Marcar/desmarcar un tema de gramática como aprendido. */
export function playLearned(on) {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  if (on) {
    voice(659.25, t, 0.1, { type: 'sine', peak: 0.14, harmonicMix: 0.2, cutoff: 3600 });
    voice(987.77, t + 0.06, 0.18, { type: 'sine', peak: 0.16, harmonicMix: 0.24, cutoff: 4400 });
  } else {
    click(t, 0.015, { cutoff: 1400, peak: 0.04 });
    voice(392, t, 0.08, { type: 'sine', peak: 0.09, harmonicMix: 0.12, cutoff: 2200, toDelay: 0 });
  }
}

/** Prender/apagar un switch de Ajustes: un "tick" cortito, más agudo si queda prendido. */
export function playSwitch(on) {
  const c = getCtx();
  if (!c || !enabled) return;
  const t = c.currentTime;
  click(t, 0.015, { cutoff: 1500, peak: 0.05 });
  voice(on ? 700 : 420, t, 0.045, { type: 'sine', peak: 0.09, harmonicMix: 0.12, cutoff: 3000, toDelay: 0 });
}
