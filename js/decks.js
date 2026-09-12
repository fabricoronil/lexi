/*
 * decks.js — carga los mazos y arma la cola de la sesión del día.
 */

import * as store from './store.js';
import { isDue, isMature, difficultyScore, struggles, isLeech } from './srs.js';

export const DECKS = [
  { id: 'esencial', file: 'data/esencial.json', label: 'esencial', hint: 'las que más se usan', color: '#f5d76e' },
  { id: 'core', file: 'data/core.json', label: 'core', hint: 'conectores y verbos A2–B1', color: '#7ab8f5' },
  { id: 'tech', file: 'data/tech.json', label: 'tech', hint: 'dev, videos, docs', color: '#6ee7a0' },
  { id: 'ia', file: 'data/ia.json', label: 'IA', hint: 'machine learning, modelos, LLMs', color: '#f38ba8' },
  { id: 'phrases', file: 'data/phrases.json', label: 'frases', hint: 'videos y reuniones', color: '#f5a742' },
  { id: 'phrasal', file: 'data/phrasal.json', label: 'phrasal verbs', hint: 'get up, give up, look for…', color: '#cba6f7' },
];

let all = [];

/** Id estable a partir del texto, así el progreso sobrevive a reordenar el JSON. */
function makeId(deckId, en) {
  return deckId + ':' + en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

/* ── qué tan usada es cada palabra ──
 * `data/frequency.json` trae las 2000 palabras más frecuentes del idioma en
 * orden. Cruzando cada card contra esa lista sabemos si lo que te está por
 * enseñar aparece en cualquier texto o es un término rebuscado que casi no
 * vas a ver. Eso es lo que decide el orden en que entran las cards nuevas.
 * Si el archivo no carga, la app sigue andando: sin ranking manda el nivel.
 */
const UNRANKED = 5000; // fuera del top 2000: para el orden, como si fuera rarísima

// Palabras que no dicen nada sobre lo difícil que es una card: si mido
// "to look into" por "to" o "into", me da que es de las más comunes del
// idioma, cuando lo difícil es justamente el sentido de la expresión.
const RANK_STOPWORDS = new Set([
  'a', 'an', 'the', 'to', 'of', 'in', 'on', 'at', 'for', 'and', 'or', 'but',
  'is', 'be', 'am', 'are', 'was', 'were', 'it', 'this', 'that', 'you', 'your',
  'we', 'i', 'my', 'me', 'not', 'with', 'as', 'do', 'so', 'up', 'out', 'off',
]);

let freq = null; // Map: palabra -> posición en el ranking (1 = la más usada)

async function loadFrequency() {
  try {
    const res = await fetch('data/frequency.json');
    if (!res.ok) return null;
    const data = await res.json();
    const map = new Map();
    (data.words || []).forEach((w, i) => {
      const k = String(w.w || '').toLowerCase();
      if (k && !map.has(k)) map.set(k, i + 1);
    });
    return map;
  } catch {
    return null; // sin conexión y sin cache: seguimos sin ranking
  }
}

/** Posición de una palabra suelta, probando las terminaciones más comunes. */
function wordRank(w) {
  if (!freq) return null;
  const tries = [w, w.replace(/s$/, ''), w.replace(/es$/, ''), w.replace(/ing$/, ''),
    w.replace(/ing$/, 'e'), w.replace(/ed$/, ''), w.replace(/ied$/, 'y')];
  for (const t of tries) {
    const r = freq.get(t);
    if (r) return r;
  }
  return null;
}

/**
 * Qué tan usada es una card. Para una expresión de varias palabras vale la
 * parte MENOS común: "to look into" es tan difícil como la idea que arma,
 * no como la palabra "to".
 */
function cardRank(en) {
  if (!freq) return UNRANKED;
  const words = en.toLowerCase().match(/[a-z']+/g) || [];
  const content = words.filter((w) => w.length > 1 && !RANK_STOPWORDS.has(w));
  const use = content.length ? content : words;
  if (!use.length) return UNRANKED;
  let worst = 0;
  for (const w of use) worst = Math.max(worst, wordRank(w) || UNRANKED);
  return worst;
}

export async function loadDecks() {
  if (all.length) return all;
  const [results, freqMap] = await Promise.all([
    Promise.all(
      DECKS.map(async (deck) => {
        const res = await fetch(deck.file);
        if (!res.ok) throw new Error(`No pude cargar ${deck.file} (${res.status})`);
        const rows = await res.json();
        return rows.map((row, i) => ({
          ...row,
          deck: deck.id,
          color: deck.color,
          id: makeId(deck.id, row.en) || `${deck.id}:${i}`,
        }));
      })
    ),
    loadFrequency(),
  ]);
  freq = freqMap;
  all = results.flat();
  for (const card of all) {
    card.rank = cardRank(card.en);
    card.tier = cardTier(card);
  }
  return all;
}

/* ── prioridad: qué se aprende ahora y qué puede esperar ──
 * Tres escalones, de lo que rinde más a lo que rinde menos si recién
 * arrancás. No esconde nada: sólo decide el orden en que las cards nuevas
 * entran al mazo, para que las primeras horas se te vayan en palabras que
 * vas a escuchar en cualquier video y no en términos rebuscados.
 */
export const SCOPES = [
  { id: 'esencial', tier: 1, label: 'Base', hint: 'Lo que aparece en cualquier frase, más el vocabulario técnico de todos los días (a bug, a function, a server).' },
  { id: 'util', tier: 2, label: 'Intermedio', hint: 'Suma lo de uso diario menos común y lo técnico de videos y docs (to deploy, an endpoint, inference).' },
  { id: 'todo', tier: 3, label: 'Completo', hint: 'También lo idiomático y los términos más rebuscados (under the hood, stale, gradient descent).' },
];

export function scopeTier(id) {
  const s = SCOPES.find((x) => x.id === id);
  return s ? s.tier : 3;
}

/**
 * 1 = base · 2 = intermedio · 3 = puede esperar.
 *
 * Para el vocabulario técnico y las frases de video, el ranking de frecuencia
 * del idioma general no sirve: `to debug` y `stale` están los dos fuera del
 * top 2000, pero uno lo escuchás en cada video y el otro casi nunca. Por eso
 * esos mazos traen un `step` puesto a mano, y cuando está, manda.
 */
export function cardTier(card) {
  if (card.step) return Math.min(3, Math.max(1, card.step));
  const rank = card.rank ?? UNRANKED;
  if (card.lvl === 'A1') return 1;
  if (card.lvl === 'A2') return rank <= 1500 ? 1 : 2;
  if (card.lvl === 'B1') return rank <= 1000 ? 2 : 3;
  return 3;
}

export function allCards() {
  return all;
}

export function activeCards() {
  const { decks } = store.get().settings;
  return all.filter((c) => decks[c.deck]);
}

/** Las de los mazos activos que todavía hay que estudiar (sin las que ya sabés). */
export function studyCards() {
  const s = store.get();
  return activeCards().filter((c) => !s.known[c.id]);
}

export function byId(id) {
  return all.find((c) => c.id === id);
}

/* ── el orden de las nuevas: una rampa, no una pared ──
 * Ordenar por nivel y después por frecuencia daba tres semanas de puro A1 y
 * de golpe una pared de A2. Ahora cada card tiene un costo = su posición en
 * el ranking de frecuencia + un peso por nivel. Así A1 domina el arranque
 * pero A2 aparece desde el principio y toma fuerza sola: una palabra A2 que
 * se usa todo el tiempo entra antes que una A1 que casi no aparece, que es
 * lo que de verdad conviene aprender primero.
 */
const LVL_WEIGHT = { A1: 0, A2: 250, B1: 600, B2: 1000 };

function freshCost(card) {
  return (card.rank ?? UNRANKED) + (LVL_WEIGHT[card.lvl] ?? 1200);
}

function freshOrder(a, b) {
  return (a.tier ?? 3) - (b.tier ?? 3) || freshCost(a) - freshCost(b);
}

/* ── una de cada tres, de lo tuyo ──
 * El objetivo no es "saber inglés" en abstracto: es entender videos de
 * programación y de IA. Si las nuevas salieran sólo por frecuencia del
 * idioma general, el vocabulario técnico quedaría para dentro de meses —
 * los términos de dev y de ML no figuran en el top 2000 de nada. Así que
 * cada tanda reserva un lugar de cada tres para una card de tech o IA del
 * escalón en el que estés: desde el primer día hay algo de lo tuyo, pero de
 * a poco y sin que te coma la tanda entera.
 */
const AREA_DECKS = new Set(['tech', 'ia']);
export const AREA_EVERY_DEFAULT = 3; // una card del área cada tantas nuevas

/** Cada cuántas nuevas entra una de tu área. Configurable en Ajustes. */
export function areaEvery() {
  const v = store.get().settings.areaEvery;
  return v >= 2 && v <= 6 ? v : AREA_EVERY_DEFAULT;
}

/** Cuántas del área entran en una tanda de `limit` cards nuevas. */
export function areaQuota(limit) {
  return Math.round(limit / areaEvery());
}

function pickFresh(fresh, limit) {
  if (limit <= 0) return [];
  const area = fresh.filter((c) => AREA_DECKS.has(c.deck));
  const general = fresh.filter((c) => !AREA_DECKS.has(c.deck));

  // La proporción se calcula sobre la tanda entera y no con un módulo, así se
  // sostiene con cualquier ritmo: con 12 nuevas por día entran 4 del área, y
  // con 5 entran 2. Un módulo cada 3 fallaba justo en las tandas chicas,
  // porque el contador se reinicia todos los días y la tercera nunca llegaba.
  const quota = Math.min(area.length, areaQuota(limit));

  const out = [];
  let a = 0;
  let g = 0;
  for (let i = 0; i < limit && (a < area.length || g < general.length); i++) {
    // Repartidas parejo a lo largo de la tanda, no todas juntas al final.
    const turnoArea = quota > 0
      && Math.floor(((i + 1) * quota) / limit) > Math.floor((i * quota) / limit);
    if (turnoArea && a < area.length) out.push(area[a++]);
    else if (g < general.length) out.push(general[g++]);
    else if (a < area.length) out.push(area[a++]);
  }
  return out;
}

/**
 * Cola de la sesión: primero lo vencido, después las nuevas del día.
 * Las nuevas se limitan según el nivel de exigencia y según la prioridad
 * elegida en Ajustes — lo que queda afuera por prioridad no desaparece,
 * espera su turno (`heldBack`).
 */
export function buildQueue(now = Date.now()) {
  const q = computeQueue(now);
  // Si no queda nada pendiente, el día cuenta para la racha aunque no llegues
  // a la meta: no tiene sentido exigirte repasos que no existen. Va acá y no
  // en `computeQueue` porque es un efecto sobre el estado, y hay quien sólo
  // quiere mirar la cola (ver `nextFreshCard`) sin tocar nada.
  store.setCleared(q.total === 0 && q.midLearning === 0);
  return q;
}

function computeQueue(now) {
  const s = store.get();
  const pool = studyCards();
  const maxTier = scopeTier(s.settings.newScope);

  const due = [];
  const fresh = [];
  let heldBack = 0; // nuevas que existen pero todavía no toca aprender
  let midLearning = 0; // a medio aprender y todavía fuera de la ventana

  // Ventana de adelanto: una card en aprendizaje que vuelve en menos de 20 min
  // se puede hacer ya, para no dejarte mirando el reloj. Igual que Anki.
  const AHEAD = 20 * 60 * 1000;

  for (const card of pool) {
    const st = s.cards[card.id];
    if (!st) {
      if ((card.tier ?? 3) <= maxTier) fresh.push(card);
      else heldBack += 1;
    } else if (isDue(st, now) || (st.state === 'learning' && st.due - now <= AHEAD)) {
      due.push(card);
    } else if (st.state === 'learning') {
      midLearning += 1;
    }
  }

  // Lo más atrasado primero.
  due.sort((a, b) => s.cards[a.id].due - s.cards[b.id].due);

  const remainingNew = Math.max(0, s.settings.newPerDay - store.newToday());
  fresh.sort(freshOrder);
  const picked = pickFresh(fresh, remainingNew);
  const total = due.length + picked.length;

  return { due, fresh: picked, total, midLearning, heldBack, freshLeft: fresh.length };
}

/** 'unseen' | 'learning' | 'learned' | 'known', según el estado guardado (si hay). */
export function cardStatus(card, s = store.get()) {
  if (s.known[card.id]) return 'known';
  const st = s.cards[card.id];
  if (!st) return 'unseen';
  return isMature(st) ? 'learned' : 'learning';
}

export function counts() {
  const s = store.get();
  let learned = 0;
  let learning = 0;
  let unseen = 0;
  let known = 0;
  for (const card of activeCards()) {
    const status = cardStatus(card, s);
    if (status === 'known') known += 1;
    else if (status === 'unseen') unseen += 1;
    else if (status === 'learned') learned += 1;
    else learning += 1;
  }
  // Las que marcaste "ya me la sé" cuentan como sabidas: no las vas a repasar,
  // pero tampoco son deuda pendiente.
  return { learned, learning, unseen, known, sabidas: learned + known, total: learned + learning + unseen + known };
}

/** Todas las cards activas con su estado, para listarlas en "Vocabulario". */
export function wordList() {
  const s = store.get();
  return activeCards().map((card) => ({
    card,
    st: s.cards[card.id] || null,
    status: cardStatus(card, s),
  }));
}

/**
 * La próxima card nueva que tocaría, sin contar las que ya están en la cola
 * de la sesión. Sirve para reemplazar en el acto a una que marcaste como
 * "ya me la sé": marcarla no te acorta el día, te adelanta a la siguiente.
 */
export function nextFreshCard(excludeIds = []) {
  const skip = new Set(excludeIds);
  return computeQueue(Date.now()).fresh.find((c) => !skip.has(c.id)) || null;
}

/**
 * Cola de refuerzo: para cuando ya no queda nada pendiente por hoy pero
 * el usuario quiere seguir practicando. A propósito no respeta newPerDay
 * ni la meta diaria — es una vuelta extra, sin límite, sobre los mazos
 * activos (ya vistos o no). Se pide de a tandas mezcladas al azar.
 */
export function buildReinforceQueue(limit = 20) {
  const pool = studyCards();
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit);
}

/**
 * Las que más te cuestan: las cards que venís fallando o marcando difícil,
 * ordenadas por cuánto pesan. Sólo entran las que ya tienen historia
 * suficiente como para que el número diga algo (ver `struggles`).
 */
export function hardestCards(limit = 12) {
  const s = store.get();
  const out = [];
  for (const card of studyCards()) {
    const st = s.cards[card.id];
    if (!st || !struggles(st)) continue;
    out.push({ card, st, score: difficultyScore(st), leech: isLeech(st) });
  }
  out.sort((a, b) => b.score - a.score || (b.st.lapses || 0) - (a.st.lapses || 0));
  return limit ? out.slice(0, limit) : out;
}

/** Cola de repaso enfocada sólo en esas, para atacarlas aparte. */
export function buildHardQueue(limit = 20) {
  return hardestCards(limit).map((h) => h.card);
}

export function deckProgress(deckId) {
  const s = store.get();
  const cards = all.filter((c) => c.deck === deckId);
  const started = cards.filter((c) => s.cards[c.id] || s.known[c.id]).length;
  return { started, total: cards.length };
}

/* ── los dos caminos ──
 * Lexi tira de dos sogas a la vez: subir de nivel (A1 → A2 → B1) y entender
 * los videos de tu área. Las dos avanzan con las mismas cards, así que
 * conviene poder mirarlas por separado y ver cuál se está quedando atrás.
 * "Sabida" es lo mismo que en el resto de la app: aprendida de verdad (el
 * intervalo pasó las tres semanas) o marcada como "ya me la sé".
 */

const LEVELS = ['A1', 'A2', 'B1', 'B2'];

function isSabida(card, s) {
  const status = cardStatus(card, s);
  return status === 'learned' || status === 'known';
}

/** Cuánto llevás del vocabulario de cada nivel CEFR que trae la app. */
export function levelProgress() {
  const s = store.get();
  const out = LEVELS.map((id) => ({ id, done: 0, total: 0 }));
  const byId = Object.fromEntries(out.map((x) => [x.id, x]));
  for (const card of activeCards()) {
    const row = byId[card.lvl];
    if (!row) continue;
    row.total += 1;
    if (isSabida(card, s)) row.done += 1;
  }
  return out.filter((x) => x.total);
}

/** Lo mismo pero para tu área: los mazos tech e IA, por paso. */
export function areaProgress() {
  const s = store.get();
  const out = SCOPES.map((sc) => ({ id: sc.id, label: sc.label, done: 0, total: 0 }));
  for (const card of activeCards()) {
    if (!AREA_DECKS.has(card.deck)) continue;
    const row = out[(card.tier ?? 3) - 1];
    if (!row) continue;
    row.total += 1;
    if (isSabida(card, s)) row.done += 1;
  }
  return out.filter((x) => x.total);
}

/* ── a este ritmo, ¿cuánto falta? ──
 * El objetivo es entender videos del área lo antes posible, y el cuello de
 * botella no es el mazo: es cuántas cards nuevas por día aceptás. Sin ver el
 * número no hay forma de decidir si conviene apretar el acelerador, así que
 * acá está, en días, para el escalón actual y para el vocabulario del área.
 */
export function pace() {
  const s = store.get();
  const perDay = Math.max(0, s.settings.newPerDay || 0);
  const maxTier = scopeTier(s.settings.newScope);

  let areaLeft = 0;
  let generalLeft = 0;
  for (const card of studyCards()) {
    if (s.cards[card.id]) continue;
    if ((card.tier ?? 3) > maxTier) continue;
    if (AREA_DECKS.has(card.deck)) areaLeft += 1;
    else generalLeft += 1;
  }

  const areaPerDay = perDay ? Math.max(1, areaQuota(perDay)) : 0;
  const days = (left, rate) => (rate > 0 && left > 0 ? Math.ceil(left / rate) : left > 0 ? Infinity : 0);

  return {
    perDay,
    areaPerDay,
    areaLeft,
    scopeLeft: areaLeft + generalLeft,
    daysArea: days(areaLeft, areaPerDay),
    daysScope: days(areaLeft + generalLeft, perDay),
  };
}

/** Cuántas cards nuevas quedan en cada escalón de prioridad, para Ajustes. */
export function scopeCounts() {
  const s = store.get();
  const left = { 1: 0, 2: 0, 3: 0 };
  for (const card of studyCards()) {
    if (s.cards[card.id]) continue;
    left[card.tier ?? 3] += 1;
  }
  return SCOPES.map((sc) => ({
    ...sc,
    left: SCOPES.filter((x) => x.tier <= sc.tier).reduce((a, x) => a + left[x.tier], 0),
  }));
}
