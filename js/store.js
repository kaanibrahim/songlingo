// Persistence layer: saved words and settings live in localStorage so the app works on
// static hosting (GitHub Pages) with no backend.

const KEYS = {
  words: 'songlingo.words.v1',
  settings: 'songlingo.settings.v1',
  translations: 'songlingo.translations.v1',
};

const DEFAULT_SETTINGS = { autoPause: true, adminMode: false, showLineTranslations: true };

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.warn('Could not save to localStorage', e);
  }
}

const listeners = new Set();
export function onWordsChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }
function emit() { listeners.forEach((fn) => fn(getWords())); }

// ---------- Settings ----------
export function getSettings() {
  return { ...DEFAULT_SETTINGS, ...read(KEYS.settings, {}) };
}
export function setSettings(patch) {
  write(KEYS.settings, { ...getSettings(), ...patch });
}

// ---------- Translation overrides ----------
const normaliseTranslationKey = (text) => text.trim().toLocaleLowerCase('tr');

export function getTranslationOverrides() {
  const overrides = read(KEYS.translations, {});
  return overrides && typeof overrides === 'object' && !Array.isArray(overrides) ? overrides : {};
}

export function setTranslationOverride(songId, text, translation) {
  const overrides = getTranslationOverrides();
  const current = overrides[songId];
  const songOverrides = current && typeof current === 'object' && !Array.isArray(current) ? current : {};
  songOverrides[normaliseTranslationKey(text)] = translation;
  write(KEYS.translations, { ...overrides, [songId]: songOverrides });
}

// ---------- Saved words ----------
export function getWords() {
  return read(KEYS.words, []);
}

function saveWords(words) {
  write(KEYS.words, words);
  emit();
}

const normalise = (s) => s.trim().toLocaleLowerCase();

export function findWord(songId, text) {
  return getWords().find((w) => w.songId === songId && normalise(w.text) === normalise(text));
}

/**
 * Add a word/phrase. If the same text already exists for the song,
 * update its translation instead of duplicating it.
 */
export function addWord(entry) {
  const words = getWords();
  const existing = words.find((w) => w.songId === entry.songId && normalise(w.text) === normalise(entry.text));
  if (existing) {
    Object.assign(existing, { translation: entry.translation, line: entry.line, lineStart: entry.lineStart, lineEnd: entry.lineEnd });
    saveWords(words);
    return existing;
  }
  const word = {
    id: crypto.randomUUID ? crypto.randomUUID() : String(Date.now() + Math.random()),
    songId: entry.songId,
    text: entry.text.trim(),
    translation: (entry.translation || '').trim(),
    line: entry.line || '',
    lineStart: entry.lineStart ?? null,
    lineEnd: entry.lineEnd ?? null,
    from: entry.from || '',
    to: entry.to || '',
    createdAt: Date.now(),
    box: 0,        // mastery level 0–5 (Leitner-style)
    correct: 0,
    wrong: 0,
    lastReviewed: null,
  };
  words.push(word);
  saveWords(words);
  return word;
}

export function updateWord(id, patch) {
  const words = getWords();
  const w = words.find((x) => x.id === id);
  if (!w) return;
  Object.assign(w, patch);
  saveWords(words);
}

export function deleteWord(id) {
  saveWords(getWords().filter((w) => w.id !== id));
}

/** Record a practice answer and move the card between mastery boxes. */
export function recordAnswer(id, isCorrect) {
  const words = getWords();
  const w = words.find((x) => x.id === id);
  if (!w) return;
  if (isCorrect) { w.correct++; w.box = Math.min(5, w.box + 1); }
  else { w.wrong++; w.box = Math.max(0, w.box - 2); }
  w.lastReviewed = Date.now();
  saveWords(words);
}

export function exportWords() {
  return JSON.stringify({ app: 'songlingo', version: 1, exportedAt: new Date().toISOString(), words: getWords() }, null, 2);
}

export function importWords(json) {
  const data = JSON.parse(json);
  const incoming = Array.isArray(data) ? data : data.words;
  if (!Array.isArray(incoming)) throw new Error('No words found in file');
  const words = getWords();
  const ids = new Set(words.map((w) => w.id));
  let added = 0;
  for (const w of incoming) {
    if (!w || !w.text || !w.songId) continue;
    if (ids.has(w.id) || words.some((x) => x.songId === w.songId && normalise(x.text) === normalise(w.text))) continue;
    words.push({ box: 0, correct: 0, wrong: 0, ...w });
    added++;
  }
  saveWords(words);
  return added;
}
