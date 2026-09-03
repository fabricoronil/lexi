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
const MAX_EASE = 3.5; // evita que una racha de "Fácil" dispare el intervalo sin freno
const START_EASE = 2.5;

/* ── reaprendizaje ──
 * Olvidarse no borra lo aprendido: cuando volvés a una palabra que ya
 * habías tenido lejos, la recuperás más rápido que la primera vez, y cada
 * ciclo de olvido → reaprendizaje deja la huella más firme. SM-2 puro no
 * modela eso (manda la card de vuelta a 1 día como si fuera nueva), así que
 * acá, al graduarla de nuevo, le devolvemos un porcentaje del intervalo que
 * tenía cuando la fallaste — porcentaje que crece con cada reaprendizaje.
 */
const RELEARN_PCT = 0.25; // del intervalo perdido, la primera vez que la reaprendés
const RELEARN_PCT_STEP = 0.1; // cuánto más te devuelve cada reaprendizaje siguiente
const RELEARN_PCT_MAX = 0.6;
const RELEARN_CAP = 15; // días: una card recién fallada nunca vuelve directo a "aprendida"

/* Cuánto recupera el ease al acertar "Bien" una card que venía castigada.
 * Sin esto, ser honesto con "Otra vez"/"Difícil" hunde la card a ease 1.3
 * para siempre y te la comés cada tres días aunque ya te la sepas. */
const EASE_RECOVERY = 0.05;

/* Cuántos olvidos hacen falta para considerarla un hueso duro. Igual que Anki. */
export const LEECH_LAPSES = 8;

/* Cuántas calificaciones recientes se guardan por card (para las estadísticas). */
const RECENT_MAX = 10;

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
    againCount: 0, // cuántas veces le diste "Otra vez" (en cualquier estado)
    hardCount: 0, // cuántas veces le diste "Difícil"
    lapseInterval: 0, // intervalo que tenía la última vez que la olvidaste
    recent: [], // últimas calificaciones, de más vieja a más nueva
  };
}

/**
 * Devuelve una copia de la card con la próxima programación aplicada.
 * No muta el original.
 */
export function schedule(card, quality, now = Date.now(), fuzzed = true) {
  const c = { ...card };
  c.reps += 1;
  c.seen = now;

  // Contadores para saber después cuáles te cuestan de verdad. Con `|| 0`
  // porque las cards guardadas antes de esta versión no los traen.
  if (quality === AGAIN) c.againCount = (c.againCount || 0) + 1;
  else if (quality === HARD) c.hardCount = (c.hardCount || 0) + 1;
  c.recent = [...(c.recent || []), quality].slice(-RECENT_MAX);

  if (c.state === 'new' || c.state === 'learning') {
    return scheduleLearning(c, quality, now);
  }
  return scheduleReview(c, quality, now, fuzzed);
}

function scheduleLearning(c, quality, now) {
  if (quality === AGAIN) {
    c.state = 'learning';
    c.step = 0;
    c.due = now + LEARNING_STEPS[0] * MIN;
    return c;
  }

  if (quality === EASY) return graduate(c, now, true);

  if (quality === HARD) {
    // Repite el paso actual, un poco más lejos.
    c.state = 'learning';
    const mins = LEARNING_STEPS[Math.min(c.step, LEARNING_STEPS.length - 1)];
    c.due = now + mins * 1.5 * MIN;
    return c;
  }

  // GOOD: avanza un paso, o gradúa.
  const next = c.step + 1;
  if (next >= LEARNING_STEPS.length) return graduate(c, now, false);
  c.state = 'learning';
  c.step = next;
  c.due = now + LEARNING_STEPS[next] * MIN;
  return c;
}

/**
 * Pasa la card a "review". Si venía de un olvido, no arranca de cero: le
 * devuelve parte del intervalo que había perdido (ver `relearnInterval`).
 */
function graduate(c, now, easy) {
  const days = relearnInterval(c, easy);
  c.state = 'review';
  c.step = 0;
  c.interval = days;
  c.due = now + days * DAY;
  c.lapseInterval = 0; // ya se cobró: el próximo olvido guarda el suyo
  return c;
}

/**
 * Cuántos días esperar al graduar. Para una card nueva es el intervalo de
 * siempre (1 día, o 4 si le diste "Fácil"). Para una que ya sabías y
 * olvidaste, un porcentaje del intervalo perdido — más alto cuantas más
 * veces la hayas reaprendido, porque cada vuelta te queda más pegada.
 * Con tope, así una card recién fallada nunca salta directo a un mes.
 */
function relearnInterval(c, easy) {
  const base = easy ? EASY_INTERVAL : GRADUATING_INTERVAL;
  const lost = c.lapseInterval || 0;
  if (lost <= 0) return base;
  const relearns = Math.max(1, c.lapses || 1);
  const pct = Math.min(RELEARN_PCT_MAX, RELEARN_PCT + RELEARN_PCT_STEP * (relearns - 1));
  const kept = Math.round(lost * pct * (easy ? 1.3 : 1));
  return Math.min(RELEARN_CAP, Math.max(base, kept));
}

function scheduleReview(c, quality, now, fuzzed) {
  if (quality === AGAIN) {
    c.lapses += 1;
    c.ease = Math.max(MIN_EASE, c.ease - 0.2);
    c.lapseInterval = c.interval; // lo que perdiste hoy, para devolverte una parte al reaprenderla
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
    // Acertarla devuelve parte de lo que le sacaron los "Difícil"/"Otra vez":
    // una palabra que costó pero que ya sabés tiene que poder volver al ritmo
    // normal en vez de quedar repitiéndose para siempre.
    if (c.ease < START_EASE) c.ease = Math.min(START_EASE, c.ease + EASE_RECOVERY);
    interval = c.interval * c.ease;
  } else {
    c.ease = Math.min(MAX_EASE, c.ease + 0.15);
    interval = c.interval * c.ease * 1.3;
  }

  if (fuzzed) interval = fuzz(interval);
  interval = Math.max(1, Math.round(interval));
  // Nunca repetir el mismo intervalo dos veces seguidas.
  if (interval === c.interval) interval += 1;
  interval = Math.min(MAX_INTERVAL, interval); // el tope va último, si no se le escapa por el +1

  c.interval = interval;
  c.due = now + interval * DAY;
  return c;
}

/**
 * Desordena un poco el intervalo (±5%, más en intervalos largos) para que
 * cards que entraron juntas no queden vencidas siempre el mismo día — el
 * mismo truco que usa Anki para no acumular repasos en picos.
 */
function fuzz(interval) {
  if (interval < 2.5) return interval; // en pasos cortos el fuzz solo generaría ruido
  const pct = interval < 7 ? 0.1 : interval < 30 ? 0.07 : 0.05;
  const delta = interval * pct;
  return interval + (Math.random() * 2 - 1) * delta;
}

/**
 * Cuánto falta para volver a ver la card si respondés `quality`. Para los
 * botones — sin fuzz, para que el número mostrado sea estable y no cambie
 * cada vez que se re-renderiza la card.
 */
export function previewInterval(card, quality, now = Date.now()) {
  const next = schedule(card, quality, now, false);
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

/** Un hueso duro: la olvidaste tantas veces que conviene atacarla aparte. */
export function isLeech(card) {
  return (card.lapses || 0) >= LEECH_LAPSES;
}

/**
 * Cuánto te cuesta una card, de 0 a 1. Mezcla cuatro señales, porque
 * ninguna sola alcanza:
 *   - cuántas veces le diste "Otra vez"/"Difícil" sobre el total,
 *   - cuántas veces la olvidaste después de haberla aprendido (lapses),
 *   - qué tan castigado quedó su ease,
 *   - y cómo venís últimamente con ella, que pesa más que el historial viejo.
 */
export function difficultyScore(card) {
  const reps = card.reps || 0;
  if (!reps) return 0;
  const again = card.againCount || 0;
  const hard = card.hardCount || 0;

  const missRate = Math.min(1, (again + hard * 0.5) / reps);
  const lapseRate = Math.min(1, (card.lapses || 0) / 5);
  const easeDrop = Math.min(1, Math.max(0, (START_EASE - (card.ease ?? START_EASE)) / (START_EASE - MIN_EASE)));

  const recent = card.recent || [];
  const recentRate = recent.length
    ? recent.reduce((a, q) => a + (q === AGAIN ? 1 : q === HARD ? 0.5 : 0), 0) / recent.length
    : missRate;

  return 0.3 * missRate + 0.25 * lapseRate + 0.2 * easeDrop + 0.25 * recentRate;
}

/**
 * Si tiene sentido mostrarla entre "las que más te cuestan": una card con
 * dos respuestas no dice nada todavía, y una que nunca fallaste tampoco.
 */
export function struggles(card) {
  const misses = (card.againCount || 0) + (card.hardCount || 0);
  if ((card.lapses || 0) >= 1) return true;
  return (card.reps || 0) >= 3 && misses >= 2;
}
