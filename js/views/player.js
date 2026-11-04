import { $, $$, esc, toast, getSong, loadLyrics, loadTranslation, coverHtml } from '../util.js';
import { tokenize, activeLineIndex, formatTime } from '../lrc.js';
import { getSettings, addWord, findWord, getWords, deleteWord, onWordsChange } from '../store.js';
import { translate, dictionaryLinks, LANGUAGES } from '../translate.js';

const ICON_PLAY = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M7 4.5v15l13-7.5z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="26" height="26"><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/></svg>';

export async function renderPlayer(root, songId) {
  const song = await getSong(songId);
  if (!song) {
    root.innerHTML = `<section class="empty"><h2>Song not found</h2><p><a href="#/">Back to songs</a></p></section>`;
    return;
  }
  const [lyrics, translationResult] = await Promise.all([
    loadLyrics(song),
    song.translation
      ? loadTranslation(song).then((text) => ({ text }), (error) => ({ error }))
      : Promise.resolve({ text: '' }),
  ]);
  const translation = translationResult.text || '';
  const lines = lyrics.lines;
  const settings = getSettings();
  const from = song.language || 'auto';
  const to = song.translationLanguage || settings.targetLang;
  const manualLines = translation.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const lyricLines = lines.filter((line) => line.text);

  root.innerHTML = `
    <section class="player-view">
      <div class="player-head">
        <a href="#/" class="back" aria-label="Back to songs">←</a>
        ${coverHtml(song, 'small')}
        <div class="player-title">
          <h1>${esc(song.title)}</h1>
          <p>${esc(song.artist || '')}${song.language ? ` · ${esc(LANGUAGES[song.language] || song.language)} → ${esc(LANGUAGES[to] || to)}` : ''}</p>
        </div>
        <div class="player-head-actions">
          <a class="btn ghost small" href="#/practice?song=${encodeURIComponent(song.id)}">Practise <span id="songWordCount"></span></a>
        </div>
      </div>

      <p class="hint">Tap a word to translate it. Drag across several words (or tap one, then shift-tap another) to translate a phrase.</p>

      <div id="notices"></div>
      <div class="lyrics" id="lyrics" aria-live="off"></div>
      ${song.translation ? `<section class="manual-translation" aria-labelledby="translationTitle">
        <h2 id="translationTitle">${esc(LANGUAGES[song.translationLanguage] || song.translationLanguage || 'Manual translation')}</h2>
        ${translationResult.error
          ? `<p class="notice error">${esc(translationResult.error.message)}</p>`
          : `<div class="manual-translation-text">${esc(translation.trim())}</div>`}
      </section>` : ''}

      <div class="controls" id="controls">
        <button class="ctl" id="backBtn" title="Back 5 seconds (←)" aria-label="Back 5 seconds">−5</button>
        <button class="play" id="playBtn" title="Play / pause (space)" aria-label="Play">${ICON_PLAY}</button>
        <button class="ctl" id="fwdBtn" title="Forward 5 seconds (→)" aria-label="Forward 5 seconds">+5</button>
        <div class="progress">
          <span id="curTime">0:00</span>
          <input type="range" id="seek" min="0" max="100" step="0.1" value="0" aria-label="Seek">
          <span id="durTime">0:00</span>
        </div>
        <button class="ctl toggle" id="loopBtn" title="Loop the current line (L)" aria-pressed="false">Loop line</button>
        <select id="speed" class="ctl" title="Playback speed" aria-label="Playback speed">
          <option value="0.6">0.6×</option><option value="0.75">0.75×</option><option value="0.9">0.9×</option>
          <option value="1" selected>1×</option><option value="1.25">1.25×</option>
        </select>
      </div>

      <audio id="audio" preload="auto" src="${esc(song.audio)}"></audio>
    </section>

    <div class="lookup" id="lookup" hidden role="dialog" aria-label="Translation">
      <button class="icon-btn close" id="lookupClose" aria-label="Close">×</button>
      <p class="lookup-src" id="lookupSrc"></p>
      <div class="lookup-tr" id="lookupTr"></div>
      <label class="field compact">
        <span>Your translation (edit if needed)</span>
        <input type="text" id="lookupInput" autocomplete="off">
      </label>
      <div class="row">
        <button class="btn" id="saveBtn">Save word</button>
        <button class="btn ghost" id="replayBtn" title="Replay this line">▶ Line</button>
        <button class="btn ghost danger" id="unsaveBtn" hidden>Remove</button>
      </div>
      <p class="lookup-links" id="lookupLinks"></p>
    </div>`;

  const audio = $('#audio');
  const lyricsEl = $('#lyrics');
  const playBtn = $('#playBtn');
  const seek = $('#seek');
  const lookup = $('#lookup');

  // ---------- Render lyrics ----------
  if (!lines.length) {
    lyricsEl.innerHTML = `
      <div class="empty inline">
        <h3>No lyrics found</h3>
        <p>You can still play the song. Lyrics are read from the MP3 file itself, and this one has none embedded. Use an MP3 with embedded synced lyrics, or set a <code>"lyrics"</code> .lrc file for this song in <code>songs/songs.json</code>.</p>
      </div>`;
  } else {
    lyricsEl.innerHTML = '<div class="lyrics-pad"></div>' + lines.map((l, li) => {
      if (!l.text) return `<div class="line gap" data-l="${li}" aria-hidden="true"><span class="gap-dots"><i></i><i></i><i></i></span></div>`;
      const tokens = tokenize(l.text);
      let wi = 0;
      const html = tokens.length
        ? tokens.map((t) => t.word ? `<span class="w" data-l="${li}" data-i="${wi++}">${esc(t.text)}</span>` : `<span class="sep">${esc(t.text)}</span>`).join('')
        : '';
      return `<div class="line" data-l="${li}">
        <button class="line-seek" data-l="${li}" title="Play from here" aria-label="Play from ${formatTime(l.time, false)}">${formatTime(l.time, false)}</button>
        <p class="line-text">${html}</p>
      </div>`;
    }).join('') + '<div class="lyrics-pad"></div>';
  }
  if (!lyrics.synced && lines.length) {
    $('#notices').insertAdjacentHTML('beforeend', `<p class="notice">This file's lyrics have no timestamps, so they won't follow the music — but you can still tap words to translate them.</p>`);
    lyricsEl.classList.add('unsynced');
  }

  const lineEls = $$('.line', lyricsEl);

  function markSaved() {
    const saved = getWords().filter((w) => w.songId === song.id).map((w) => w.text.toLocaleLowerCase());
    const savedSet = new Set(saved);
    $$('.w', lyricsEl).forEach((el) => el.classList.toggle('saved', savedSet.has(el.textContent.toLocaleLowerCase())));
    // Mark multi-word phrases too
    lineEls.forEach((lineEl) => {
      const ws = $$('.w', lineEl);
      const txt = ws.map((w) => w.textContent.toLocaleLowerCase());
      for (const phrase of saved) {
        const parts = phrase.split(/\s+/);
        if (parts.length < 2) continue;
        for (let i = 0; i + parts.length <= txt.length; i++) {
          if (parts.every((p, k) => txt[i + k].replace(/[^\p{L}\p{N}'’-]/gu, '') === p.replace(/[^\p{L}\p{N}'’-]/gu, ''))) {
            for (let k = 0; k < parts.length; k++) ws[i + k].classList.add('saved');
          }
        }
      }
    });
    const n = saved.length;
    $('#songWordCount').textContent = n ? `(${n})` : '';
  }
  markSaved();
  const offWords = onWordsChange(markSaved);

  // ---------- Playback ----------
  let current = -1;
  let loop = null;          // { start, end } when looping a line
  let userScrolledAt = 0;

  const setPlayIcon = () => {
    const playing = !audio.paused;
    playBtn.innerHTML = playing ? ICON_PAUSE : ICON_PLAY;
    playBtn.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    document.body.classList.toggle('is-playing', playing);
  };

  const togglePlay = () => {
    if (audio.paused) audio.play().catch(() => toast('Could not play audio — check the file path in songs.json'));
    else audio.pause();
  };

  const seekTo = (t) => {
    audio.currentTime = Math.max(0, Math.min(t, audio.duration || t));
    update(true);
  };

  function update(force = false) {
    if (!lyrics.synced) force = false;
    const t = lyrics.synced ? audio.currentTime : -1;
    if (loop && t >= loop.end) { audio.currentTime = loop.start; return; }
    if (!seek.matches(':active')) seek.value = audio.duration ? (audio.currentTime / audio.duration) * 100 : 0;
    $('#curTime').textContent = formatTime(audio.currentTime, false);

    const idx = activeLineIndex(lines, t);
    if (idx !== current || force) {
      if (lineEls[current]) lineEls[current].classList.remove('active');
      current = idx;
      lineEls.forEach((el, i) => el.classList.toggle('past', i < idx));
      if (lineEls[idx]) {
        lineEls[idx].classList.add('active');
        if (Date.now() - userScrolledAt > 3500) scrollToLine(idx);
      }
    }
  }

  function scrollToLine(i) {
    const el = lineEls[i];
    if (!el) return;
    const top = el.offsetTop - lyricsEl.clientHeight / 2 + el.clientHeight / 2;
    lyricsEl.scrollTo({ top, behavior: 'smooth' });
  }

  let raf;
  const tick = () => { update(); raf = requestAnimationFrame(tick); };

  audio.addEventListener('play', () => { setPlayIcon(); cancelAnimationFrame(raf); tick(); });
  audio.addEventListener('pause', () => { setPlayIcon(); cancelAnimationFrame(raf); update(); });
  audio.addEventListener('ended', () => { setPlayIcon(); });
  audio.addEventListener('loadedmetadata', () => { $('#durTime').textContent = formatTime(audio.duration, false); });
  audio.addEventListener('error', () => {
    $('#notices').insertAdjacentHTML('beforeend', `<p class="notice error">Couldn't load the audio file <code>${esc(song.audio)}</code>. Check that the file exists and the path in <code>songs/songs.json</code> matches (paths are case-sensitive on GitHub Pages).</p>`);
  });

  playBtn.addEventListener('click', togglePlay);
  $('#backBtn').addEventListener('click', () => seekTo(audio.currentTime - 5));
  $('#fwdBtn').addEventListener('click', () => seekTo(audio.currentTime + 5));
  seek.addEventListener('input', () => { if (audio.duration) seekTo((seek.value / 100) * audio.duration); });
  $('#speed').addEventListener('change', (e) => { audio.playbackRate = parseFloat(e.target.value); });

  const loopBtn = $('#loopBtn');
  const setLoop = (on) => {
    let i = Math.max(0, current);
    while (lines[i] && !lines[i].text && i > 0) i--;
    const l = lines[i];
    loop = on && l ? { start: l.time, end: isFinite(l.end) ? l.end : (audio.duration || l.time + 8) } : null;
    loopBtn.setAttribute('aria-pressed', String(!!loop));
    loopBtn.classList.toggle('on', !!loop);
    if (loop) toast('Looping this line');
  };
  loopBtn.addEventListener('click', () => setLoop(!loop));

  ['wheel', 'touchmove'].forEach((ev) => lyricsEl.addEventListener(ev, () => { userScrolledAt = Date.now(); }, { passive: true }));

  // Line seek buttons
  lyricsEl.addEventListener('click', (e) => {
    const b = e.target.closest('.line-seek');
    if (!b) return;
    const l = lines[+b.dataset.l];
    if (loop) setLoop(false);
    seekTo(l.time);
    userScrolledAt = 0;
    if (audio.paused) togglePlay();
  });

  // ---------- Word / phrase selection ----------
  let sel = null;       // { line, a, b }
  let anchor = null;    // { line, i } for shift-click
  let dragging = false;
  let wasPlaying = false;

  const wordsOf = (li) => $$(`.w[data-l="${li}"]`, lyricsEl);

  function paintSelection() {
    $$('.w.sel', lyricsEl).forEach((el) => el.classList.remove('sel'));
    if (!sel) return;
    const ws = wordsOf(sel.line);
    const lo = Math.min(sel.a, sel.b), hi = Math.max(sel.a, sel.b);
    for (let i = lo; i <= hi; i++) ws[i]?.classList.add('sel');
  }

  function selectedText() {
    if (!sel) return '';
    const lineText = lines[sel.line].text;
    const ws = wordsOf(sel.line);
    const lo = Math.min(sel.a, sel.b), hi = Math.max(sel.a, sel.b);
    // Slice the original line so punctuation/apostrophes between words are kept
    const tokens = tokenize(lineText);
    let wi = -1, out = '', on = false;
    for (const t of tokens) {
      if (t.word) wi++;
      if (t.word && wi === lo) on = true;
      if (on) out += t.text;
      if (t.word && wi === hi) break;
    }
    return out.trim() || ws.slice(lo, hi + 1).map((w) => w.textContent).join(' ');
  }

  lyricsEl.addEventListener('pointerdown', (e) => {
    const w = e.target.closest('.w');
    if (!w) return;
    e.preventDefault();
    const li = +w.dataset.l, i = +w.dataset.i;
    if (e.shiftKey && anchor && anchor.line === li) {
      sel = { line: li, a: anchor.i, b: i };
    } else {
      sel = { line: li, a: i, b: i };
      anchor = { line: li, i };
    }
    dragging = true;
    paintSelection();
  });

  window.addEventListener('pointermove', onPointerMove);
  function onPointerMove(e) {
    if (!dragging || !sel) return;
    const el = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.w');
    if (el && +el.dataset.l === sel.line && +el.dataset.i !== sel.b) {
      sel.b = +el.dataset.i;
      paintSelection();
    }
  }
  window.addEventListener('pointerup', onPointerUp);
  function onPointerUp() {
    if (!dragging) return;
    dragging = false;
    if (sel) openLookup();
  }

  // ---------- Lookup popup ----------
  let lookupReq = 0;
  async function openLookup() {
    const text = selectedText();
    if (!text) return;
    const line = lines[sel.line];
    const reqId = ++lookupReq;

    if (getSettings().autoPause && !audio.paused) { wasPlaying = true; audio.pause(); }

    $('#lookupSrc').textContent = text;
    $('#lookupLinks').innerHTML = 'More: ' + dictionaryLinks(text, from, to).map((l) => `<a href="${l.url}" target="_blank" rel="noopener">${l.label}</a>`).join(' · ');
    const input = $('#lookupInput');
    const existing = findWord(song.id, text);
    $('#unsaveBtn').hidden = !existing;
    $('#saveBtn').textContent = existing ? 'Update' : 'Save word';
    input.value = existing?.translation || '';
    lookup.hidden = false;
    positionLookup();

    const trEl = $('#lookupTr');
    if (translation && !translationResult.error) {
      if (manualLines.length !== lyricLines.length) {
        trEl.innerHTML = `<p class="muted">This manual translation has ${manualLines.length} non-empty lines, but the lyrics have ${lyricLines.length}. Add one translated line per lyric line to enable tap lookup.</p>`;
        return;
      }
      const lyricIndex = lines.slice(0, sel.line + 1).filter((lyric) => lyric.text).length - 1;
      const manualTranslation = manualLines[lyricIndex];
      trEl.innerHTML = `<p class="tr-main">${esc(manualTranslation)}</p><p class="muted">Manual translation of this lyric line</p>`;
      if (!existing) input.value = manualTranslation;
      return;
    }
    if (from === 'auto' || from === to) {
      trEl.innerHTML = `<p class="muted">Set a <code>language</code> for this song in songs.json to get automatic translations.</p>`;
      return;
    }
    trEl.innerHTML = '<p class="muted pulse">Translating…</p>';
    try {
      const r = await translate(text, from, to);
      if (reqId !== lookupReq) return;
      trEl.innerHTML = `<p class="tr-main">${esc(r.main)}</p>` +
        (r.alternatives.length ? `<p class="tr-alt">${r.alternatives.map((a) => `<button class="alt" type="button">${esc(a)}</button>`).join('')}</p>` : '');
      if (!existing) input.value = r.main;
      $$('.alt', trEl).forEach((b) => b.addEventListener('click', () => { input.value = b.textContent; }));
    } catch (err) {
      if (reqId !== lookupReq) return;
      trEl.innerHTML = `<p class="muted">Couldn't reach the translation service. Type your own translation below, or use one of the links.</p>`;
    }
  }

  function positionLookup() {
    if (window.matchMedia('(max-width: 640px)').matches) { lookup.style.left = lookup.style.top = ''; return; }
    const ws = $$('.w.sel', lyricsEl);
    if (!ws.length) return;
    const r1 = ws[0].getBoundingClientRect();
    const r2 = ws[ws.length - 1].getBoundingClientRect();
    const box = lookup.getBoundingClientRect();
    let left = (r1.left + r2.right) / 2 - box.width / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - box.width - 12));
    let top = r2.bottom + 10;
    if (top + box.height > window.innerHeight - 100) top = r1.top - box.height - 10;
    lookup.style.left = `${left}px`;
    lookup.style.top = `${Math.max(12, top)}px`;
  }

  function closeLookup() {
    lookup.hidden = true;
    sel = null;
    paintSelection();
    if (wasPlaying) { wasPlaying = false; audio.play().catch(() => {}); }
  }

  $('#lookupClose').addEventListener('click', closeLookup);
  $('#saveBtn').addEventListener('click', () => {
    const text = $('#lookupSrc').textContent;
    const translation = $('#lookupInput').value.trim();
    if (!translation) { toast('Add a translation first'); $('#lookupInput').focus(); return; }
    const line = lines[sel?.line ?? 0];
    const existed = !!findWord(song.id, text);
    addWord({
      songId: song.id, text, translation, from, to,
      line: line?.text, lineStart: line?.time,
      lineEnd: line && isFinite(line.end) ? line.end : (line ? line.time + 6 : null),
    });
    toast(existed ? 'Updated' : `Saved “${text}”`);
    closeLookup();
  });
  $('#unsaveBtn').addEventListener('click', () => {
    const w = findWord(song.id, $('#lookupSrc').textContent);
    if (w) deleteWord(w.id);
    toast('Removed');
    closeLookup();
  });
  $('#lookupInput').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('#saveBtn').click(); });
  $('#replayBtn').addEventListener('click', () => {
    if (!sel) return;
    const l = lines[sel.line];
    wasPlaying = false;
    seekTo(l.time);
    audio.play().catch(() => {});
    const end = isFinite(l.end) ? l.end : l.time + 6;
    const stop = () => { if (audio.currentTime >= end) { audio.pause(); audio.removeEventListener('timeupdate', stop); } };
    audio.addEventListener('timeupdate', stop);
  });

  // Close popup when clicking elsewhere
  const onDocDown = (e) => {
    if (lookup.hidden) return;
    if (lookup.contains(e.target) || e.target.closest('.w')) return;
    closeLookup();
  };
  document.addEventListener('pointerdown', onDocDown);

  // ---------- Keyboard shortcuts ----------
  const onKey = (e) => {
    if (e.target.matches('input, textarea, select')) return;
    if (e.key === ' ') { e.preventDefault(); togglePlay(); }
    else if (e.key === 'ArrowLeft') seekTo(audio.currentTime - 5);
    else if (e.key === 'ArrowRight') seekTo(audio.currentTime + 5);
    else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && lines.length) {
      e.preventDefault();
      const dir = e.key === 'ArrowUp' ? -1 : 1;
      let i = current + dir;
      while (lines[i] && !lines[i].text) i += dir;
      if (lines[i]) seekTo(lines[i].time);
    }
    else if (e.key.toLowerCase() === 'l') setLoop(!loop);
    else if (e.key === 'Escape' && !lookup.hidden) closeLookup();
  };
  document.addEventListener('keydown', onKey);
  window.addEventListener('resize', positionLookup);

  update(true);

  return () => {
    cancelAnimationFrame(raf);
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    offWords();
    document.body.classList.remove('is-playing');
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointerdown', onDocDown);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('resize', positionLookup);
  };
}
