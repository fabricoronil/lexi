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
    decks: { core: true, tech: true, phrases: true, phrasal: true },
    autoSpeak: true,
    reverse: false,
    sound: true,
  },
  streak: {
    current: 0,
    best: 0,
    lastGoalDay: null, // 'YYYY-MM-DD' del último día en que cumpliste la meta
    rescuedOn: null, // 'YYYY-MM-DD' del último día en que la recuperaste pagando el multiplicador
    rescues: 0, // cuántas veces la salvaste así, para las estadísticas
  },
  history: {}, // 'YYYY-MM-DD' -> cantidad de respuestas
  newIntroduced: {}, // 'YYYY-MM-DD' -> cards nuevas mostradas ese día
  topicsDone: {}, // id de tema de gramática -> true
  exerciseResults: {}, // id de tema -> { correct, total, bestPct, at }
  textResults: {}, // id de texto de lectura -> { correct, total, bestPct, attempts, at }
  myWords: [], // palabras anotadas a mano desde el celu (ver más abajo)
};

let state = null;

/**
 * Arregla lo que el merge no puede: si el estado guardado no traía `myWords`,
 * `deepMerge` deja el array de DEFAULTS por referencia y agregar una palabra
 * lo mutaría para siempre. Además defiende de un JSON importado con basura.
 */
function normalize(s) {
  s.myWords = Array.isArray(s.myWords) ? s.myWords.slice() : [];
  return s;
}

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
  state = normalize(saved ? deepMerge(DEFAULTS, saved) : structuredClone(DEFAULTS));
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
  state = normalize(deepMerge(DEFAULTS, remote));
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

/** La meta de hoy: la normal, o multiplicada si estás en un día de rescate. */
export function todayGoal() {
  return streakStatus().goal;
}

export function goalMet() {
  const done = reviewsToday();
  if (done === 0) return false;
  const st = streakStatus();
  if (done >= st.goal) return true;
  // Vaciar la cola salva un día normal, pero no un rescate: recuperar la
  // racha tiene que costar el doble (o el triple) de verdad, y para eso
  // siempre queda el refuerzo, que no tiene límite.
  return st.mode !== 'rescue' && clearedToday;
}

function dayBefore(key) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() - 1);
  return todayKey(dt);
}

function parseKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Días de calendario entre dos claves 'YYYY-MM-DD' (a → b). */
function daysBetween(a, b) {
  return Math.round((parseKey(b) - parseKey(a)) / 86400000);
}

/* ── recuperación de racha ──
 * Perder un día no la mata de una: al día siguiente podés rescatarla
 * haciendo el DOBLE de la meta. Si también fallás ese, queda una última
 * oportunidad al tercer día con el TRIPLE. Recién ahí se muere.
 */
export const MAX_MISSED = 2; // días perdidos que se pueden pagar (1 → x2, 2 → x3)

/**
 * Todo el estado de la racha para hoy, en un solo lugar:
 *  - mode: 'normal' (al día o sin racha), 'rescue' (podés recuperarla), 'lost'
 *  - missed: días que te salteaste desde la última meta cumplida
 *  - multiplier / goal: lo que cuesta salvar el día de hoy
 *  - lastChance: true cuando es el último día en que se puede rescatar
 *  - rescuedToday: hoy ya la recuperaste pagando el multiplicador
 */
export function streakStatus() {
  const s = load();
  const key = todayKey();
  const base = s.settings.dailyGoal;
  const flat = {
    mode: 'normal',
    missed: 0,
    multiplier: 1,
    goal: base,
    streak: s.streak.current,
    lastChance: false,
    rescuedToday: s.streak.rescuedOn === key,
  };
  const last = s.streak.lastGoalDay;
  if (!last || !s.streak.current) return { ...flat, streak: last ? s.streak.current : 0 };

  const missed = Math.max(0, daysBetween(last, key) - 1);
  if (missed === 0) return flat;
  if (missed > MAX_MISSED) {
    return { ...flat, mode: 'lost', missed, streak: 0 };
  }
  const multiplier = missed + 1;
  return {
    ...flat,
    mode: 'rescue',
    missed,
    multiplier,
    goal: base * multiplier,
    lastChance: missed === MAX_MISSED,
  };
}

/**
 * La racha sube una sola vez por día, y sólo cuando llegás a la meta.
 * Ese es el nivel de exigencia: vos elegís cuánto cuesta salvar el día.
 * Si venías de un día perdido, la meta ya viene multiplicada (ver
 * `streakStatus`), así que cumplirla también rescata la racha en vez de
 * arrancarla de cero.
 */
export function updateStreak() {
  const s = load();
  const key = todayKey();
  const st = streakStatus(); // antes de tocar lastGoalDay
  if (!goalMet()) return;
  if (s.streak.lastGoalDay === key) return;

  if (st.mode === 'rescue') {
    s.streak.current += 1;
    s.streak.rescuedOn = key;
    s.streak.rescues = (s.streak.rescues || 0) + 1;
  } else if (s.streak.lastGoalDay === dayBefore(key)) {
    s.streak.current += 1;
  } else {
    s.streak.current = 1;
  }
  s.streak.lastGoalDay = key;
  if (s.streak.current > s.streak.best) s.streak.best = s.streak.current;
}

/**
 * La racha que se muestra: sigue viva mientras quede alguna oportunidad de
 * rescate (queda "en riesgo", no en cero) y recién cae a cero cuando ya no
 * hay forma de recuperarla.
 */
export function liveStreak() {
  return streakStatus().streak;
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
  state = normalize(deepMerge(DEFAULTS, parsed));
  save();
  return state;
}

/* ── palabras propias ──
 * Las que anotás vos desde el celu mientras mirás algo con subtítulos.
 * Viven acá y no en un JSON del repo porque la app no tiene backend:
 * localStorage + el gist de sync.js es lo único que las hace aparecer en los
 * otros dispositivos. Siguen siendo material de lectura, igual que las que
 * salen del Notion: no llevan estado de progreso ni entran al SRS.
 */

export function myWords() {
  return load().myWords;
}

/** Id propio y estable: no se deriva del texto, así podés corregir la palabra sin perderla. */
function newWordId() {
  return 'w' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

export function addMyWord(fields) {
  const s = load();
  const entry = { ...fields, id: newWordId(), createdAt: Date.now() };
  s.myWords.push(entry);
  save();
  return entry;
}

export function updateMyWord(id, fields) {
  const s = load();
  const i = s.myWords.findIndex((w) => w.id === id);
  if (i === -1) return null;
  s.myWords[i] = { ...s.myWords[i], ...fields };
  save();
  return s.myWords[i];
}

export function removeMyWord(id) {
  const s = load();
  s.myWords = s.myWords.filter((w) => w.id !== id);
  save();
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
  state = normalize(structuredClone(DEFAULTS));
  save();
}
