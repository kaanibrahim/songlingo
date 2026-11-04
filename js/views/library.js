import { esc, loadSongs, coverHtml, withTags } from '../util.js';
import { getWords } from '../store.js';
import { LANGUAGES } from '../translate.js';

export async function renderLibrary(root) {
  root.innerHTML = `
    <section>
      <div class="section-head"><h2>Your songs</h2></div>
      <div class="song-grid" id="songGrid"><p class="muted">Loading songs…</p></div>
    </section>`;

  const grid = root.querySelector('#songGrid');
  let songs;
  try {
    songs = await Promise.all((await loadSongs()).map(withTags));
  } catch (e) {
    grid.innerHTML = `<div class="empty"><h3>No song list found</h3>
      <p>Create <code>songs/songs.json</code> (see the README). If you opened <code>index.html</code> directly from your disk, run a local server instead — browsers block loading files that way.</p></div>`;
    return;
  }
  if (!songs.length) {
    grid.innerHTML = `<div class="empty"><h3>No songs yet</h3><p>Add songs to <code>songs/songs.json</code>.</p></div>`;
    return;
  }

  const words = getWords();
  grid.innerHTML = songs.map((s) => {
    const count = words.filter((w) => w.songId === s.id).length;
    const lang = LANGUAGES[s.language] || s.language || '';
    return `
      <a class="song-card" href="#/song/${encodeURIComponent(s.id)}">
        ${coverHtml(s)}
        <div class="song-meta">
          <h3>${esc(s.title)}</h3>
          <p>${esc(s.artist || '')}</p>
          <div class="chips">
            ${lang ? `<span class="chip">${esc(lang)}</span>` : ''}
            <span class="chip">${count} saved</span>
          </div>
        </div>
      </a>`;
  }).join('');
}
