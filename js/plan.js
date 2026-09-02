/*
 * plan.js — proyecta cuántos repasos te va a pedir el mazo en los próximos
 * días, para poder recomendar una meta diaria que se banque el ritmo de
 * cards nuevas elegido.
 *
 * La idea: una card nueva no es un repaso, es muchos. El día que entra te
 * come los pasos de aprendizaje, y después vuelve al día siguiente, a los
 * 3 días, a los 8… Si la meta diaria es más chica que eso, la racha se
 * "cumple" a mitad de camino y el atraso crece sin que se note. Si es más
 * grande, es inalcanzable. La meta útil es el promedio real de trabajo.
 *
 * No es una simulación con azar: cada card se reparte en fracciones
 * (probabilidad de fallar vs. acertar) y se propaga por el calendario, así
 * el número recomendado es estable y no cambia cada vez que abrís Ajustes.
 */

import * as store from './store.js';
import * as decks from './decks.js';

const DAY = 24 * 60 * 60 * 1000;

const HORIZON = 14; // días proyectados; más allá el mazo ya cambió demasiado
const P_AGAIN = 0.12; // cuán seguido se falla una card ya graduada
const NEW_PRESSES = 2.4; // botones que come una card nueva el día que entra (pasos de 1 y 10 min)
const LAPSE_PRESSES = 1.6; // los pasos extra que cuesta una card fallada, el mismo día
const MIN_WEIGHT = 0.02; // fracciones más chicas que esto no mueven la aguja
const GOAL_MIN = 5;
const GOAL_MAX = 150;
const GOAL_STEP = 5; // el paso del slider de Ajustes

/**
 * Repasos (botones apretados) esperados por día, desde hoy hasta HORIZON.
 * `days[0]` es hoy e incluye lo que ya está vencido, así que suele ser un
 * pico si venís atrasado.
 */
export function projectDailyLoad(newPerDay = store.get().settings.newPerDay, now = Date.now()) {
  const s = store.get();
  const days = new Array(HORIZON + 1).fill(0);
  const queue = [];
  let unseen = 0;

  for (const card of decks.activeCards()) {
    const st = s.cards[card.id];
    if (!st) {
      unseen += 1;
      continue;
    }
    const day = Math.max(0, Math.round((st.due - now) / DAY));
    if (day > HORIZON) continue;
    queue.push({ day, weight: 1, interval: Math.max(1, st.interval || 1), ease: st.ease || 2.5 });
  }

  // Las nuevas que van a ir entrando, hasta que se acaben las que no viste.
  let left = Math.max(0, unseen - store.newToday());
  for (let d = 0; d <= HORIZON; d++) {
    const n = Math.min(newPerDay, left);
    if (!n) break;
    left -= n;
    days[d] += n * NEW_PRESSES;
    queue.push({ day: d + 1, weight: n, interval: 1, ease: 2.5 });
  }

  // Cada evento se procesa una vez y engendra sus dos futuros posibles.
  // Como los hijos siempre caen en un día posterior y las fracciones se
  // achican, la cola se agota sola.
  for (let i = 0; i < queue.length; i++) {
    const ev = queue[i];
    if (ev.day > HORIZON || ev.weight < MIN_WEIGHT) continue;
    days[ev.day] += ev.weight;

    const again = ev.weight * P_AGAIN;
    days[ev.day] += again * LAPSE_PRESSES;
    queue.push({ day: ev.day + 1, weight: again, interval: 1, ease: Math.max(1.3, ev.ease - 0.2) });

    const next = Math.max(1, Math.round(ev.interval * ev.ease));
    queue.push({ day: ev.day + next, weight: ev.weight * (1 - P_AGAIN), interval: next, ease: ev.ease });
  }

  return days;
}

/** Promedio de repasos por día de acá en adelante, sin contar el atraso de hoy. */
export function averageLoad(newPerDay, now = Date.now()) {
  const rest = projectDailyLoad(newPerDay, now).slice(1);
  if (!rest.length) return 0;
  return rest.reduce((a, b) => a + b, 0) / rest.length;
}

/** La meta diaria que hace falta para no acumular atraso con ese ritmo de nuevas. */
export function recommendedGoal(newPerDay = store.get().settings.newPerDay, now = Date.now()) {
  const avg = averageLoad(newPerDay, now);
  const rounded = Math.round(avg / GOAL_STEP) * GOAL_STEP;
  return Math.min(GOAL_MAX, Math.max(GOAL_MIN, rounded));
}

/** Minutos estimados por día para una meta dada (a unas 4 cards por minuto). */
export function minutesFor(goal) {
  return Math.max(2, Math.round(goal / 4));
}

/**
 * Cómo le queda la meta actual al ritmo elegido: 'ok' si acompaña,
 * 'baja' si te va a dejar atraso todos los días, 'alta' si pide más
 * repasos de los que el mazo va a tener para darte.
 */
export function goalVerdict(goal, recommended) {
  if (goal < recommended * 0.75) return 'baja';
  if (goal > recommended * 1.35) return 'alta';
  return 'ok';
}
