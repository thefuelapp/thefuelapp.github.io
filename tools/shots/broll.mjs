// Clean screen recordings of the REAL app (../../app) for cutting into Cameron's own videos: no text, no music, no stickers, like an
// iPhone screen recording. Phone-sized Chromium, a fixed Monday-evening clock, cloud pointed at a dummy address (nothing reaches Supabase).
// Frames come from Chrome's screencast at full resolution and are timed exactly, then encoded with ffmpeg.
// Usage: PW=<folder with node_modules/playwright> [FUEL_BROLL_OUT=<folder>] node tools/shots/broll.mjs [only-this-scene]
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { createRequire } from 'module'; import { execFileSync } from 'child_process';
const require = createRequire(path.join(process.env.PW, 'node_modules/')); const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url)); const APP = path.join(HERE, '../../app');
const OUT = path.resolve(process.env.FUEL_BROLL_OUT || path.join(HERE, '../../shots-out/broll')); // was marketing/film/broll in the retired private copy; shots-out/ is git-ignored const TMP = path.join(OUT, '.frames'); fs.mkdirSync(TMP, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const b = await chromium.launch({ channel: 'chromium' });
const W = 390, H = 844, DPR = 3;
async function phone(state) {
  const ctx = await b.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: DPR, isMobile: true, hasTouch: true, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' });
  const p = await ctx.newPage();
  await p.clock.install({ time: new Date('2026-10-05T18:30:00') });
  await p.route('http://fuel.local/**', (route) => {
    let u = new URL(route.request().url()).pathname; if (u.endsWith('/')) u += 'index.html';
    if (u === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: "export const CONFIG={SUPABASE_URL:'https://dummy.invalid',SUPABASE_ANON_KEY:'x',CHECKOUT_URL:'https://buy.stripe.com/test',APP_NAME:'Fuel',PRICE_LABEL:'£4.99'};" });
    const f = path.join(APP, u); if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ contentType: types[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  // the backend as it will be once growth.sql is in: the mates card shows (0 of 3), a made-up link code for this demo phone
  await p.route('https://dummy.invalid/rest/v1/rpc/**', (r) => { const fn = r.request().url().split('/').pop();
    if (fn === 'mate_status') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, code: 'CAM7QX', planned: 0, needed: 3, unlocked: false }) });
    if (fn === 'make_mate_code') return r.fulfill({ contentType: 'application/json', body: JSON.stringify({ ok: true, code: 'CAM7QX', secret: 'demo' }) });
    return r.fulfill({ status: 204, body: '' }); });
  await p.route('https://dummy.invalid/**', (r) => r.fulfill({ status: 404, body: '' }));
  if (state) await p.addInitScript((s) => { if (!localStorage.getItem('fuel:v1')) { localStorage.setItem('fuel:v1', s); localStorage.setItem('fuel:mate', JSON.stringify({ code: 'CAM7QX', secret: 'demo' })); } }, state);
  return p;
}
async function record(p, name, fn) {
  const cdp = await p.context().newCDPSession(p); const frames = []; let n = 0;
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => { const f = path.join(TMP, `${name}_${String(n++).padStart(5, '0')}.jpg`); fs.writeFileSync(f, Buffer.from(data, 'base64')); frames.push({ f, t: metadata.timestamp }); cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {}); });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: W * DPR, maxHeight: H * DPR, everyNthFrame: 1 });
  const t0 = Date.now(); await fn(); const end = Date.now() / 1000; await p.waitForTimeout(150);
  await cdp.send('Page.stopScreencast');
  if (frames.length < 2) throw new Error(name + ': no frames');
  const list = frames.map((x, i) => `file '${x.f}'\nduration ${Math.max(0.001, ((frames[i + 1]?.t ?? end) - x.t)).toFixed(4)}`).join('\n') + `\nfile '${frames.at(-1).f}'\n`;
  const lf = path.join(TMP, name + '.txt'); fs.writeFileSync(lf, list);
  const out = path.join(OUT, name + '.mp4');
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', lf, '-vf', 'scale=1080:-2:flags=lanczos,fps=30,format=yuv420p', '-c:v', 'libx264', '-crf', '17', '-preset', 'slow', '-movflags', '+faststart', out]);
  for (const x of frames) fs.unlinkSync(x.f); fs.unlinkSync(lf);
  console.log(`${name}.mp4  ${((Date.now() - t0) / 1000).toFixed(1)} s, ${frames.length} frames`);
}
const pause = (p, ms) => p.waitForTimeout(ms);
const tap = async (p, sel, after = 700) => { await p.locator(sel).first().tap(); await pause(p, after); };
const glide = (p, to, ms = 1400) => p.evaluate(([y, d]) => new Promise((res) => { const v = document.getElementById('view'); const from = v.scrollTop; const s = performance.now(); const step = (t) => { const k = Math.min(1, (t - s) / d); const e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2; v.scrollTop = from + (y - from) * e; if (k < 1) requestAnimationFrame(step); else res(); }; requestAnimationFrame(step); }), [to, ms]);
const glideTo = (p, sel, offset = 90, ms = 1400) => p.evaluate((s) => { const el = document.querySelector(s); const v = document.getElementById('view'); return el ? el.getBoundingClientRect().top + v.scrollTop : 0; }, sel).then((y) => glide(p, Math.max(0, y - offset), ms));
const ONLY = process.argv[2];
const scene = async (name, state, fn) => { if (ONLY && ONLY !== name) return; const p = await phone(state); await p.goto('http://fuel.local/'); await pause(p, 1800); await record(p, name, () => fn(p)); await p.context().close(); };

// a settled phone: set up (85 kg, building, £40), week planned by "Plan my week for me"
let planned;
{ const p = await phone(); await p.goto('http://fuel.local/'); await pause(p, 1500);
  await tap(p, '[data-action="intro-goal"][data-goal="build"]', 300); await tap(p, '[data-action="intro-weight"]', 300); await tap(p, '[data-action="intro-budget"][data-budget="40"]', 300); await tap(p, '[data-action="intro-next"]', 300);
  await tap(p, '[data-action="intro-auto"]', 3500); await tap(p, '[data-action="autoplan-keep"]', 400);
  planned = await p.evaluate(() => localStorage.getItem('fuel:v1')); await p.context().close(); }

// 1. set-up to a planned week in one tap
await scene('01-set-up-and-plan-my-week', null, async (p) => {
  await pause(p, 900); await tap(p, '[data-action="intro-goal"][data-goal="build"]', 900);
  await tap(p, '[data-action="intro-weight"]', 900); await tap(p, '[data-action="intro-budget"][data-budget="40"]', 900);
  await tap(p, '[data-action="intro-next"]', 1400);
  await tap(p, '[data-action="intro-auto"]', 3600);
  await pause(p, 1200); await tap(p, '[data-action="autoplan-keep"]', 900);
  await glideTo(p, '.gridcard', 20, 2200); await pause(p, 1200); await glide(p, 1500, 3200); await pause(p, 800);
});
// 2. the free week, said plainly
await scene('02-free-week', planned, async (p) => { await pause(p, 1500); await tap(p, '.fw-more', 2600); await pause(p, 1200); });
// 3. one tap, another week
await scene('03-try-another-week', planned, async (p) => {
  await glideTo(p, '.pickhead', 20, 900); await tap(p, '[data-action="clear-week"]', 900).catch(() => {});
  const ok = await p.locator('[data-dlg="1"]').count(); if (ok) await tap(p, '[data-dlg="1"]', 900);
  await glide(p, 0, 600); await pause(p, 400); await tap(p, '[data-action="autoplan"]', 3600); await pause(p, 1000);
  await tap(p, '[data-action="autoplan"][data-seed="2"]', 3600); await pause(p, 1400);
});
// 4. same list, four supermarkets
await scene('04-four-shops', planned, async (p) => {
  await tap(p, '#tabs [data-tab="shop"]', 900); if (await p.locator('[data-action="cup-done"]').count()) await tap(p, '[data-action="cup-done"]', 700);
  await glideTo(p, '.shophead', 30, 1200); await pause(p, 1000);
  for (const s of ['tesco', 'asda', 'sainsburys', 'aldi']) { const el = p.locator(`.shopchip[data-shop="${s}"], [data-action="shop"][data-shop="${s}"]`); if (await el.count()) await tap(p, `.shopchip[data-shop="${s}"], [data-action="shop"][data-shop="${s}"]`, 1300); }
  await pause(p, 600);
});
// 5. already got it? tick it and the price drops
await scene('05-cupboard-check', planned, async (p) => {
  await tap(p, '#tabs [data-tab="shop"]', 1200);
  const chips = p.locator('.cupcheck .chip[data-action="cup-tick"]'); const n = Math.min(5, await chips.count());
  for (let i = 0; i < n; i++) { await chips.nth(i).tap(); await pause(p, 900); }
  await tap(p, '[data-action="cup-done"]', 900); await glideTo(p, '.shophead', 30, 1300); await pause(p, 1500);
});
// 6. share my week
await scene('06-share-my-week', planned, async (p) => { await glideTo(p, '.gridcard', 20, 1200); await glideTo(p, '[data-action="share-week"]', 300, 900); await tap(p, '[data-action="share-week"]', 2800); await pause(p, 1500); });
// 7. Sunday's cook sheet
await scene('07-cook-sheet', planned, async (p) => { await tap(p, '#tabs [data-tab="cook"]', 1300); await glide(p, 700, 3000); await pause(p, 600); await tap(p, '.cookfold summary', 1500).catch(() => {}); await glide(p, 1500, 2500); await pause(p, 700); });
// 8. bring 3 mates
await scene('08-bring-3-mates', planned, async (p) => { await pause(p, 1200); await tap(p, '.fw-more', 1600); await p.evaluate(() => document.querySelector('.sheet-inner .matescard')?.scrollIntoView({ behavior: 'smooth', block: 'center' })); await pause(p, 2200); });
// 9. day 8 (what it looks like when the free week ends)
await scene('09-day-8', (() => { const s = JSON.parse(planned); s.trial = { start: '2026-09-27T18:00:00.000Z' }; return JSON.stringify(s); })(), async (p) => { await pause(p, 2500); });
await b.close();
