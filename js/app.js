/*
 * app.js — pega todo: vistas, sesión de repaso, estadísticas y ajustes.
 */

import * as store from './store.js';
import * as decks from './decks.js';
import * as study from './study.js';
import * as texts from './texts.js';
import { schedule, previewInterval, formatDelay, AGAIN, HARD, GOOD, EASY } from './srs.js';
import * as sound from './sound.js';
import * as sync from './sync.js';

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const VIEWS = ['home', 'review', 'done', 'stats', 'words', 'settings', 'study', 'grammar', 'grammar-level', 'grammar-topic', 'my-vocab', 'texts', 'texts-level', 'texts-reader'];
const SUBVIEW_TAB = {
  words: 'stats', grammar: 'study', 'grammar-level': 'study', 'grammar-topic': 'study', 'my-vocab': 'study',
  texts: 'study', 'texts-level': 'study', 'texts-reader': 'study',
};
let wordsFilter = 'all';
let currentGrammarLevelId = null;
let currentTopicId = null;
let currentTextLevelId = null;
let currentTextId = null;
const openVocabCats = new Set();
const XP_BY_QUALITY = [2, 5, 10, 15]; // otra vez, difícil, bien, fácil — solo cosmético, no toca el SRS
// Mismo número que VERSION en sw.js — subir los dos juntos en cada deploy, así "Versión" en Ajustes
// sirve para confirmar a simple vista si el dispositivo ya tiene los cambios nuevos.
const APP_VERSION = 'v18';
let session = null;
let lastStreakSeen = null;
let streakPopTimer = null;
let revealed = false; // si ya se mostró el significado de la card actual

/* ═══════════ arranque ═══════════ */

async function boot() {
  try {
    await Promise.all([decks.loadDecks(), study.loadStudyData(), texts.loadTextsData()]);
  } catch (err) {
    const msg = $('#boot-msg');
    msg.className = 'boot-msg error';
    msg.textContent = 'No pude cargar los mazos ni los datos de estudio. Si abriste el archivo directo desde la carpeta, subilo a un servidor (o usá la versión publicada).';
    console.error(err);
    return;
  }
  store.load();

  $('#boot-msg').textContent = 'sincronizando…';
  const remote = await sync.pull();
  if (remote && (remote.updatedAt || 0) > (store.get().updatedAt || 0)) {
    store.applyRemote(remote);
  } else {
    sync.schedulePush(store.get());
  }

  sound.setEnabled(store.get().settings.sound);
  document.addEventListener('pointerdown', () => sound.unlock(), { once: true });

  $('#boot').classList.add('gone');
  $('#app').hidden = false;
  setTimeout(() => $('#boot').remove(), 300);

  wireNav();
  wireReview();
  wireWords();
  wireSettings();
  wireSync();
  wireVersionCheck();
  wireStudy();
  wireMyVocab();
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
  const activeTab = SUBVIEW_TAB[view] || view;
  $$('#tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.view === activeTab));
  window.scrollTo(0, 0);

  if (view === 'home') renderHome();
  if (view === 'stats') renderStats();
  if (view === 'words') renderWords();
  if (view === 'settings') renderSettings();
  if (view === 'study') renderStudy();
  if (view === 'grammar') renderGrammarLevels();
  if (view === 'grammar-level') renderGrammarLevel();
  if (view === 'grammar-topic') renderTopic();
  if (view === 'my-vocab') renderMyVocab();
  if (view === 'texts') renderTextLevels();
  if (view === 'texts-level') renderTextsLevel();
  if (view === 'texts-reader') renderTextReader();
}

// Botones que ya disparan su propio sonido — el tap genérico se salta estos
// para no pisarlo (quedaría un "clic-clic" feo pegado al sonido real).
const TAP_EXCLUDE = '.grade, .ex-option, .ex-check, .switch, .topic-row, #btn-start, #btn-more, #btn-reveal, #btn-topic-done';

/** Un tap sutil para cualquier botón que no tenga ya su propio sonido — así toda la app "responde" al tacto, estilo Duolingo. */
function wireGlobalTapSound() {
  document.addEventListener('click', (e) => {
    const btn = e.target.closest('button');
    if (!btn || btn.matches(TAP_EXCLUDE) || btn.disabled) return;
    sound.playTap();
  });
}

function wireNav() {
  wireGlobalTapSound();
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

  renderStreakBanner(streak, met, goal, done);

  $('#done-today').textContent = Math.min(done, goal);
  $('#goal-today').textContent = goal;
  const pct = met ? 1 : goal ? Math.min(1, done / goal) : 0;
  $('#ring-fg').style.strokeDashoffset = String(565.5 * (1 - pct));
  $('#ring-fg').classList.toggle('full', pct >= 1);

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

/** El estado del día, bien a la vista: completado, en riesgo, o todavía sin arrancar. */
function renderStreakBanner(streak, met, goal, done) {
  const el = $('#streak-banner');
  const ico = $('#streak-banner-ico');
  const title = $('#streak-banner-title');
  const sub = $('#streak-banner-sub');
  const day = (n) => (n === 1 ? 'día' : 'días');

  if (met) {
    el.className = 'streak-banner done';
    ico.textContent = '✅';
    title.textContent = '¡Racha de hoy completada!';
    sub.textContent = `Racha de ${streak} ${day(streak)}. Volvé mañana antes de medianoche.`;
  } else if (streak > 0) {
    el.className = 'streak-banner warn';
    ico.textContent = '🔥';
    title.textContent = 'No dejes que la racha muera';
    sub.textContent = `Te faltan ${Math.max(0, goal - done)} respuestas para salvar tu racha de ${streak} ${day(streak)}.`;
  } else {
    el.className = 'streak-banner start';
    ico.textContent = '🔥';
    title.textContent = 'Arrancá tu racha hoy';
    sub.textContent = done > 0
      ? `Te faltan ${Math.max(0, goal - done)} respuestas para empezarla.`
      : `Sumá ${goal} respuestas hoy para empezarla.`;
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

  session = { queue, index: 0, answered: 0, xp: 0, combo: 0, reinforce: false };
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
  session = { queue, index: 0, answered: 0, xp: 0, combo: 0, reinforce: true };
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

/**
 * Alterna entre el primer y el segundo ejemplo de la card según cuántas
 * veces ya la respondiste (par → ex, impar → ex2). Así, cuando una palabra
 * vuelve a aparecer, no te la aprendés de memoria por la oración siempre
 * igual — cada repaso testea la palabra en un contexto distinto, y eso hace
 * que la calificación que le des refleje mejor si de verdad la sabés.
 */
function pickExample(card, st) {
  const useSecond = st.reps % 2 === 1 && card.ex2 && card.exEs2;
  return useSecond ? { en: card.ex2, es: card.exEs2 } : { en: card.ex, es: card.exEs };
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
  const ex = pickExample(card, st);
  $('#card-example').innerHTML = highlight(ex.en, card.en);

  $('#card-answer').textContent = back;
  $('#card-example-es').textContent = ex.es || '';

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

// Palabras sin peso propio para elegir qué resaltar del ejemplo: artículos,
// pronombres, auxiliares y las contracciones (sin apóstrofe) que aparecen
// en el mazo. Sin esto el resaltado terminaba marcando fragmentos como
// "doesn" (de "doesn't") en vez de la palabra que de verdad importa.
const HIGHLIGHT_STOPWORDS = new Set([
  'to', 'a', 'an', 'the', 'and', 'or', 'but', 'it', 'in', 'on', 'at', 'of', 'up', 'out',
  'is', 'be', 'been', 'being', 'with', 'for', 'that', 'this', 'you', 'your', 'we', 'i',
  'how', 'what', 'which', 'who', 'why', 'when', 'can', 'could', 'would', 'should', 'will',
  'doesnt', 'heres', 'id', 'ill', 'im', 'its', 'lets', 'thats', 'well', 'were',
]);
// Verbos irregulares del propio mazo: el resaltado por raíz no los pesca
// (become → became no comparten prefijo), así que van directo al ejemplo.
const HIGHLIGHT_IRREGULAR = { become: 'became', find: 'found', take: 'took', freeze: 'froze', lend: 'lent' };

/**
 * Resalta en `sentence` la palabra o frase `term`. Prueba primero la frase
 * completa tal cual; si no aparece literal (verbo conjugado, orden distinto,
 * frase parafraseada), busca palabra por palabra permitiendo que el final
 * cambie (run → running, dependency → dependencies). Si nada matchea, se
 * muestra el ejemplo sin marcar — no es un error, hay mazos donde el
 * ejemplo no repite el término literalmente.
 */
function highlight(sentence, term) {
  if (!sentence) return '';
  const esc = (t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const safe = sentence.replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]));
  const clean = term.replace(/^(to|a|an|the)\s+/i, '').replace(/[.!?…]+$/, '').trim();
  if (!clean) return safe;

  try {
    const exact = new RegExp(esc(clean), 'i');
    if (exact.test(safe)) return safe.replace(exact, (m) => `<mark>${m}</mark>`);
  } catch {
    // regex inválida por algún caracter raro en el término: seguimos con el plan B
  }

  const words = clean.toLowerCase().replace(/[^a-z\s]/g, '').split(/\s+/)
    .filter((w) => w.length > 2 && !HIGHLIGHT_STOPWORDS.has(w));

  for (const w of words) {
    const candidates = [w, HIGHLIGHT_IRREGULAR[w]].filter(Boolean);
    for (const base of candidates) {
      for (let cut = 0; cut <= 2 && base.length - cut >= 3; cut++) {
        const stem = base.slice(0, base.length - cut);
        try {
          const re = new RegExp('\\b' + esc(stem) + '\\w*', 'i');
          if (re.test(safe)) return safe.replace(re, (m) => `<mark>${m}</mark>`);
        } catch {
          // idem
        }
      }
    }
  }

  return safe;
}

/**
 * Sonido según la calificación. Bien/Fácil llevan el "combo" de la sesión
 * (cuántas veces seguidas veniste calificando bien) para que la nota suba
 * un poco cada vez, al estilo racha de Duolingo — sin pasarse de rosca.
 */
function playGradeSound(quality) {
  if (quality === AGAIN) return sound.playAgain();
  if (quality === HARD) return sound.playHard();
  const combo = Math.max(0, (session?.combo || 1) - 1);
  return quality === GOOD ? sound.playGood(combo) : sound.playEasy(combo);
}

const CHOSEN_CLASS = { [AGAIN]: 'chosen-negative', [HARD]: 'chosen', [GOOD]: 'chosen-success', [EASY]: 'chosen-success' };

let grading = false;
/** Capa cosmética sobre answer(): sonido, XP y el pop del botón elegido. */
function chooseGrade(quality) {
  if (!session || grading || !revealed) return;
  grading = true;

  session.combo = quality === GOOD || quality === EASY ? (session.combo || 0) + 1 : 0;

  const gained = XP_BY_QUALITY[quality];
  session.xp += gained;
  const xpChip = $('#session-xp');
  xpChip.textContent = '+' + session.xp;
  xpChip.classList.toggle('combo', session.combo >= 3);
  bounce(xpChip, 'pop');

  const btn = $(`.grade[data-q="${quality}"]`);
  const chosenCls = CHOSEN_CLASS[quality];
  $('#grade-grid').classList.add('locked');
  if (btn) {
    bounce(btn, chosenCls);
    const fly = document.createElement('span');
    fly.className = 'xp-fly';
    fly.textContent = '+' + gained;
    btn.appendChild(fly);
    fly.addEventListener('animationend', () => fly.remove());
  }
  playGradeSound(quality);

  setTimeout(() => {
    grading = false;
    if (btn) btn.classList.remove(chosenCls);
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

/* ═══════════ vocabulario ═══════════ */

const STATUS_LABEL = { learned: 'Aprendida', learning: 'En progreso', unseen: 'Sin ver' };

function wireWords() {
  $$('#view-stats .rows .row').forEach((btn) => {
    btn.addEventListener('click', () => {
      wordsFilter = btn.dataset.status;
      show('words');
    });
  });
  $('#btn-words-back').addEventListener('click', () => show('stats'));
  $$('#words-filter button').forEach((btn) => {
    btn.addEventListener('click', () => {
      wordsFilter = btn.dataset.filter;
      renderWords();
    });
  });
}

function renderWords() {
  $$('#words-filter button').forEach((b) => b.classList.toggle('on', b.dataset.filter === wordsFilter));

  const all = decks.wordList();
  const rows = (wordsFilter === 'all' ? all : all.filter((w) => w.status === wordsFilter))
    .sort((a, b) => a.card.en.localeCompare(b.card.en));

  $('#words-count').textContent = `${rows.length} ${rows.length === 1 ? 'palabra' : 'palabras'}`;

  const list = $('#word-list');
  list.innerHTML = '';
  if (!rows.length) {
    list.innerHTML = '<p class="word-empty">No hay cards en esta categoría todavía.</p>';
    return;
  }

  for (const { card, st, status } of rows) {
    const due = st && status !== 'unseen' ? formatDelay(Math.max(0, st.due - Date.now())) : '';
    const el = document.createElement('div');
    el.className = 'word-row';
    el.innerHTML = `
      <div class="word-main">
        <span class="word-en">${card.en}</span>
        <span class="word-es">${card.es}</span>
      </div>
      <div class="word-meta">
        <span class="word-status ${status}">${STATUS_LABEL[status]}</span>
        ${due ? `<span class="word-due">vuelve en ${due}</span>` : ''}
      </div>`;
    list.appendChild(el);
  }
}

/* ═══════════ estudio ═══════════ */

function checkSvg() {
  return '<svg viewBox="0 0 24 24"><path d="M5 13l4 4L19 7"/></svg>';
}

function escapeHtml(str) {
  return String(str).replace(/[<>&]/g, (ch) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[ch]));
}

const AUX_NEG = ["isn't", "aren't", "wasn't", "weren't", "doesn't", "don't", "didn't", "haven't", "hasn't", "hadn't", "can't", "won't", "wouldn't", "shouldn't", "mustn't"];
const AUX_POS = ["going to", "am", "is", "are", "was", "were", "do", "does", "did", "have", "has", "had", "will", "would", "can", "could", "should", "must"];

function buildAuxRegex(words) {
  const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const sorted = [...words].sort((a, b) => b.length - a.length).map(esc);
  return new RegExp(`\\b(${sorted.join('|')})\\b`, 'gi');
}
const AUX_NEG_RE = buildAuxRegex(AUX_NEG);
const AUX_POS_RE = buildAuxRegex(AUX_POS);

/** Resalta auxiliares/modales (azul) y sus formas negativas (rojo) en una oración. */
function highlightAux(text) {
  return escapeHtml(text)
    .replace(AUX_NEG_RE, '<span class="hl-neg">$1</span>')
    .replace(AUX_POS_RE, '<span class="hl-aux">$1</span>');
}

/** Si la línea empieza con una etiqueta corta seguida de ":" (ej. "Irregulares:"), la separa del resto. */
function splitRuleIntro(line) {
  const m = line.match(/^([A-Za-zÀ-ÿ .'-]{3,40}:)\s*(.+)$/);
  return m ? { intro: m[1], rest: m[2] } : { intro: '', rest: line };
}

/**
 * Convierte una línea de regla en HTML. Si es una lista de pares "X → Y" (o una
 * cadena "A → B → C…"), la dibuja como chips/pills en vez de texto plano — son
 * patrones muy comunes en las reglas de gramática y se leen mucho mejor así.
 */
function renderRuleLine(line) {
  const { intro, rest } = splitRuleIntro(line);
  const introHtml = intro ? `<p class="rule-intro">${escapeHtml(intro)}</p>` : '';
  const segments = rest.split('·').map((s) => s.trim()).filter(Boolean);

  const isPairGrid = segments.length >= 2 && segments.every((s) => {
    const parts = s.split('→');
    return parts.length === 2 && parts[0].trim().length <= 30 && parts[1].trim().length <= 30;
  });
  if (isPairGrid) {
    const chips = segments.map((seg) => {
      const [left, right] = seg.split('→').map((p) => p.trim().replace(/[.;]+$/, ''));
      return `<span class="rule-chip">${escapeHtml(left)}<span class="arrow">→</span><b>${escapeHtml(right)}</b></span>`;
    }).join('');
    return `${introHtml}<div class="rule-grid">${chips}</div>`;
  }

  const arrowCount = (rest.match(/→/g) || []).length;
  if (segments.length === 1 && arrowCount >= 2) {
    const steps = rest.replace(/[.;]+$/, '').split('→').map((s) => s.trim());
    const chainHtml = steps.map((s, i) => (i === 0
      ? `<span class="step">${escapeHtml(s)}</span>`
      : `<span class="arrow">→</span><span class="step">${escapeHtml(s)}</span>`)).join('');
    return `${introHtml}<div class="rule-chain">${chainHtml}</div>`;
  }

  return `<p>${highlightAux(line)}</p>`;
}

/*
 * Motor de "preguntas con autocorrección", compartido entre los ejercicios
 * de un tema de gramática y las preguntas de comprensión de un texto de
 * lectura — ambos son, en el fondo, la misma cosa: una lista de preguntas de
 * opción múltiple (o para completar) que se corrigen al toque, sin backend.
 */
function normalizeAnswer(s) {
  return String(s).trim().toLowerCase().replace(/[.!?,;:]+$/, '').replace(/\s+/g, ' ');
}

function practiceItemHtml(item, i) {
  const q = `<div class="ex-q">${highlightAux(item.q)}</div>`;
  if (item.type === 'fill') {
    return `
      <div class="exercise exercise-fill" data-idx="${i}">
        ${q}
        <form class="ex-form">
          <input type="text" class="ex-input" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Escribí tu respuesta">
          <button type="submit" class="ex-check">Revisar</button>
        </form>
        <p class="ex-explain" hidden></p>
      </div>`;
  }
  const options = item.options.map((o, oi) => `<button type="button" class="ex-option" data-opt="${oi}">${escapeHtml(o)}</button>`).join('');
  return `
    <div class="exercise exercise-mc" data-idx="${i}">
      ${q}
      <div class="ex-options">${options}</div>
      <p class="ex-explain" hidden></p>
    </div>`;
}

/**
 * Pinta una lista de preguntas autocorregibles en `host` y llama a
 * `onComplete(correct, total)` una sola vez, cuando ya se respondieron todas.
 */
function renderPractice(host, summaryEl, items, onComplete) {
  if (!items?.length) {
    host.innerHTML = '';
    summaryEl.hidden = true;
    return;
  }
  const state = items.map(() => false);
  let doneCount = 0;
  host.innerHTML = items.map(practiceItemHtml).join('');
  summaryEl.hidden = true;
  summaryEl.className = 'practice-summary';

  const finish = () => {
    doneCount += 1;
    if (doneCount < items.length) return;
    const correct = state.filter(Boolean).length;
    summaryEl.hidden = false;
    summaryEl.classList.toggle('perfect', correct === items.length);
    summaryEl.textContent = correct === items.length
      ? `¡Todo correcto! ${correct}/${items.length}.`
      : `Resultado: ${correct}/${items.length} correctas.`;
    if (correct === items.length) sound.playPerfect();
    onComplete(correct, items.length);
  };

  host.querySelectorAll('.exercise-mc').forEach((card) => {
    const idx = Number(card.dataset.idx);
    const item = items[idx];
    card.querySelectorAll('.ex-option').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (state[idx] !== false) return;
        const chosen = Number(btn.dataset.opt);
        const correct = chosen === item.answer;
        state[idx] = correct;
        card.querySelectorAll('.ex-option').forEach((b, oi) => {
          b.disabled = true;
          if (oi === item.answer) b.classList.add('correct');
          else if (oi === chosen) b.classList.add('wrong');
        });
        const explain = card.querySelector('.ex-explain');
        if (item.explain) {
          explain.hidden = false;
          explain.textContent = item.explain;
        }
        (correct ? sound.playCorrect : sound.playWrong)();
        finish();
      });
    });
  });

  host.querySelectorAll('.exercise-fill').forEach((card) => {
    const idx = Number(card.dataset.idx);
    const item = items[idx];
    const form = card.querySelector('form');
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      if (state[idx] !== false) return;
      const input = card.querySelector('.ex-input');
      const accepted = [item.answer, ...(item.accept || [])].map(normalizeAnswer);
      const correct = accepted.includes(normalizeAnswer(input.value));
      state[idx] = correct;
      input.disabled = true;
      form.querySelector('.ex-check').disabled = true;
      card.classList.add(correct ? 'is-correct' : 'is-wrong');
      const explain = card.querySelector('.ex-explain');
      explain.hidden = false;
      explain.textContent = correct
        ? (item.explain || '¡Correcto!')
        : `Respuesta: ${item.answer}${item.explain ? ' — ' + item.explain : ''}`;
      (correct ? sound.playCorrect : sound.playWrong)();
      finish();
    });
  });
}

function wireStudy() {
  $('#btn-go-my-vocab').addEventListener('click', () => show('my-vocab'));
  $('#btn-go-grammar').addEventListener('click', () => show('grammar'));
  $('#btn-go-texts').addEventListener('click', () => show('texts'));
  $('#btn-grammar-back').addEventListener('click', () => show('study'));
  $('#btn-grammar-level-back').addEventListener('click', () => show('grammar'));
  $('#btn-grammar-topic-back').addEventListener('click', () => show(currentGrammarLevelId ? 'grammar-level' : 'grammar'));
  $('#btn-my-vocab-back').addEventListener('click', () => show('study'));
  $('#btn-texts-back').addEventListener('click', () => show('study'));
  $('#btn-texts-level-back').addEventListener('click', () => show('texts'));
  $('#btn-texts-reader-back').addEventListener('click', () => show(currentTextLevelId ? 'texts-level' : 'texts'));

  $('#btn-topic-done').addEventListener('click', () => {
    store.toggleTopicDone(currentTopicId);
    sound.playLearned(store.isTopicDone(currentTopicId));
    renderTopic();
  });
}

function renderStudy() {
  const vocab = study.allVocab();
  $('#study-vocab-sub').textContent = `${vocab.length} palabras`;

  let doneAll = 0;
  let totalAll = 0;
  for (const lvl of study.allLevels()) {
    const { done, total } = study.levelProgress(lvl);
    doneAll += done;
    totalAll += total;
  }
  $('#study-grammar-sub').textContent = `${doneAll}/${totalAll} temas · A1 a B2`;

  let textsTotal = 0;
  let textsRead = 0;
  for (const lvl of texts.allLevels()) {
    for (const t of lvl.texts) {
      textsTotal += 1;
      if (store.textResult(t.id)) textsRead += 1;
    }
  }
  $('#study-texts-sub').textContent = `${textsRead}/${textsTotal} leídos · A1 a B2`;
}

function renderGrammarLevels() {
  const list = $('#level-list');
  list.innerHTML = '';
  for (const lvl of study.allLevels()) {
    const { done, total } = study.levelProgress(lvl);
    const complete = total > 0 && done === total;
    const emText = lvl.units ? `${done}/${total}` : 'Próximamente';
    const btn = document.createElement('button');
    btn.className = 'level-card';
    btn.type = 'button';
    btn.innerHTML = `
      <span class="level-ring" style="border:2px solid ${lvl.color}; background:${complete ? lvl.color : 'transparent'}; color:${complete ? '#0d1011' : lvl.color}">${complete ? checkSvg() : lvl.label}</span>
      <div class="level-card-text">
        <span>${lvl.label}</span>
        <small>${lvl.goal}</small>
      </div>
      <em>${emText}</em>`;
    btn.addEventListener('click', () => openGrammarLevel(lvl.id));
    list.appendChild(btn);
  }
}

function openGrammarLevel(id) {
  currentGrammarLevelId = id;
  show('grammar-level');
}

function renderGrammarLevel() {
  const lvl = study.levelById(currentGrammarLevelId);
  if (!lvl) return;
  $('#grammar-level-title').textContent = lvl.label;
  $('#grammar-level-goal').textContent = lvl.goal;
  $('#grammar-level-book').textContent = `📖 ${lvl.book}`;

  const body = $('#grammar-level-body');
  body.innerHTML = '';

  if (!lvl.units) {
    body.innerHTML = `
      <p class="note">${lvl.note}</p>
      <div class="grammar-unit">
        <div class="grammar-unit-label">Lo que viene</div>
        <ul class="grammar-upcoming">${lvl.upcoming.map((u) => `<li>${u}</li>`).join('')}</ul>
      </div>`;
    return;
  }

  for (const unit of lvl.units) {
    const block = document.createElement('div');
    block.className = 'grammar-unit';
    const rows = unit.topics.map((t) => {
      const done = store.isTopicDone(t.id);
      const res = store.exerciseResult(t.id);
      const badge = res ? `<em class="topic-score${res.bestPct === 1 ? ' perfect' : ''}">${res.correct}/${res.total}</em>` : '';
      return `<button class="topic-row" type="button" data-topic="${t.id}">
        <span class="topic-check${done ? ' on' : ''}">${done ? checkSvg() : ''}</span>
        <div class="topic-row-text"><span>${t.title}</span><small>${t.tag}</small></div>
        ${badge}
      </button>`;
    }).join('');
    block.innerHTML = `<div class="grammar-unit-label">${unit.label}</div>${rows}`;
    body.appendChild(block);
  }

  if (lvl.checkpoint?.length) {
    const cp = document.createElement('div');
    cp.className = 'grammar-unit';
    cp.innerHTML = `<div class="grammar-unit-label">Para pasar de nivel, tenés que poder…</div>
      <ul class="checkpoint-list">${lvl.checkpoint.map((c) => `<li>${c}</li>`).join('')}</ul>`;
    body.appendChild(cp);
  }

  body.querySelectorAll('.topic-row').forEach((row) => {
    row.addEventListener('click', () => openTopic(row.dataset.topic));
  });
}

function openTopic(id) {
  currentTopicId = id;
  sound.playFlip();
  show('grammar-topic');
}

function renderTopic() {
  const found = study.topicById(currentTopicId);
  if (!found) return;
  const { topic, level } = found;

  const tag = $('#topic-tag');
  tag.textContent = `${level.label} · ${topic.tag}`;
  tag.style.color = level.color;
  tag.style.background = `${level.color}22`;
  tag.style.borderColor = `${level.color}55`;

  $('#topic-title').textContent = topic.title;
  $('#topic-hook').textContent = topic.hook;

  const done = store.isTopicDone(topic.id);
  $('#topic-done-label').textContent = done ? 'Aprendido' : 'Marcar como aprendido';
  $('#topic-done-switch').classList.toggle('on', done);

  $('#topic-rule').innerHTML = topic.rule.map((r, i) => `
    <div class="rule-card"><span class="rule-num">${i + 1}</span>${renderRuleLine(r)}</div>`).join('');

  const tipBlock = $('#topic-tip-block');
  if (topic.tip) {
    tipBlock.hidden = false;
    $('#topic-tip').innerHTML = highlightAux(topic.tip);
  } else {
    tipBlock.hidden = true;
  }

  const examplesEl = $('#topic-examples');
  examplesEl.style.setProperty('--ex-accent', level.color);
  examplesEl.innerHTML = topic.examples.map((ex, i) => `
    <div class="topic-example">
      <span class="ex-num">${i + 1}</span>
      <div class="ex-body">
        <div class="en">${highlightAux(ex.en)}</div>
        <div class="es">${escapeHtml(ex.es)}</div>
      </div>
    </div>`).join('');

  const mistakesBlock = $('#topic-mistakes-block');
  if (topic.mistakes?.length) {
    mistakesBlock.hidden = false;
    $('#topic-mistakes').innerHTML = topic.mistakes.map((m) => `
      <div class="topic-mistake">
        <div class="wrong"><span class="ico">❌</span><span class="txt">${escapeHtml(m.wrong)}</span></div>
        <div class="right"><span class="ico">✅</span><span class="txt">${escapeHtml(m.right)}</span></div>
        ${m.note ? `<div class="mistake-note">${escapeHtml(m.note)}</div>` : ''}
      </div>`).join('');
  } else {
    mistakesBlock.hidden = true;
  }

  renderPractice($('#topic-exercises'), $('#topic-exercise-summary'), topic.exercises, (correct, total) => {
    store.recordExerciseRun(topic.id, correct, total);
  });
}

/** Solo lectura, como la tabla de Notion: se navega y se lee, no se marca nada acá. */
function renderMyVocab() {
  const all = study.allVocab();
  $('#my-vocab-count').textContent = `${all.length} ${all.length === 1 ? 'palabra' : 'palabras'}`;

  const groups = new Map();
  for (const w of all) {
    const key = w.category || 'General';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(w);
  }

  const list = $('#my-vocab-list');
  list.innerHTML = '';
  for (const [cat, words] of [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    const open = openVocabCats.has(cat);
    const group = document.createElement('div');
    group.className = `vocab-group${open ? ' open' : ''}`;
    const rowsHtml = words
      .sort((a, b) => a.word.localeCompare(b.word))
      .map((w) => `
        <div class="vocab-row">
          <div class="vocab-row-text">
            <div class="word-line"><span class="word-en">${escapeHtml(w.word)}</span><span class="word-type">${escapeHtml(w.type)}</span></div>
            <span class="word-es">${escapeHtml(w.meaning)}</span>
            <span class="word-ex">${escapeHtml(w.example)}</span>
          </div>
        </div>`).join('');
    group.innerHTML = `
      <button class="vocab-group-head" type="button" data-cat="${escapeHtml(cat)}">
        <span class="cat-name">${escapeHtml(cat)}</span>
        <span class="cat-count">${words.length}</span>
        <svg viewBox="0 0 24 24" class="ico chev"><path d="m9 6 6 6-6 6"/></svg>
      </button>
      <div class="vocab-group-body"${open ? '' : ' hidden'}>${rowsHtml}</div>`;
    list.appendChild(group);
  }
}

function wireMyVocab() {
  $('#my-vocab-list').addEventListener('click', (e) => {
    const head = e.target.closest('.vocab-group-head');
    if (!head) return;
    const cat = head.dataset.cat;
    const group = head.closest('.vocab-group');
    const body = group.querySelector('.vocab-group-body');
    const willOpen = body.hidden;
    body.hidden = !willOpen;
    group.classList.toggle('open', willOpen);
    if (willOpen) openVocabCats.add(cat);
    else openVocabCats.delete(cat);
  });
}

/* ═══════════ textos (reading) ═══════════ */

function renderTextLevels() {
  const list = $('#text-level-list');
  list.innerHTML = '';
  for (const lvl of texts.allLevels()) {
    const total = lvl.texts.length;
    const done = lvl.texts.filter((t) => store.textResult(t.id)).length;
    const complete = total > 0 && done === total;
    const btn = document.createElement('button');
    btn.className = 'level-card';
    btn.type = 'button';
    btn.innerHTML = `
      <span class="level-ring" style="border:2px solid ${lvl.color}; background:${complete ? lvl.color : 'transparent'}; color:${complete ? '#0d1011' : lvl.color}">${complete ? checkSvg() : lvl.label}</span>
      <div class="level-card-text">
        <span>${lvl.label}</span>
        <small>${lvl.exam}</small>
      </div>
      <em>${done}/${total}</em>`;
    btn.addEventListener('click', () => openTextLevel(lvl.id));
    list.appendChild(btn);
  }
}

function openTextLevel(id) {
  currentTextLevelId = id;
  show('texts-level');
}

function renderTextsLevel() {
  const lvl = texts.levelById(currentTextLevelId);
  if (!lvl) return;
  $('#texts-level-title').textContent = lvl.label;
  $('#texts-level-exam').textContent = lvl.exam;

  const list = $('#text-list');
  list.innerHTML = lvl.texts.map((t) => {
    const res = store.textResult(t.id);
    const badge = res
      ? `<em class="topic-score${res.bestPct === 1 ? ' perfect' : ''}">${Math.round(res.bestPct * 100)}%</em>`
      : '<em class="topic-score todo">Sin leer</em>';
    return `<button class="topic-row" type="button" data-text="${t.id}">
      <div class="topic-row-text"><span>${t.title}</span><small>${t.words} palabras · ${t.questions.length} preguntas</small></div>
      ${badge}
    </button>`;
  }).join('');
  list.querySelectorAll('.topic-row').forEach((row) => {
    row.addEventListener('click', () => openText(row.dataset.text));
  });
}

function openText(id) {
  currentTextId = id;
  sound.playFlip();
  show('texts-reader');
}

function renderTextReader() {
  const found = texts.textById(currentTextId);
  if (!found) return;
  const { text, level } = found;

  const tag = $('#text-tag');
  tag.textContent = `${level.label} · ${text.words} palabras`;
  tag.style.color = level.color;
  tag.style.background = `${level.color}22`;
  tag.style.borderColor = `${level.color}55`;

  $('#text-title').textContent = text.title;
  $('#text-words').textContent = level.exam;

  $('#text-body').innerHTML = text.body.split('\n\n').map((p) => `<p>${escapeHtml(p)}</p>`).join('');

  renderPractice($('#text-questions'), $('#text-summary'), text.questions, (correct, total) => {
    store.recordTextRun(text.id, correct, total);
  });
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
      sound.playSwitch(!on);
      renderSettings();
    });
    box.appendChild(row);
  }

  renderSyncStatus();
  $('#version-label').textContent = `Versión ${APP_VERSION}`;
}

function renderSyncStatus() {
  const st = sync.status();
  const dot = $('#sync-dot');
  const label = $('#sync-status-label');
  const note = $('#sync-status-note');
  const row = $('#sync-connect-row');
  const disconnectBtn = $('#btn-sync-disconnect');

  dot.className = 'sync-dot';
  if (!st.hasToken) {
    label.textContent = 'Sin conectar';
    note.textContent = 'El progreso solo vive en este dispositivo.';
    row.hidden = false;
    disconnectBtn.hidden = true;
  } else if (st.lastPushError === 'token') {
    dot.classList.add('error');
    label.textContent = 'Código inválido';
    note.textContent = 'Revisá el código pegado — puede haber expirado.';
    row.hidden = false;
    disconnectBtn.hidden = true;
  } else {
    dot.classList.add('on');
    label.textContent = 'Sincronizado';
    note.textContent = st.lastPushAt
      ? `Último envío: ${new Date(st.lastPushAt).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}`
      : 'Conectado — sincronizando en segundo plano.';
    row.hidden = true;
    disconnectBtn.hidden = false;
  }
}

function wireSync() {
  $('#btn-sync-connect').addEventListener('click', () => {
    const input = $('#sync-token-input');
    const token = input.value.trim();
    if (!token) return;
    sync.setToken(token);
    input.value = '';
    toast('Conectando…');
    sync.pushNow().then(() => renderSyncStatus());
    renderSyncStatus();
  });
  $('#btn-sync-disconnect').addEventListener('click', () => {
    sync.setToken('');
    renderSyncStatus();
    toast('Desconectado de este dispositivo.');
  });
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
    if (on) sound.playSwitch(true);
    renderSettings();
  });
  $('#t-speak').addEventListener('click', () => {
    const on = !store.get().settings.autoSpeak;
    store.setSettings({ autoSpeak: on });
    sound.playSwitch(on);
    renderSettings();
  });
  $('#t-reverse').addEventListener('click', () => {
    const on = !store.get().settings.reverse;
    store.setSettings({ reverse: on });
    sound.playSwitch(on);
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

/**
 * Registra el service worker y se asegura de que una versión nueva se
 * aplique sola. sw.js ya hace skipWaiting + clients.claim en cuanto
 * termina de instalar, así que lo único que faltaba era escuchar
 * `controllerchange` y recargar una vez — si no, la pestaña seguía viva
 * con los módulos JS viejos ya cargados en memoria hasta el próximo
 * cierre y apertura manual, y los cambios "no se notaban".
 */
let swRegistration = null;
let reloadingForUpdate = false;

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const base = location.pathname.replace(/[^/]*$/, '');

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadingForUpdate) return;
    reloadingForUpdate = true;
    location.reload();
  });

  navigator.serviceWorker.register(base + 'sw.js')
    .then((reg) => { swRegistration = reg; })
    .catch((e) => console.warn('SW:', e));
}

/** Botón "Buscar actualización" en Ajustes: fuerza el chequeo, sin esperar al próximo reload natural. */
function wireVersionCheck() {
  $('#btn-check-update').addEventListener('click', async () => {
    const dot = $('#update-dot');
    const note = $('#update-note');
    if (!('serviceWorker' in navigator) || !swRegistration) {
      toast('Este navegador no soporta actualizaciones automáticas.');
      return;
    }
    dot.className = 'update-dot checking';
    note.textContent = 'Buscando actualización…';
    try {
      await swRegistration.update();
    } catch (e) {
      console.warn('No se pudo buscar actualización:', e);
    }
    // Si había una versión nueva, el listener de controllerchange ya
    // recargó la página antes de que esto se ejecute. Si no, avisamos.
    setTimeout(() => {
      if (reloadingForUpdate) return;
      dot.className = 'update-dot';
      note.textContent = 'Estás al día.';
      toast(`Ya tenés la última versión (${APP_VERSION}).`);
    }, 1200);
  });
}

export { formatDelay };
boot();
