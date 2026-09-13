/*
 * Pruebas del planificador de repetición espaciada.
 *
 * El algoritmo es el corazón de Lexi: si programa mal, las palabras vuelven
 * cuando ya te las olvidaste o te comen el día repitiéndose de gusto, y eso
 * no se nota hasta semanas después. Estas pruebas fijan el comportamiento
 * que tiene que tener, para que cualquier cambio futuro que lo rompa se vea
 * en el momento y no dentro de un mes.
 *
 * Correlas con:  node --test test/
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  newCard, schedule, isDue, isMature, isLeech, difficultyScore, struggles,
  previewInterval, formatDelay, LEARNING_STEPS, AGAIN, HARD, GOOD, EASY,
} from '../js/srs.js';

const MIN = 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;
const T0 = Date.UTC(2026, 0, 1);

/** Califica una card varias veces seguidas, sin fuzz para que dé exacto. */
function run(card, qualities, now = T0) {
  let c = card;
  let t = now;
  for (const q of qualities) {
    c = schedule(c, q, t, false);
    t = c.due;
  }
  return c;
}

test('una card nueva arranca en cero y disponible', () => {
  const c = newCard('x');
  assert.equal(c.state, 'new');
  assert.equal(c.reps, 0);
  assert.equal(c.interval, 0);
  assert.equal(c.ease, 2.5);
  assert.ok(isDue(c, T0), 'una card nueva tiene que estar lista para verse');
});

test('los pasos de aprendizaje son 1 y 10 minutos antes de graduar', () => {
  let c = schedule(newCard('x'), GOOD, T0, false);
  assert.equal(c.state, 'learning');
  assert.equal(c.due - T0, LEARNING_STEPS[1] * MIN, 'el primer Bien lleva al paso de 10 minutos');

  c = schedule(c, GOOD, c.due, false);
  assert.equal(c.state, 'review', 'el segundo Bien la gradúa');
  assert.equal(c.interval, 1, 'gradúa a 1 día');
});

test('"Fácil" en una card nueva la gradúa directo a 4 días', () => {
  const c = schedule(newCard('x'), EASY, T0, false);
  assert.equal(c.state, 'review');
  assert.equal(c.interval, 4);
});

test('"Otra vez" en aprendizaje vuelve al primer paso', () => {
  let c = schedule(newCard('x'), GOOD, T0, false);
  c = schedule(c, AGAIN, c.due, false);
  assert.equal(c.state, 'learning');
  assert.equal(c.step, 0);
  assert.equal(c.due - c.seen, LEARNING_STEPS[0] * MIN);
});

test('el intervalo crece multiplicando por el ease', () => {
  // Graduada a 1 día; de ahí cada "Bien" multiplica por 2.5.
  const c = run(newCard('x'), [GOOD, GOOD]);
  assert.equal(c.interval, 1);

  const c2 = schedule(c, GOOD, c.due, false);
  assert.equal(c2.interval, 3, '1 × 2.5 = 2.5, redondeado a 3');

  const c3 = schedule(c2, GOOD, c2.due, false);
  assert.equal(c3.interval, 8, '3 × 2.5 = 7.5, redondeado a 8');
});

test('el intervalo nunca se repite dos veces seguidas', () => {
  // Con ease en el piso (1.3), 1 × 1.3 redondea a 1 y quedaría clavada.
  let c = run(newCard('x'), [GOOD, GOOD]);
  c.ease = 1.3;
  const next = schedule(c, GOOD, c.due, false);
  assert.ok(next.interval > c.interval, 'tiene que avanzar aunque sea un día');
});

test('"Difícil" castiga el ease y crece poco', () => {
  const c = run(newCard('x'), [GOOD, GOOD, GOOD, GOOD]); // interval 8, ease 2.5
  const hard = schedule(c, HARD, c.due, false);
  assert.ok(hard.ease < c.ease, 'el ease baja');
  assert.equal(hard.ease, 2.35);
  assert.equal(hard.interval, 10, '8 × 1.2 = 9.6, redondeado a 10');
});

test('el ease tiene piso en 1.30 y techo en 3.50', () => {
  let c = run(newCard('x'), [GOOD, GOOD]);
  for (let i = 0; i < 30; i++) c = schedule(c, HARD, c.due, false);
  assert.equal(c.ease, 1.3, 'por más que falles, no baja de 1.30');

  let d = run(newCard('y'), [GOOD, GOOD]);
  for (let i = 0; i < 30; i++) d = schedule(d, EASY, d.due, false);
  assert.equal(d.ease, 3.5, 'ni sube de 3.50 con una racha de Fácil');
});

test('el intervalo tiene techo en un año', () => {
  let c = run(newCard('x'), [GOOD, GOOD]);
  for (let i = 0; i < 40; i++) c = schedule(c, EASY, c.due, false);
  assert.equal(c.interval, 365);
});

/* ── los dos arreglos propios sobre SM-2 ── */

test('olvidar no borra lo aprendido: al reaprender devuelve parte del intervalo', () => {
  // Una palabra que ya estaba a 20 días y se escapó.
  let c = run(newCard('x'), [GOOD, GOOD]);
  c.interval = 20;

  const fallada = schedule(c, AGAIN, T0, false);
  assert.equal(fallada.state, 'learning');
  assert.equal(fallada.lapses, 1);
  assert.equal(fallada.lapseInterval, 20, 'se acuerda de lo que perdió');

  // SM-2 puro la mandaría de vuelta a 1 día; acá recupera el 25%.
  const regraduada = run(fallada, [GOOD, GOOD], fallada.due);
  assert.equal(regraduada.interval, 5, '25% de 20 días');
  assert.ok(regraduada.interval > 1, 'no arranca de cero como si fuera nueva');
});

test('cada reaprendizaje siguiente devuelve más que el anterior', () => {
  const recuperado = (lapses) => {
    let c = run(newCard('x'), [GOOD, GOOD]);
    c.interval = 40;
    c.lapses = lapses - 1;
    const f = schedule(c, AGAIN, T0, false);
    return run(f, [GOOD, GOOD], f.due).interval;
  };
  assert.equal(recuperado(1), 10, 'primera vez: 25% de 40');
  assert.equal(recuperado(2), 14, 'segunda: 35%');
  // 45% de 40 serían 18, pero el tope de reaprendizaje lo frena en 15: una
  // card recién fallada no puede volver directo a estar casi aprendida.
  assert.equal(recuperado(3), 15, 'tercera: el tope de 15 días manda');
  assert.ok(recuperado(9) >= recuperado(2), 'sigue subiendo hasta chocar el tope');
});

test('una card recién fallada nunca salta directo a "aprendida"', () => {
  let c = run(newCard('x'), [GOOD, GOOD]);
  c.interval = 300; // la tenías lejísimos
  const f = schedule(c, AGAIN, T0, false);
  const re = run(f, [GOOD, GOOD], f.due);
  assert.ok(re.interval <= 15, 'el tope de reaprendizaje la frena en 15 días');
  assert.ok(!isMature(re), 'y por lo tanto no cuenta como aprendida todavía');
});

test('el ease se recupera con "Bien": no existe el pozo sin salida', () => {
  // Una card castigada hasta el piso por respuestas honestas.
  let c = run(newCard('x'), [GOOD, GOOD]);
  for (let i = 0; i < 20; i++) c = schedule(c, HARD, c.due, false);
  assert.equal(c.ease, 1.3);

  // Ahora ya te la sabés: cada "Bien" devuelve un poco.
  for (let i = 0; i < 5; i++) c = schedule(c, GOOD, c.due, false);
  assert.ok(c.ease > 1.3, 'el ease sube de nuevo');
  assert.equal(Number(c.ease.toFixed(2)), 1.55);

  // Y nunca se pasa del valor de arranque por recuperación sola.
  for (let i = 0; i < 60; i++) c = schedule(c, GOOD, c.due, false);
  assert.ok(c.ease <= 2.5, 'la recuperación llega hasta el ease inicial, no más');
});

/* ── cómo se ve el progreso ── */

test('"aprendida" es pasar las tres semanas de intervalo', () => {
  const c = run(newCard('x'), [GOOD, GOOD]);
  assert.ok(!isMature({ ...c, interval: 20 }));
  assert.ok(isMature({ ...c, interval: 21 }));
  assert.ok(!isMature({ ...c, state: 'learning', interval: 30 }), 'en aprendizaje no cuenta');
});

test('un hueso duro son ocho olvidos', () => {
  assert.ok(!isLeech({ lapses: 7 }));
  assert.ok(isLeech({ lapses: 8 }));
});

test('la dificultad sube con los fallos y baja con los aciertos', () => {
  const facil = { reps: 10, againCount: 0, hardCount: 0, lapses: 0, ease: 2.5, recent: [2, 2, 3, 2] };
  const dificil = { reps: 10, againCount: 6, hardCount: 3, lapses: 4, ease: 1.3, recent: [0, 0, 1, 0] };
  assert.ok(difficultyScore(facil) < 0.15);
  assert.ok(difficultyScore(dificil) > 0.8);
  assert.equal(difficultyScore({ reps: 0 }), 0, 'sin historia no dice nada');
});

test('sólo entran a "las que más te cuestan" las que tienen historia', () => {
  assert.ok(!struggles({ reps: 2, againCount: 2, hardCount: 0, lapses: 0 }), 'dos respuestas no alcanzan');
  assert.ok(struggles({ reps: 5, againCount: 2, hardCount: 0, lapses: 0 }));
  assert.ok(struggles({ reps: 1, againCount: 0, hardCount: 0, lapses: 1 }), 'un olvido ya la marca');
});

/* ── lo que ve el usuario en los botones ── */

test('los cuatro botones muestran cuatro intervalos distintos y crecientes', () => {
  const c = run(newCard('x'), [GOOD, GOOD, GOOD]); // en review, interval 3
  const previews = [AGAIN, HARD, GOOD, EASY].map((q) => previewInterval(c, q, T0));
  assert.equal(previews.length, new Set(previews).size, 'ningún par de botones dice lo mismo');

  const dias = [HARD, GOOD, EASY].map((q) => schedule(c, q, T0, false).interval);
  assert.deepEqual(dias, [...dias].sort((a, b) => a - b), 'Difícil < Bien < Fácil');
  assert.equal(schedule(c, AGAIN, T0, false).interval, 0, 'Otra vez la saca de review');
});

test('la previsualización no cambia entre llamadas', () => {
  // Sin esto el número bailaría cada vez que se re-dibuja la card.
  const c = run(newCard('x'), [GOOD, GOOD, GOOD, GOOD]);
  const a = [0, 1, 2, 3].map((q) => previewInterval(c, q, T0));
  const b = [0, 1, 2, 3].map((q) => previewInterval(c, q, T0));
  assert.deepEqual(a, b);
});

test('calificar no toca la card original', () => {
  const c = run(newCard('x'), [GOOD, GOOD]);
  const copia = structuredClone(c);
  schedule(c, EASY, T0, false);
  assert.deepEqual(c, copia, 'schedule devuelve una card nueva, no muta la que recibe');
});

test('los tiempos se dicen en castellano y en la unidad que corresponde', () => {
  assert.equal(formatDelay(30 * 1000), '<1 min');
  assert.equal(formatDelay(10 * MIN), '10 min');
  assert.equal(formatDelay(3 * 60 * MIN), '3 h');
  assert.equal(formatDelay(DAY), '1 día');
  assert.equal(formatDelay(5 * DAY), '5 días');
  assert.equal(formatDelay(60 * DAY), '2 meses');
  assert.equal(formatDelay(365 * DAY), '1 años');
});

/* ── la prueba de verdad: meses de uso ── */

test('una palabra que siempre respondés bien termina en meses, no en días', () => {
  let c = newCard('x');
  let t = T0;
  for (let i = 0; i < 8; i++) {
    c = schedule(c, GOOD, t, false);
    t = c.due;
  }
  assert.ok(c.interval > 60, `después de 8 aciertos tendría que estar lejos, está en ${c.interval} días`);
  assert.ok(isMature(c), 'y contar como aprendida');
});

test('una palabra que siempre fallás se queda cerca y no se pierde', () => {
  let c = newCard('x');
  let t = T0;
  // Un año de "la gradúo y la olvido", que es el caso peor real.
  for (let i = 0; i < 12; i++) {
    c = schedule(c, GOOD, t, false); t = c.due;
    c = schedule(c, GOOD, t, false); t = c.due;
    c = schedule(c, AGAIN, t, false); t = c.due;
  }
  assert.ok(c.interval <= 15, 'nunca se va lejos');
  assert.ok(isLeech(c), 'y queda marcada como hueso duro para atacarla aparte');
  assert.ok(c.ease >= 1.3, 'el ease se mantiene en el piso, no se rompe');
});

test('el fuzz desordena los intervalos largos pero no los cortos', () => {
  // Por debajo de dos días y medio el fuzz no actúa: ahí sólo haría ruido.
  const corta = { ...run(newCard('x'), [GOOD, GOOD]), ease: 1.6 }; // 1 × 1.6 = 1.6
  const cortos = new Set();
  for (let i = 0; i < 40; i++) cortos.add(schedule(corta, GOOD, T0).interval);
  assert.equal(cortos.size, 1, 'en intervalos chicos el resultado es siempre el mismo');

  const largo = { ...corta, ease: 2.5, interval: 100 };
  const largos = new Set();
  for (let i = 0; i < 60; i++) largos.add(schedule(largo, GOOD, T0).interval);
  assert.ok(largos.size > 3, 'en los largos reparte, para no juntar picos de repaso');
  for (const v of largos) {
    assert.ok(Math.abs(v - 250) < 40, `${v} se fue demasiado lejos del valor esperado`);
  }
});
