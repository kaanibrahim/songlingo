import { $, $$, esc, shuffle, loadSongs } from '../util.js';
import { getWords, recordAnswer } from '../store.js';

const MODES = {
  flashcards: { name: 'Flashcards', desc: 'Flip cards and sort them into “know it” and “still learning”.', min: 1 },
  choice: { name: 'Multiple choice', desc: 'Pick the right meaning from four options.', min: 2 },
  write: { name: 'Write', desc: 'Type the answer from memory. The hardest — and the best for recall.', min: 1 },
};

const norm = (s) => s.toLocaleLowerCase().replace(/[’`]/g, "'").replace(/[^\p{L}\p{N}' ]/gu, ' ').replace(/\s+/g, ' ').trim();
const stripAccents = (s) => s.normalize('NFD').replace(/\p{M}/gu, '');

export async function renderPractice(root, query) {
  let songs = [];
  try { songs = await loadSongs(); } catch {}
  const songById = Object.fromEntries(songs.map((s) => [s.id, s]));
  const all = getWords().filter((w) => w.translation);

  if (!all.length) {
    root.innerHTML = `<section class="empty"><h2>Nothing to practise yet</h2><p>Save some words while listening to a song, then come back here.</p><a class="btn" href="#/">Browse songs</a></section>`;
    return;
  }

  const songIds = [...new Set(all.map((w) => w.songId))];
  const preset = query.get('song');
  const state = {
    deck: preset && songIds.includes(preset) ? preset : 'all',
    mode: 'flashcards',
    direction: 'forward',  // forward: original → translation; reverse; mixed
    order: 'weakest',
  };

  // Shared audio element for "hear it in the song"
  const audio = new Audio();
  let stopAt = null;
  audio.addEventListener('timeupdate', () => { if (stopAt != null && audio.currentTime >= stopAt) { audio.pause(); stopAt = null; } });
  function playContext(w) {
    const song = songById[w.songId];
    if (!song || w.lineStart == null) return;
    if (!audio.src.endsWith(song.audio)) audio.src = song.audio;
    const go = () => { audio.currentTime = w.lineStart; stopAt = w.lineEnd ?? w.lineStart + 6; audio.play().catch(() => {}); };
    if (audio.readyState >= 1) go(); else audio.addEventListener('loadedmetadata', go, { once: true });
  }

  let gen = 0;            // bumps on every screen change; stale timers check it
  let onKey = null;
  const setKeys = (fn) => {
    if (onKey) document.removeEventListener('keydown', onKey);
    onKey = fn;
    if (fn) document.addEventListener('keydown', fn);
  };

  const deckWords = () => (state.deck === 'all' ? all : all.filter((w) => w.songId === state.deck));

  // ---------- Setup screen ----------
  function setup() {
    gen++;
    setKeys(null);
    const deckOpts = [['all', `All songs (${all.length})`],
      ...songIds.map((id) => [id, `${songById[id]?.title || id} (${all.filter((w) => w.songId === id).length})`])];

    root.innerHTML = `
      <section class="practice-setup">
        <h1>Practise</h1>
        <div class="setup-grid">
          <label class="field">
            <span>Words from</span>
            <select id="deckSel">${deckOpts.map(([v, l]) => `<option value="${esc(v)}" ${v === state.deck ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
          </label>
          <label class="field">
            <span>Show me</span>
            <select id="dirSel">
              <option value="forward">Song language → translation</option>
              <option value="reverse">Translation → song language</option>
              <option value="mixed">Mixed</option>
            </select>
          </label>
          <label class="field">
            <span>Order</span>
            <select id="orderSel">
              <option value="weakest">Weakest words first</option>
              <option value="shuffle">Shuffle</option>
              <option value="newest">Newest first</option>
            </select>
          </label>
        </div>
        <div class="mode-grid">
          ${Object.entries(MODES).map(([k, m]) => `
            <button class="mode-card" data-mode="${k}">
              <span class="mode-icon mode-${k}" aria-hidden="true"></span>
              <strong>${m.name}</strong>
              <span>${m.desc}</span>
            </button>`).join('')}
        </div>
        <p class="muted" id="setupNote"></p>
      </section>`;

    $('#dirSel').value = state.direction;
    $('#orderSel').value = state.order;
    $('#deckSel').addEventListener('change', (e) => { state.deck = e.target.value; refresh(); });
    $('#dirSel').addEventListener('change', (e) => { state.direction = e.target.value; });
    $('#orderSel').addEventListener('change', (e) => { state.order = e.target.value; });
    $$('.mode-card').forEach((b) => b.addEventListener('click', () => { state.mode = b.dataset.mode; start(deckWords()); }));

    function refresh() {
      const n = deckWords().length;
      $$('.mode-card').forEach((b) => { b.disabled = n < MODES[b.dataset.mode].min; });
      $('#setupNote').textContent = n < 2 ? 'Save at least 2 words for multiple choice.' : '';
    }
    refresh();
  }

  // ---------- Build a session ----------
  function orderCards(words) {
    if (state.order === 'shuffle') return shuffle(words);
    if (state.order === 'newest') return [...words].sort((a, b) => b.createdAt - a.createdAt);
    return shuffle(words).sort((a, b) => a.box - b.box || (a.lastReviewed || 0) - (b.lastReviewed || 0));
  }

  function makeCard(w) {
    const reverse = state.direction === 'reverse' || (state.direction === 'mixed' && Math.random() < 0.5);
    return { w, reverse, prompt: reverse ? w.translation : w.text, answer: reverse ? w.text : w.translation };
  }

  function start(words) {
    const cards = orderCards(words).map(makeCard);
    const session = { cards, i: 0, right: [], wrong: [], pool: deckWords() };
    if (state.mode === 'flashcards') flashcards(session);
    else if (state.mode === 'choice') choice(session);
    else write(session);
  }

  function frame(session, inner) {
    gen++;
    const total = session.cards.length;
    const pct = (session.i / total) * 100;
    root.innerHTML = `
      <section class="practice">
        <div class="practice-top">
          <button class="btn ghost small" id="quitBtn">← Options</button>
          <span class="muted">${MODES[state.mode].name} · ${Math.min(session.i + 1, total)} / ${total}</span>
        </div>
        <div class="progressbar"><span style="width:${pct}%"></span></div>
        ${inner}
      </section>`;
    $('#quitBtn').addEventListener('click', setup);
  }

  function contextHtml(card) {
    const w = card.w;
    const song = songById[w.songId];
    const hear = song && w.lineStart != null ? `<button class="btn ghost small hear" type="button">▶ Hear it in the song</button>` : '';
    const line = w.line ? `<p class="ctx-line">“${esc(w.line)}”</p>` : '';
    const src = song ? `<p class="ctx-song">${esc(song.title)} · ${esc(song.artist || '')}</p>` : '';
    return `<div class="ctx">${line}${src}${hear}</div>`;
  }
  const bindHear = (card) => $$('.hear').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); playContext(card.w); }));

  // ---------- Flashcards ----------
  function flashcards(session) {
    if (session.i >= session.cards.length) return summary(session);
    const card = session.cards[session.i];
    frame(session, `
      <div class="flashcard" id="card" tabindex="0" role="button" aria-label="Flip card">
        <div class="fc-inner">
          <div class="fc-face fc-front">
            <span class="fc-label">${card.reverse ? 'Meaning' : 'Word / phrase'}</span>
            <p class="fc-text">${esc(card.prompt)}</p>
            <span class="fc-tip">Click or press space to flip</span>
          </div>
          <div class="fc-face fc-back">
            <span class="fc-label">${card.reverse ? 'Word / phrase' : 'Meaning'}</span>
            <p class="fc-text">${esc(card.answer)}</p>
            ${contextHtml(card)}
          </div>
        </div>
      </div>
      <div class="fc-actions">
        <button class="btn learning" id="noBtn">Still learning <kbd>1</kbd></button>
        <button class="btn know" id="yesBtn">Know it <kbd>2</kbd></button>
      </div>`);

    const el = $('#card');
    const flip = () => el.classList.toggle('flipped');
    el.addEventListener('click', flip);
    bindHear(card);
    const answer = (ok) => {
      recordAnswer(card.w.id, ok);
      (ok ? session.right : session.wrong).push(card);
      session.i++;
      flashcards(session);
    };
    $('#noBtn').addEventListener('click', () => answer(false));
    $('#yesBtn').addEventListener('click', () => answer(true));
    setKeys((e) => {
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); flip(); }
      else if (e.key === '1' || e.key === 'ArrowLeft') answer(false);
      else if (e.key === '2' || e.key === 'ArrowRight') answer(true);
    });
  }

  // ---------- Multiple choice ----------
  function choice(session) {
    if (session.i >= session.cards.length) return summary(session);
    const card = session.cards[session.i];
    const field = card.reverse ? 'text' : 'translation';
    const distractors = shuffle(
      [...new Map(all.filter((w) => w.id !== card.w.id && norm(w[field]) !== norm(card.answer)).map((w) => [norm(w[field]), w[field]])).values()]
    ).slice(0, 3);
    const options = shuffle([card.answer, ...distractors]);

    frame(session, `
      <div class="quiz-card">
        <span class="fc-label">${card.reverse ? 'Which word means…' : 'What does this mean?'}</span>
        <p class="fc-text">${esc(card.prompt)}</p>
      </div>
      <div class="options">
        ${options.map((o, i) => `<button class="option" data-v="${esc(o)}"><kbd>${i + 1}</kbd>${esc(o)}</button>`).join('')}
      </div>
      <div class="feedback" id="feedback"></div>`);

    let done = false;
    const pick = (btn) => {
      if (done) return;
      done = true;
      const ok = btn.dataset.v === card.answer;
      recordAnswer(card.w.id, ok);
      $$('.option').forEach((b) => {
        b.disabled = true;
        if (b.dataset.v === card.answer) b.classList.add('correct');
      });
      if (!ok) btn.classList.add('wrong');
      (ok ? session.right : session.wrong).push(card);
      const fb = $('#feedback');
      fb.innerHTML = (ok ? '<p class="good">Correct!</p>' : `<p class="bad">The answer is <strong>${esc(card.answer)}</strong></p>`) +
        contextHtml(card) + '<button class="btn" id="nextBtn">Continue <kbd>↵</kbd></button>';
      bindHear(card);
      const next = () => { session.i++; choice(session); };
      $('#nextBtn').addEventListener('click', next);
      setKeys((e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); next(); } });
      const myGen = gen;
      if (ok) setTimeout(() => { if (gen === myGen) next(); }, 1100);
    };
    $$('.option').forEach((b) => b.addEventListener('click', () => pick(b)));
    setKeys((e) => { const b = $$('.option')[+e.key - 1]; if (b) pick(b); });
  }

  // ---------- Write ----------
  function write(session) {
    if (session.i >= session.cards.length) return summary(session);
    const card = session.cards[session.i];
    frame(session, `
      <div class="quiz-card">
        <span class="fc-label">${card.reverse ? 'Write it in the song language' : 'Write the meaning'}</span>
        <p class="fc-text">${esc(card.prompt)}</p>
      </div>
      <form class="write-form" id="writeForm" autocomplete="off">
        <input type="text" id="answerInput" placeholder="Type your answer" autofocus>
        <button class="btn">Check</button>
        <button class="btn ghost" type="button" id="dunnoBtn">Don't know</button>
      </form>
      <div class="feedback" id="feedback"></div>`);

    const input = $('#answerInput');
    input.focus();
    setKeys(null);
    let done = false;

    const finish = (ok, msg) => {
      done = true;
      input.disabled = true;
      $$('#writeForm button').forEach((b) => (b.disabled = true));
      recordAnswer(card.w.id, ok);
      (ok ? session.right : session.wrong).push(card);
      $('#feedback').innerHTML = msg + contextHtml(card) +
        `<div class="row">${!ok ? '<button class="btn ghost" id="overrideBtn">I was right</button>' : ''}<button class="btn" id="nextBtn">Continue <kbd>↵</kbd></button></div>`;
      bindHear(card);
      const next = () => { session.i++; write(session); };
      $('#nextBtn').addEventListener('click', next);
      $('#nextBtn').focus();
      $('#overrideBtn')?.addEventListener('click', () => {
        session.wrong.pop(); session.right.push(card);
        recordAnswer(card.w.id, true); recordAnswer(card.w.id, true); // undo the penalty
        next();
      });
    };

    $('#writeForm').addEventListener('submit', (e) => {
      e.preventDefault();
      if (done) return;
      const given = norm(input.value);
      if (!given) return;
      // Accept any of several answers separated by , ; or /
      const accepted = card.answer.split(/[,;/]/).map(norm).filter(Boolean).concat(norm(card.answer));
      if (accepted.includes(given)) finish(true, '<p class="good">Correct!</p>');
      else if (accepted.map(stripAccents).includes(stripAccents(given))) finish(true, `<p class="good">Correct — watch the accents: <strong>${esc(card.answer)}</strong></p>`);
      else finish(false, `<p class="bad">You wrote <s>${esc(input.value)}</s><br>Answer: <strong>${esc(card.answer)}</strong></p>`);
    });
    $('#dunnoBtn').addEventListener('click', () => finish(false, `<p class="bad">Answer: <strong>${esc(card.answer)}</strong></p>`));
  }

  // ---------- Summary ----------
  function summary(session) {
    gen++;
    setKeys(null);
    const total = session.cards.length;
    const r = session.right.length;
    const pct = total ? Math.round((r / total) * 100) : 0;
    root.innerHTML = `
      <section class="practice summary">
        <div class="score-ring" style="--p:${pct}"><span>${pct}%</span></div>
        <h1>${pct === 100 ? 'Perfect round!' : pct >= 70 ? 'Nice work!' : 'Keep going!'}</h1>
        <p class="muted">${r} of ${total} right${state.mode === 'flashcards' ? ' (know it)' : ''}.</p>
        ${session.wrong.length ? `
          <h3>Still learning</h3>
          <ul class="missed">${session.wrong.map((c) => `<li><strong>${esc(c.w.text)}</strong> — ${esc(c.w.translation)}</li>`).join('')}</ul>` : ''}
        <div class="row center">
          ${session.wrong.length ? '<button class="btn" id="missedBtn">Practise these again</button>' : ''}
          <button class="btn ghost" id="againBtn">Start over</button>
          <button class="btn ghost" id="optsBtn">Change mode</button>
        </div>
      </section>`;
    $('#missedBtn')?.addEventListener('click', () => start(session.wrong.map((c) => c.w)));
    $('#againBtn').addEventListener('click', () => start(deckWords()));
    $('#optsBtn').addEventListener('click', setup);
  }

  setup();

  return () => {
    gen++;
    setKeys(null);
    audio.pause();
    audio.removeAttribute('src');
  };
}
