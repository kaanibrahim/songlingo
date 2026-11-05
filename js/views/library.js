import { esc, loadSongs, coverHtml, withTags } from '../util.js';
import { getSettings, setSettings, getWords } from '../store.js';
import { LANGUAGES } from '../languages.js';

export async function renderLibrary(root) {
  root.innerHTML = `
    <section>
      <div class="section-head library-head">
        <h2>Your songs</h2>
        <button class="icon-btn view-toggle" id="songViewToggle" type="button" aria-pressed="false"></button>
      </div>
      <div class="song-grid" id="songGrid"><p class="muted">Loading songs…</p></div>
    </section>`;

  const grid = root.querySelector('#songGrid');
  const viewToggle = root.querySelector('#songViewToggle');
  let listView = getSettings().libraryView === 'list';
  const updateView = () => {
    grid.classList.toggle('list-view', listView);
    viewToggle.setAttribute('aria-pressed', String(listView));
    viewToggle.setAttribute('aria-label', `Show songs as a ${listView ? 'grid' : 'list'}`);
    viewToggle.title = `Show songs as a ${listView ? 'grid' : 'list'}`;
    viewToggle.innerHTML = listView
      ? '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><rect x="3" y="3" width="8" height="8" rx="1"/><rect x="13" y="3" width="8" height="8" rx="1"/><rect x="3" y="13" width="8" height="8" rx="1"/><rect x="13" y="13" width="8" height="8" rx="1"/></svg>'
      : '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M8 6h13M8 12h13M8 18h13"/><path d="M3 6h.01M3 12h.01M3 18h.01" stroke-width="3" stroke-linecap="round"/></svg>';
  };
  updateView();
  viewToggle.addEventListener('click', () => {
    listView = !listView;
    setSettings({ libraryView: listView ? 'list' : 'grid' });
    updateView();
  });

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
