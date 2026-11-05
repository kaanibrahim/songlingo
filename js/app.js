import { $, $$, toast } from './util.js';
import { getSettings, setSettings, getWords, onWordsChange, exportWords, importWords } from './store.js';
import { renderLibrary } from './views/library.js';
import { renderPlayer } from './views/player.js';
import { renderWords } from './views/words.js';
import { renderPractice } from './views/practice.js';

const app = $('#app');
let cleanup = null;

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
    .catch((error) => console.error('Could not register the update-checking service worker:', error));
}

// Simple hash router: #/  #/song/<id>  #/words  #/practice[?song=<id>]
const routes = [
  { re: /^\/?$/, nav: 'library', view: () => renderLibrary(app) },
  { re: /^\/song\/([^/?]+)/, nav: 'library', view: (m) => renderPlayer(app, decodeURIComponent(m[1])) },
  { re: /^\/words/, nav: 'words', view: () => renderWords(app) },
  { re: /^\/practice/, nav: 'practice', view: (m, q) => renderPractice(app, q) },
];

async function route() {
  const hash = location.hash.slice(1) || '/';
  const [path, qs] = hash.split('?');
  const query = new URLSearchParams(qs || '');

  if (typeof cleanup === 'function') { try { cleanup(); } catch {} }
  cleanup = null;

  const r = routes.find((x) => x.re.test(path)) || routes[0];
  $$('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === r.nav));
  app.innerHTML = '';
  window.scrollTo(0, 0);
  try {
    cleanup = await r.view(path.match(r.re), query);
  } catch (e) {
    console.error(e);
    app.innerHTML = `<section class="empty"><h2>Something went wrong</h2><p>${e.message}</p></section>`;
  }
}

function updateBadge() {
  $('#wordCount').textContent = getWords().length;
}

// ---------- Settings dialog ----------
function setupSettings() {
  const dlg = $('#settingsDialog');

  $('#settingsBtn').addEventListener('click', () => {
    const s = getSettings();
    $('#autoPause').checked = s.autoPause;
    $('#adminMode').checked = s.adminMode;
    const editor = $('#translationEditor');
    if (editor) editor.hidden = !s.adminMode;
    dlg.showModal();
  });
  $('#autoPause').addEventListener('change', (e) => setSettings({ autoPause: e.target.checked }));
  $('#adminMode').addEventListener('change', (e) => {
    const enabled = e.target.checked;
    setSettings({ adminMode: enabled });
    const editor = $('#translationEditor');
    if (editor) editor.hidden = !enabled;
  });

  $('#exportBtn').addEventListener('click', () => {
    const blob = new Blob([exportWords()], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `songlingo-words-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('#importInput').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const n = importWords(await file.text());
      toast(`Imported ${n} new word${n === 1 ? '' : 's'}`);
      route();
    } catch (err) {
      toast(`Import failed: ${err.message}`);
    }
    e.target.value = '';
  });
}

onWordsChange(updateBadge);
window.addEventListener('hashchange', route);
setupSettings();
updateBadge();
route();
