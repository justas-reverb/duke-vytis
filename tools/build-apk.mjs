// The Android build: the web build in a WebView (android/), as an APK for testing on a phone.
//
//   node tools/build-apk.mjs          dist/Duke Vytis <version>.apk, debug-signed
//
// Made with the Android SDK's own tools -- aapt2, javac, d8, zipalign, apksigner -- straight
// from here: no Gradle, no Android Gradle plugin, nothing downloaded. The app is one Java
// class and a manifest, with no library to resolve, and Gradle's first build wanted a few
// hundred megabytes of plugins fetched before it would compile it (2026-09-29).
//
// Needs an Android SDK -- ANDROID_HOME or ANDROID_SDK_ROOT, else %LOCALAPPDATA%\Android\Sdk or
// ~/Android/Sdk -- with a platform (platforms/android-NN) and build-tools, and a JDK 17 or newer
// (JAVA_HOME, else the usual install folders). The newest of each found is used.
//
// Signed with the SDK's DEBUG key (~/.android/debug.keystore, made here if it is missing, with
// the well-known password every Android debug build uses): an APK to sideload and test, not one
// for a store. The same key signs every build, so a new one installs over the last.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { execFileSync, execSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildWeb, readZip } from './build-web.mjs';
import { readPNG } from './pngread.mjs';
import { installDom, HeadlessCanvas, encodePNG } from './headless.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const VERSION = PKG.version;
const [MAJ, MIN, PAT] = VERSION.split('.').map(Number);
const VERSION_CODE = MAJ * 10000 + MIN * 100 + PAT;
const APP_ID = 'lt.dukevytis.tower';
const MIN_SDK = 24;
const OUT = path.join(ROOT, 'dist', `Duke Vytis ${VERSION}.apk`);
const WORK = path.join(ROOT, 'dist', 'android-build');
const exe = process.platform === 'win32' ? '.exe' : '';
const bat = process.platform === 'win32' ? '.bat' : '';

const byVersion = (a, b) => {
  const pa = a.split(/[^0-9]+/).filter(Boolean).map(Number), pb = b.split(/[^0-9]+/).filter(Boolean).map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  return 0;
};
const newest = (dir, ok = () => true) => {
  if (!fs.existsSync(dir)) return null;
  const list = fs.readdirSync(dir).filter((d) => ok(path.join(dir, d))).sort(byVersion);
  return list.length ? path.join(dir, list[list.length - 1]) : null;
};

function findSdk() {
  const tries = [process.env.ANDROID_HOME, process.env.ANDROID_SDK_ROOT,
    process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk'),
    path.join(os.homedir(), 'Android', 'Sdk'), path.join(os.homedir(), 'Library', 'Android', 'sdk')];
  const sdk = tries.find((d) => d && fs.existsSync(path.join(d, 'platforms')) && fs.existsSync(path.join(d, 'build-tools')));
  if (!sdk) throw new Error('no Android SDK found: set ANDROID_HOME');
  const platform = newest(path.join(sdk, 'platforms'), (d) => fs.existsSync(path.join(d, 'android.jar')));
  const tools = newest(path.join(sdk, 'build-tools'), (d) => fs.existsSync(path.join(d, 'aapt2' + exe)) && fs.existsSync(path.join(d, 'd8' + bat)));
  if (!platform || !tools) throw new Error(`the SDK at ${sdk} has no platform or no build-tools`);
  return { sdk, jar: path.join(platform, 'android.jar'), tools, api: path.basename(platform) };
}

function findJdk() {
  const has = (d) => d && fs.existsSync(path.join(d, 'bin', 'javac' + exe));
  if (has(process.env.JAVA_HOME)) return process.env.JAVA_HOME;
  const pf = process.env.ProgramFiles || 'C:\\Program Files';
  for (const base of [path.join(pf, 'Eclipse Adoptium'), path.join(pf, 'Java'), path.join(pf, 'Microsoft'), path.join(pf, 'Zulu')]) {
    const d = newest(base, (x) => /jdk/i.test(path.basename(x)) && has(x));
    if (d) return d;
  }
  const studio = path.join(pf, 'Android', 'Android Studio', 'jbr');
  if (has(studio)) return studio;
  throw new Error('no JDK found: set JAVA_HOME to a JDK 17 or newer');
}

/**
 * Run a tool. A .bat wrapper (d8, apksigner) cannot be run directly on Windows, only through the
 * shell, so it goes as one command line with each argument quoted where it needs to be.
 */
function run(file, args, opts = {}) {
  const o = { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts };
  const q = (a) => (/[\s"&|<>^()]/.test(a) ? `"${a}"` : a);
  try {
    return file.endsWith('.bat') ? execSync([file, ...args].map(q).join(' '), o) : execFileSync(file, args, o);
  } catch (e) {
    throw new Error(`${path.basename(file)} failed:\n${e.stdout || ''}${e.stderr || ''}`);
  }
}

const listFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true })
  .flatMap((e) => (e.isDirectory() ? listFiles(path.join(dir, e.name)) : [path.join(dir, e.name)]));

// --- the launcher icon: the title's shield, as the desktop build's (tools/make-icon.mjs) ------

/** `src` area-averaged (premultiplied, as make-icon does) into an `inner` square centred on `size`, over `bg`. */
function icon(src, size, inner, bg) {
  installDom();
  const c = new HeadlessCanvas(size, size);
  const d = c.data;
  if (bg) for (let i = 0; i < d.length; i += 4) { d[i] = bg[0]; d[i + 1] = bg[1]; d[i + 2] = bg[2]; d[i + 3] = 255; }
  const o = Math.round((size - inner) / 2);
  const sx = src.w / inner, sy = src.h / inner;
  for (let y = 0; y < inner; y++) {
    const y0 = Math.floor(y * sy), y1 = Math.max(y0 + 1, Math.ceil((y + 1) * sy));
    for (let x = 0; x < inner; x++) {
      const x0 = Math.floor(x * sx), x1 = Math.max(x0 + 1, Math.ceil((x + 1) * sx));
      let r = 0, g = 0, b = 0, a = 0, n = 0;
      for (let yy = y0; yy < y1 && yy < src.h; yy++) {
        for (let xx = x0; xx < x1 && xx < src.w; xx++) {
          const i = (yy * src.w + xx) * 4, al = src.data[i + 3] / 255;
          r += src.data[i] * al; g += src.data[i + 1] * al; b += src.data[i + 2] * al; a += al; n++;
        }
      }
      if (!a) continue;
      const k = ((y + o) * size + (x + o)) * 4, al = a / n;
      const [br, bgg, bb, ba] = [d[k], d[k + 1], d[k + 2], d[k + 3] / 255];
      d[k] = Math.round(r / a * al + br * (1 - al));
      d[k + 1] = Math.round(g / a * al + bgg * (1 - al));
      d[k + 2] = Math.round(b / a * al + bb * (1 - al));
      d[k + 3] = Math.round(255 * (al + ba * (1 - al)));
    }
  }
  return encodePNG(c);
}

function writeResources(res) {
  const src = readPNG(path.join(ROOT, 'assets', 'icon.png'));
  const BG = [42, 7, 16];    // the title plaque's crimson, darkened: #2a0710
  // The old kind of icon, for Android 7: the whole square, the shield on the crimson.
  for (const [dpi, size] of [['mdpi', 48], ['hdpi', 72], ['xhdpi', 96], ['xxhdpi', 144], ['xxxhdpi', 192]]) {
    fs.mkdirSync(path.join(res, `mipmap-${dpi}`), { recursive: true });
    fs.writeFileSync(path.join(res, `mipmap-${dpi}`, 'ic_launcher.png'), icon(src, size, Math.round(size * 0.8), BG));
  }
  // Android 8 and later mask an ADAPTIVE icon to the launcher's shape: the crimson behind, the
  // shield in front within the middle 66 of its 108 dp, where no mask can cut it.
  fs.mkdirSync(path.join(res, 'mipmap-anydpi-v26'), { recursive: true });
  fs.writeFileSync(path.join(res, 'mipmap-xxxhdpi', 'ic_launcher_foreground.png'), icon(src, 432, 250, null));
  fs.writeFileSync(path.join(res, 'mipmap-anydpi-v26', 'ic_launcher.xml'),
    '<?xml version="1.0" encoding="utf-8"?>\n<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">\n'
    + '  <background android:drawable="@color/icon_back" />\n  <foreground android:drawable="@mipmap/ic_launcher_foreground" />\n</adaptive-icon>\n');
  fs.mkdirSync(path.join(res, 'values'), { recursive: true });
  fs.writeFileSync(path.join(res, 'values', 'colors.xml'),
    `<?xml version="1.0" encoding="utf-8"?>\n<resources>\n  <color name="icon_back">#${BG.map((v) => v.toString(16).padStart(2, '0')).join('')}</color>\n</resources>\n`);
}

// --- the zip: aapt2's APK, with the code and the game added -----------------------------------
//
// aapt2 can take the assets itself (-A), and on Windows it stores their paths with backslashes --
// `assets/www\index.html` -- which Android's asset manager never finds: the page would not load.
// Found by this script's own check of the finished APK (2026-09-29). So aapt2 links the manifest
// and the resources alone, and the code and the game's files are added here under '/' names,
// every entry aapt2 wrote copied byte for byte (resources.arsc stays stored, as Android 11 and
// later require of an app targeting them). zipalign then aligns what is stored.

const STORED = /\.(png|webp|ogg|mp3|wav|jpg)$/i;   // compressed already: deflating gains nothing

function zipWith(baseFile, adds) {
  const buf = fs.readFileSync(baseFile);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw new Error('aapt2 wrote no zip');
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  const locals = [], centrals = [];
  let at = 0;
  for (let n = 0; n < count; n++) {
    const nlen = buf.readUInt16LE(p + 28), xlen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    const csize = buf.readUInt32LE(p + 20), off = buf.readUInt32LE(p + 42);
    if (buf.readUInt16LE(off + 6) & 8) throw new Error('an entry with a data descriptor: not copied');
    const len = 30 + buf.readUInt16LE(off + 26) + buf.readUInt16LE(off + 28) + csize;
    locals.push(buf.subarray(off, off + len));
    const c = Buffer.from(buf.subarray(p, p + 46 + nlen + xlen + clen));
    c.writeUInt32LE(at, 42);
    centrals.push(c);
    at += len;
    p += 46 + nlen + xlen + clen;
  }
  const DATE = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const { name, data } of adds) {
    const store = STORED.test(name);
    const body = store ? data : zlib.deflateRawSync(data, { level: 9 });
    const nm = Buffer.from(name, 'utf8');
    const crc = zlib.crc32(data) >>> 0;
    const head = Buffer.alloc(30);
    head.writeUInt32LE(0x04034b50, 0); head.writeUInt16LE(20, 4); head.writeUInt16LE(0x0800, 6);
    head.writeUInt16LE(store ? 0 : 8, 8); head.writeUInt16LE(0, 10); head.writeUInt16LE(DATE, 12);
    head.writeUInt32LE(crc, 14); head.writeUInt32LE(body.length, 18); head.writeUInt32LE(data.length, 22);
    head.writeUInt16LE(nm.length, 26); head.writeUInt16LE(0, 28);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8);
    cen.writeUInt16LE(store ? 0 : 8, 10); cen.writeUInt16LE(0, 12); cen.writeUInt16LE(DATE, 14);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nm.length, 28); cen.writeUInt32LE(at, 42);
    locals.push(head, nm, body);
    centrals.push(Buffer.concat([cen, nm]));
    at += 30 + nm.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(centrals.length, 8); end.writeUInt16LE(centrals.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(at, 16);
  return Buffer.concat([...locals, cd, end]);
}

// --- the build --------------------------------------------------------------------------------

export async function buildApk() {
  const S = findSdk();
  const JDK = findJdk();
  const env = { ...process.env, JAVA_HOME: JDK, PATH: path.join(JDK, 'bin') + path.delimiter + process.env.PATH };
  const T = (name) => path.join(S.tools, name);
  fs.rmSync(WORK, { recursive: true, force: true });
  const assets = path.join(WORK, 'assets'), res = path.join(WORK, 'res'), classes = path.join(WORK, 'classes'), dex = path.join(WORK, 'dex');
  for (const d of [assets, res, classes, dex]) fs.mkdirSync(d, { recursive: true });

  // 1. The game: exactly the web build's files, under assets/www/.
  const web = await buildWeb(path.join(assets, 'www'));
  // 2. The resources: the icon.
  writeResources(res);
  run(T('aapt2' + exe), ['compile', '--dir', res, '-o', path.join(WORK, 'res.zip')]);
  // 3. The manifest and the resources linked into an APK with no code and no game yet.
  const base = path.join(WORK, 'base.apk');
  run(T('aapt2' + exe), ['link', '-o', base, '-I', S.jar, '--manifest', path.join(ROOT, 'android', 'AndroidManifest.xml'),
    '--version-code', String(VERSION_CODE), '--version-name', VERSION, '--debug-mode', path.join(WORK, 'res.zip')]);
  // 4. The code: the activity, against the platform's android.jar, to dex.
  const java = listFiles(path.join(ROOT, 'android', 'src')).filter((f) => f.endsWith('.java'));
  run(path.join(JDK, 'bin', 'javac' + exe), ['-encoding', 'UTF-8', '-source', '8', '-target', '8', '-Xlint:-options',
    '-bootclasspath', S.jar, '-d', classes, ...java], { env });
  run(T('d8' + bat), ['--release', '--min-api', String(MIN_SDK), '--lib', S.jar, '--output', dex,
    ...listFiles(classes).filter((f) => f.endsWith('.class'))], { env });
  // The code and the game's files added, under '/' names (zipWith says why not by aapt2).
  const unsigned = path.join(WORK, 'unsigned.apk');
  fs.writeFileSync(unsigned, zipWith(base, [
    { name: 'classes.dex', data: fs.readFileSync(path.join(dex, 'classes.dex')) },
    ...web.map((f) => ({ name: 'assets/www/' + f, data: fs.readFileSync(path.join(assets, 'www', f)) })),
  ]));
  // 5. Aligned, then signed (in that order: a v2 signature covers the aligned bytes).
  const aligned = path.join(WORK, 'aligned.apk'), signed = path.join(WORK, 'signed.apk');
  run(T('zipalign' + exe), ['-f', '-p', '4', unsigned, aligned]);
  run(T('zipalign' + exe), ['-c', '-p', '4', aligned]);
  const ks = path.join(os.homedir(), '.android', 'debug.keystore');
  if (!fs.existsSync(ks)) {
    fs.mkdirSync(path.dirname(ks), { recursive: true });
    run(path.join(JDK, 'bin', 'keytool' + exe), ['-genkeypair', '-keystore', ks, '-storepass', 'android', '-alias', 'androiddebugkey',
      '-keypass', 'android', '-keyalg', 'RSA', '-keysize', '2048', '-validity', '10000', '-dname', 'CN=Android Debug,O=Android,C=US'], { env });
  }
  run(T('apksigner' + bat), ['sign', '--ks', ks, '--ks-pass', 'pass:android', '--key-pass', 'pass:android',
    '--ks-key-alias', 'androiddebugkey', '--out', signed, aligned], { env });

  // 6. Proved before it is called built: the signature verifies, the manifest says what it
  // should, and every file of the web build is in it, byte for byte.
  const verify = run(T('apksigner' + bat), ['verify', '--verbose', signed], { env });
  if (!/Verified using v2 scheme \(APK Signature Scheme v2\): true/.test(verify)) throw new Error('the signature does not verify:\n' + verify);
  const badging = run(T('aapt2' + exe), ['dump', 'badging', signed]);
  const want = [`package: name='${APP_ID}' versionCode='${VERSION_CODE}' versionName='${VERSION}'`, `minSdkVersion:'${MIN_SDK}'`,
    `launchable-activity: name='${APP_ID}.MainActivity'`];
  const lacking = want.filter((w) => !badging.includes(w));
  if (lacking.length) throw new Error('the manifest is not as meant: ' + lacking.join('; ') + '\n' + badging.slice(0, 600));
  const inside = new Map(readZip(signed).map((e) => [e.name, e.data]));
  const off = web.filter((f) => { const d = inside.get('assets/www/' + f); return !d || !d.equals(fs.readFileSync(path.join(ROOT, f))); });
  if (off.length) throw new Error(`${off.length} file(s) of the game missing or changed in the APK: ${off.slice(0, 5).join(', ')}`);
  if (!inside.has('classes.dex') || !inside.has('resources.arsc')) throw new Error('the APK has no code or no resources');
  const crooked = [...inside.keys()].filter((n) => n.includes('\\'));
  if (crooked.length) throw new Error(`entries named with a backslash, which Android never finds: ${crooked.slice(0, 3).join(', ')}`);

  fs.copyFileSync(signed, OUT);
  return { out: OUT, bytes: fs.statSync(OUT).size, files: web.length, api: S.api, tools: path.basename(S.tools), jdk: path.basename(JDK) };
}

const MAIN = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (MAIN) {
  try {
    const r = await buildApk();
    console.log(`  ${path.relative(ROOT, r.out)}  ${(r.bytes / 1048576).toFixed(1)} MB: the game's ${r.files} files, ` +
      `built against ${r.api} with build-tools ${r.tools} and ${r.jdk}`);
    console.log('  signed with the debug key and verified; the manifest and every file of the game checked');
  } catch (e) {
    console.log('  FAILED: ' + e.message);
    process.exit(1);
  }
}
