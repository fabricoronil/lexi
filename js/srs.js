/*
 * srs.js — planificador de repetición espaciada (SM-2, al estilo Anki).
 *
 * Estados de una card:
 *   new      · nunca la viste
 *   learning · la estás aprendiendo, se repite en minutos dentro de la sesión
 *   review   · ya la graduaste, vuelve en días
 *
 * Calidades (los 4 botones):
 *   0 = Otra vez · 1 = Difícil · 2 = Bien · 3 = Fácil
 */

export const AGAIN = 0;
export const HARD = 1;
export const GOOD = 2;
export const EASY = 3;

const MIN = 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

/* Pasos de aprendizaje, en minutos. Igual que el default de Anki. */
export const LEARNING_STEPS = [1, 10];
const GRADUATING_INTERVAL = 1; // días
const EASY_INTERVAL = 4; // días
const MAX_INTERVAL = 365; // días
const MIN_EASE = 1.3;
const START_EASE = 2.5;

/** Card nueva, lista para entrar al mazo. */
export function newCard(id) {
  return {
    id,
    state: 'new',
    step: 0,
    ease: START_EASE,
    interval: 0, // en días
    due: 0, // timestamp; 0 = disponible ya
    reps: 0,
    lapses: 0,
    seen: 0, // última vez que la respondiste
  };
}

/**
 * Devuelve una copia de la card con la próxima programación aplicada.
 * No muta el original.
 */
export function schedule(card, quality, now = Date.now()) {
  const c = { ...card };
  c.reps += 1;
  c.seen = now;

  if (c.state === 'new' || c.state === 'learning') {
    return scheduleLearning(c, quality, now);
  }
  return scheduleReview(c, quality, now);
}

function scheduleLearning(c, quality, now) {
  if (quality === AGAIN) {
    c.state = 'learning';
    c.step = 0;
    c.due = now + LEARNING_STEPS[0] * MIN;
    return c;
  }

  if (quality === EASY) {
    c.state = 'review';
    c.step = 0;
    c.interval = EASY_INTERVAL;
    c.due = now + EASY_INTERVAL * DAY;
    return c;
  }

  if (quality === HARD) {
    // Repite el paso actual, un poco más lejos.
    c.state = 'learning';
    const mins = LEARNING_STEPS[Math.min(c.step, LEARNING_STEPS.length - 1)];
    c.due = now + mins * 1.5 * MIN;
    return c;
  }

  // GOOD: avanza un paso, o gradúa.
  const next = c.step + 1;
  if (next >= LEARNING_STEPS.length) {
    c.state = 'review';
    c.step = 0;
    c.interval = GRADUATING_INTERVAL;
    c.due = now + GRADUATING_INTERVAL * DAY;
  } else {
    c.state = 'learning';
    c.step = next;
    c.due = now + LEARNING_STEPS[next] * MIN;
  }
  return c;
}

function scheduleReview(c, quality, now) {
  if (quality === AGAIN) {
    c.lapses += 1;
    c.ease = Math.max(MIN_EASE, c.ease - 0.2);
    c.state = 'learning';
    c.step = 0;
    c.interval = 0;
    c.due = now + LEARNING_STEPS[0] * MIN;
    return c;
  }

  let interval;
  if (quality === HARD) {
    c.ease = Math.max(MIN_EASE, c.ease - 0.15);
    interval = c.interval * 1.2;
  } else if (quality === GOOD) {
    interval = c.interval * c.ease;
  } else {
    c.ease = c.ease + 0.15;
    interval = c.interval * c.ease * 1.3;
  }

  interval = Math.min(MAX_INTERVAL, Math.max(1, Math.round(interval)));
  // Nunca repetir el mismo intervalo dos veces seguidas.
  if (interval === c.interval) interval += 1;

  c.interval = interval;
  c.due = now + interval * DAY;
  return c;
}

/** Cuánto falta para volver a ver la card si respondés `quality`. Para los botones. */
export function previewInterval(card, quality, now = Date.now()) {
  const next = schedule(card, quality, now);
  return formatDelay(next.due - now);
}

export function formatDelay(ms) {
  if (ms < 60 * 1000) return '<1 min';
  const mins = Math.round(ms / MIN);
  if (mins < 60) return mins + ' min';
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours + ' h';
  const days = Math.round(ms / DAY);
  if (days < 30) return days === 1 ? '1 día' : days + ' días';
  const months = Math.round(days / 30);
  if (months < 12) return months === 1 ? '1 mes' : months + ' meses';
  const years = (days / 365).toFixed(1).replace('.0', '');
  return years + ' años';
}

/** Una card está lista si su `due` ya pasó. */
export function isDue(card, now = Date.now()) {
  return card.due <= now;
}

/** Se considera aprendida cuando el intervalo ya pasó las tres semanas. */
export function isMature(card) {
  return card.state === 'review' && card.interval >= 21;
}
