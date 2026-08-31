/*
 * study.js — carga gramática y vocabulario propio para la sección Estudio.
 * Es contenido para leer, separado del sistema de mazos/SRS estilo Anki
 * (decks.js): no comparten datos ni estado. La gramática tiene un simple
 * check de "aprendido" guardado en store.js; el vocabulario es de solo
 * lectura, como la tabla de Notion de la que sale.
 */

import * as store from './store.js';

let levels = [];
let vocab = [];

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

export function allVocab() {
  return vocab;
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
