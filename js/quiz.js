/*
 * quiz.js — práctica activa.
 *
 * Mirar una palabra, pensar "sí, me la sé" y darle Bien es lo cómodo, pero
 * mide poco: uno cree que se acuerda hasta que tiene que producirla. Estos
 * tres modos hacen que la respuesta salga de vos antes de ver la solución.
 *
 *   elegir     · reconocerla entre otras parecidas — el primer encuentro
 *   escribir   · producirla de memoria, que es lo que de verdad cuesta
 *   dictado    · sacarla de oído, sin verla escrita
 *
 * El módulo no toca el SRS ni el DOM: decide qué modo toca, compara lo que
 * escribiste con lo que era, y devuelve hasta dónde podés calificar. Quién
 * lo muestra y quién lo agenda son otros.
 */

import { AGAIN, HARD, GOOD, EASY } from './srs.js';

/* ── qué modo le toca a cada card ──
 * La dificultad del ejercicio sigue a la madurez de la palabra. Pedirle a
 * alguien que escriba una palabra que ve por primera vez no es exigencia,
 * es una pared: no hay nada que recuperar todavía. Y seguir mostrándole
 * opciones a una palabra que hace un mes que sabe no le enseña nada.
 */
export const MODES = { REVEAL: 'reveal', CHOICE: 'choice', WRITE: 'write', LISTEN: 'listen' };

export const PRACTICE = [
  {
    id: 'off',
    label: 'Clásico',
    hint: 'El flujo de Anki de siempre: ves la palabra, la pensás, mostrás el significado y te calificás con los cuatro botones.',
  },
  {
    id: 'smart',
    label: 'Mixto',
    hint: 'El ejercicio sigue a la palabra: elegís entre opciones la primera vez, escribís cuando ya la venís teniendo, y las que hace rato sabés llegan de oído.',
  },
  {
    id: 'always',
    label: 'Exigente',
    hint: 'Escribís siempre, salvo la primera vez que ves una palabra. Cuesta más y se fija mejor.',
  },
];

/**
 * El modo de esta card, ahora.
 *
 * `canListen` lo decide quien llama: sin voz en el dispositivo el dictado
 * no existe, y un ejercicio mudo sería imposible de contestar.
 */
export function pickMode(st, { practice = 'off', listen = true, canListen = true } = {}) {
  if (practice === 'off') return MODES.REVEAL;

  const isNew = !st || st.reps === 0;
  // Nunca la viste: no hay memoria que recuperar, así que reconocer es el
  // escalón que corresponde. Escribirla a ciegas sólo enseña frustración.
  if (isNew) return MODES.CHOICE;

  if (practice === 'always') return MODES.WRITE;

  // Todavía en los pasos de aprendizaje: la palabra está frágil y conviene
  // verla entera unas cuantas veces antes de exigir que salga sola.
  if (st.state !== 'review') return MODES.REVEAL;

  // Ya graduada y con un intervalo largo: si de verdad la sabés, la tenés
  // que reconocer sin leerla. Ese es el salto que lleva a entender un video.
  if (listen && canListen && st.interval >= 21) return MODES.LISTEN;

  return MODES.WRITE;
}

/* ── comparar lo que escribiste con lo que era ── */

/**
 * Deja una respuesta en su forma comparable: sin acentos, sin mayúsculas,
 * sin puntuación y sin las palabras que no cambian si están o no.
 */
export function normalize(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // acentos: "resolvió" y "resolvio" son la misma respuesta
    .replace(/[¿?¡!.,;:"'«»()\[\]]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/* El infinitivo en inglés y los artículos en los dos idiomas no son lo que
 * se está evaluando: si escribiste "figure out" en vez de "to figure out",
 * la sabías. */
const LEADING = /^(?:to|a|an|the|el|la|los|las|un|una|unos|unas)\s+/;

function stripLeading(s) {
  let out = s;
  // Dos vueltas: "the a" no pasa, pero "a un" sí ("a una función").
  for (let i = 0; i < 2; i++) out = out.replace(LEADING, '');
  return out;
}

/**
 * Todas las formas que cuentan como correctas para una respuesta dada.
 *
 * Un significado casi nunca es una sola palabra: "levantar (un servicio)"
 * se puede contestar con o sin el paréntesis, y "darse cuenta / resolver"
 * son dos respuestas válidas, no una sola de seis palabras.
 */
export function variants(expected) {
  const raw = String(expected || '');
  const out = new Set();

  const add = (v) => {
    const n = normalize(v);
    if (!n) return;
    out.add(n);
    const bare = stripLeading(n);
    if (bare) out.add(bare);
  };

  // Cada alternativa por separado: "/", ";" y " o " son separadores reales.
  const parts = raw.split(/\s*[/;]\s*|\s+o\s+/i).filter(Boolean);
  for (const part of parts) {
    add(part);
    // Y cada una también sin su aclaración entre paréntesis.
    const sinParentesis = part.replace(/\([^)]*\)/g, ' ');
    if (sinParentesis !== part) add(sinParentesis);
  }
  // La frase entera, por si alguien la escribe completa tal cual figura.
  add(raw);
  add(raw.replace(/\([^)]*\)/g, ' '));

  return [...out].filter(Boolean);
}

/** Distancia de edición, con corte temprano: no interesa saber si es 9 o 12. */
export function distance(a, b, max = 3) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const prev = new Array(b.length + 1);
  const cur = new Array(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;
  for (let i = 1; i <= a.length; i++) {
    cur[0] = i;
    let best = cur[0];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      cur[j] = Math.min(cur[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (cur[j] < best) best = cur[j];
    }
    if (best > max) return max + 1; // toda la fila ya se pasó: no hay vuelta
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return prev[b.length];
}

/* Cuánto error de tipeo se perdona. Una letra en una palabra corta cambia
 * la palabra; en una larga suele ser el dedo. */
function tolerance(len) {
  if (len <= 4) return 0;
  if (len <= 7) return 1;
  return 2;
}

/**
 * Qué tan bien estuvo lo que escribiste.
 *
 *   ok    · era eso
 *   close · era eso con un error de tipeo
 *   no    · otra cosa
 *
 * `typedHtml` marca las letras que no coinciden, para que veas dónde se te
 * fue la mano en vez de tener que comparar a ojo.
 */
export function check(typed, expected) {
  const t = normalize(typed);
  if (!t) return { verdict: 'no', match: null, typedHtml: '' };

  const opts = variants(expected);
  const tBare = stripLeading(t);

  for (const opt of opts) {
    if (t === opt || tBare === opt) return { verdict: 'ok', match: opt, typedHtml: null };
  }

  // Una respuesta que contiene la correcta entera también vale: quien
  // escribe "darse cuenta de algo" sabe lo que quiere decir "darse cuenta".
  for (const opt of opts) {
    if (opt.length >= 5 && (t.includes(opt) || opt.includes(t))) {
      return { verdict: 'ok', match: opt, typedHtml: null };
    }
  }

  let best = null;
  let bestDist = Infinity;
  for (const opt of opts) {
    const d = distance(tBare || t, opt, 3);
    if (d < bestDist) { bestDist = d; best = opt; }
  }
  if (best !== null && bestDist <= tolerance(best.length)) {
    return { verdict: 'close', match: best, typedHtml: markDiff(typed, best) };
  }
  return { verdict: 'no', match: best, typedHtml: null };
}

/** Subraya en rojo las letras de `typed` que no están donde iban. */
function markDiff(typed, target) {
  const t = normalize(typed);
  let out = '';
  for (let i = 0; i < typed.length; i++) {
    const ch = typed[i];
    const n = normalize(ch);
    const ok = n && target.includes(n);
    out += ok ? escapeHtml(ch) : `<u>${escapeHtml(ch)}</u>`;
  }
  return t ? out : escapeHtml(typed);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* ── qué calificación permite cada resultado ──
 * El mismo trato que las pistas: si no te salió, "Bien" le mentiría al SRS.
 * Hacia abajo siempre podés; hacia arriba, no.
 */
export function capForVerdict(verdict) {
  if (verdict === 'ok') return EASY;
  if (verdict === 'close') return GOOD;
  return AGAIN;
}

/** La calificación que el ejercicio propone, dentro de lo que permite. */
export function suggestedQuality(verdict) {
  if (verdict === 'ok') return GOOD;
  if (verdict === 'close') return HARD;
  return AGAIN;
}

/* ── opciones para elegir ──
 * Los distractores tienen que ser plausibles o el ejercicio se contesta por
 * descarte sin saber nada: se buscan primero en el mismo mazo y nivel, que
 * es donde viven las palabras que de verdad se confunden entre sí.
 */
export function buildChoices(card, pool, reverse, count = 4) {
  const field = reverse ? 'en' : 'es';
  const right = card[field];
  const taken = new Set([normalize(right)]);

  const usable = pool.filter((c) => c.id !== card.id && c[field] && !taken.has(normalize(c[field])));
  const sameDeckLevel = usable.filter((c) => c.deck === card.deck && c.lvl === card.lvl);
  const sameDeck = usable.filter((c) => c.deck === card.deck);

  const picked = [];
  for (const tier of [sameDeckLevel, sameDeck, usable]) {
    for (const c of shuffle(tier)) {
      const key = normalize(c[field]);
      if (taken.has(key)) continue;
      taken.add(key);
      picked.push(c[field]);
      if (picked.length >= count - 1) break;
    }
    if (picked.length >= count - 1) break;
  }

  return shuffle([right, ...picked]).map((text) => ({ text, right: text === right }));
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
