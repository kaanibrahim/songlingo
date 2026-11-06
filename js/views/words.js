import { $, $$, esc, loadSongs } from '../util.js';
import { getWords, deleteWord, deleteAllWords } from '../store.js';

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
  let editing = false;

  root.innerHTML = `
    <section>
      <div class="section-head">
        <div class="row">
          <h1>My words</h1>
          <button type="button" class="btn ghost small" id="wordEdit" aria-pressed="false">Edit</button>
          <button type="button" class="btn ghost small danger" id="wordDeleteAll" hidden>Delete all</button>
        </div>
        <input type="search" id="wordSearch" class="search" placeholder="Search words…" aria-label="Search saved words">
      </div>
      <div id="wordGroups"></div>
    </section>`;

  const container = $('#wordGroups');
  const editButton = $('#wordEdit');
  const deleteAllButton = $('#wordDeleteAll');

  function render() {
    const savedWords = getWords();
    const q = $('#wordSearch').value.trim().toLowerCase();
    const words = savedWords.filter((w) => !q || w.text.toLowerCase().includes(q) || w.translation.toLowerCase().includes(q));
    editButton.hidden = !savedWords.length;
    editButton.textContent = editing ? 'Done' : 'Edit';
    editButton.setAttribute('aria-pressed', String(editing));
    deleteAllButton.hidden = !editing || !savedWords.length;

    if (!savedWords.length) {
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
                  ${editing ? `<button type="button" class="btn ghost small danger del" aria-label="Delete ${esc(w.text)}">Delete</button>` : ''}
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

  editButton.addEventListener('click', () => {
    editing = !editing;
    render();
  });
  deleteAllButton.addEventListener('click', () => {
    if (!window.confirm('Delete all saved words? This cannot be undone.')) return;
    deleteAllWords();
    editing = false;
    render();
  });
  $('#wordSearch').addEventListener('input', render);
  render();
}
