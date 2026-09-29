// The browser build as one zip for itch.io: `npm run web`.
//
//   dist/web/                 index.html, src/, and the assets the game loads at runtime
//   dist/duke-vytis-web.zip   the same, with index.html at the zip's root
//
// itch.io's HTML upload wants exactly that zip, and serves what is in it from a SUBPATH
// of its own domain inside an iframe -- so the build is proved the way it will be used:
// served from /duke/ by a small server that answers nothing outside it, with index.html
// fetched and every module import and every asset reference walked and required to come
// back 200. An absolute URL anywhere ('/src/...', '/assets/...') 404s there, as it would
// on itch, and fails the build.
//
// What goes in. index.html; the whole of src/ (the static walk below finds every module
// the game imports, but copying the tree rather than the walk's list means a mistake in
// the walk cannot drop a module from the build -- the check and the thing checked are
// kept apart); and from assets/ only what the page asks for at runtime: the artist's
// tiles and furniture sprites the generated lists name (bgart.js, decorart.js) and the
// sound samples in assets/sfx/ under the names audio.js asks for. The rest of assets/
// is source art -- sheets, references, 8.5 MB of it -- that the game never loads. The
// desktop build packed it too until 14ac461; its files list in package.json now takes the
// window icon, every .ogg and .wav in assets/sfx/ and the background and furniture PNGs, a
// coarser cut than this one's by name (see docs/BUILD.md). Not electron/, tools/, docs/ or
// node_modules.
//
// No dependencies: the zip is written here (deflate from node's zlib), and read back by
// test-web.mjs to prove it round-trips.

import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';
import zlib from 'node:zlib';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PREFIX = '/duke/';

// The extensions audio.js's loadSamples tries, in its order; test-web holds the two
// lists together. A sample is shipped only under a name the game asks for.
export const SAMPLE_EXTS = ['ogg', 'wav'];

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.flac': 'audio/flac',
};

const posix = (p) => p.split(path.sep).join('/');

function listFiles(dir, base = dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...listFiles(p, base));
    else out.push(posix(path.relative(base, p)));
  }
  return out.sort();
}

/**
 * The asset files the game asks for at runtime, as paths relative to the page. Read from
 * the generated lists themselves, not from a scan of the code, so the build does not
 * share a blind spot with the checker that scans.
 */
export async function runtimeAssets(root = ROOT) {
  const out = new Set();
  const lists = [
    ['src/render/bgart.js', 'BG_FILES'],
    ['src/render/decorart.js', 'DECOR_FILES'],
  ];
  for (const [file, name] of lists) {
    const mod = await import(pathToFileURL(path.join(root, file)).href);
    for (const zone of Object.values(mod[name] || {})) {
      for (const v of Object.values(zone)) if (typeof v === 'string') out.add(v);
    }
  }
  // Samples by the names the game fetches (SAMPLE_NAMES x SAMPLE_EXTS), not by what
  // happens to sit in assets/sfx/. That folder is gitignored and holds whatever the
  // user dropped there -- raw takes, an .mp3 the loader never tries -- and shipping the
  // folder put every one of those into a public zip while the game could load none.
  const { SAMPLE_NAMES } = await import(pathToFileURL(path.join(root, 'src/render/audio.js')).href);
  for (const name of SAMPLE_NAMES) {
    for (const ext of SAMPLE_EXTS) {
      const f = `assets/sfx/${name}.${ext}`;
      if (fs.existsSync(path.join(root, f))) out.add(f);
    }
  }
  return [...out].sort();
}

/**
 * What index.html itself links, beyond the game's modules: the app manifest and the icon a
 * phone's home screen shows when the page is saved there (index.html's head). Listed here, not
 * read off the page, so the build does not share a blind spot with the walk that checks it.
 */
export const PAGE_FILES = ['manifest.webmanifest', 'assets/icon.png'];

/** Build the package into `out`, emptied first. Returns the list of files written. */
export async function buildWeb(out, root = ROOT) {
  fs.rmSync(out, { recursive: true, force: true });
  const files = ['index.html', ...PAGE_FILES, ...listFiles(path.join(root, 'src')).map((f) => 'src/' + f)];
  const assets = await runtimeAssets(root);
  const missing = assets.filter((a) => !fs.existsSync(path.join(root, a)));
  if (missing.length) throw new Error('the game names assets that do not exist: ' + missing.join(', '));
  files.push(...assets);
  for (const f of files) {
    const dst = path.join(out, f);
    fs.mkdirSync(path.dirname(dst), { recursive: true });
    fs.copyFileSync(path.join(root, f), dst);
  }
  return files.sort();
}

// --- zip ---------------------------------------------------------------------------
//
// PKZIP with deflate, the subset every unzipper reads: a local header and data per file,
// a central directory, an end record. No directory entries (none are required), no
// zip64 (nothing here is near 4 GB), UTF-8 names. The timestamp is FIXED, and the
// entries sorted, so the same tree always zips to the same bytes -- two builds can be
// compared by hash.

const DOS_TIME = 0;                                   // 00:00:00
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1; // 2026-01-01

export function zipDir(dir, zipPath) {
  const names = listFiles(dir);
  const chunks = [];
  const central = [];
  let offset = 0;
  for (const name of names) {
    const data = fs.readFileSync(path.join(dir, name));
    const crc = zlib.crc32(data) >>> 0;
    const deflated = zlib.deflateRawSync(data, { level: 9 });
    // Store what deflate cannot shrink (it happens to small or already-compressed files).
    const method = deflated.length < data.length ? 8 : 0;
    const body = method === 8 ? deflated : data;
    const fname = Buffer.from(name, 'utf8');

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);           // version needed: 2.0
    local.writeUInt16LE(0x0800, 6);       // flags: UTF-8 names
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(DOS_TIME, 10);
    local.writeUInt16LE(DOS_DATE, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(fname.length, 26);
    local.writeUInt16LE(0, 28);           // no extra field
    chunks.push(local, fname, body);

    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);              // made by: 2.0, MS-DOS attributes
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(method, 10);
    cd.writeUInt16LE(DOS_TIME, 12);
    cd.writeUInt16LE(DOS_DATE, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(body.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(fname.length, 28);
    cd.writeUInt16LE(0, 30);              // extra
    cd.writeUInt16LE(0, 32);              // comment
    cd.writeUInt16LE(0, 34);              // disk
    cd.writeUInt16LE(0, 36);              // internal attributes
    cd.writeUInt32LE(0, 38);              // external attributes
    cd.writeUInt32LE(offset, 42);
    central.push(cd, fname);
    offset += local.length + fname.length + body.length;
  }
  const cdSize = central.reduce((n, b) => n + b.length, 0);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4);
  end.writeUInt16LE(0, 6);
  end.writeUInt16LE(names.length, 8);
  end.writeUInt16LE(names.length, 10);
  end.writeUInt32LE(cdSize, 12);
  end.writeUInt32LE(offset, 16);
  end.writeUInt16LE(0, 20);
  fs.mkdirSync(path.dirname(zipPath), { recursive: true });
  fs.writeFileSync(zipPath, Buffer.concat([...chunks, ...central, end]));
  return names.length;
}

/** Read a zip back: [{ name, data }], each CRC-checked. Throws on anything malformed. */
export function readZip(zipPath) {
  const buf = fs.readFileSync(zipPath);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('no end-of-central-directory record');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const out = [];
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('bad central directory entry ' + n);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nlen = buf.readUInt16LE(p + 28);
    const xlen = buf.readUInt16LE(p + 30);
    const clen = buf.readUInt16LE(p + 32);
    const at = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nlen);
    if (buf.readUInt32LE(at) !== 0x04034b50) throw new Error('bad local header for ' + name);
    const start = at + 30 + buf.readUInt16LE(at + 26) + buf.readUInt16LE(at + 28);
    const raw = buf.subarray(start, start + csize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : method === 0 ? Buffer.from(raw) : null;
    if (!data) throw new Error(`${name}: unsupported method ${method}`);
    if (data.length !== usize) throw new Error(`${name}: size ${data.length}, header says ${usize}`);
    if ((zlib.crc32(data) >>> 0) !== crc) throw new Error(`${name}: CRC mismatch`);
    out.push({ name, data });
    p += 46 + nlen + xlen + clen;
  }
  return out;
}

// --- serving it from a subpath -----------------------------------------------------

/** Serve `dir` at `prefix` on 127.0.0.1 and nothing else. Resolves to { url, close, log }. */
export function serveSubpath(dir, prefix = PREFIX) {
  const log = [];
  const base = path.resolve(dir);
  // Only the files as they are spelled on disk. itch.io's servers tell 'Input.js' from
  // 'input.js' and this machine's file system does not: served by fs.existsSync alone,
  // an import of './core/Input.js' for core/input.js came back 200 here and would 404
  // there, and the proof passed a package that could not boot.
  const files = new Set(listFiles(base));
  const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    let status = 404;
    let body = 'not found: ' + url;
    let type = 'text/plain';
    if (url.startsWith(prefix)) {
      const rel = decodeURIComponent(url.slice(prefix.length)) || 'index.html';
      const file = path.resolve(base, rel);
      if (files.has(rel)) {
        status = 200;
        body = fs.readFileSync(file);
        type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
      }
    }
    log.push({ url, status });
    res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
    res.end(body);
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}${prefix}`,
        log,
        close: () => new Promise((r) => server.close(r)),
      });
    });
  });
}

// --- the walk ----------------------------------------------------------------------
//
// Static, by pattern: every `import ... from '...'` and `export ... from '...'` at the
// start of a line (a comment line starts with // or *, so it cannot match), every
// side-effect `import '...'`, every literal `import('...')`, and in index.html every
// src=, href= and url(). A module specifier must be relative ('./' or '../'): a bare or
// absolute one is reported, as is an import() whose argument is not a literal, since no
// static walk can follow it. Asset paths are the 'assets/...' literals in the code, and
// they resolve against the PAGE, not the module, because that is what fetch() and
// Image.src resolve against.

const IMPORT_RE = /^[ \t]*(?:import|export)\b[^;'"`]*?\bfrom\s*(['"])([^'"]+)\1/gm;
const BARE_IMPORT_RE = /^[ \t]*import\s*(['"])([^'"]+)\1/gm;
const DYNAMIC_RE = /\bimport\(\s*(['"`])([^'"`]+)\1\s*\)/g;
const DYNAMIC_ANY_RE = /\bimport\(\s*([^'"`\s)][^)]*)\)/g;
const ASSET_RE = /(['"`])(\/?assets\/[^'"`$]*)\1/g;
const HTML_REF_RE = /\b(?:src|href)\s*=\s*(['"])([^'"]+)\1/g;
const CSS_URL_RE = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;

export function referencesIn(text, kind) {
  const modules = [];
  const assets = [];
  const problems = [];
  const code = text.split('\n').filter((l) => !/^\s*(\/\/|\*)/.test(l)).join('\n');
  const mod = (spec) => {
    if (/^\.\.?\//.test(spec)) modules.push(spec);
    else problems.push(`module specifier is not relative: '${spec}'`);
  };
  if (kind === 'html') {
    for (const m of text.matchAll(HTML_REF_RE)) {
      if (/^(data:|#)/.test(m[2])) continue;
      if (/^(\/|[a-z]+:)/i.test(m[2])) problems.push(`absolute reference in HTML: '${m[2]}'`);
      else if (/\.m?js$/.test(m[2])) modules.push(m[2]);
      else assets.push(m[2]);
    }
  }
  // In a page these are an inline module script's; in a module, its own.
  for (const m of code.matchAll(IMPORT_RE)) mod(m[2]);
  for (const m of code.matchAll(BARE_IMPORT_RE)) mod(m[2]);
  for (const m of code.matchAll(DYNAMIC_RE)) mod(m[2]);
  for (const m of code.matchAll(DYNAMIC_ANY_RE)) problems.push(`import() of a computed specifier: import(${m[1].trim()})`);
  for (const m of code.matchAll(CSS_URL_RE)) {
    if (/^(data:|#)/.test(m[2])) continue;
    if (/^(\/|[a-z]+:)/i.test(m[2])) problems.push(`absolute url() '${m[2]}'`);
    else assets.push(m[2]);
  }
  for (const m of code.matchAll(ASSET_RE)) {
    if (m[2].startsWith('/')) problems.push(`absolute asset path '${m[2]}'`);
    else if (!m[2].endsWith('/')) assets.push(m[2]);   // a directory base is checked by the fetches it makes
  }
  return { modules, assets, problems };
}

/**
 * Walk the package as a browser would load it from `pageUrl`: the page, every module it
 * reaches, every asset they name, plus `extraAssets` (the generated lists and samples).
 * Returns { modules, assets, fetched: [{ url, status }], problems }.
 */
export async function walkServed(pageUrl, extraAssets = []) {
  const problems = [];
  const fetched = [];
  const seen = new Set();
  const get = async (url) => {
    const res = await fetch(url);
    const body = res.ok ? await res.text() : '';
    fetched.push({ url, status: res.status });
    if (!res.ok) problems.push(`${res.status} ${url}`);
    return body;
  };
  const html = await get(pageUrl);
  const top = referencesIn(html, 'html');
  problems.push(...top.problems);
  const queue = top.modules.map((s) => new URL(s, pageUrl).href);
  const assetUrls = new Set([...top.assets, ...extraAssets].map((a) => new URL(a, pageUrl).href));
  const modules = [];
  while (queue.length) {
    const url = queue.shift();
    if (seen.has(url)) continue;
    seen.add(url);
    modules.push(url);
    const text = await get(url);
    const refs = referencesIn(text, 'js');
    for (const p of refs.problems) problems.push(`${url}: ${p}`);
    for (const s of refs.modules) queue.push(new URL(s, url).href);
    for (const a of refs.assets) assetUrls.add(new URL(a, pageUrl).href);
  }
  for (const url of assetUrls) {
    const res = await fetch(url);
    await res.arrayBuffer();
    fetched.push({ url, status: res.status });
    if (!res.ok) problems.push(`${res.status} ${url}`);
  }
  return { modules, assets: [...assetUrls], fetched, problems };
}

/** Build, zip, serve from a subpath and walk it. Returns a report; throws on nothing. */
export async function buildAndProve(out, zipPath, root = ROOT) {
  const files = await buildWeb(out, root);
  const count = zipDir(out, zipPath);
  const bytes = files.reduce((n, f) => n + fs.statSync(path.join(out, f)).size, 0);
  const zipBytes = fs.statSync(zipPath).size;
  const srv = await serveSubpath(out);
  let walk;
  try {
    walk = await walkServed(srv.url + 'index.html', await runtimeAssets(root));
    // The page as a directory too: itch links index.html, but a host that serves the
    // folder URL must resolve every relative path the same way.
    const bare = await fetch(srv.url);
    await bare.text();
    if (!bare.ok) walk.problems.push(`${bare.status} ${srv.url}`);
  } finally {
    await srv.close();
  }
  const outside = srv.log.filter((r) => !r.url.startsWith(PREFIX));
  for (const r of outside) walk.problems.push(`requested outside the subpath: ${r.url}`);
  const srcFiles = files.filter((f) => f.startsWith('src/')).length;
  return { files, count, bytes, zipBytes, walk, srcFiles, log: srv.log };
}

const MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (MAIN) {
  const out = path.join(ROOT, 'dist', 'web');
  const zip = path.join(ROOT, 'dist', 'duke-vytis-web.zip');
  const r = await buildAndProve(out, zip);
  const kb = (n) => (n / 1024).toFixed(0) + ' KB';
  console.log(`  dist/web                 ${r.files.length} files, ${kb(r.bytes)}`);
  console.log(`  dist/duke-vytis-web.zip  ${r.count} files, ${kb(r.zipBytes)}, index.html at the root`);
  // Said out loud because they are the user's own files and this zip is public.
  const sfx = r.files.filter((f) => f.startsWith('assets/sfx/'));
  console.log(`  samples from assets/sfx/: ${sfx.length ? sfx.map((f) => path.posix.basename(f)).join(' ') : 'none'}`);
  console.log(`  served from ${PREFIX}: ${r.walk.modules.length} modules and ${r.walk.assets.length} assets walked, `
    + `${r.walk.fetched.filter((f) => f.status === 200).length}/${r.walk.fetched.length} requests 200`);
  if (r.walk.modules.length < r.srcFiles) {
    console.log(`  (${r.srcFiles - r.walk.modules.length} of ${r.srcFiles} files under src/ are not imported by the game; shipped anyway)`);
  }
  if (r.walk.problems.length) {
    console.log('\n  FAILED -- the package will not load from a subpath:');
    for (const p of r.walk.problems) console.log('    ' + p);
    process.exit(1);
  }
  console.log('\n  OK -- upload dist/duke-vytis-web.zip as an HTML game (docs/BUILD.md).');
}
