// Translation lookup. Uses the free MyMemory API, which allows requests from
// browsers (CORS) and needs no key — ideal for a static GitHub Pages site.
// Results are cached in memory and localStorage.

export const LANGUAGES = {
  en: 'English', fr: 'French', es: 'Spanish', de: 'German', it: 'Italian',
  pt: 'Portuguese', nl: 'Dutch', tr: 'Turkish', ar: 'Arabic', ru: 'Russian',
  pl: 'Polish', sv: 'Swedish', ja: 'Japanese', ko: 'Korean', zh: 'Chinese',
  hi: 'Hindi', el: 'Greek', uk: 'Ukrainian', ro: 'Romanian', cs: 'Czech',
};

const CACHE_KEY = 'songlingo.tcache.v1';
let cache;
function loadCache() {
  if (cache) return cache;
  try { cache = JSON.parse(localStorage.getItem(CACHE_KEY)) || {}; } catch { cache = {}; }
  return cache;
}
function saveCache() {
  try {
    const keys = Object.keys(cache);
    if (keys.length > 1500) keys.slice(0, keys.length - 1500).forEach((k) => delete cache[k]);
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {}
}

const decode = (s) => {
  const el = document.createElement('textarea');
  el.innerHTML = s;
  return el.value;
};

/**
 * Translate text. Returns { main, alternatives[] }.
 * Throws if the service can't be reached.
 */
export async function translate(text, from, to) {
  const q = text.trim();
  if (!q || from === to) return { main: q, alternatives: [] };
  const key = `${from}|${to}|${q.toLowerCase()}`;
  const c = loadCache();
  if (c[key]) return c[key];

  const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(q)}&langpair=${from}|${to}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  let data;
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } finally {
    clearTimeout(timer);
  }
  if (data.responseStatus && Number(data.responseStatus) !== 200) {
    throw new Error(data.responseDetails || 'Translation service error');
  }

  const main = decode(data.responseData?.translatedText || '').trim();
  const seen = new Set([main.toLowerCase()]);
  const alternatives = [];
  for (const m of data.matches || []) {
    const t = decode(m.translation || '').trim();
    if (!t || seen.has(t.toLowerCase())) continue;
    if ((m.segment || '').trim().toLowerCase() !== q.toLowerCase()) continue;
    seen.add(t.toLowerCase());
    alternatives.push(t);
    if (alternatives.length >= 3) break;
  }
  const result = { main, alternatives };
  if (main) { c[key] = result; saveCache(); }
  return result;
}

/** Links to fuller dictionary entries for when the user wants more detail. */
export function dictionaryLinks(text, from, to) {
  const q = encodeURIComponent(text.trim());
  const links = [
    { label: 'Google Translate', url: `https://translate.google.com/?sl=${from}&tl=${to}&text=${q}&op=translate` },
    { label: 'Wiktionary', url: `https://en.wiktionary.org/wiki/${encodeURIComponent(text.trim().toLowerCase())}` },
  ];
  if (['fr', 'es', 'it', 'pt', 'de'].includes(from) && to === 'en') {
    links.push({ label: 'WordReference', url: `https://www.wordreference.com/${from}en/${q}` });
  }
  return links;
}
