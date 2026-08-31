/*
 * texts.js — carga los textos de lectura (estilo reading de examen Cambridge)
 * por nivel, para la subsección Textos dentro de Estudio. Mismo patrón que
 * study.js: solo carga y expone, sin tocar el estado — eso lo maneja store.js.
 */

let levels = [];

export async function loadTextsData() {
  if (levels.length) return;
  const res = await fetch('data/texts.json');
  if (!res.ok) throw new Error(`No pude cargar data/texts.json (${res.status})`);
  const data = await res.json();
  levels = data.levels;
}

export function allLevels() {
  return levels;
}

export function levelById(id) {
  return levels.find((l) => l.id === id);
}

export function textById(id) {
  for (const lvl of levels) {
    const text = lvl.texts.find((t) => t.id === id);
    if (text) return { text, level: lvl };
  }
  return null;
}
