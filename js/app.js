/*
 * app.js — pega todo: vistas, sesión de repaso, estadísticas y ajustes.
 */

import * as store from './store.js';
import * as decks from './decks.js';
import { schedule, previewInterval, formatDelay, AGAIN, GOOD } from './srs.js';
import * as sound from './sound.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const VIEWS = ['home', 'review', 'done', 'stats', 'settings'];
const XP_BY_QUALITY = [2, 5, 10, 15]; // otra vez, difícil, bien, fácil — solo cosmético, no toca el SRS
let session = null;
let lastStreakSeen = null;
let streakPopTimer = null;
let revealed = false; // si ya se mostró el significado de la card actual

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
  sound.setEnabled(store.get().settings.sound);
  document.addEventListener('pointerdown', () => sound.unlock(), { once: true });

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
  $('#btn-more').addEventListener('click', () => {
    sound.playTap();
    if ($('#btn-more').dataset.mode === 'reinforce') startReinforce();
    else startSession(true);
  });
  $('#btn-start').addEventListener('click', () => {
    sound.playTap();
    if ($('#btn-start').dataset.mode === 'reinforce') startReinforce();
    else startSession(false);
  });
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
  const met = store.goalMet();
  $('#streak-count').textContent = streak;
  $('#streak-chip').classList.toggle('cold', streak === 0);
  $('#streak-chip').classList.toggle('lit', streak > 0 && met);
  if (lastStreakSeen !== null && streak > lastStreakSeen) {
    bounce($('#streak-chip'));
    sound.playStreak();
  }
  lastStreakSeen = streak;

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
    btn.dataset.mode = 'normal';
    $('#cta-label').textContent = done > 0 ? 'Seguir repasando' : 'Empezar repaso';
    note.textContent = met
      ? 'Meta cumplida — lo que hagas ahora es yapa.'
      : `Te faltan ${goal - done} respuestas para salvar el día.`;
  } else {
    btn.disabled = false;
    btn.dataset.mode = 'reinforce';
    $('#cta-label').textContent = 'Reforzar más';
    if (met) {
      note.textContent = 'Día salvado. Si querés seguir practicando, no hay límite.';
    } else if (done === 0) {
      note.textContent = 'Sin cards vencidas hoy. Podés reforzar lo que ya viste igual.';
    } else {
      note.textContent = c.unseen > 0
        ? 'Vaciaste la cola y el día ya cuenta. Seguí si querés más.'
        : 'Terminaste todos los mazos activos. Podés repasar de yapa.';
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

  session = { queue, index: 0, answered: 0, xp: 0, reinforce: false };
  $('#session-xp').textContent = '+0';
  show('review');
  renderCard();
}

/**
 * Tanda extra sin límite diario: para cuando ya no queda nada pendiente
 * pero el usuario quiere seguir practicando igual.
 */
function startReinforce() {
  const queue = decks.buildReinforceQueue();
  if (!queue.length) {
    toast('Todavía no tenés cards para reforzar. Aprendé algunas primero.');
    show('home');
    return;
  }
  session = { queue, index: 0, answered: 0, xp: 0, reinforce: true };
  $('#session-xp').textContent = '+0';
  show('review');
  renderCard();
}

function currentCard() {
  return session ? session.queue[session.index] : null;
}

/** Reinicia una animación CSS por clase, aunque ya la tuviera puesta. */
function bounce(el, cls = 'pop') {
  if (!el) return;
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

/** El momento exacto en que se salva el día: la llama "se pinta" en pantalla. */
function celebrateStreak() {
  const streak = store.liveStreak();
  $('#streak-pop-sub').textContent = `Racha de ${streak} ${streak === 1 ? 'día' : 'días'}`;
  bounce($('#streak-pop'), 'show');
  sound.playStreak();
  clearTimeout(streakPopTimer);
  streakPopTimer = setTimeout(() => $('#streak-pop').classList.remove('show'), 2800);
}

function renderCard() {
  const card = currentCard();
  if (!card) return finishSession();

  bounce($('#card'), 'card-enter');

  const s = store.get();
  const reverse = s.settings.reverse;
  const st = store.cardState(card.id);

  const front = reverse ? card.es : card.en;
  const back = reverse ? card.en : card.es;

  const prompt = $('#card-prompt');
  prompt.textContent = front;
  prompt.className = 'prompt' + (front.length > 34 ? ' xlong' : front.length > 20 ? ' long' : '');
  $('#card-example').innerHTML = highlight(card.ex, card.en);

  $('#card-answer').textContent = back;
  $('#card-example-es').textContent = card.exEs || '';

  const seen = st.reps === 0 ? 'nueva' : `vista ${st.reps} ${st.reps === 1 ? 'vez' : 'veces'}`;
  const reinforceTag = session.reinforce ? '<span class="tag refuerzo">refuerzo</span>' : '';
  $('#card-tags').innerHTML = `
    ${reinforceTag}
    <span class="tag accent">${deckLabel(card.deck)}</span>
    <span class="tag">${card.lvl}</span>
    <span class="tag">${seen}</span>`;

  // El total incluye lo que ya se contestó más lo que queda en cola: si una
  // card "vuelve" (otra vez / aprendizaje) el total crece con ella, así el
  // contador nunca muestra más respuestas que el total (ej. "8/7").
  const total = session.answered + session.queue.length;
  $('#session-count').textContent = `${session.answered}/${total}`;
  const pct = total ? (session.answered / total) * 100 : 0;
  $('#session-fill').style.width = pct + '%';

  for (let q = 0; q <= 3; q++) {
    $('#iv-' + q).textContent = previewInterval(st, q);
  }

  revealed = false;
  $('#card-back').hidden = true;
  $('#btn-reveal').hidden = false;
  $('#grade-grid').hidden = true;
  $('#grade-grid').classList.remove('locked');
  $('#grade-hint').hidden = true;

  if (s.settings.autoSpeak) speak(card.en);
}

/** Muestra el significado de la card actual y habilita votar. */
function revealCard() {
  if (!session || revealed) return;
  revealed = true;
  $('#card-back').hidden = false;
  $('#btn-reveal').hidden = true;
  $('#grade-grid').hidden = false;
  $('#grade-hint').hidden = false;
  bounce($('#card-back'), 'reveal-in');
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

const GRADE_SOUND = [sound.playAgain, sound.playHard, sound.playGood, sound.playEasy];

let grading = false;
/** Capa cosmética sobre answer(): sonido, XP y el pop del botón elegido. */
function chooseGrade(quality) {
  if (!session || grading || !revealed) return;
  grading = true;

  const gained = XP_BY_QUALITY[quality];
  session.xp += gained;
  $('#session-xp').textContent = '+' + session.xp;

  const btn = $(`.grade[data-q="${quality}"]`);
  $('#grade-grid').classList.add('locked');
  if (btn) {
    bounce(btn, 'chosen');
    const fly = document.createElement('span');
    fly.className = 'xp-fly';
    fly.textContent = '+' + gained;
    btn.appendChild(fly);
    fly.addEventListener('animationend', () => fly.remove());
  }
  GRADE_SOUND[quality]();

  setTimeout(() => {
    grading = false;
    if (btn) btn.classList.remove('chosen');
    answer(quality);
  }, 190);
}

function answer(quality) {
  if (!session) return;
  const card = currentCard();
  if (!card) return;

  const metBefore = store.goalMet();
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

  if (!metBefore && store.goalMet()) celebrateStreak();

  if (session.index >= session.queue.length) session.index = 0;
  if (!session.queue.length) return finishSession();
  renderCard();
}

function finishSession() {
  const streak = store.liveStreak();
  const met = store.goalMet();
  const xp = session ? session.xp : 0;
  const wasReinforce = session ? session.reinforce : false;
  $('#done-count').textContent = session ? session.answered : 0;
  $('#done-xp').textContent = '+' + xp;
  $('#done-streak').textContent = streak;
  $('#done-title').textContent = wasReinforce ? 'Refuerzo listo' : met ? '¡Día salvado!' : 'Buena sesión';
  const s = store.get();
  const falta = Math.max(0, s.settings.dailyGoal - store.reviewsToday());
  $('#done-sub').textContent = wasReinforce
    ? `Racha de ${streak} ${streak === 1 ? 'día' : 'días'} — seguís sumando repasos de yapa.`
    : met
      ? `Racha de ${streak} ${streak === 1 ? 'día' : 'días'}. Volvé mañana antes de medianoche.`
      : `Te faltan ${falta} respuestas para que cuente el día.`;

  const noMorePending = decks.buildQueue().total === 0;
  const more = $('#btn-more');
  more.textContent = noMorePending ? 'Reforzar más' : 'Seguir repasando';
  more.dataset.mode = noMorePending ? 'reinforce' : 'normal';
  more.hidden = false;

  session = null;
  show('done');

  bounce($('#done-mark'), 'enter');
  spawnConfetti(met && !wasReinforce);
  sound.playComplete();
}

function spawnConfetti(big) {
  const host = $('#confetti');
  if (!host) return;
  host.innerHTML = '';
  const colors = ['#6ee7a0', '#f5a742', '#7ab8f5', '#f57a7a'];
  const count = big ? 46 : 22;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('i');
    p.className = 'confetti-piece';
    p.style.left = (Math.random() * 100) + '%';
    p.style.background = colors[i % colors.length];
    p.style.setProperty('--dur', (900 + Math.random() * 700) + 'ms');
    p.style.setProperty('--delay', (Math.random() * 250) + 'ms');
    p.style.setProperty('--rot', (180 + Math.random() * 360) + 'deg');
    host.appendChild(p);
  }
  setTimeout(() => { host.innerHTML = ''; }, 2200);
}

function wireReview() {
  $('#btn-speak').addEventListener('click', (e) => {
    e.stopPropagation();
    const card = currentCard();
    if (card) speak(card.en);
  });
  $('#btn-reveal').addEventListener('click', () => {
    sound.playTap();
    revealCard();
  });
  $$('#grade-grid .grade').forEach((b) => {
    b.addEventListener('click', () => chooseGrade(Number(b.dataset.q)));
  });
  $('#btn-quit').addEventListener('click', () => {
    session = null;
    show('home');
  });

  document.addEventListener('keydown', (e) => {
    if ($('#view-review').hidden) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (!session) return;
      if (!revealed) revealCard();
      else chooseGrade(GOOD);
    } else if (['1', '2', '3', '4'].includes(e.key)) {
      if (revealed) chooseGrade(Number(e.key) - 1);
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

  const liveStreak = store.liveStreak();
  $('#st-streak').innerHTML = `${liveStreak} <small>días</small>`;
  $('#streak-card-current').classList.toggle('lit', liveStreak > 0 && store.goalMet());
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

  $('#t-sound').classList.toggle('on', s.settings.sound);
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

  $('#t-sound').addEventListener('click', () => {
    const on = !store.get().settings.sound;
    store.setSettings({ sound: on });
    sound.setEnabled(on);
    if (on) sound.playTap();
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
