import { $, $$, toast, loadTranslationOverrides } from './util.js';
import { getSettings, setSettings, getTranslationOverrides, getWords, onWordsChange, exportWords, importWords } from './store.js';
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
    $('#translationExportField').hidden = !s.adminMode;
    const editor = $('#translationEditor');
    if (editor) editor.hidden = !s.adminMode;
    dlg.showModal();
  });
  $('#autoPause').addEventListener('change', (e) => setSettings({ autoPause: e.target.checked }));
  $('#adminMode').addEventListener('change', (e) => {
    const enabled = e.target.checked;
    setSettings({ adminMode: enabled });
    $('#translationExportField').hidden = !enabled;
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
  $('#exportTranslationsBtn').addEventListener('click', async () => {
    let fileHandle;
    try {
      if (typeof window.showSaveFilePicker === 'function') {
        fileHandle = await window.showSaveFilePicker({
          suggestedName: 'translation-overrides.json',
          types: [{ description: 'JSON file', accept: { 'application/json': ['.json'] } }],
        });
      }

      const base = await loadTranslationOverrides();
      const overrides = getTranslationOverrides();
      const merged = { ...base };
      for (const [songId, translations] of Object.entries(overrides)) {
        merged[songId] = { ...(base[songId] || {}), ...translations };
      }
      const contents = `${JSON.stringify(merged, null, 2)}\n`;

      if (fileHandle) {
        const writable = await fileHandle.createWritable();
        await writable.write(contents);
        await writable.close();
        toast('Saved translation-overrides.json');
      } else {
        const blob = new Blob([contents], { type: 'application/json' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'translation-overrides.json';
        a.click();
        URL.revokeObjectURL(a.href);
        toast('Downloaded translation-overrides.json');
      }
    } catch (error) {
      if (error.name !== 'AbortError') toast(`Could not save translations: ${error.message}`);
    }
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
