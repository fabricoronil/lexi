/*
 * Pruebas del Contrarreloj.
 *
 * Lo que no se puede romper acá es que el juego elija de dónde corresponde
 * (nunca de menos de cuatro cards, nunca la misma dos veces seguidas cuando
 * hay alternativa) y que el puntaje efectivamente premie el combo. El
 * comparador de respuestas ya lo prueba quiz.test.mjs — esto sólo agrega lo
 * propio del juego.
 *
 * Correlas con:  npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPool, nextRound, scoreForHit, MIN_POOL, SPEED_SECONDS } from '../js/games.js';

const POOL = [
  { id: 'a', en: 'to continue', es: 'seguir / continuar', deck: 'esencial', lvl: 'A2' },
  { id: 'b', en: 'to start', es: 'empezar', deck: 'esencial', lvl: 'A2' },
  { id: 'c', en: 'to stop', es: 'parar', deck: 'esencial', lvl: 'A2' },
  { id: 'd', en: 'to keep', es: 'mantener', deck: 'esencial', lvl: 'A2' },
  { id: 'e', en: 'to deploy', es: 'desplegar', deck: 'tech', lvl: 'B1' },
];

test('la ronda base dura un minuto y hacen falta al menos cuatro cards', () => {
  assert.equal(SPEED_SECONDS, 60);
  assert.equal(MIN_POOL, 4);
});

/* ── de dónde sale el pool ── */

test('con pocas palabras vistas, completa con cualquiera activa', () => {
  const seen = POOL.slice(0, 3); // menos que el mínimo
  assert.equal(pickPool(POOL, seen), POOL);
});

test('con vistas de sobra, juega sólo con esas', () => {
  const vistas = Array.from({ length: 12 }, (_, i) => ({ id: 'w' + i, en: 'w' + i, es: 'w' + i }));
  const todas = [...vistas, { id: 'nueva', en: 'nueva', es: 'nueva' }];
  assert.equal(pickPool(todas, vistas), vistas);
});

/* ── una ronda ── */

test('la ronda trae una card del pool y sus cuatro opciones', () => {
  const { card, choices } = nextRound(POOL, false, null);
  assert.ok(POOL.some((c) => c.id === card.id));
  assert.equal(choices.length, 4);
  assert.equal(choices.filter((o) => o.right).length, 1);
});

test('no repite la card anterior si hay otra para elegir', () => {
  const dos = [POOL[0], POOL[1]];
  for (let i = 0; i < 20; i++) {
    const { card } = nextRound(dos, false, POOL[0].id);
    assert.equal(card.id, POOL[1].id);
  }
});

test('con una sola card en el pool, la repite igual: no hay de otra', () => {
  const { card } = nextRound([POOL[0]], false, POOL[0].id);
  assert.equal(card.id, POOL[0].id);
});

/* ── puntaje ── */

test('acertar sin combo da el puntaje base', () => {
  assert.equal(scoreForHit(0), 10);
});

test('el combo suma puntos, hasta un techo', () => {
  assert.equal(scoreForHit(1), 12);
  assert.equal(scoreForHit(5), 20);
  assert.equal(scoreForHit(10), 30);
  assert.equal(scoreForHit(50), 30); // el techo no deja que un combo larguísimo rompa el puntaje
});
