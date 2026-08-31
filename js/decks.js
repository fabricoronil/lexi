/*
 * decks.js — carga los mazos y arma la cola de la sesión del día.
 */

import * as store from './store.js';
import { isDue } from './srs.js';

export const DECKS = [
  { id: 'core', file: 'data/core.json', label: 'core', hint: 'A1–B1 esencial', color: '#7ab8f5' },
  { id: 'tech', file: 'data/tech.json', label: 'tech', hint: 'dev, videos, docs', color: '#6ee7a0' },
  { id: 'phrases', file: 'data/phrases.json', label: 'frases', hint: 'videos y reuniones', color: '#f5a742' },
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

export function counts() {
  const s = store.get();
  let learned = 0;
  let learning = 0;
  let unseen = 0;
  for (const card of activeCards()) {
    const st = s.cards[card.id];
    if (!st) unseen += 1;
    else if (st.state === 'review' && st.interval >= 21) learned += 1;
    else learning += 1;
  }
  return { learned, learning, unseen, total: learned + learning + unseen };
}

export function deckProgress(deckId) {
  const s = store.get();
  const cards = all.filter((c) => c.deck === deckId);
  const started = cards.filter((c) => s.cards[c.id]).length;
  return { started, total: cards.length };
}
