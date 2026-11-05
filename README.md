# Songlingo

Learn languages through songs. Songlingo plays your songs with synced lyrics, which it reads straight from the MP3 file. Tap a word or phrase to see its supplied translation or add one yourself, save it, then practise your saved words with flashcards, multiple choice and writing drills.

It's plain HTML, CSS and JavaScript with no build step and no backend, so it runs as-is on GitHub Pages.

## Features

- **Synced lyrics from the MP3.** Songlingo reads the lyrics embedded in the file, so there are no separate lyrics files to manage. The current line is highlighted and scrolls into view as the song plays, and instrumental breaks show a small animation. Click a line's timestamp to jump to it. Lyrics are marked as not to translate, so browser translation preserves the original words.
- **Player controls.** Play/pause, ±5 s, seek bar, speed from 0.6× to 1.25×, and loop the current line.
- **Manual translations.** Songs can include a manually supplied translation displayed below the lyrics, and individual words or phrases can have built-in translations. Add translations for other words yourself before saving them.
- **Saved words, grouped by song.** Each saved word keeps the lyric line it came from. Edit, search or delete words. Saved words are underlined in the lyrics.
- **Practice modes.**
  - Flashcards: flip, then sort into "Know it" or "Still learning".
  - Multiple choice.
  - Write: accent-tolerant, and accepts answers separated by `,` `;` `/`.

  You can practise in either direction or mixed, weakest words first. A "Hear it in the song" button plays the line the word came from. Each word gets a mastery score from 0 to 5.
- **Backup.** Export or import your saved words as JSON (⚙ Settings).

## Project structure

```
index.html            App shell
css/styles.css        All styles
js/app.js             Router + settings
js/id3.js             Reads embedded lyrics, title, artist and cover from MP3 tags
js/store.js           localStorage persistence (saved words, settings)
js/lrc.js             LRC timestamp parsing, splitting lines into words
js/translate.js       Translation lookups (unofficial Google endpoint) + dictionary links
js/util.js            Helpers, song + lyrics + translation loading
js/views/*.js         Library, Player, My words, Practise
songs/songs.json      Your song list
songs/*.txt           Optional manual song translations
audio/                Your .mp3 files (with embedded lyrics)
```

## Adding a song

1. Copy an MP3 with **embedded synced lyrics** into `audio/`, e.g. `audio/formidable.mp3`.
2. Add an entry to `songs/songs.json`:

   ```json
   {
     "id": "formidable",
     "title": "Formidable",
     "artist": "Stromae",
     "language": "fr",
     "audio": "audio/formidable.mp3"
   }
   ```

   - `id`: a unique slug that never changes, because saved words are linked to it.
   - `language`: a two-letter code for the song's language (`fr`, `es`, `de`, `tr`, ...). This is the language that gets translated *from*. If you leave it out, the language stored with the embedded lyrics is used.
   - `translation` (optional): path to a UTF-8 text file containing a manual translation. Each non-empty line should translate the corresponding non-empty lyric line in order; blank lines are for display formatting. The translation is displayed below the lyrics. Built-in word and phrase translations can be added in `js/views/player.js`. Set `translationLanguage` to its language code (for example, `"en"`).
   - `title` and `artist` are optional. If you leave them out, they're read from the MP3's tags.
   - `cover` (an image path) is optional. Without it, the cover art inside the MP3 is used, or a generated cover if there is none.

### Embedded lyrics

Songlingo understands the two standard ways lyrics are stored inside an MP3 (ID3 tags):

- **Synchronised lyrics** (the `SYLT` frame), with a timestamp for each line. Most lyrics-tagging tools write this.
- **Unsynchronised lyrics** (the `USLT` frame). If the text contains LRC timestamps (`[00:05.11] line`), they're used for syncing. If it doesn't, the lyrics are still shown, and you can still tap words to translate them, but the lines won't light up in time with the song.

A timestamp with no words after it marks an instrumental break.

To add lyrics to your own MP3s, you can use a tag editor such as [Mp3tag](https://www.mp3tag.de/) or [MusicBrainz Picard](https://picard.musicbrainz.org/) with a lyrics plugin. As a fallback, you can also give a song a separate synced-lyrics file with `"lyrics": "lyrics/song.lrc"`, which takes priority over the embedded lyrics.

Songlingo only downloads the tag at the start of the file (about 17 KB for Formidable) to read the lyrics, so the song list loads quickly.

## Running locally

ES modules and `fetch()` don't work from `file://`, so serve the folder:

```bash
cd songlingo
python3 -m http.server 8000
# open http://localhost:8000
```

Python's built-in server can't serve parts of a file, so skipping around in a song may not work locally. On GitHub Pages it works normally.

## Deploying to GitHub Pages

1. Create a GitHub repository and push these files to it, with `index.html` at the root.
2. Go to **Settings → Pages**. Set **Source** to "Deploy from a branch", choose `main` and `/ (root)`, then save.
3. After a minute the site is live at `https://<your-username>.github.io/<repo-name>/`.

All paths are relative, so the site works from a repo subfolder URL.

### Notes

- **Updates.** The site revalidates same-origin files with the network, so browsers check for deployed changes instead of relying on stale cached copies. After deploying this update, open the site once on each device to enable the update check.
- **File sizes.** GitHub blocks files over 100 MB and warns above 50 MB. A typical MP3 is 3–10 MB, which is fine.
- **Copyright.** A public GitHub Pages site is visible to anyone. Only publish audio and lyrics you have the rights to share, or keep the repository private. Private-repo Pages needs a paid GitHub plan.
- **Data storage.** Saved words live in each visitor's browser (`localStorage`). Clearing site data deletes them, so use Settings → Export to back them up or move them to another device.
- **Translations.** Translations are supplied with each song or entered manually; the app does not send selected lyrics to an online translation service.

## Keyboard shortcuts

| Where | Keys |
|---|---|
| Player | `Space` play/pause · `←/→` ±5 s · `↑/↓` previous/next line · `L` loop line · `Esc` close popup |
| Flashcards | `Space` flip · `1` still learning · `2` know it |
| Multiple choice | `1`–`4` choose · `Enter` continue |
