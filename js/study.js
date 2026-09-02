/*
 * study.js — carga gramática y vocabulario propio para la sección Estudio.
 * Es contenido para leer, separado del sistema de mazos/SRS estilo Anki
 * (decks.js): no comparten datos ni estado. La gramática tiene un simple
 * check de "aprendido" guardado en store.js; el vocabulario no tiene estado
 * de progreso: es una tabla de consulta, como la de Notion de la que sale.
 * Lo único que se le suma son las palabras que anotás vos desde el celu
 * (`store.myWords()`), que se muestran en la misma lista y se editan a mano.
 */

import * as store from './store.js';

let levels = [];
let vocab = [];
let vocabLevels = [];
let frequency = null;

export async function loadStudyData() {
  if (levels.length && vocab.length) return;
  const [gRes, vRes] = await Promise.all([fetch('data/grammar.json'), fetch('data/my-vocab.json')]);
  if (!gRes.ok) throw new Error(`No pude cargar data/grammar.json (${gRes.status})`);
  if (!vRes.ok) throw new Error(`No pude cargar data/my-vocab.json (${vRes.status})`);
  const gData = await gRes.json();
  vocab = await vRes.json();
  levels = gData.levels;
}

export function allLevels() {
  return levels;
}

export function levelById(id) {
  return levels.find((l) => l.id === id);
}

export function topicById(id) {
  for (const lvl of levels) {
    for (const unit of lvl.units) {
      const topic = unit.topics.find((t) => t.id === id);
      if (topic) return { topic, level: lvl, unit };
    }
  }
  return null;
}

/**
 * El vocabulario del JSON más las palabras propias. Las propias van marcadas
 * con `own` porque son las únicas que se pueden editar o borrar desde la app.
 */
/*
 * Las listas grandes (niveles y frecuencia, ~3000 palabras entre las dos) se
 * bajan recién cuando entrás a Vocabulario, no en el arranque: no tiene
 * sentido hacerte esperar 120 KB para abrir la app y ponerte a repasar.
 */
export async function loadVocabSections() {
  if (vocabLevels.length && frequency) return;
  const [lRes, fRes] = await Promise.all([fetch('data/vocab-levels.json'), fetch('data/frequency.json')]);
  if (!lRes.ok) throw new Error(`No pude cargar data/vocab-levels.json (${lRes.status})`);
  if (!fRes.ok) throw new Error(`No pude cargar data/frequency.json (${fRes.status})`);
  vocabLevels = (await lRes.json()).levels;
  frequency = await fRes.json();
}

export function allVocabLevels() {
  return vocabLevels;
}

export function vocabLevelById(id) {
  return vocabLevels.find((l) => l.id === id);
}

export function vocabLevelCount(level) {
  return level.groups.reduce((n, g) => n + g.words.length, 0);
}

/** Las `size` más frecuentes, cortadas en bloques de a cien para poder navegarlas. */
export function frequencyBlocks(size) {
  const words = (frequency?.words || []).slice(0, size);
  const blocks = [];
  for (let i = 0; i < words.length; i += 100) {
    blocks.push({ name: `${i + 1} – ${Math.min(i + 100, words.length)}`, words: words.slice(i, i + 100) });
  }
  return blocks;
}

export function frequencyNote() {
  return frequency?.note || '';
}

export function allVocab() {
  const own = store.myWords().map((w) => ({ ...w, own: true }));
  return [...vocab, ...own];
}

/** Categorías y tipos ya usados, para sugerirlos al anotar una palabra nueva. */
export function vocabSuggestions() {
  const cats = new Set();
  const types = new Set();
  for (const w of allVocab()) {
    if (w.category) cats.add(w.category);
    if (w.type) types.add(w.type);
  }
  return {
    categories: [...cats].sort((a, b) => a.localeCompare(b)),
    types: [...types].sort((a, b) => a.localeCompare(b)),
  };
}

/**
 * Cuántos temas de gramática de un nivel ya se marcaron como aprendidos.
 * Los niveles sin contenido todavía (B1/B2 hoy) no tienen `units` — son
 * solo una lista de "lo que viene", así que no tienen progreso que contar.
 */
export function levelProgress(level) {
  if (!level.units) return { done: 0, total: 0 };
  let total = 0;
  let done = 0;
  for (const unit of level.units) {
    for (const topic of unit.topics) {
      total += 1;
      if (store.isTopicDone(topic.id)) done += 1;
    }
  }
  return { done, total };
}
