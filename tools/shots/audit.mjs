// Screenshots every screen of the CURRENT app (../../app) at iPhone size, for design review. Cloud is pointed at a dummy address, so the
// free-week UI shows but nothing reaches Supabase. Usage: PW=<folder with node_modules/playwright> node tools/shots/audit.mjs <outDir> [tag]
import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url'; import { createRequire } from 'module';
const require = createRequire(path.join(process.env.PW, 'node_modules/')); const { chromium } = require('playwright');
const HERE = path.dirname(fileURLToPath(import.meta.url)); const APP = path.join(HERE, '../../app');
const OUT = path.resolve(process.argv[2] || 'shots'); const TAG = process.argv[3] || ''; fs.mkdirSync(OUT, { recursive: true });
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg' };
const b = await chromium.launch({ channel: 'chromium' });
async function phone(h = 812) {
  const ctx = await b.newContext({ viewport: { width: 390, height: h }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block',
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36' });
  const p = await ctx.newPage(); const errs = []; p.on('pageerror', (e) => errs.push(String(e))); p.errs = errs;
  await p.clock.install({ time: new Date(process.env.FUEL_DATE || '2026-10-05T09:41:00') });
  await p.route('http://fuel.local/**', (route) => {
    let u = new URL(route.request().url()).pathname; if (u.endsWith('/')) u += 'index.html';
    if (u === '/config.js') return route.fulfill({ contentType: 'text/javascript', body: "export const CONFIG={SUPABASE_URL:'https://dummy.invalid',SUPABASE_ANON_KEY:'x',CHECKOUT_URL:'https://buy.stripe.com/test',APP_NAME:'Fuel',PRICE_LABEL:'£4.99'};" });
    const f = path.join(APP, u); if (!fs.existsSync(f)) return route.fulfill({ status: 404, body: '' });
    route.fulfill({ contentType: types[path.extname(f)] || 'application/octet-stream', body: fs.readFileSync(f) });
  });
  await p.route('https://dummy.invalid/**', (r) => r.fulfill({ status: 404, body: '' }));
  return p;
}
const wait = (p, ms = 700) => p.clock.runFor(ms);
const shot = async (p, name) => { await wait(p, 900); await p.waitForTimeout(700); await p.screenshot({ path: path.join(OUT, `${TAG}${name}.png`) }); console.log('shot', name); };
const click = async (p, sel) => { await p.locator(sel).first().click(); await wait(p); };
// state after set-up + Plan my week for me, reused for every tall screen
let saved = null;
{
  const p = await phone();
  await p.goto('http://fuel.local/'); await wait(p, 1500);
  await shot(p, '01-intro-goal');
  await click(p, '[data-action="intro-goal"][data-goal="build"]'); await p.fill('#intro-weight', '85'); await click(p, '[data-action="intro-weight"]');
  await click(p, '[data-action="intro-budget"][data-budget="40"]'); await click(p, '[data-action="intro-next"]');
  await shot(p, '02-intro-done');
  await click(p, '[data-action="intro-auto"]'); await wait(p, 3500);
  await shot(p, '03-autoplan-sheet');
  await click(p, '[data-action="autoplan-keep"]');
  await shot(p, '04-plan-top');
  saved = await p.evaluate(() => localStorage.getItem('fuel:v1'));
  await p.context().close();
}
// v86: every tab, light and dark (dark = S.theme set in the saved state), plus the Sunday check-in
for (const dark of [false, true]) {
  const st = JSON.parse(saved); if (dark) st.theme = 'dark'; const state = JSON.stringify(st); const pre = dark ? 'dark-' : '';
  for (const [tab, name] of [['home', '04b-home-tall'], ['plan', '05-plan-tall'], ['shop', '06-shop-tall'], ['cook', '07-cook-tall'], ['recipes', '08-recipes-tall'], ['pantry', '09-pantry-tall'], ['settings', '10-settings-tall'], ['more', '10b-more-tall']]) {
    const p = await phone(2600);
    await p.addInitScript((s) => { if (!localStorage.getItem('fuel:v1')) localStorage.setItem('fuel:v1', s); }, state);
    await p.goto('http://fuel.local/'); await wait(p, 1500);
    if (tab === 'settings') await click(p, '[data-action="settings"]'); else if (tab === 'recipes' || tab === 'pantry') { await click(p, '#tabs [data-tab="more"]'); await click(p, `.morebtn[data-to="${tab}"]`); } else await click(p, `#tabs [data-tab="${tab}"]`);
    await shot(p, pre + name);
    if (p.errs.length) console.log('ERRORS', pre + name, p.errs);
    await p.context().close();
  }
  { // the check-in, three steps, from More
    const p = await phone(1400);
    await p.addInitScript((s) => { if (!localStorage.getItem('fuel:v1')) localStorage.setItem('fuel:v1', s); }, state);
    await p.goto('http://fuel.local/'); await wait(p, 1500);
    await click(p, '#tabs [data-tab="more"]'); await click(p, '[data-action="checkin-start"]'); await shot(p, pre + '12-checkin-1');
    await click(p, '.ci-row [data-action="checkin-eaten"][data-d="-1"]'); await click(p, '[data-action="checkin-next"]'); await shot(p, pre + '13-checkin-2');
    await click(p, '[data-action="checkin-next"]'); await shot(p, pre + '14-checkin-3');
    if (p.errs.length) console.log('ERRORS', pre + 'checkin', p.errs);
    await p.context().close();
  }
}
{ // day 8: the door
  const p = await phone();
  const st = JSON.parse(saved); st.trial = { start: '2026-09-27T09:00:00.000Z', planAt: '2026-09-28T09:00:00.000Z', planWeek: '2026-09-28' }; st.stepPlanned = '2026-09-28T09:00:00.000Z';
  await p.addInitScript((s) => localStorage.setItem('fuel:v1', s), JSON.stringify(st));
  await p.goto('http://fuel.local/'); await wait(p, 2500); await shot(p, '11-gate-day8');
  await p.context().close();
}
await b.close();
