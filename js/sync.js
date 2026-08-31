/*
 * sync.js — sincroniza el progreso entre dispositivos usando un Gist de
 * GitHub como backend. Leer el gist no necesita token (es la forma en que
 * cualquier dispositivo puede "bajar" el último estado solo). Escribir sí
 * necesita un token pegado una vez en Ajustes — sin él, este dispositivo
 * queda de solo lectura hasta que lo cargues.
 */

const GIST_ID = '98cab4c5b062bf376f522e18b7d8e4a9';
const GIST_FILENAME = 'lexi-progress.json';
const API_URL = `https://api.github.com/gists/${GIST_ID}`;
const TOKEN_KEY = 'lexi.sync.token';
const PUSH_DELAY = 4000;

let pushTimer = null;
let latestState = null;
let pushing = false;
let pendingAfterPush = false;
let lastPushError = null;
let lastPushAt = null;

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY) || '';
  } catch {
    return '';
  }
}

export function setToken(token) {
  try {
    const clean = (token || '').trim();
    if (clean) localStorage.setItem(TOKEN_KEY, clean);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    // localStorage puede fallar en modo privado; no es crítico acá.
  }
}

export function hasToken() {
  return !!getToken();
}

export function status() {
  return { hasToken: hasToken(), lastPushError, lastPushAt };
}

/** Trae el último estado guardado en el gist. null si no hay internet o falla. */
export async function pull() {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    const res = await fetch(API_URL, {
      headers: { Accept: 'application/vnd.github+json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const gist = await res.json();
    const file = gist.files?.[GIST_FILENAME];
    if (!file?.content) return null;
    return JSON.parse(file.content);
  } catch {
    return null;
  }
}

/** Programa un push del estado actual, juntando cambios seguidos en uno solo. */
export function schedulePush(state) {
  latestState = state;
  if (!hasToken()) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(pushNow, PUSH_DELAY);
}

/** Fuerza el push inmediato (por ejemplo, apenas se pega el token). */
export function pushNow() {
  return doPush();
}

async function doPush() {
  const token = getToken();
  if (!token || !latestState) return;
  if (pushing) {
    pendingAfterPush = true;
    return;
  }
  pushing = true;
  try {
    const res = await fetch(API_URL, {
      method: 'PATCH',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ files: { [GIST_FILENAME]: { content: JSON.stringify(latestState) } } }),
      keepalive: true,
    });
    if (res.ok) {
      lastPushError = null;
      lastPushAt = Date.now();
    } else {
      lastPushError = res.status === 401 || res.status === 403 ? 'token' : `http-${res.status}`;
    }
  } catch {
    lastPushError = 'network';
  } finally {
    pushing = false;
    if (pendingAfterPush) {
      pendingAfterPush = false;
      doPush();
    }
  }
}
