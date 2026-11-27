// Copies the web app (app/) into ios-web/, the folder Capacitor packs into the iPhone app. Run by `npm run sync:ios`.
// app/ stays exactly what the website serves: nothing here changes it. Left out of the phone: the tests, the service worker
// (the app carries its own files, and WKWebView does not run one on capacitor://), and the web-only owner/partner pages.
import { cpSync, rmSync, existsSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const src = join(root, 'app'), out = join(root, 'ios-web');
const SKIP = new Set(['tests', 'sw.js', 'owner.html', 'partner.html', 'creator-terms.html', 'prices.html']);
if (!existsSync(join(src, 'index.html'))) { console.error('app/index.html is missing'); process.exit(1); }
rmSync(out, { recursive: true, force: true });
cpSync(src, out, { recursive: true, filter: (f) => { const rel = relative(src, f); return !rel || !SKIP.has(rel.split(sep)[0]) && !rel.endsWith('.DS_Store'); } });
console.log(`ios-web/ built from app/ (left out: ${[...SKIP].join(', ')})`);
