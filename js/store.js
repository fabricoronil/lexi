/*
 * store.js — todo el estado vive en localStorage, así funciona sin cuenta
 * y sin internet una vez que cargaste la página.
 */

import { newCard } from './srs.js';

const KEY = 'lexi.v1';

export const PRESETS = {
  tranqui: { label: 'Tranqui', newPerDay: 5, dailyGoal: 15 },
  normal: { label: 'Normal', newPerDay: 10, dailyGoal: 30 },
  bestia: { label: 'Bestia', newPerDay: 20, dailyGoal: 60 },
};

const DEFAULTS = {
  version: 1,
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
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    console.warn('No se pudo guardar el progreso:', e);
  }
}

export function get() {
  return load();
}

/** Devuelve el estado SRS de una card, creándolo la primera vez. */
export function cardState(id) {
  const s = load();
  if (!s.cards[id]) s.cards[id] = newCard(id);
  return s.cards[id];
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

export function resetAll() {
  state = structuredClone(DEFAULTS);
  save();
}
