/*
 * Pruebas de la práctica activa.
 *
 * Lo delicado acá es el comparador: si es muy estricto, te marca mal una
 * respuesta que sabías y el SRS te castiga una palabra que tenías; si es muy
 * flojo, te da por buena cualquier cosa y deja de medir. Estos casos fijan
 * dónde está la línea.
 *
 * Correlas con:  npm test
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  MODES, pickMode, normalize, variants, distance, check,
  capForVerdict, suggestedQuality, buildChoices,
} from '../js/quiz.js';
import { AGAIN, HARD, GOOD, EASY } from '../js/srs.js';

/* ── qué ejercicio le toca a cada card ── */

test('en Clásico nunca hay ejercicio: es el flujo de Anki de siempre', () => {
  const estados = [
    null,
    { reps: 0, state: 'new', interval: 0 },
    { reps: 3, state: 'learning', interval: 0 },
    { reps: 9, state: 'review', interval: 60 },
  ];
  for (const st of estados) {
    assert.equal(pickMode(st, { practice: 'off' }), MODES.REVEAL);
  }
});

test('Clásico es el modo por defecto', () => {
  assert.equal(pickMode({ reps: 5, state: 'review', interval: 30 }), MODES.REVEAL);
});

test('una palabra que ves por primera vez se reconoce, no se escribe', () => {
  for (const practice of ['smart', 'always']) {
    assert.equal(pickMode(null, { practice }), MODES.CHOICE);
    assert.equal(pickMode({ reps: 0, state: 'new' }, { practice }), MODES.CHOICE);
  }
});

test('en Mixto la exigencia sigue a la madurez de la palabra', () => {
  const o = { practice: 'smart', listen: true, canListen: true };
  assert.equal(pickMode({ reps: 2, state: 'learning', interval: 0 }, o), MODES.REVEAL,
    'todavía frágil: se mira entera');
  assert.equal(pickMode({ reps: 5, state: 'review', interval: 6 }, o), MODES.WRITE,
    'ya graduada: se escribe');
  assert.equal(pickMode({ reps: 12, state: 'review', interval: 40 }, o), MODES.LISTEN,
    'sabida hace rato: llega de oído');
});

test('sin voz en el dispositivo, el dictado no se ofrece', () => {
  const st = { reps: 12, state: 'review', interval: 40 };
  assert.equal(pickMode(st, { practice: 'smart', listen: true, canListen: false }), MODES.WRITE);
  assert.equal(pickMode(st, { practice: 'smart', listen: false, canListen: true }), MODES.WRITE);
});

test('en Exigente se escribe siempre, salvo la primera vez', () => {
  const o = { practice: 'always' };
  assert.equal(pickMode({ reps: 2, state: 'learning' }, o), MODES.WRITE);
  assert.equal(pickMode({ reps: 30, state: 'review', interval: 200 }, o), MODES.WRITE);
  assert.equal(pickMode({ reps: 0, state: 'new' }, o), MODES.CHOICE);
});

/* ── el comparador ── */

test('normalizar saca acentos, mayúsculas y puntuación', () => {
  assert.equal(normalize('  ¿Resolvió?  '), 'resolvio');
  assert.equal(normalize('Está   BIEN.'), 'esta bien');
});

test('una respuesta con varias alternativas acepta cualquiera', () => {
  const v = variants('darse cuenta / resolver');
  assert.ok(v.includes('darse cuenta'));
  assert.ok(v.includes('resolver'));
});

test('las aclaraciones entre paréntesis son opcionales', () => {
  const v = variants('levantar (un servicio)');
  assert.ok(v.includes('levantar'));
  assert.ok(v.includes('levantar un servicio'));
});

test('la distancia de edición corta temprano y no miente', () => {
  assert.equal(distance('casa', 'casa'), 0);
  assert.equal(distance('casa', 'cosa'), 1);
  assert.equal(distance('desplegar', 'deplegar'), 1);
  assert.ok(distance('bicicleta', 'resolver', 3) > 3, 'cuando se pasa del corte, lo dice');
});

test('se dan por buenas las respuestas que realmente lo son', () => {
  const ok = [
    ['continuar', 'seguir / continuar'],
    ['seguir', 'seguir / continuar'],
    ['Resolvió', 'resolvio'],
    ['darse cuenta', 'darse cuenta / resolver'],
    ['levantar', 'levantar (un servicio)'],
    ['figure out', 'to figure out'],
    ['to figure out', 'to figure out'],
    ['el servidor', 'servidor'],
    ['darse cuenta de algo', 'darse cuenta'],
  ];
  for (const [typed, expected] of ok) {
    assert.equal(check(typed, expected).verdict, 'ok', `"${typed}" para "${expected}"`);
  }
});

test('un error de tipeo es "casi", no un fallo', () => {
  assert.equal(check('contimuar', 'continuar').verdict, 'close');
  assert.equal(check('deplegar', 'desplegar').verdict, 'close');
  assert.equal(check('darse cuena', 'darse cuenta').verdict, 'close');
});

test('una palabra corta cambiada por una letra es otra palabra, no un tipeo', () => {
  // Perdonar una letra en palabras de cuatro letras daría por buena
  // cualquier cosa: "pero" y "perro" no significan lo mismo.
  assert.equal(check('pero', 'peso').verdict, 'no');
  assert.equal(check('casa', 'cosa').verdict, 'no');
});

test('una respuesta equivocada o vacía es un fallo', () => {
  assert.equal(check('bicicleta', 'darse cuenta').verdict, 'no');
  assert.equal(check('', 'algo').verdict, 'no');
  assert.equal(check('   ', 'algo').verdict, 'no');
});

test('"casi" muestra dónde se te fue la mano', () => {
  const r = check('contimuar', 'continuar');
  assert.ok(r.typedHtml.includes('<u>'), 'la letra de más va marcada');
});

/* ── el techo de calificación ──
 * Es el mismo trato que las pistas: si no te salió, "Bien" le mentiría al
 * SRS y te mandaría la palabra a un mes cuando en realidad no la sabías.
 */

test('el resultado del ejercicio limita hasta dónde podés votar', () => {
  assert.equal(capForVerdict('ok'), EASY, 'si la sabías, podés votar lo que quieras');
  assert.equal(capForVerdict('close'), GOOD, 'con un tipeo, el techo es Bien');
  assert.equal(capForVerdict('no'), AGAIN, 'si no te salió, va de vuelta a la cola');
});

test('la calificación sugerida es honesta con lo que pasó', () => {
  assert.equal(suggestedQuality('ok'), GOOD);
  assert.equal(suggestedQuality('close'), HARD);
  assert.equal(suggestedQuality('no'), AGAIN);
});

/* ── las opciones para elegir ── */

const POOL = [
  { id: 'a', en: 'to continue', es: 'seguir / continuar', deck: 'esencial', lvl: 'A2' },
  { id: 'b', en: 'to start', es: 'empezar', deck: 'esencial', lvl: 'A2' },
  { id: 'c', en: 'to stop', es: 'parar', deck: 'esencial', lvl: 'A2' },
  { id: 'd', en: 'to keep', es: 'mantener', deck: 'esencial', lvl: 'A2' },
  { id: 'e', en: 'to deploy', es: 'desplegar', deck: 'tech', lvl: 'B1' },
];

test('siempre hay una opción correcta y sólo una', () => {
  const opts = buildChoices(POOL[0], POOL, false);
  assert.equal(opts.length, 4);
  assert.equal(opts.filter((o) => o.right).length, 1);
  assert.equal(opts.find((o) => o.right).text, 'seguir / continuar');
});

test('las opciones no se repiten entre sí', () => {
  for (let i = 0; i < 30; i++) {
    const textos = buildChoices(POOL[0], POOL, false).map((o) => o.text);
    assert.equal(textos.length, new Set(textos).size);
  }
});

test('la correcta no cae siempre en el mismo lugar', () => {
  const posiciones = new Set();
  for (let i = 0; i < 60; i++) {
    posiciones.add(buildChoices(POOL[0], POOL, false).findIndex((o) => o.right));
  }
  assert.ok(posiciones.size > 1, 'si no, se contesta sin leer');
});

test('en modo inverso las opciones son las palabras en inglés', () => {
  const opts = buildChoices(POOL[0], POOL, true);
  assert.equal(opts.find((o) => o.right).text, 'to continue');
});

test('con pocas palabras disponibles no se rompe: da las que haya', () => {
  const opts = buildChoices(POOL[0], POOL.slice(0, 2), false);
  assert.ok(opts.length >= 2);
  assert.equal(opts.filter((o) => o.right).length, 1);
});
