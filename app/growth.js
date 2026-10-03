// Growth plumbing (3 Oct 2026), all optional: with no cloud configured every call quietly does nothing.
//  - A random id for this device (nothing about the person). The website at / and the app at /app/ share it (same address, same storage).
//  - Where the device first came from: ?r=tt (a source tag) and ?c=CODE (a mate's or a creator's code), kept from the first visit.
//  - track(step): counts each step once per device (supabase/growth.sql: track()). Settings → "Count my visit" switches it off.
//  - The device's own "bring 3 mates" code and how many mates have planned a week with it.
import { CONFIG } from './config.js';

const ON = !!(CONFIG.SUPABASE_URL && CONFIG.SUPABASE_ANON_KEY);
const store = { get(k) { try { return localStorage.getItem(k); } catch { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch {} } };

export function anonId() {
  let id = store.get('fuel:anon');
  if (!id || !/^[a-z0-9-]{8,40}$/.test(id)) { id = (crypto.randomUUID ? crypto.randomUUID() : 'd' + Math.random().toString(36).slice(2) + Date.now().toString(36)).toLowerCase(); store.set('fuel:anon', id); }
  return id;
}

const cleanSrc = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 24);
const cleanCode = (s) => String(s || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 20);

// Read ?r= and ?c= off the address and keep the first of each. They are left in the address bar on purpose: "Open in Safari" from
// Instagram/TikTok and iPhone's Add to Home Screen both start from the address, and a home-screen app has its own, empty storage.
export function captureAttribution() {
  let a = attribution();
  try {
    const u = new URL(location.href); const r = cleanSrc(u.searchParams.get('r')), c = cleanCode(u.searchParams.get('c'));
    if ((r && !a.src) || (c && !a.code)) { a = { src: a.src || r || '', code: a.code || c || '', at: a.at || new Date().toISOString() }; store.set('fuel:attr', JSON.stringify(a)); }
  } catch {}
  return a;
}
// iPhone only: the home-screen icon opens the manifest's start_url, which would drop the code. Point it at this address, code included.
export function carryCodeToHomeScreen() {
  try {
    const a = attribution(); const ios = /iPhone|iPad|iPod/.test(navigator.userAgent); const standalone = navigator.standalone === true;
    if (!ios || standalone || (!a.code && !a.src)) return;
    const link = document.querySelector('link[rel="manifest"]'); if (!link) return;
    const base = new URL(link.href, location.href); const q = new URLSearchParams(); if (a.src) q.set('r', a.src); if (a.code) q.set('c', a.code);
    fetch(base).then((r) => r.json()).then((m) => {
      const abs = (x) => new URL(x, base).href;
      const start = new URL(m.start_url || './', base); start.search = q.toString();
      const out = { ...m, start_url: start.href, scope: abs(m.scope || './'), icons: (m.icons || []).map((i) => ({ ...i, src: abs(i.src) })) };
      link.href = 'data:application/manifest+json,' + encodeURIComponent(JSON.stringify(out));
    }).catch(() => {});
  } catch {}
}
export function attribution() { try { return JSON.parse(store.get('fuel:attr') || '{}') || {}; } catch { return {}; } }

async function rpc(fn, args) {
  if (!ON) return null;
  const res = await fetch(`${CONFIG.SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: CONFIG.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(args), keepalive: true });
  if (!res.ok) throw new Error(`${fn}: ${res.status}`);
  const t = await res.text(); return t ? JSON.parse(t) : null;
}

let optedOut = () => false;
export function setOptOut(fn) { optedOut = fn; }
export function track(step) {
  if (!ON || optedOut()) return;
  let done = {}; try { done = JSON.parse(store.get('fuel:steps') || '{}') || {}; } catch {}
  if (done[step]) return;
  const a = attribution();
  rpc('track', { p_anon: anonId(), p_step: step, p_src: a.src || null, p_code: a.code || null })
    .then(() => { done[step] = new Date().toISOString(); store.set('fuel:steps', JSON.stringify(done)); })
    .catch(() => {}); // not set up yet, or offline: tried again next time
}

// This device's mate code: { code, secret }, made on first ask and kept on the phone.
export async function mateCode() {
  try { const m = JSON.parse(store.get('fuel:mate') || 'null'); if (m?.code && m?.secret) return m; } catch {}
  const r = await rpc('make_mate_code', { p_anon: anonId() });
  if (!r?.ok) throw new Error('no code');
  const m = { code: r.code, secret: r.secret }; store.set('fuel:mate', JSON.stringify(m)); return m;
}
export function savedMateCode() { try { return JSON.parse(store.get('fuel:mate') || 'null'); } catch { return null; } }
export async function mateStatus() {
  const m = savedMateCode(); if (!m) return null;
  const r = await rpc('mate_status', { p_code: m.code, p_secret: m.secret });
  return r?.ok ? r : null;
}
// Is supabase/growth.sql in yet? (A made-up code gets {ok:false} back once it is, a 404 before.) Asked once per session.
let ready = null;
export function growthReady() {
  if (!ON) return Promise.resolve(false);
  if (!ready) ready = rpc('mate_status', { p_code: 'PROBE', p_secret: 'x' }).then(() => true, () => false);
  return ready;
}
export const cloudOn = ON;
