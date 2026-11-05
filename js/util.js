import { parseLrc } from './lrc.js';
import { readTags } from './id3.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
export function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2400);
}

export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ---------- Song catalogue ----------
let songsPromise;
export function loadSongs() {
  if (!songsPromise) {
    songsPromise = fetch('songs/songs.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error('songs.json not found'); return r.json(); })
      .then((d) => (Array.isArray(d) ? d : d.songs || []))
      .catch((e) => { songsPromise = null; throw e; });
  }
  return songsPromise;
}

let translationOverridesPromise;
export function loadTranslationOverrides() {
  if (!translationOverridesPromise) {
    translationOverridesPromise = fetch('songs/translation-overrides.json', { cache: 'no-cache' })
      .then((r) => { if (!r.ok) throw new Error(`Couldn't load songs/translation-overrides.json (HTTP ${r.status})`); return r.json(); })
      .then((data) => {
        if (!data || typeof data !== 'object' || Array.isArray(data)) {
          throw new Error('songs/translation-overrides.json must contain a JSON object');
        }
        return data;
      })
      .catch((error) => { translationOverridesPromise = null; throw error; });
  }
  return translationOverridesPromise;
}

export async function getSong(id) {
  const songs = await loadSongs();
  const song = songs.find((s) => s.id === id);
  return song ? withTags(song) : null;
}

// ISO 639-2 (used inside ID3 tags) -> ISO 639-1 (used for translation)
const LANG3 = { fra: 'fr', fre: 'fr', eng: 'en', spa: 'es', deu: 'de', ger: 'de', ita: 'it', por: 'pt', nld: 'nl', dut: 'nl',
  tur: 'tr', ara: 'ar', rus: 'ru', pol: 'pl', swe: 'sv', jpn: 'ja', kor: 'ko', zho: 'zh', chi: 'zh', hin: 'hi', ell: 'el', gre: 'el',
  ukr: 'uk', ron: 'ro', rum: 'ro', ces: 'cs', cze: 'cs' };

/**
 * Fill in anything songs.json leaves out (title, artist, cover, language)
 * from the tags embedded in the MP3.
 */
export async function withTags(song) {
  const tags = await readTags(song.audio);
  if (!tags) return song;
  const lang3 = tags.sylt?.lang || tags.uslt?.lang;
  return {
    ...song,
    title: song.title || tags.title || song.id,
    artist: song.artist || tags.artist || '',
    cover: song.cover || tags.cover,
    language: song.language || LANG3[lang3?.toLowerCase()] || '',
  };
}

const finish = (lines) => {
  lines.sort((a, b) => a.time - b.time);
  lines.forEach((l, i) => { l.end = i + 1 < lines.length ? lines[i + 1].time : Infinity; });
  return lines;
};

/**
 * Lyrics for a song, in order of preference:
 *   1. a separate .lrc file, if songs.json gives a "lyrics" path
 *   2. synchronised lyrics embedded in the MP3 (ID3 SYLT frame)
 *   3. lyrics text embedded in the MP3 (ID3 USLT frame) — timed if it
 *      contains [mm:ss.xx] stamps, otherwise shown without highlighting
 * Returns { lines: [{time, end, text}], synced, source }.
 */
export async function loadLyrics(song) {
  if (song.lyrics) {
    try {
      const res = await fetch(song.lyrics, { cache: 'no-cache' });
      if (res.ok) {
        const { lines } = parseLrc(await res.text());
        if (lines.length) return { lines, synced: true, source: 'file' };
      }
    } catch {}
  }
  const tags = await readTags(song.audio);
  if (tags?.sylt) {
    return { lines: finish(tags.sylt.lines.map((l) => ({ time: l.t / 1000, text: l.text }))), synced: true, source: 'embedded' };
  }
  if (tags?.uslt?.text) {
    const { lines } = parseLrc(tags.uslt.text);
    if (lines.length) return { lines, synced: true, source: 'embedded' };
    const plain = tags.uslt.text.split(/\r?\n/).map((t) => t.trim());
    return { lines: plain.map((text, i) => ({ time: i, end: i + 1, text })), synced: false, source: 'embedded' };
  }
  return { lines: [], synced: false, source: 'none' };
}

export async function loadTranslation(song) {
  if (!song.translation) return '';
  const res = await fetch(song.translation, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Couldn't load ${song.translation} (HTTP ${res.status})`);
  return res.text();
}

/** Deterministic colour pair for a song cover when no image is provided. */
export function coverStyle(song) {
  let h = 0;
  for (const ch of song.id) h = (h * 31 + ch.charCodeAt(0)) % 360;
  return `--c1: hsl(${h} 62% 52%); --c2: hsl(${(h + 40) % 360} 70% 30%);`;
}

export function coverHtml(song, cls = '') {
  if (song.cover) return `<div class="cover ${cls}"><img src="${esc(song.cover)}" alt=""></div>`;
  return `<div class="cover ${cls}" style="${coverStyle(song)}"><span class="cover-groove"></span><span class="cover-label">${esc((song.title || '?')[0])}</span></div>`;
}
