/*
 * games.js — Contrarreloj: elegir la traducción correcta contra el reloj.
 *
 * A propósito no toca el SRS ni `store.cards`: esto es para practicar rápido
 * lo que ya viste, no para programar cuándo volvés a ver una palabra. El
 * puntaje vive aparte (ver `store.recordGameRun`), así que jugar mal un
 * minuto no le hace nada a la racha ni al progreso real.
 */

import { buildChoices } from './quiz.js';

export const SPEED_SECONDS = 60;
export const MIN_POOL = 4; // menos que esto y no se puede armar una opción de 4

// Por debajo de esta cantidad de palabras ya vistas, el juego no tiene tela:
// mejor completar con cualquier palabra activa que negarse a arrancar.
const SEEN_MIN = 10;

/**
 * De qué cards se puede tirar: primero las que ya viste (adivinar sobre algo
 * que nunca miraste no practica nada), y si no hay suficientes todavía —
 * recién empezando — cualquiera de los mazos activos.
 */
export function pickPool(allCards, seenCards) {
  return seenCards.length >= SEEN_MIN ? seenCards : allCards;
}

/** Una ronda: una card al azar (distinta de la anterior, si se puede) y sus cuatro opciones. */
export function nextRound(pool, reverse, excludeId) {
  const options = excludeId && pool.length > 1 ? pool.filter((c) => c.id !== excludeId) : pool;
  const card = options[Math.floor(Math.random() * options.length)];
  return { card, choices: buildChoices(card, pool, reverse) };
}

/*
 * ── puntaje ──
 * Acertar seguido suma más: el combo es lo que hace sentir el ritmo. Fallar
 * no resta puntos — ya perdiste el combo entero, restar encima sería
 * castigar dos veces lo mismo.
 */
const COMBO_CAP = 10;

export function scoreForHit(comboBefore) {
  return 10 + Math.min(comboBefore, COMBO_CAP) * 2;
}
