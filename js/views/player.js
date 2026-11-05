import { $, $$, esc, toast, getSong, loadLyrics, coverHtml } from '../util.js';
import { tokenize, activeLineIndex, formatTime } from '../lrc.js';
import { getSettings, addWord, findWord, getWords, deleteWord, onWordsChange } from '../store.js';
import { LANGUAGES } from '../languages.js';

const ICON_PLAY = '<svg viewBox="0 0 24 24" width="26" height="26"><path d="M7 4.5v15l13-7.5z" fill="currentColor"/></svg>';
const ICON_PAUSE = '<svg viewBox="0 0 24 24" width="26" height="26"><rect x="6" y="4.5" width="4" height="15" rx="1" fill="currentColor"/><rect x="14" y="4.5" width="4" height="15" rx="1" fill="currentColor"/></svg>';

const AYNALI_KEMER_PHRASES = [
  ['sabah yeli', 'morning breeze'],
  ['ılgıt ılgıt', 'gently'],
  ['eserken', 'while blowing'],
  ['seher vakti', 'at dawn'],
  ['bir güzel', 'a beauty'],
  ['bir güzele', 'a beauty'],
  ['vuruldum', 'I fell for'],
  ['al dudak', 'red lips'],
  ['al dudakta', 'red lips'],
  ['inci dişi', 'pearly teeth'],
  ['bu dünyada', 'in this world'],
  ['yok bir eşi', 'she has no equal'],
  ['aynalı kemer', 'mirrored belt'],
  ['ince bel', 'slender waist'],
  ['ince bele', 'slender waist'],
  ['bu can kurban', 'I’d give my life'],
  ['tatlı dil', 'sweet words'],
  ['tatlı dile', 'sweet words'],
  ['mor menekşe', 'purple violet'],
  ['nergiz', 'daffodil'],
  ['dizmiş boynuna', 'strung around her neck'],
  ['kuşluk vakti', 'mid-morning'],
  ['aldı beni koynuna', 'took me in her arms'],
  ['cıvıldaşır', 'chirp together'],
  ['dudu kuşu', 'parrot'],
  ['sanki', 'as if'],
  ['bülbülün ötüşü', 'the nightingale’s song'],
  ['akşam oldu', 'evening came'],
  ['gün kavuştu', 'the sun set'],
  ['sessizce', 'quietly'],
  ['dedi güzel', 'the beauty said'],
  ['ayrılık vardır bize', 'we must part'],
  ['uzakta', 'in the distance'],
  ['bir baykuş öttü', 'an owl hooted'],
  ['gül bahçemde', 'in my rose garden'],
  ['diken bitti', 'a thorn grew'],
].map(([text, translation]) => ({
  words: text.toLocaleLowerCase('tr').split(/\s+/),
  translation,
})).sort((a, b) => b.words.length - a.words.length);

const DELI_OGLAN_PHRASES = [
  ['ne tarafa dönersem döneyim', 'No matter which way I turn'],
  ['yüzünü', 'your face'],
  ['görüyorum', 'I see'],
  ['hep', 'always'],
  ['her yerde sen', 'you’re everywhere'],
  ['sırrını bilemediğim', 'a mystery that I can’t figure out'],
  ["bi' çekim", 'an attraction'],
  ['var', 'there is'],
  ['beni kıskıvrak ele geçiren', 'That has me completely in its grip'],
  ['düşünsem', 'if I think'],
  ['ne olur', 'what does it matter?'],
  ['düşünmesem', 'If I don’t think'],
  ['beni çılgına çeviren neydi', 'what was it that drove me wild?'],
  ['dirensem', 'If I resist'],
  ['direnmesem', 'if I don’t resist?'],
  ['ten', 'skin'],
  ['eşini', 'it’s match'],
  ['seçiyor', 'chooses'],
  ['haydi', 'come on'],
  ['hadi', 'come on'],
  ['deli', 'wild'],
  ['oğlan', 'boy'],
  ['belime dolan', 'wrap your arms around my waist'],
  ["hele bi' öp bakalım", 'Go ahead and kiss'],
  ['kızı', 'the girl'],
  ['dudağından', 'on the lips'],
  ["olur da hani bi' de", 'and if by chance'],
  ['denk gelirse', 'it lines up'],
  ['dudaktan', 'from the lips'],
  ['kalbine', 'to your heart'],
  ['düşerse', 'if it travels'],
  ['tenle', 'with the skin'],
  ['yanar', 'it burns'],
  ['ruhla', 'with the soul'],
  ['tamamlanır', 'is completed'],
  ["hele bi'", 'especially'],
  ['aşkla', 'with love'],
  ['pişerse', 'if it’s tempered'],
  ['kalp', 'heart'],
  ['kalbi', 'the heart'],
  ['hisseder', 'senses'],
  ['olmaz mı', 'couldn’t it happen?'],
  ['hepi topu', 'all in all'],
  ['bu', 'this'],
  ['istediğim', 'what I want'],
  ['hayatta', 'in life'],
  ["dene n'olur", 'give it a try'],
  ['tutamam kendimi', 'I can’t hold myself back'],
  ['sen çıkardın beni baştan', 'you led me astray'],
  ['ateşe dans bu', 'this is a dance with fire'],
  ['kaçırma şans bu', 'don’t miss this chance'],
  ['aşk', 'love'],
  ['tehlikeyi', 'danger'],
  ['sever', 'loves'],
].map(([text, translation]) => ({
  words: text.toLocaleLowerCase('tr').split(/\s+/),
  translation,
})).sort((a, b) => b.words.length - a.words.length);

function findPhrase(tokens, start, phrases) {
  for (const phrase of phrases) {
    let tokenIndex = start;
    let matches = true;
    for (let wordIndex = 0; wordIndex < phrase.words.length; wordIndex++) {
      if (!tokens[tokenIndex]?.word || tokens[tokenIndex].text.toLocaleLowerCase('tr') !== phrase.words[wordIndex]) {
        matches = false;
        break;
      }
      if (wordIndex < phrase.words.length - 1) {
        const separator = tokens[tokenIndex + 1];
        if (!separator || separator.word || !/^\s+$/.test(separator.text)) {
          matches = false;
          break;
        }
        tokenIndex += 2;
      }
    }
    if (matches) return { end: tokenIndex, translation: phrase.translation };
  }
  return null;
}

export async function renderPlayer(root, songId) {
  const song = await getSong(songId);
  if (!song) {
    root.innerHTML = `<section class="empty"><h2>Song not found</h2><p><a href="#/">Back to songs</a></p></section>`;
    return;
  }
  const lyrics = await loadLyrics(song);
  const lines = lyrics.lines;
  const settings = getSettings();
  const from = song.language || '';
  const to = song.translationLanguage || 'en';

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

      <p class="hint">Tap a word or phrase to see its translation, or add one manually.</p>

      <div id="notices"></div>
      <div class="lyrics notranslate" id="lyrics" translate="no"${song.language ? ` lang="${esc(song.language)}"` : ''} aria-live="off"></div>

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
      <label class="field compact" id="lookupEdit" hidden>
        <span>Add a translation</span>
        <input type="text" id="lookupInput" autocomplete="off">
      </label>
      <div class="row">
        <button class="btn" id="saveBtn">Save word</button>
        <button class="btn ghost" id="replayBtn" title="Replay this line">▶ Line</button>
        <button class="btn ghost danger" id="unsaveBtn" hidden>Remove</button>
      </div>
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
    const phrases = song.id === 'aynali-kemer' ? AYNALI_KEMER_PHRASES
      : song.id === 'deli-oglan' ? DELI_OGLAN_PHRASES
        : [];
    const renderTokens = (tokens, lineIndex) => {
      let html = '';
      for (let i = 0; i < tokens.length;) {
        const token = tokens[i];
        if (!token.word) {
          html += `<span class="sep">${esc(token.text)}</span>`;
          i++;
          continue;
        }

        const match = findPhrase(tokens, i, phrases);

        const end = match?.end ?? i;
        const text = tokens.slice(i, end + 1).map((part) => part.text).join('');
        html += `<button class="w" type="button" data-l="${lineIndex}"${match ? ` data-translation="${esc(match.translation)}"` : ''}>${esc(text)}</button>`;
        i = end + 1;
      }
      return html;
    };

    lyricsEl.innerHTML = '<div class="lyrics-pad"></div>' + lines.map((l, li) => {
      if (!l.text) return `<div class="line gap" data-l="${li}" aria-hidden="true"><span class="gap-dots"><i></i><i></i><i></i></span></div>`;
      const html = renderTokens(tokenize(l.text), li);
      return `<div class="line" data-l="${li}">
        <button class="line-seek" data-l="${li}" title="Play from here" aria-label="Play from ${formatTime(l.time, false)}">${formatTime(l.time, false)}</button>
        <p class="line-text">${html}</p>
      </div>`;
    }).join('') + '<div class="lyrics-pad"></div>';
  }
  if (!lyrics.synced && lines.length) {
    $('#notices').insertAdjacentHTML('beforeend', `<p class="notice">This file's lyrics have no timestamps, so they won't follow the music — but you can still tap words to see supplied translations or add your own.</p>`);
    lyricsEl.classList.add('unsynced');
  }

  const lineEls = $$('.line', lyricsEl);

  function markSaved() {
    const saved = getWords().filter((w) => w.songId === song.id);
    const savedSet = new Set(saved.map((w) => w.text.toLocaleLowerCase(song.language || undefined)));
    $$('.w', lyricsEl).forEach((el) => el.classList.toggle('saved', savedSet.has(el.textContent.toLocaleLowerCase(song.language || undefined))));
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

  // ---------- Word / phrase lookup ----------
  let sel = null;       // { line, text, translation, element }
  let wasPlaying = false;

  // ---------- Lookup popup ----------
  function openLookup(element) {
    const text = element.textContent.trim();
    if (!text) return;
    sel = {
      line: +element.dataset.l,
      text,
      translation: element.dataset.translation || '',
      element,
    };

    if (getSettings().autoPause && !audio.paused) { wasPlaying = true; audio.pause(); }

    $('#lookupSrc').textContent = text;
    const existing = findWord(song.id, text);
    $('#unsaveBtn').hidden = !existing;
    $('#saveBtn').textContent = existing ? 'Update' : 'Save word';
    lookup.hidden = false;
    positionLookup();

    const trEl = $('#lookupTr');
    const input = $('#lookupInput');
    const edit = $('#lookupEdit');
    const knownTranslation = existing?.translation || sel.translation;
    if (knownTranslation) {
      edit.hidden = true;
      trEl.innerHTML = `<p class="tr-main">${esc(knownTranslation)}</p>`;
      return;
    }
    edit.hidden = false;
    input.value = existing?.translation || '';
    trEl.innerHTML = '<p class="muted">No translation supplied for this word. Add one below.</p>';
  }

  function positionLookup() {
    if (window.matchMedia('(max-width: 640px)').matches) { lookup.style.left = lookup.style.top = ''; return; }
    if (!sel?.element) return;
    const rect = sel.element.getBoundingClientRect();
    const box = lookup.getBoundingClientRect();
    let left = rect.left + rect.width / 2 - box.width / 2;
    left = Math.max(12, Math.min(left, window.innerWidth - box.width - 12));
    let top = rect.bottom + 10;
    if (top + box.height > window.innerHeight - 100) top = rect.top - box.height - 10;
    lookup.style.left = `${left}px`;
    lookup.style.top = `${Math.max(12, top)}px`;
  }

  function closeLookup() {
    lookup.hidden = true;
    sel?.element.classList.remove('sel');
    sel = null;
    if (wasPlaying) { wasPlaying = false; audio.play().catch(() => {}); }
  }

  lyricsEl.addEventListener('click', (e) => {
    const word = e.target.closest('.w');
    if (!word) return;
    $$('.w.sel', lyricsEl).forEach((el) => el.classList.remove('sel'));
    word.classList.add('sel');
    openLookup(word);
  });

  $('#lookupClose').addEventListener('click', closeLookup);
  $('#saveBtn').addEventListener('click', () => {
    if (!sel) return;
    const { text, line: lineIndex, translation: knownTranslation } = sel;
    const translation = findWord(song.id, text)?.translation || knownTranslation || $('#lookupInput').value.trim() || $('#lookupTr .tr-main')?.textContent?.trim();
    if (!translation) { toast('Translation not available'); return; }
    const line = lines[lineIndex];
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
    const w = sel && findWord(song.id, sel.text);
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
    window.removeEventListener('resize', positionLookup);
  };
}
