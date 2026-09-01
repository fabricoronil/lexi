/*
 * decks.js — carga los mazos y arma la cola de la sesión del día.
 */

import * as store from './store.js';
import { isDue, isMature } from './srs.js';

export const DECKS = [
  { id: 'core', file: 'data/core.json', label: 'core', hint: 'A1–B1 esencial', color: '#7ab8f5' },
  { id: 'tech', file: 'data/tech.json', label: 'tech', hint: 'dev, videos, docs', color: '#6ee7a0' },
  { id: 'phrases', file: 'data/phrases.json', label: 'frases', hint: 'videos y reuniones', color: '#f5a742' },
  { id: 'phrasal', file: 'data/phrasal.json', label: 'phrasal verbs', hint: 'get up, give up, look for…', color: '#cba6f7' },
];

let all = [];

/** Id estable a partir del texto, así el progreso sobrevive a reordenar el JSON. */
function makeId(deckId, en) {
  return deckId + ':' + en.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export async function loadDecks() {
  if (all.length) return all;
  const results = await Promise.all(
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
  );
  all = results.flat();
  return all;
}

export function allCards() {
  return all;
}

export function activeCards() {
  const { decks } = store.get().settings;
  return all.filter((c) => decks[c.deck]);
}

export function byId(id) {
  return all.find((c) => c.id === id);
}

/**
 * Cola de la sesión: primero lo vencido, después las nuevas del día.
 * Las nuevas se limitan según el nivel de exigencia.
 */
export function buildQueue(now = Date.now()) {
  const s = store.get();
  const pool = activeCards();

  const due = [];
  const fresh = [];
  let midLearning = 0; // a medio aprender y todavía fuera de la ventana

  // Ventana de adelanto: una card en aprendizaje que vuelve en menos de 20 min
  // se puede hacer ya, para no dejarte mirando el reloj. Igual que Anki.
  const AHEAD = 20 * 60 * 1000;

  for (const card of pool) {
    const st = s.cards[card.id];
    if (!st) {
      fresh.push(card);
    } else if (isDue(st, now) || (st.state === 'learning' && st.due - now <= AHEAD)) {
      due.push(card);
    } else if (st.state === 'learning') {
      midLearning += 1;
    }
  }

  // Lo más atrasado primero.
  due.sort((a, b) => s.cards[a.id].due - s.cards[b.id].due);

  const remainingNew = Math.max(0, s.settings.newPerDay - store.newToday());
  // Las nuevas salen mezcladas pero de menor a mayor nivel.
  const order = { A1: 0, A2: 1, B1: 2, B2: 3 };
  fresh.sort((a, b) => (order[a.lvl] ?? 9) - (order[b.lvl] ?? 9));
  const picked = fresh.slice(0, remainingNew);
  const total = due.length + picked.length;

  // Si no queda nada pendiente, el día cuenta para la racha aunque no llegues
  // a la meta: no tiene sentido exigirte repasos que no existen.
  store.setCleared(total === 0 && midLearning === 0);

  return { due, fresh: picked, total, midLearning };
}

/** 'unseen' | 'learning' | 'learned', según el estado SRS guardado (si hay). */
export function cardStatus(card, s = store.get()) {
  const st = s.cards[card.id];
  if (!st) return 'unseen';
  return isMature(st) ? 'learned' : 'learning';
}

export function counts() {
  const s = store.get();
  let learned = 0;
  let learning = 0;
  let unseen = 0;
  for (const card of activeCards()) {
    const status = cardStatus(card, s);
    if (status === 'unseen') unseen += 1;
    else if (status === 'learned') learned += 1;
    else learning += 1;
  }
  return { learned, learning, unseen, total: learned + learning + unseen };
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
 * Cola de refuerzo: para cuando ya no queda nada pendiente por hoy pero
 * el usuario quiere seguir practicando. A propósito no respeta newPerDay
 * ni la meta diaria — es una vuelta extra, sin límite, sobre los mazos
 * activos (ya vistos o no). Se pide de a tandas mezcladas al azar.
 */
export function buildReinforceQueue(limit = 20) {
  const pool = activeCards();
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, limit);
}

export function deckProgress(deckId) {
  const s = store.get();
  const cards = all.filter((c) => c.deck === deckId);
  const started = cards.filter((c) => s.cards[c.id]).length;
  return { started, total: cards.length };
}
