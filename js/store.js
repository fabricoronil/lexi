/*
 * store.js — todo el estado vive en localStorage, así funciona sin cuenta
 * y sin internet una vez que cargaste la página.
 */

import { newCard } from './srs.js';
import * as sync from './sync.js';

const KEY = 'lexi.v1';

export const PRESETS = {
  tranqui: { label: 'Tranqui', newPerDay: 5, dailyGoal: 15 },
  normal: { label: 'Normal', newPerDay: 10, dailyGoal: 30 },
  bestia: { label: 'Bestia', newPerDay: 20, dailyGoal: 60 },
};

const DEFAULTS = {
  version: 1,
  updatedAt: 0, // timestamp del último cambio local, para saber qué dispositivo tiene la versión más nueva
  cards: {}, // id -> estado SRS
  settings: {
    preset: 'normal',
    newPerDay: 10,
    dailyGoal: 30,
    decks: { core: true, tech: true, phrases: true },
    autoSpeak: true,
    reverse: false,
    sound: true,
  },
  streak: {
    current: 0,
    best: 0,
    lastGoalDay: null, // 'YYYY-MM-DD' del último día en que cumpliste la meta
  },
  history: {}, // 'YYYY-MM-DD' -> cantidad de respuestas
  newIntroduced: {}, // 'YYYY-MM-DD' -> cards nuevas mostradas ese día
  topicsDone: {}, // id de tema de gramática -> true
  exerciseResults: {}, // id de tema -> { correct, total, bestPct, at }
  textResults: {}, // id de texto de lectura -> { correct, total, bestPct, attempts, at }
};

let state = null;

export function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function deepMerge(base, extra) {
  const out = Array.isArray(base) ? base.slice() : { ...base };
  for (const k of Object.keys(extra || {})) {
    const v = extra[k];
    if (v && typeof v === 'object' && !Array.isArray(v) && typeof out[k] === 'object' && out[k] !== null) {
      out[k] = deepMerge(out[k], v);
    } else if (v !== undefined) {
      out[k] = v;
    }
  }
  return out;
}

export function load() {
  if (state) return state;
  let saved = null;
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) saved = JSON.parse(raw);
  } catch (e) {
    console.warn('No se pudo leer el progreso guardado:', e);
  }
  state = saved ? deepMerge(DEFAULTS, saved) : structuredClone(DEFAULTS);
  return state;
}

export function save() {
  state.updatedAt = Date.now();
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('No se pudo guardar el progreso:', e);
  }
  sync.schedulePush(state);
}

/** Reemplaza el estado local por uno traído de otro dispositivo (sync). No dispara un push de vuelta. */
export function applyRemote(remote) {
  state = deepMerge(DEFAULTS, remote);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('No se pudo guardar el progreso sincronizado:', e);
  }
  return state;
}

export function get() {
  return load();
}

/**
 * Devuelve el estado SRS de una card sin persistirlo: si nunca se calificó,
 * da una card nueva "de prueba" para poder mostrarla o previsualizar
 * intervalos. Guardar de verdad es cosa de `putCard`, que sólo se llama al
 * calificar — así una card que sólo se mira (y la sesión se corta antes de
 * responderla) no queda marcada como "vista" en el progreso.
 */
export function cardState(id) {
  const s = load();
  return s.cards[id] || newCard(id);
}

export function putCard(card) {
  const s = load();
  s.cards[card.id] = card;
}

/** Registra una respuesta: suma al historial del día y actualiza la racha. */
export function recordAnswer() {
  const s = load();
  const key = todayKey();
  s.history[key] = (s.history[key] || 0) + 1;
  updateStreak();
  save();
}

export function recordNewCard() {
  const s = load();
  const key = todayKey();
  s.newIntroduced[key] = (s.newIntroduced[key] || 0) + 1;
}

export function reviewsToday() {
  return load().history[todayKey()] || 0;
}

export function newToday() {
  return load().newIntroduced[todayKey()] || 0;
}

/*
 * `cleared` lo setea decks.js: es true cuando no queda nada pendiente hoy.
 * Sin esto la racha sería imposible los primeros días — con 10 cards nuevas
 * no hay forma de llegar a una meta de 30. Vaciar la cola también salva el día.
 */
let clearedToday = false;
export function setCleared(v) {
  clearedToday = v;
}

export function goalMet() {
  const done = reviewsToday();
  if (done === 0) return false;
  return done >= load().settings.dailyGoal || clearedToday;
}

function dayBefore(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return todayKey(dt);
}

/**
 * La racha sube una sola vez por día, y sólo cuando llegás a la meta.
 * Ese es el nivel de exigencia: vos elegís cuánto cuesta salvar el día.
 */
export function updateStreak() {
  const s = load();
  const key = todayKey();
  if (!goalMet()) return;
  if (s.streak.lastGoalDay === key) return;

  if (s.streak.lastGoalDay === dayBefore(key)) {
    s.streak.current += 1;
  } else {
    s.streak.current = 1;
  }
  s.streak.lastGoalDay = key;
  if (s.streak.current > s.streak.best) s.streak.best = s.streak.current;
}

/** Si te salteaste un día, la racha ya está rota: mostrala en cero. */
export function liveStreak() {
  const s = load();
  const last = s.streak.lastGoalDay;
  if (!last) return 0;
  const key = todayKey();
  if (last === key || last === dayBefore(key)) return s.streak.current;
  return 0;
}

export function setSettings(patch) {
  const s = load();
  s.settings = { ...s.settings, ...patch };
  save();
}

export function exportJSON() {
  return JSON.stringify(load(), null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  if (!parsed || typeof parsed !== 'object' || !parsed.cards) {
    throw new Error('El archivo no parece una copia de Lexi.');
  }
  state = deepMerge(DEFAULTS, parsed);
  save();
  return state;
}

export function isTopicDone(id) {
  return !!load().topicsDone[id];
}

export function toggleTopicDone(id) {
  const s = load();
  if (s.topicsDone[id]) delete s.topicsDone[id];
  else s.topicsDone[id] = true;
  save();
}

/** Guarda el resultado de una tanda de ejercicios de un tema de gramática. */
export function recordExerciseRun(topicId, correct, total) {
  const s = load();
  const pct = total ? correct / total : 0;
  const prev = s.exerciseResults[topicId];
  const bestPct = prev ? Math.max(prev.bestPct, pct) : pct;
  s.exerciseResults[topicId] = { correct, total, bestPct, at: todayKey() };
  save();
}

export function exerciseResult(topicId) {
  return load().exerciseResults[topicId] || null;
}

/** Guarda el resultado de las preguntas de comprensión de un texto de lectura. */
export function recordTextRun(textId, correct, total) {
  const s = load();
  const pct = total ? correct / total : 0;
  const prev = s.textResults[textId];
  const bestPct = prev ? Math.max(prev.bestPct, pct) : pct;
  const attempts = (prev?.attempts || 0) + 1;
  s.textResults[textId] = { correct, total, bestPct, attempts, at: todayKey() };
  save();
}

export function textResult(textId) {
  return load().textResults[textId] || null;
}

export function resetAll() {
  state = structuredClone(DEFAULTS);
  save();
}
