// LRC (synced lyrics) parsing and serialising.
// Format:  [mm:ss.xx] lyric line
// A line may carry several timestamps: [00:12.00][01:40.50] chorus line

const TIME_RE = /\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/g;
const META_RE = /^\[(ti|ar|al|by|offset|length|re|ve|la|lang):(.*)\]$/i;

export function parseLrc(text) {
  const meta = {};
  const lines = [];
  if (!text) return { meta, lines };

  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    const m = line.match(META_RE);
    if (m) { meta[m[1].toLowerCase()] = m[2].trim(); continue; }

    const times = [];
    let match;
    TIME_RE.lastIndex = 0;
    let lastIndex = 0;
    while ((match = TIME_RE.exec(line)) !== null) {
      if (match.index !== lastIndex) break; // timestamps must be at the start
      const min = parseInt(match[1], 10);
      const sec = parseFloat(match[2].replace(':', '.'));
      times.push(min * 60 + sec);
      lastIndex = TIME_RE.lastIndex;
    }
    if (!times.length) continue;
    const lyric = line.slice(lastIndex).trim();
    for (const t of times) lines.push({ time: t, text: lyric });
  }

  const offset = meta.offset ? parseInt(meta.offset, 10) / 1000 : 0;
  lines.forEach((l) => { l.time = Math.max(0, l.time + offset); });
  lines.sort((a, b) => a.time - b.time);
  lines.forEach((l, i) => { l.end = i + 1 < lines.length ? lines[i + 1].time : Infinity; });
  return { meta, lines };
}

export function formatTime(t, withCentis = true) {
  if (!isFinite(t) || t < 0) t = 0;
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  if (!withCentis) return `${m}:${String(Math.floor(s)).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${s.toFixed(2).padStart(5, '0')}`;
}

export function toLrc(lines, meta = {}) {
  const head = Object.entries(meta)
    .filter(([, v]) => v)
    .map(([k, v]) => `[${k}:${v}]`);
  const body = lines
    .filter((l) => l.time != null)
    .sort((a, b) => a.time - b.time)
    .map((l) => `[${formatTime(l.time)}]${l.text}`);
  return [...head, ...body].join('\n') + '\n';
}

/** Index of the line active at time t (binary search), or -1 before first line. */
export function activeLineIndex(lines, t) {
  let lo = 0, hi = lines.length - 1, ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (lines[mid].time <= t + 0.05) { ans = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return ans;
}

/** Split a lyric line into word and non-word tokens (keeps apostrophes & hyphens inside words). */
export function tokenize(text) {
  const tokens = [];
  const re = /[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*['’]?/gu;
  let last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) tokens.push({ word: false, text: text.slice(last, m.index) });
    tokens.push({ word: true, text: m[0] });
    last = re.lastIndex;
  }
  if (last < text.length) tokens.push({ word: false, text: text.slice(last) });
  return tokens;
}
