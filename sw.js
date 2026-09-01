/*
 * sw.js — cachea la app para que funcione sin internet una vez instalada.
 * Estrategia: network-first para el HTML (así ves los cambios al deployar),
 * cache-first para el resto.
 */

const VERSION = 'lexi-v21';
const ASSETS = [
  './',
  './index.html',
  './css/style.css',
  './js/app.js',
  './js/srs.js',
  './js/store.js',
  './js/decks.js',
  './js/study.js',
  './js/texts.js',
  './js/sound.js',
  './js/sync.js',
  './data/core.json',
  './data/tech.json',
  './data/phrases.json',
  './data/phrasal.json',
  './data/grammar.json',
  './data/my-vocab.json',
  './data/texts.json',
  './manifest.webmanifest',
  './assets/icon.svg',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(VERSION).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // fuentes de Google, etc.

  const isDoc = req.mode === 'navigate' || url.pathname.endsWith('.html');

  if (isDoc) {
    e.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
    );
    return;
  }

  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      });
    })
  );
});
