// Minimal ID3v2 (2.2 / 2.3 / 2.4) reader for the bits Songlingo needs:
//   SYLT  synchronised lyrics  -> timed lines
//   USLT  unsynchronised lyrics (often LRC text with [mm:ss.xx] stamps)
//   TIT2 / TPE1  title / artist,  APIC  cover picture
// Only the tag at the start of the file is downloaded (via an HTTP Range
// request when the server supports it, which GitHub Pages does).

const cache = new Map();

export function readTags(url) {
  if (!cache.has(url)) cache.set(url, fetchTag(url).then(parseTag).catch((e) => { console.warn('ID3 read failed', e); return null; }));
  return cache.get(url);
}

async function fetchTag(url) {
  const head = await fetch(url, { headers: { Range: 'bytes=0-9' } });
  if (!head.ok) throw new Error(`HTTP ${head.status}`);
  let buf = new Uint8Array(await head.arrayBuffer());
  if (head.status === 200) return buf;                 // server sent the whole file
  if (buf[0] !== 0x49 || buf[1] !== 0x44 || buf[2] !== 0x33) return null; // no "ID3"
  const size = syncsafe(buf, 6) + 10 + (buf[5] & 0x10 ? 10 : 0);
  const res = await fetch(url, { headers: { Range: `bytes=0-${size - 1}` } });
  return new Uint8Array(await res.arrayBuffer());
}

const syncsafe = (b, o) => (b[o] << 21) | (b[o + 1] << 14) | (b[o + 2] << 7) | b[o + 3];
const u32 = (b, o) => ((b[o] << 24) >>> 0) + (b[o + 1] << 16) + (b[o + 2] << 8) + b[o + 3];

function removeUnsync(b) {
  const out = [];
  for (let i = 0; i < b.length; i++) {
    out.push(b[i]);
    if (b[i] === 0xff && b[i + 1] === 0x00) i++;
  }
  return Uint8Array.from(out);
}

function parseTag(bytes) {
  if (!bytes || bytes.length < 10 || bytes[0] !== 0x49 || bytes[1] !== 0x44 || bytes[2] !== 0x33) return null;
  const ver = bytes[3];
  const flags = bytes[5];
  const size = syncsafe(bytes, 6);
  let body = bytes.subarray(10, Math.min(bytes.length, 10 + size));
  if (flags & 0x80 && ver < 4) body = removeUnsync(body);

  let pos = 0;
  if (flags & 0x40) pos += ver === 4 ? syncsafe(body, 0) : u32(body, 0) + 4; // extended header

  const tags = {};
  const idLen = ver === 2 ? 3 : 4;
  const hdrLen = ver === 2 ? 6 : 10;
  while (pos + hdrLen <= body.length) {
    const id = String.fromCharCode(...body.subarray(pos, pos + idLen));
    if (!/^[A-Z0-9]+$/.test(id)) break; // padding
    let fsize;
    if (ver === 2) fsize = (body[pos + 3] << 16) | (body[pos + 4] << 8) | body[pos + 5];
    else if (ver === 4) fsize = syncsafe(body, pos + 4);
    else fsize = u32(body, pos + 4);
    const fflags = ver === 2 ? 0 : body[pos + 9];
    let data = body.subarray(pos + hdrLen, pos + hdrLen + fsize);
    pos += hdrLen + fsize;
    if (ver === 4 && fflags & 0x02) data = removeUnsync(data);
    if (ver === 4 && fflags & 0x01) data = data.subarray(4); // data length indicator
    try { readFrame(id, data, tags); } catch (e) { console.warn('Bad ID3 frame', id, e); }
  }
  return tags;
}

// ---------- text helpers ----------
function decoderFor(enc) {
  return new TextDecoder(['latin1', 'utf-16', 'utf-16be', 'utf-8'][enc] || 'latin1');
}

/** Read a terminated string starting at `start`; returns [text, nextIndex]. */
function readStr(data, start, enc) {
  const wide = enc === 1 || enc === 2;
  let end = start;
  if (wide) { while (end + 1 < data.length && !(data[end] === 0 && data[end + 1] === 0)) end += 2; }
  else { while (end < data.length && data[end] !== 0) end++; }
  let slice = data.subarray(start, end);
  // UTF-16 strings without their own BOM inherit little-endian in practice
  if (enc === 1 && !(slice[0] === 0xff && slice[1] === 0xfe) && !(slice[0] === 0xfe && slice[1] === 0xff)) {
    return [new TextDecoder('utf-16le').decode(slice), Math.min(data.length, end + 2)];
  }
  return [decoderFor(enc).decode(slice), Math.min(data.length, end + (wide ? 2 : 1))];
}

function readFrame(id, data, tags) {
  const enc = data[0];
  switch (id) {
    case 'TIT2': case 'TT2':
      tags.title = readStr(data, 1, enc)[0].trim(); break;
    case 'TPE1': case 'TP1':
      tags.artist = readStr(data, 1, enc)[0].trim(); break;
    case 'USLT': case 'ULT': {
      const lang = String.fromCharCode(...data.subarray(1, 4));
      const [, p] = readStr(data, 4, enc);                 // descriptor
      const text = decoderFor(enc).decode(data.subarray(p)).replace(/\0+$/, '');
      if (!tags.uslt) tags.uslt = { lang, text };
      break;
    }
    case 'SYLT': case 'SLT': {
      const lang = String.fromCharCode(...data.subarray(1, 4));
      const format = data[4];          // 1 = MPEG frames, 2 = milliseconds
      const type = data[5];            // 1 = lyrics
      let [, p] = readStr(data, 6, enc);
      const lines = [];
      while (p < data.length) {
        const [text, q] = readStr(data, p, enc);
        if (q + 4 > data.length) break;
        lines.push({ text: text.replace(/^[\r\n]+/, '').trim(), t: u32(data, q) });
        p = q + 4;
      }
      if (format === 2 && (type === 1 || type === 0) && lines.length && !tags.sylt) tags.sylt = { lang, lines };
      break;
    }
    case 'APIC': case 'PIC': {
      let p, mime;
      if (id === 'PIC') { mime = 'image/' + String.fromCharCode(...data.subarray(1, 4)).toLowerCase(); p = 4; }
      else { [mime, p] = readStr(data, 1, 0); }
      p += 1; // picture type
      [, p] = readStr(data, p, enc);
      if (!tags.cover) tags.cover = URL.createObjectURL(new Blob([data.subarray(p)], { type: mime || 'image/jpeg' }));
      break;
    }
  }
}
