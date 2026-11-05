import { $, $$, esc, loadSongs } from '../util.js';
import { getWords, deleteWord } from '../store.js';

function masteryDots(box) {
  return `<span class="mastery" title="Mastery ${box}/5">${[1, 2, 3, 4, 5].map((i) => `<i class="${i <= box ? 'on' : ''}"></i>`).join('')}</span>`;
}

function highlight(line, text) {
  const safe = esc(line);
  const t = esc(text).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  try { return safe.replace(new RegExp(`(${t})`, 'i'), '<mark>$1</mark>'); } catch { return safe; }
}

export async function renderWords(root) {
  let songs = [];
  try { songs = await loadSongs(); } catch {}
  const songById = Object.fromEntries(songs.map((s) => [s.id, s]));

  root.innerHTML = `
    <section>
      <div class="section-head">
        <h1>My words</h1>
        <input type="search" id="wordSearch" class="search" placeholder="Search words…" aria-label="Search saved words">
      </div>
      <div id="wordGroups"></div>
    </section>`;

  const container = $('#wordGroups');

  function render() {
    const q = $('#wordSearch').value.trim().toLowerCase();
    const words = getWords().filter((w) => !q || w.text.toLowerCase().includes(q) || w.translation.toLowerCase().includes(q));

    if (!getWords().length) {
      container.innerHTML = `<div class="empty"><h3>No saved words yet</h3><p>Open a song and tap any word you don't understand to save it here.</p><a class="btn" href="#/">Browse songs</a></div>`;
      return;
    }
    if (!words.length) { container.innerHTML = '<p class="muted">No matches.</p>'; return; }

    // Group by song, keeping the order of songs.json, unknown songs last
    const groups = new Map();
    for (const w of words) {
      if (!groups.has(w.songId)) groups.set(w.songId, []);
      groups.get(w.songId).push(w);
    }
    const order = [...groups.keys()].sort((a, b) => {
      const ia = songs.findIndex((s) => s.id === a), ib = songs.findIndex((s) => s.id === b);
      return (ia < 0 ? 1e9 : ia) - (ib < 0 ? 1e9 : ib);
    });

    container.innerHTML = order.map((songId) => {
      const song = songById[songId] || { title: songId, artist: '' };
      const list = groups.get(songId).sort((a, b) => b.createdAt - a.createdAt);
      const mastered = list.filter((w) => w.box >= 4).length;
      return `
        <article class="word-group">
          <header>
            <div>
              <h2>${esc(song.title)}</h2>
              <p class="muted">${esc(song.artist)} · ${list.length} word${list.length === 1 ? '' : 's'} · ${mastered} mastered</p>
            </div>
            <div class="row">
              ${songById[songId] ? `<a class="btn ghost small" href="#/song/${encodeURIComponent(songId)}">Listen</a>` : ''}
              <a class="btn small" href="#/practice?song=${encodeURIComponent(songId)}">Practise</a>
            </div>
          </header>
          <ul class="word-list">
            ${list.map((w) => `
              <li data-id="${w.id}">
                <div class="wl-main">
                  <strong class="wl-text">${esc(w.text)}</strong>
                  <span class="wl-translation">${esc(w.translation || w.text)}</span>
                </div>
                ${w.line ? `<p class="wl-line">“${highlight(w.line, w.text)}”</p>` : ''}
                <div class="wl-side">
                  ${masteryDots(w.box)}
                  <button class="icon-btn del" title="Delete" aria-label="Delete ${esc(w.text)}">
                    <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14"/></svg>
                  </button>
                </div>
              </li>`).join('')}
          </ul>
        </article>`;
    }).join('');

    $$('.del', container).forEach((b) => {
      b.addEventListener('click', () => {
        const li = b.closest('li');
        deleteWord(li.dataset.id);
        render();
      });
    });
  }

  $('#wordSearch').addEventListener('input', render);
  render();
}
