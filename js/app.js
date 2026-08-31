/*
 * app.js — pega todo: vistas, sesión de repaso, estadísticas y ajustes.
 */

import * as store from './store.js';
import * as decks from './decks.js';
import { schedule, previewInterval, formatDelay, AGAIN, GOOD } from './srs.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const VIEWS = ['home', 'review', 'done', 'stats', 'settings'];
let session = null;

/* ═══════════ arranque ═══════════ */

async function boot() {
  try {
    await decks.loadDecks();
  } catch (err) {
    const msg = $('#boot-msg');
    msg.className = 'boot-msg error';
    msg.textContent = 'No pude cargar los mazos. Si abriste el archivo directo desde la carpeta, subilo a un servidor (o usá la versión publicada).';
    console.error(err);
    return;
  }
  store.load();
  $('#boot').classList.add('gone');
  $('#app').hidden = false;
  setTimeout(() => $('#boot').remove(), 300);

  wireNav();
  wireReview();
  wireSettings();
  renderHome();
  renderSettings();
  registerServiceWorker();
}

/* ═══════════ navegación ═══════════ */

function show(view) {
  for (const v of VIEWS) {
    const el = $('#view-' + v);
    if (el) el.hidden = v !== view;
  }
  $('#tabbar').hidden = view === 'review';
  $$('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
  window.scrollTo(0, 0);

  if (view === 'home') renderHome();
  if (view === 'stats') renderStats();
  if (view === 'settings') renderSettings();
}

function wireNav() {
  $$('#tabbar button').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));
  $('#streak-chip').addEventListener('click', () => show('stats'));
  $('#btn-home').addEventListener('click', () => show('home'));
  $('#btn-more').addEventListener('click', () => startSession(true));
  $('#btn-start').addEventListener('click', () => startSession(false));
}

/* ═══════════ inicio ═══════════ */

function renderHome() {
  const s = store.get();
  const q = decks.buildQueue();
  const c = decks.counts();
  const done = store.reviewsToday();
  const goal = s.settings.dailyGoal;

  const fmt = new Intl.DateTimeFormat('es-AR', { weekday: 'long', day: 'numeric', month: 'long' });
  const label = fmt.format(new Date());
  $('#today-label').textContent = label.charAt(0).toUpperCase() + label.slice(1);

  const streak = store.liveStreak();
  $('#streak-count').textContent = streak;
  $('#streak-chip').classList.toggle('cold', streak === 0);

  const met = store.goalMet();
  $('#done-today').textContent = Math.min(done, goal);
  $('#goal-today').textContent = goal;
  const pct = met ? 1 : goal ? Math.min(1, done / goal) : 0;
  $('#ring-fg').style.strokeDashoffset = String(565.5 * (1 - pct));

  $('#n-new').textContent = q.fresh.length;
  $('#n-due').textContent = q.due.length;
  $('#n-learned').textContent = c.learned;

  const btn = $('#btn-start');
  const note = $('#cta-note');
  if (q.total > 0) {
    btn.disabled = false;
    $('#cta-label').textContent = done > 0 ? 'Seguir repasando' : 'Empezar repaso';
    note.textContent = met
      ? 'Meta cumplida — lo que hagas ahora es yapa.'
      : `Te faltan ${goal - done} respuestas para salvar el día.`;
  } else {
    btn.disabled = true;
    $('#cta-label').textContent = 'Nada pendiente';
    if (done === 0) {
      note.textContent = 'Sin cards vencidas hoy. Volvé mañana o subí las nuevas por día.';
    } else {
      note.textContent = c.unseen > 0
        ? 'Vaciaste la cola: el día ya cuenta. Subí el nivel en Ajustes si querés más.'
        : 'Terminaste todos los mazos activos. Bien ahí.';
    }
  }

  const list = $('#deck-list');
  list.innerHTML = '';
  for (const deck of decks.DECKS) {
    if (!s.settings.decks[deck.id]) continue;
    const p = decks.deckProgress(deck.id);
    const pctDeck = p.total ? Math.round((p.started / p.total) * 100) : 0;
    const el = document.createElement('div');
    el.className = 'deck';
    el.innerHTML = `
      <span class="deck-dot" style="background:${deck.color}"></span>
      <div class="deck-body">
        <div class="deck-top"><span>${deck.label}</span><em>${p.started}/${p.total}</em></div>
        <div class="deck-track"><div class="deck-fill" style="width:${pctDeck}%;background:${deck.color}"></div></div>
      </div>`;
    list.appendChild(el);
  }
}

/* ═══════════ sesión de repaso ═══════════ */

function startSession(extra) {
  const q = decks.buildQueue();
  let queue = [...q.due];
  // Intercalar las nuevas cada 3 repasos, para que no lleguen todas juntas.
  q.fresh.forEach((card, i) => {
    const at = Math.min(queue.length, (i + 1) * 3);
    queue.splice(at, 0, card);
  });

  if (!queue.length) {
    if (extra) toast('No hay nada más para repasar ahora mismo.');
    show('home');
    return;
  }

  session = { queue, index: 0, answered: 0, planned: queue.length, revealed: false };
  show('review');
  renderCard();
}

function currentCard() {
  return session ? session.queue[session.index] : null;
}

function renderCard() {
  const card = currentCard();
  if (!card) return finishSession();

  const s = store.get();
  const reverse = s.settings.reverse;
  const st = store.cardState(card.id);

  session.revealed = false;
  $('#card').classList.remove('revealed');
  $('#card-back').hidden = true;
  $('#btn-reveal').hidden = false;
  $('#grade-grid').hidden = true;
  $('#grade-hint').textContent = 'Tocá la card o la barra espaciadora para ver la respuesta';

  const front = reverse ? card.es : card.en;
  const back = reverse ? card.en : card.es;

  const prompt = $('#card-prompt');
  prompt.textContent = front;
  prompt.className = 'prompt' + (front.length > 34 ? ' xlong' : front.length > 20 ? ' long' : '');
  $('#card-answer').textContent = back;

  $('#card-example').innerHTML = highlight(card.ex, card.en);
  $('#card-example-es').textContent = card.exEs || '';

  const seen = st.reps === 0 ? 'nueva' : `vista ${st.reps} ${st.reps === 1 ? 'vez' : 'veces'}`;
  $('#card-tags').innerHTML = `
    <span class="tag accent">${deckLabel(card.deck)}</span>
    <span class="tag">${card.lvl}</span>
    <span class="tag">${seen}</span>`;

  $('#session-count').textContent = `${session.answered}/${session.planned}`;
  const pct = session.planned ? (session.answered / session.planned) * 100 : 0;
  $('#session-fill').style.width = pct + '%';

  if (s.settings.autoSpeak && !reverse) speak(card.en);
}

function deckLabel(id) {
  const d = decks.DECKS.find((x) => x.id === id);
  return d ? d.label : id;
}

function highlight(sentence, term) {
  if (!sentence) return '';
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const clean = term.replace(/^(to|a|an|the)\s+/i, '').trim();
  const safe = sentence.replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]));
  if (!clean) return safe;
  try {
    return safe.replace(new RegExp(esc(clean), 'i'), (m) => `<mark>${m}</mark>`);
  } catch {
    return safe;
  }
}

function reveal() {
  if (!session || session.revealed) return;
  const card = currentCard();
  if (!card) return;
  session.revealed = true;
  $('#card').classList.add('revealed');
  $('#card-back').hidden = false;
  $('#btn-reveal').hidden = true;
  $('#grade-grid').hidden = false;
  $('#grade-hint').textContent = 'Elegí según cuánto te costó recordarla';

  const st = store.cardState(card.id);
  for (let q = 0; q <= 3; q++) {
    $('#iv-' + q).textContent = previewInterval(st, q);
  }
  if (store.get().settings.autoSpeak && store.get().settings.reverse) speak(card.en);
}

function answer(quality) {
  if (!session || !session.revealed) return;
  const card = currentCard();
  if (!card) return;

  const st = store.cardState(card.id);
  const wasNew = st.reps === 0;
  const next = schedule(st, quality);
  store.putCard(next);
  if (wasNew) store.recordNewCard();

  session.answered += 1;
  session.queue.splice(session.index, 1);

  // Si hay que volver a verla dentro de la sesión, la reinsertamos más adelante.
  const soon = next.due - Date.now() < 20 * 60 * 1000;
  if (soon) {
    const gap = quality === AGAIN ? 3 : 8;
    const at = Math.min(session.queue.length, session.index + gap);
    session.queue.splice(at, 0, card);
  }

  // "No queda nada pendiente" incluye lo que todavía está dando vueltas en
  // esta sesión, no sólo lo que vence más adelante.
  const pending = decks.buildQueue().total + session.queue.length;
  store.setCleared(pending === 0);
  store.recordAnswer();

  if (session.index >= session.queue.length) session.index = 0;
  if (!session.queue.length) return finishSession();
  renderCard();
}

function finishSession() {
  const streak = store.liveStreak();
  const met = store.goalMet();
  $('#done-count').textContent = session ? session.answered : 0;
  $('#done-streak').textContent = streak;
  $('#done-title').textContent = met ? '¡Día salvado!' : 'Buena sesión';
  const s = store.get();
  const falta = Math.max(0, s.settings.dailyGoal - store.reviewsToday());
  $('#done-sub').textContent = met
    ? `Racha de ${streak} ${streak === 1 ? 'día' : 'días'}. Volvé mañana antes de medianoche.`
    : `Te faltan ${falta} respuestas para que cuente el día.`;
  const q = decks.buildQueue();
  $('#btn-more').hidden = q.total === 0;
  session = null;
  show('done');
}

function wireReview() {
  $('#btn-reveal').addEventListener('click', reveal);
  $('#card').addEventListener('click', reveal);
  $('#btn-speak').addEventListener('click', (e) => {
    e.stopPropagation();
    const card = currentCard();
    if (card) speak(card.en);
  });
  $$('#grade-grid .grade').forEach((b) => {
    b.addEventListener('click', () => answer(Number(b.dataset.q)));
  });
  $('#btn-quit').addEventListener('click', () => {
    session = null;
    show('home');
  });

  document.addEventListener('keydown', (e) => {
    if ($('#view-review').hidden) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      session && session.revealed ? answer(GOOD) : reveal();
    } else if (['1', '2', '3', '4'].includes(e.key)) {
      answer(Number(e.key) - 1);
    } else if (e.key === 'Escape') {
      session = null;
      show('home');
    }
  });
}

/* ═══════════ voz ═══════════ */

let voice = null;
function pickVoice() {
  if (!('speechSynthesis' in window)) return null;
  const all = speechSynthesis.getVoices();
  if (!all.length) return null;
  return (
    all.find((v) => /en-GB/i.test(v.lang)) ||
    all.find((v) => /en-US/i.test(v.lang)) ||
    all.find((v) => /^en/i.test(v.lang)) ||
    null
  );
}
if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => { voice = pickVoice(); };
}

function speak(text) {
  if (!('speechSynthesis' in window) || !text) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text.replace(/^(to|a|an)\s+/i, ''));
    voice = voice || pickVoice();
    if (voice) u.voice = voice;
    u.lang = voice ? voice.lang : 'en-US';
    u.rate = 0.92;
    speechSynthesis.speak(u);
  } catch (e) {
    console.warn('Sin voz disponible:', e);
  }
}

/* ═══════════ progreso ═══════════ */

function renderStats() {
  const s = store.get();
  const c = decks.counts();

  $('#st-streak').innerHTML = `${store.liveStreak()} <small>días</small>`;
  $('#st-best').innerHTML = `${s.streak.best} <small>días</small>`;

  const total = Object.values(s.history).reduce((a, b) => a + b, 0);
  $('#st-total').textContent = `${total.toLocaleString('es-AR')} repasos`;

  // Heatmap: 18 semanas, empezando un lunes.
  const map = $('#heatmap');
  map.innerHTML = '';
  const today = new Date();
  const start = new Date(today);
  start.setDate(start.getDate() - 125);
  const cells = [];
  for (let i = 0; i < 126; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const n = s.history[store.todayKey(d)] || 0;
    cells.push({ n, key: store.todayKey(d) });
  }
  // El grid va por columnas de semana, así que reordenamos: fila = día, col = semana.
  for (let row = 0; row < 7; row++) {
    for (let col = 0; col < 18; col++) {
      const cell = cells[col * 7 + row];
      if (!cell) continue;
      const i = document.createElement('i');
      i.className = 'lv' + level(cell.n, s.settings.dailyGoal);
      i.title = `${cell.key}: ${cell.n} repasos`;
      map.appendChild(i);
    }
  }

  $('#st-cards-label').textContent = `Las ${c.total} cards`;
  const pc = (n) => (c.total ? (n / c.total) * 100 : 0);
  $('#sb-learned').style.width = pc(c.learned) + '%';
  $('#sb-learning').style.width = pc(c.learning) + '%';
  $('#sb-unseen').style.width = pc(c.unseen) + '%';
  $('#st-learned').textContent = c.learned;
  $('#st-learning').textContent = c.learning;
  $('#st-unseen').textContent = c.unseen;

  // Últimos 7 días.
  const bars = $('#bars');
  bars.innerHTML = '';
  const names = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
  const week = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    week.push({ n: s.history[store.todayKey(d)] || 0, label: names[d.getDay()], today: i === 0 });
  }
  const max = Math.max(s.settings.dailyGoal, ...week.map((w) => w.n), 1);
  for (const w of week) {
    const col = document.createElement('div');
    col.className = 'bar-col';
    col.innerHTML = `<div class="bar${w.today ? ' today' : ''}" style="height:${Math.round((w.n / max) * 62)}px" title="${w.n} repasos"></div><em>${w.label}</em>`;
    bars.appendChild(col);
  }
}

function level(n, goal) {
  if (!n) return 0;
  const r = n / Math.max(1, goal);
  if (r < 0.25) return 1;
  if (r < 0.6) return 2;
  if (r < 1) return 3;
  return 4;
}

/* ═══════════ ajustes ═══════════ */

function renderSettings() {
  const s = store.get();
  $$('#presets button').forEach((b) => b.classList.toggle('on', b.dataset.preset === s.settings.preset));
  $('#s-new').value = s.settings.newPerDay;
  $('#s-goal').value = s.settings.dailyGoal;
  $('#v-new').textContent = s.settings.newPerDay;
  $('#v-goal').textContent = s.settings.dailyGoal;
  $('#goal-note').textContent = `Con la meta en ${s.settings.dailyGoal} mantenés la racha en unos ${Math.max(2, Math.round(s.settings.dailyGoal / 4))} minutos por día.`;

  $('#t-speak').classList.toggle('on', s.settings.autoSpeak);
  $('#t-reverse').classList.toggle('on', s.settings.reverse);

  const box = $('#deck-toggles');
  box.innerHTML = '';
  for (const deck of decks.DECKS) {
    const p = decks.deckProgress(deck.id);
    const on = !!s.settings.decks[deck.id];
    const row = document.createElement('div');
    row.className = 'opt opt-mono';
    row.innerHTML = `
      <span class="deck-dot" style="background:${deck.color}"></span>
      <div class="opt-text"><span>${deck.label}</span><small>${p.total} cards · ${deck.hint}</small></div>
      <button class="switch${on ? ' on' : ''}" role="switch" type="button"><i></i></button>`;
    row.querySelector('.switch').addEventListener('click', () => {
      const next = { ...store.get().settings.decks, [deck.id]: !on };
      if (!Object.values(next).some(Boolean)) return toast('Dejá al menos un mazo activo.');
      store.setSettings({ decks: next });
      renderSettings();
    });
    box.appendChild(row);
  }
}

function wireSettings() {
  $$('#presets button').forEach((b) => {
    b.addEventListener('click', () => {
      const p = store.PRESETS[b.dataset.preset];
      store.setSettings({ preset: b.dataset.preset, newPerDay: p.newPerDay, dailyGoal: p.dailyGoal });
      renderSettings();
    });
  });

  $('#s-new').addEventListener('input', (e) => {
    store.setSettings({ newPerDay: Number(e.target.value), preset: 'custom' });
    renderSettings();
  });
  $('#s-goal').addEventListener('input', (e) => {
    store.setSettings({ dailyGoal: Number(e.target.value), preset: 'custom' });
    renderSettings();
  });

  $('#t-speak').addEventListener('click', () => {
    store.setSettings({ autoSpeak: !store.get().settings.autoSpeak });
    renderSettings();
  });
  $('#t-reverse').addEventListener('click', () => {
    store.setSettings({ reverse: !store.get().settings.reverse });
    renderSettings();
  });

  $('#btn-export').addEventListener('click', () => {
    const blob = new Blob([store.exportJSON()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `lexi-backup-${store.todayKey()}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast('Copia descargada.');
  });

  $('#btn-import').addEventListener('click', () => $('#file-import').click());
  $('#file-import').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      store.importJSON(await file.text());
      renderSettings();
      renderHome();
      toast('Progreso restaurado.');
    } catch (err) {
      toast('No pude leer ese archivo.');
      console.error(err);
    }
    e.target.value = '';
  });

  $('#btn-reset').addEventListener('click', () => {
    if (!confirm('¿Seguro? Se borra la racha, el historial y el progreso de todas las cards.')) return;
    store.resetAll();
    renderSettings();
    renderHome();
    toast('Todo a cero.');
  });
}

/* ═══════════ util ═══════════ */

let toastTimer = null;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { el.hidden = true; }, 2600);
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const base = location.pathname.replace(/[^/]*$/, '');
  navigator.serviceWorker.register(base + 'sw.js').catch((e) => console.warn('SW:', e));
}

export { formatDelay };
boot();
