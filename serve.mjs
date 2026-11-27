// Local dev server for the app folder. Not deployed.
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'app');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
// Dev-only drop box: POST /_dump?name=x saves the body to $FUEL_DUMP_DIR/x.txt (used for price scraping). Ignored unless the env var is set.
const dumpDir = process.env.FUEL_DUMP_DIR;
http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]); if (p.endsWith('/')) p += 'index.html';
  if (req.method === 'GET' && p === '/_file' && dumpDir) { // dev-only: read a file back out of the drop box (e.g. the term list a scraper needs)
    const name = (new URL(req.url, 'http://x').searchParams.get('name') || '').replace(/[^a-z0-9_.-]/gi, '');
    fs.readFile(path.join(dumpDir, name), (err, data) => { res.writeHead(err ? 404 : 200, { 'access-control-allow-origin': '*', 'content-type': 'application/json' }); res.end(err ? 'not found' : data); });
    return;
  }
  if (req.method === 'GET' && p === '/_relay' && dumpDir) { // dev-only: a scraper tab stashes results in window.name, navigates here, and this page drops them into the box
    const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'relay').replace(/[^a-z0-9_-]/gi, '');
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(`<!doctype html><body><script>fetch('/_dump?name=${name}',{method:'POST',body:window.name}).then(r=>r.text()).then(t=>{document.body.textContent='relay '+t;window.name=''})</script></body>`);
    return;
  }
  if (req.method === 'POST' && p === '/_dump' && dumpDir) {
    const name = (new URL(req.url, 'http://x').searchParams.get('name') || 'dump').replace(/[^a-z0-9_-]/gi, '');
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => { fs.writeFileSync(path.join(dumpDir, name + '.txt'), body); res.writeHead(200, { 'access-control-allow-origin': '*' }); res.end('saved ' + body.length); });
    return;
  }
  const f = path.join(root, p);
  fs.readFile(f, (err, data) => { if (err) { res.writeHead(404); res.end('not found'); return; }
    res.writeHead(200, { 'content-type': types[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' }); res.end(data); });
}).listen(+process.env.PORT || 8765, () => console.log('serving', root, 'on', +process.env.PORT || 8765));
