import * as P from './planner.js';
import { CONFIG } from './config.js';
import { cloud, initCloud, onCloudChange, signIn, signUp, resetPassword, redeemCode, signOut, hasAccess, pullState, pushStateSoon } from './cloud.js';

const KEY = 'fuel:v1';
const APP_VERSION = 'v75';
const DATA = { ingredients: [], recipes: [] };
const S = load();
if (S.tab === 'settings') S.tab = S.prevTab && S.prevTab !== 'settings' ? S.prevTab : 'plan';

function load() {
  const base = { tab: 'plan', activeWeek: null, weeks: {}, tubs: {}, customRecipes: [], customIngredients: [], inbox: [], settings: { portion: 1, weight: 85, goal: 'build', proteinTarget: 180, snackProtein: 24, budget: 50, avoid: [] } };
  try { return { ...base, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return base; }
}
function syncable() { const { tab, search, planSearch, planFilter, pantrySearch, ideasOpen, ideaTag, ...rest } = S; return rest; }
function save() { S.updatedAt = new Date().toISOString(); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} pushStateSoon(syncable); }

const ING = () => DATA.ingredients.concat(S.customIngredients);
// Personal tweaks: S.tweaks[recipeId] = { drop: [ingredientId], add: [{ id, qty }] } (qty per portion). Applied to the user's copy of any recipe.
// Sensible stand-ins offered when an ingredient is left out (same unit only, checked at render time).
const SWAPS = {
  breadcrumbs: ['oats', 'parmesan', 'flour'], cottage_cheese: ['skyr', 'cheddar'], skyr: ['cottage_cheese'], cheddar: ['parmesan', 'cottage_cheese'], parmesan: ['cheddar'],
  chicken_breast: ['chicken_thigh', 'chicken_mince', 'turkey_mince', 'salmon', 'prawns'], chicken_thigh: ['chicken_breast'], chicken_mince: ['turkey_mince', 'pork_mince_5', 'beef_mince_5'],
  beef_mince_5: ['turkey_mince', 'pork_mince_5', 'chicken_mince', 'red_lentils'], pork_mince_5: ['turkey_mince', 'beef_mince_5', 'chicken_mince'], turkey_mince: ['chicken_mince', 'beef_mince_5', 'pork_mince_5'],
  tuna: ['salmon', 'prawns', 'chicken_breast'], salmon: ['tuna', 'prawns', 'chicken_breast'], prawns: ['chicken_breast', 'salmon'],
  penne: ['basmati', 'rice_noodles', 'baby_potatoes', 'sweet_potato'], basmati: ['penne', 'rice_noodles', 'baby_potatoes'], rice_noodles: ['basmati', 'penne'],
  sweet_potato: ['baby_potatoes', 'basmati'], baby_potatoes: ['sweet_potato', 'basmati'], bread: ['wrap', 'pitta'], wrap: ['pitta', 'bread'], pitta: ['wrap', 'bread'], corn_tortilla: ['wrap'],
  mushrooms: ['pepper', 'spinach', 'broccoli'], spinach: ['broccoli', 'frozen_peas', 'mixed_veg'], broccoli: ['mixed_veg', 'frozen_peas', 'spinach'], frozen_peas: ['sweetcorn', 'mixed_veg'], mixed_veg: ['broccoli', 'frozen_peas'],
  kidney_beans: ['black_beans', 'chickpeas'], black_beans: ['kidney_beans', 'chickpeas'], chickpeas: ['black_beans', 'kidney_beans', 'red_lentils'], red_lentils: ['chickpeas'],
  light_mayo: ['skyr'], coconut_milk: ['milk'], banana: ['frozen_blueberries', 'frozen_mango'],
};
function swapsFor(fromId) { const from = ingById(fromId); return (SWAPS[fromId] || []).map(ingById).filter((it) => it && from && it.unit === from.unit); }
const KW_STOP = new Set(['frozen', 'fresh', 'dried', 'low', 'fat', 'grated', 'chunks', 'tin', 'tins', 'mature', 'lean', 'fillets', 'fillet', 'paste', 'powder', 'plain', 'golden', 'light', 'mixed', 'baby', 'red', 'green', 'cherry', 'boneless', 'chopped', 'your', 'pick', 'skinless', 'whole', 'large', 'small', 'tinned', 'canned']);
// The word a method step would use for an ingredient: first meaningful word of its name, singular. "Golden breadcrumbs" → breadcrumb.
function keywordFor(it) { const words = (it?.name || '').toLowerCase().replace(/\(.*?\)/g, '').split(/[^a-z]+/).filter((w) => w.length >= 4 && !KW_STOP.has(w)); const w = words[0] || ''; return w.endsWith('oes') ? w.slice(0, -2) : w.replace(/s$/, ''); }
function applyTweak(r) {
  const t = S.tweaks && S.tweaks[r.id]; if (!t || (!(t.drop || []).length && !(t.add || []).length)) return r;
  const drop = new Set(t.drop || []);
  // A stand-in takes the place of what it replaces; anything else added goes on the end.
  const ingredients = r.ingredients.flatMap((x) => { if (!drop.has(x.id)) return [x]; const sw = (t.add || []).find((a) => a.for === x.id); return sw ? [{ id: sw.id, qty: sw.qty }] : []; }).concat((t.add || []).filter((x) => !x.for).map((x) => ({ id: x.id, qty: x.qty })));
  // Rewrite the method so it still reads right: steps that mention a dropped ingredient say so; a swap says what to use instead; extras get a step of their own.
  const notes = (t.drop || []).map((d) => { const from = ingById(d); const sw = (t.add || []).find((x) => x.for === d); const to = sw && ingById(sw.id); return { kw: keywordFor(from), text: to ? `use ${to.name.toLowerCase()} instead of ${(from?.name || d).toLowerCase()}` : `skip the ${(from?.name || d).toLowerCase()}` }; }).filter((n) => n.kw);
  let touched = false;
  const method = r.method.map((step) => { const low = step.toLowerCase(); const hits = notes.filter((n) => low.includes(n.kw)); if (!hits.length) return step; touched = true; return `${step} (${hits.map((h) => h.text).join('; ')})`; });
  for (const n of notes) if (!r.method.some((st) => st.toLowerCase().includes(n.kw))) { method.push(`${n.text[0].toUpperCase()}${n.text.slice(1)}.`); touched = true; }
  for (const x of (t.add || []).filter((x) => !x.for)) { const it = ingById(x.id); method.push(`Add the ${(it?.name || x.id).toLowerCase()} (${P.fmtQty(x.qty, it?.unit || '')} a portion): stir it in at the end, or put it on top when eating.`); touched = true; }
  return { ...r, ingredients, method, tweaked: true, tweakedMethod: touched };
}
const RAW = () => DATA.recipes.concat(S.customRecipes).map(applyTweak);
const RAW_ORIGINAL = (id) => DATA.recipes.concat(S.customRecipes).find((r) => r.id === id);
let SCALED = { f: null, list: null, n: 0 };
// Meals (not snacks) are scaled so the active week's picks land on the calorie target.
function mealsKcalAt1x(w) {
  const raw = RAW(); const ing = ING(); const rec = Object.fromEntries(raw.map((r) => [r.id, r]));
  const active = (w.days || []).filter(Boolean).length || 1;
  let meals = 0, snacks = 0;
  let cells = 0, skipped = 0;
  (w.grid || []).forEach((d, i) => { if (!w.days[i]) return; for (const sl of P.SLOTS) { const v = d[sl]; if (P.isOut(v)) { skipped += 1; continue; } const rid = P.isTub(v) ? P.tubRecipe(v) : v; if (rid && rec[rid]) { meals += P.kcalPerPortion(rec[rid], ing); cells += 1; } } });
  // A skipped slot is a meal eaten somewhere else, not a reason to make every other portion bigger: count it as an average meal.
  if (cells && skipped) meals += (meals / cells) * skipped;
  for (const [id, n] of Object.entries(w.snacks || {})) if (rec[id] && n) snacks += P.kcalPerPortion(rec[id], ing) * n;
  return { meals: meals / active, snacks: snacks / active };
}
function weekFactor(w, kcalTarget = S.settings.kcalTarget) {
  if (!w || !w.grid) return 1;
  const { meals, snacks } = mealsKcalAt1x(w);
  if (!meals || !kcalTarget) return 1;
  const f = (kcalTarget - snacks) / meals;
  return Math.round(Math.min(2.5, Math.max(0.6, f)) * 20) / 20; // 0.6× to 2.5× the written recipe
}
const REC = () => {
  const raw = RAW(); const w = S.weeks?.[S.activeWeek];
  const f = weekFactor(w);
  if (SCALED.f !== f || SCALED.n !== raw.length) { SCALED = { f, n: raw.length, list: raw.map((r) => (r.slots.includes('snack') ? r : { ...r, ingredients: r.ingredients.map((x) => ({ id: x.id, qty: Math.round(x.qty * f * 100) / 100 })) })) }; META.clear(); }
  return SCALED.list;
};
const inLibrary = (id) => !S.library || S.library.includes(id);
const ingById = (id) => ING().find((i) => i.id === id);
// What actually gets bought for an ingredient id: the week's fruit pick, thighs instead of breast.
function resolveFor(w) {
  return (id) => {
    if (id === 'chicken_breast' && S.settings.preferThigh) return 'chicken_thigh';
    if (id === 'milk' && S.settings.milk && S.settings.milk !== 'milk' && ingById(S.settings.milk)) return S.settings.milk; // oat / almond / soya instead of dairy
    return id; // choice ingredients (e.g. frozen fruit) are split across the picked options in shopNeeds
  };
}
const recById = (id) => REC().find((r) => r.id === id);
// Ingredients the Pantry should list: everything used by the recipes in your library (after tweaks and the thigh switch),
// the options behind any choice ingredient, plus anything already ticked or marked "use up" this week so nothing vanishes.
// The rest of the catalogue stays as the price store for recipes added later.
function pantryIds(w) {
  const ids = new Set(); const res = resolveFor(w);
  for (const r of RAW()) {
    if (!inLibrary(r.id) && !Object.values(S.weeks).some((wk) => wk.portions?.[r.id] || wk.snacks?.[r.id])) continue;
    for (const x of r.ingredients || []) { ids.add(x.id); ids.add(res(x.id)); const it = ingById(x.id); for (const c of it?.choices || []) ids.add(c); }
  }
  for (const id of Object.keys(w.pantry || {})) ids.add(id);
  for (const id of Object.keys(w.useUp || {})) ids.add(id);
  for (const e of extras(w)) ids.add(e.id);
  return ids;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hue = (id) => { let h = 0; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
const cellStyle = (id) => `background:hsl(${hue(id)} 90% 82%);color:hsl(${hue(id)} 70% 22%);`;

// ---------- weeks ----------
const iso = (d) => d.toISOString().slice(0, 10);
function mondayOf(date) { const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return iso(d); }
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
// The date you actually cook for this week: a Sunday cook is the Sunday before the week starts.
function cookDate(w, key) { return w.cookDay === 6 ? addDays(key, -1) : addDays(key, w.cookDay); }
function addDays(isoDate, n) { const d = new Date(isoDate + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
function fmtDate(isoDate) { const d = new Date(isoDate + 'T00:00:00Z'); return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' }); }
const W = () => S.weeks[S.activeWeek];
// Days of the active week that have already gone: index of today within this week (0 for a future week, 7 for a past one).
function todayIdx() { if (S.activeWeek !== S.thisMon) return S.activeWeek < S.thisMon ? 7 : 0; return (new Date().getDay() + 6) % 7; }
const isPast = (i) => i < todayIdx();
// Days still to come: what the stats, the cook and the shop are about. Past days are eaten, not planned.
function liveDays(w) { return (w.days || []).map((on, i) => on && !isPast(i)); }
function liveGrid(w) { return (w.grid || []).map((d, i) => (isPast(i) ? { breakfast: null, lunch: null, dinner: null } : d)); }
// Stock-ups (whey, oils, spices, rice, pasta…) last weeks: what was ticked in the Pantry or bought on the shop list carries into the next week's Pantry as "plenty".
function carryStaples(from, to) {
  if (!from || !to) return;
  for (const [id, v] of Object.entries(from.pantry || {})) if (ingById(id)?.staple && to.pantry[id] === undefined) to.pantry[id] = v;
  for (const [k, on] of Object.entries(from.ticks || {})) { const id = k.split(':')[1]; if (on && ingById(id)?.staple && to.pantry[id] === undefined) to.pantry[id] = true; }
}
function blankWeek() { return { portions: {}, grid: null, overflow: [], cookDay: 6, ticks: {}, days: [true, true, true, true, true, true, true], choices: {}, pantry: {}, fresh: {} }; }
function setupWeeks() {
  const thisMon = mondayOf(new Date()), nextMon = addDays(thisMon, 7);
  // Weeks used to start on Sunday (index 0 = Sun). They now run Mon–Sun: shift saved weeks one day and rotate their grids.
  if (!S.monFirst) {
    const moved = {};
    for (const [k, wk] of Object.entries(S.weeks)) {
      const rot = (i) => (i + 6) % 7; // old Sun(0)→6, Mon(1)→0 …
      if (wk.grid) wk.grid = Array.from({ length: 7 }, (_, j) => wk.grid[(j + 1) % 7]);
      if (wk.days) wk.days = Array.from({ length: 7 }, (_, j) => wk.days[(j + 1) % 7]);
      wk.cookDay = rot(wk.cookDay || 0);
      const fr = {}; for (const [kk, v] of Object.entries(wk.fresh || {})) { const [d, sl] = kk.split('-'); fr[`${rot(+d)}-${sl}`] = v; } wk.fresh = fr;
      moved[addDays(k, 1)] = wk;
    }
    S.weeks = moved; if (S.activeWeek) S.activeWeek = addDays(S.activeWeek, 1); S.monFirst = true;
  }
  // migrate v1 single-week state
  if (S.portions) { S.weeks[thisMon] = { portions: S.portions, grid: S.grid, overflow: S.overflow || [], cookDay: S.cookDay || 0, ticks: S.ticks || {} }; delete S.portions; delete S.grid; delete S.overflow; delete S.cookDay; delete S.ticks; }
  for (const k of Object.keys(S.weeks)) if (k < thisMon) delete S.weeks[k];
  if (!S.weeks[thisMon]) { const w = blankWeek(); const t = (new Date().getDay() + 6) % 7; for (let i = 0; i < t; i++) w.days[i] = false; S.weeks[thisMon] = w; } // first open mid-week: the days already gone are off
  if (!S.weeks[nextMon]) { S.weeks[nextMon] = blankWeek(); carryStaples(S.weeks[thisMon], S.weeks[nextMon]); }
  // First open late in the week (Fri/Sat): the week worth planning is the one that starts on Sunday.
  if (!S.weeks[S.activeWeek]) S.activeWeek = !S.activeWeek && [0, 5, 6].includes(new Date().getDay()) ? nextMon : thisMon;
  S.thisMon = thisMon; S.nextMon = nextMon;
  // pantry used to be one global list; it now belongs to each week (a fresh week starts with nothing ticked)
  if (S.pantry) { const p = S.pantry; if (p.peppers_frozen !== undefined) { p.pepper = p.peppers_frozen; delete p.peppers_frozen; } S.weeks[thisMon].pantry = { ...(S.weeks[thisMon].pantry || {}), ...p }; delete S.pantry; }
  S.tubs ||= {}; S.freshDefault ||= {}; S.settings.avoid ||= []; S.settings.weight ||= 85; S.settings.goal ||= 'build'; S.settings.kcalTarget ||= P.kcalTargetFor(S.settings.weight, S.settings.goal);
  // Personal recipe library: existing users keep everything they had; new users start with the core set and add from Ideas.
  // Personal recipe library. Starts as the core set; everything else lives in "Find more meal ideas".
  // Free accounts (cloud on, not paid) start with the first 8 core recipes; everyone else with the full core set.
  if (!S.library) { S.library = RAW().filter((r) => r.core).map((r) => r.id); for (const wk of Object.values(S.weeks)) for (const id of Object.keys(wk.portions || {})) if (!S.library.includes(id)) S.library.push(id); }
  // Core recipes added after someone first installed join their list once (the six shop-bought snacks came in v56).
  const NEW_CORE = ['snack_protein_bar', 'snack_protein_yogurt', 'snack_beef_jerky', 'snack_rtd_shake', 'snack_babybel_apple', 'snack_nuts'];
  S.coreSeen ||= RAW().filter((r) => r.core && !NEW_CORE.includes(r.id)).map((r) => r.id);
  for (const r of RAW()) if (r.core && !S.coreSeen.includes(r.id)) { S.coreSeen.push(r.id); if (S.library && !S.library.includes(r.id)) S.library.push(r.id); }
  for (const wk of Object.values(S.weeks)) wk.snacks ||= {};
  for (const w of Object.values(S.weeks)) { w.days ||= [true, true, true, true, true, true, true]; w.choices ||= {}; w.pantry ||= {}; w.fresh ||= {}; if (!w.grid) relayout(w); }
  if (!S.settings.onboarded && Object.values(S.weeks).some((w) => Object.keys(w.portions).length)) S.settings.onboarded = true;
  save();
}
function lockedCells(w) { const l = {}; (w.grid || []).forEach((d, i) => { for (const s of P.SLOTS) if (P.isOut(d[s]) || P.isTub(d[s])) l[`${i}-${s}`] = d[s]; }); return l; }
function relayout(w = W()) {
  const locked = lockedCells(w);
  let { grid, overflow } = P.autoLayout(w.portions, REC(), w.cookDay, w.days, locked);
  // The week can't hold more than its slots: trim portions to what fits rather than carrying phantom extras.
  if (overflow.length) { w.portions = P.gridCounts(grid); ({ grid, overflow } = P.autoLayout(w.portions, REC(), w.cookDay, w.days, locked)); }
  w.grid = grid; w.overflow = overflow;
  for (const k of Object.keys(w.fresh || {})) { const [d, s] = k.split('-'); if (!P.isRecipeCell(grid[+d]?.[s])) delete w.fresh[k]; }
  save();
}
function portionsFromGrid(w = W()) {
  const counts = {};
  for (const d of w.grid) for (const s of P.SLOTS) if (P.isRecipeCell(d[s])) counts[d[s]] = (counts[d[s]] || 0) + 1;
  w.portions = counts; w.overflow = []; save();
}
// [1,1,3] -> "Mon ×2, Wed"
function dayList(days) { const c = {}; for (const d of days) c[d] = (c[d] || 0) + 1; return Object.keys(c).map(Number).sort((x, y) => x - y).map((d) => c[d] > 1 ? `${P.DAYS[d]} ×${c[d]}` : P.DAYS[d]).join(', '); }
function weekLabel(k) { return k === S.thisMon ? 'This week' : k === S.nextMon ? 'Next week' : `Week of ${fmtDate(k)}`; }
function weekSwitch() {
  return `<div class="wtabs" role="tablist">${[S.thisMon, S.nextMon].map((k) => `<button role="tab" aria-selected="${S.activeWeek === k}" class="${S.activeWeek === k ? 'on' : ''}" data-action="week" data-week="${k}">${weekLabel(k)}<small>Mon ${fmtDate(k)} – Sun ${fmtDate(addDays(k, 6))}</small></button>`).join('')}</div>`;
}

// ---------- boot ----------
// For the owner's dashboard: one small note per session, saved with the account's own data (so nothing for people without an account):
// is the app on the home screen, what kind of phone, when it was last opened and how many times. No pages, taps or content.
let openNoted = false;
function noteOpen() {
  if (openNoted) return; openNoted = true;
  const ua = navigator.userAgent; const device = /iPhone|iPad|iPod/.test(ua) ? 'ios' : /Android/.test(ua) ? 'android' : 'other';
  const m = S.meta || {}; S.meta = { standalone: isStandalone() || !!m.standalone, device, opens: (m.opens || 0) + 1, lastOpen: new Date().toISOString(), version: APP_VERSION };
  save();
}
async function boot() {
  try {
    const [i, r] = await Promise.all([fetch('data/ingredients.json').then((x) => x.json()), fetch('data/recipes.json').then((x) => x.json())]);
    DATA.ingredients = i.items; DATA.recipes = r.items; DATA.priceNote = i.checkedNote; DATA.priceDate = (i.items.flatMap((x) => x.packs || []).map((p) => p.checked).sort().pop()) || '';
  } catch (e) {
    document.getElementById('view').innerHTML = `<div class="bad-box">Couldn't load the recipe data. ${esc(e.message)}</div>`;
    return;
  }
  setupWeeks();
  document.getElementById('tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { if (b.dataset.tab !== S.tab) pantryBase = null; S.tab = b.dataset.tab; save(); render({ top: true }); } });
  const v = document.getElementById('view');
  v.addEventListener('click', onAction); v.addEventListener('change', onChange); v.addEventListener('input', onInput);
  v.addEventListener('pointerdown', onDragStart);
  v.addEventListener('touchmove', (e) => { if (drag.active) e.preventDefault(); }, { passive: false });
  v.addEventListener('contextmenu', (e) => { if (e.target.closest('.cell')) e.preventDefault(); });
  render();
  if (!cloud.enabled) ensureIntro();
  onCloudChange(async () => {
    const gated = gateScreen();
    if (cloud.user && cloud.user.id !== syncedFor) { syncedFor = cloud.user.id; await syncOnSignIn(); }
    if (cloud.user && !gated) noteOpen();
    if (!gated) ensureIntro();
    if (S.tab === 'pantry') render();
  });
  if (cloud.enabled) { cloud.status = 'loading'; gateScreen(); }
  initCloud();
  // Coming back from Stripe: re-check access without a manual refresh, and keep checking for a minute after a Buy tap.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { recheckAccess(false); rollWeeks(); } });
  window.addEventListener('focus', () => recheckAccess(false));
  setInterval(() => { if (S.buyStarted && Date.now() - S.buyStarted < 90000 && !hasAccess()) recheckAccess(false); }, 4000);
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}
// A new Monday: next week becomes this week and a fresh next week appears. Runs at boot (setupWeeks) and whenever the app is brought back.
function rollWeeks() { const before = S.thisMon; setupWeeks(); if (S.thisMon !== before) { if (!S.weeks[S.activeWeek]) S.activeWeek = S.thisMon; save(); render({ top: true }); toast('New week: your plan has moved along.'); } }
let recheckBusy = false;
async function recheckAccess(manual) {
  if (!cloud.enabled || !cloud.user || hasAccess() || recheckBusy) return;
  recheckBusy = true;
  try { await refreshAccess(); } catch {} finally { recheckBusy = false; }
  if (hasAccess()) { S.buyStarted = 0; save(); gateScreen(); toast('Payment received. Welcome to Fuel.'); if (!S.settings.onboarded) ensureIntro(); else render({ top: true }); }
  else if (manual) toast('Not unlocked yet. Give it a few seconds and try again.');
}

// On any sign-in (at boot or from the gate): take the account's saved copy if it's newer, otherwise send this phone's copy up.
let syncedFor = null;
async function syncOnSignIn() {
  const remote = await pullState();
  if (remote && remote.updated_at && (!S.updatedAt || remote.updated_at > S.updatedAt)) {
    const keepTab = S.tab; Object.assign(S, remote.data, { tab: keepTab }); setupWeeks(); save(); render(); toast('Synced from your account');
    if (S.settings.onboarded && introOpen()) closeIntro();
  } else pushStateSoon(syncable);
}

function render(opts = {}) {
  const view = document.getElementById('view'); const y = view.scrollTop;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === S.tab));
  const page = ({ plan: renderPlan, cook: renderCook, shop: renderShop, recipes: renderRecipes, pantry: renderPantry, settings: renderSettings })[S.tab] || renderPlan;
  document.getElementById('view').innerHTML = `<div class="brandbar">${S.tab === 'settings' ? '' : `<button class="gear" data-action="settings" aria-label="Settings" title="Settings"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button>`}<span class="wordmark" aria-label="Fuel">FU<b>£</b>L</span></div>` + page();
  view.scrollTop = opts.top ? 0 : y;
}

// ----- Plan -----
const AVOID = {
  fish: { label: 'Fish & tuna', ids: ['tuna', 'salmon', 'prawns'] }, pork: { label: 'Pork', ids: ['pork_mince_5', 'nduja'] }, beef: { label: 'Beef', ids: ['beef_mince_5'] },
  thigh: { label: 'Chicken thighs', ids: ['chicken_thigh'] }, eggs: { label: 'Eggs', ids: ['egg'] }, dairy: { label: 'Dairy', ids: ['cheddar', 'skyr', 'cottage_cheese', 'milk', 'butter', 'parmesan'] },
  spicy: { label: 'Spicy food', ids: ['sriracha', 'chilli_powder', 'curry_paste'] }, nuts: { label: 'Peanuts', ids: ['peanut_butter'] }, coconut: { label: 'Coconut', ids: ['coconut_milk'] },
};
function avoidedIds() { return new Set((S.settings.avoid || []).flatMap((k) => AVOID[k]?.ids || [])); }
// Free-text avoids ("mushrooms", "prawn") match ingredient names and recipe names, loosely singular/plural.
function avoidTerms() { return (S.settings.avoidText || []).map((t) => t.toLowerCase().replace(/s$/, '')).filter(Boolean); }
function isAvoided(r) {
  const av = avoidedIds(); if (av.size > 0 && r.ingredients.some((x) => av.has(x.id))) return true;
  const terms = avoidTerms(); if (!terms.length) return false;
  const names = [r.name, ...r.ingredients.map((x) => ingById(x.id)?.name || x.id)].join(' | ').toLowerCase();
  return terms.some((t) => names.includes(t));
}
function avoidTextChips(action) { return `<div class="chip-row" style="margin-top:8px">${(S.settings.avoidText || []).map((t) => `<button class="chip on" data-action="${action}" data-term="${esc(t)}">${esc(t)} ×</button>`).join('')}</div>`; }
function addAvoidText(inputId) { const inp = document.getElementById(inputId); const v = (inp?.value || '').trim().toLowerCase(); if (!v) return false; S.settings.avoidText ||= []; if (!S.settings.avoidText.includes(v)) S.settings.avoidText.push(v); save(); return true; }
function removeAvoidText(term) { S.settings.avoidText = (S.settings.avoidText || []).filter((t) => t !== term); save(); }
function suggestions(n = 6) { return REC().filter((r) => inLibrary(r.id) && !r.slots.includes('snack') && !isAvoided(r) && r.cookMinutes > 0).map((r) => ({ r, score: metaFor(r).c.cost ? metaFor(r).pp / metaFor(r).c.cost : 0 })).sort((a, b) => b.score - a.score).slice(0, n).map((x) => x.r); }
const META = new Map();
function metaFor(r) { let m = META.get(r.id); if (!m) { const ing = ING(); m = { pp: P.proteinPerPortion(r, ing), kcal: P.kcalPerPortion(r, ing), c: P.costPerPortion(r, ing) }; META.set(r.id, m); } return m; }
function mealMeta(r) {
  const { pp, c } = metaFor(r);
  const cost = c.cost ? `~£${c.cost.toFixed(2)}` : '';
  const flex = '';
  const cold = r.cold ? '<span class="badge ok">cold ok</span>' : '';
  const fz = r.freezer ? '<span class="badge">freezes</span>' : (r.fridgeDays ? `<span class="badge warn">fridge ${r.fridgeDays}d</span>` : '<span class="badge">made fresh</span>');
  return `${pp}g protein${cost ? ` · ${cost} a portion` : ''} ${flex}${cold}${fz}`;
}
function snackExtra(w) {
  const active = w.days.filter(Boolean).length || 1;
  let p = 0, k = 0;
  for (const [id, n] of Object.entries(w.snacks || {})) { const r = recById(id); if (!r || !n) continue; p += metaFor(r).pp * n; k += metaFor(r).kcal * n; }
  return { protein: p / active, kcal: k / active, count: Object.values(w.snacks || {}).reduce((a, b) => a + b, 0) };
}
// Everything to buy/cook this week: grid portions plus snack counts.
function weekCounts(w, opts) { const c = P.gridCounts(opts?.live ? liveGrid(w) : w.grid, opts); for (const [id, n] of Object.entries(w.snacks || {})) if (n > 0 && recById(id)) c[id] = (c[id] || 0) + n; return c; }
// Cells to make fresh: per-cell flags plus any recipe the user has set to "always fresh".
function freshMap(w) {
  const m = { ...(w.fresh || {}) };
  (w.grid || []).forEach((d, i) => { for (const sl of P.SLOTS) { const v = d[sl]; if (P.isRecipeCell(v) && S.freshDefault?.[v]) m[`${i}-${sl}`] = true; } });
  return m;
}
function snackBar(w) {
  const items = Object.entries(w.snacks || {}).filter(([id, n]) => n > 0 && recById(id));
  const active = w.days.filter(Boolean).length || 1;
  if (!items.length) return `<div class="snackbar empty"><span>Snacks this week: none yet.</span> <span class="muted">Pick some under the meal list and they'll show here.</span></div>`;
  const total = items.reduce((a, [, n]) => a + n, 0);
  const ex = snackExtra(w);
  return `<div class="snackbar"><div class="row"><b class="grow">Snacks this week</b><span class="small muted">${total} total · about ${Math.round((total / active) * 10) / 10} a day · +${Math.round(ex.protein)}g protein</span></div><div class="chip-row" style="margin:6px 0 0">${items.map(([id, n]) => `<span class="chip meal" style="${cellStyle(id)}">${esc(shortName(recById(id)))} × ${n}</span>`).join('')}</div></div>`;
}
function planTop(w) {
  const recipes = REC(), ing = ING();
  const st = P.gridStats(liveGrid(w), recipes, ing, snackExtra(w), liveDays(w)); // gone days don't count as planned
  const gone = w.days.filter((on, i) => on && isPast(i)).length;
  const target = S.settings.proteinTarget;
  const kcalT = S.settings.kcalTarget || 0;
  const max = Math.max(target * 1.2, ...st.perDay);
  const bars = st.perDay.map((p, i) => `<div class="bar ${p < target ? 'low' : ''} ${w.days[i] && !isPast(i) ? '' : 'off'}"><b>${w.days[i] && !isPast(i) ? p : ''}</b><i style="height:${Math.round((p / max) * 100)}%"></i></div>`).join('');
  const chosen = Object.keys(w.portions).filter((id) => w.portions[id] > 0);
  const overflow = (w.overflow || []).map((o) => `<div class="warn-box">${esc(recById(o.id)?.name)}: ${o.unplaced} portion${o.unplaced > 1 ? 's' : ''} won't fit in the week. Drop the count or move something.</div>`).join('');
  const fm = freshMap(w);
  const cell = (v, i, s) => {
    if (!w.days[i]) return `<div class="cell off"></div>`;
    if (isPast(i)) { const r = v && !P.isOut(v) ? recById(P.isTub(v) ? P.tubRecipe(v) : v) : null; return `<button class="cell past" data-action="cell" data-day="${i}" data-slot="${s}"><span class="cname">${r ? esc(r.name) : P.isOut(v) ? 'Not eaten' : '—'}</span><span class="ctag">${r ? '✓ eaten · tap if not' : ''}</span></button>`; }
    if (!v) return `<button class="cell empty" data-action="cell" data-day="${i}" data-slot="${s}"><span>+</span><span class="cadd">add</span></button>`;
    if (P.isOut(v)) return `<button class="cell out" data-action="cell" data-day="${i}" data-slot="${s}"><span class="cname">Skipped</span><span class="cmeta">nothing bought</span></button>`;
    if (P.isTub(v)) { const r = recById(P.tubRecipe(v)); return `<button class="cell tubcell" style="${cellStyle(P.tubRecipe(v))}" data-action="cell" data-day="${i}" data-slot="${s}"><span class="cname">${esc(r?.name || '')}</span><span class="cmeta">${r ? metaFor(r).pp : 0}g protein</span><span class="ctag">from the freezer</span></button>`; }
    const r = recById(v); if (!r) return `<button class="cell empty" data-action="cell" data-day="${i}" data-slot="${s}"><span>+</span><span class="cadd">add</span></button>`;
    const isFresh = !!fm[`${i}-${s}`];
    const tp = P.tubPlan(r, w.grid, w.cookDay, fm);
    const cls = isFresh || tp.fresh ? 'freshcell' : tp.freezer.includes(i) ? 'frozen' : tp.late.includes(i) ? 'late' : '';
    // Only say something when it isn't the default (a fridge tub from the batch cook).
    const tag = isFresh ? 'made fresh' : cls === 'frozen' ? 'freezer · thaw night before' : cls === 'late' ? 'too old by then' : '';
    return `<button class="cell ${cls}" style="${cellStyle(v)}" data-action="cell" data-day="${i}" data-slot="${s}" draggable="false"><span class="cname">${esc(r.name)}</span><span class="cmeta">${metaFor(r).pp}g protein</span>${tag ? `<span class="ctag">${tag}</span>` : ''}</button>`;
  };
  const dayNum = (i) => { const d = new Date(S.activeWeek + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i); return d.getUTCDate(); };
  const gridHtml = `<div class="grid">
    <div class="hd corner"></div>${P.SLOTS.map((s) => `<div class="hd">${({ breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' })[s]}</div>`).join('')}
    ${P.DAYS.map((d, i) => `<div class="lbl ${w.days[i] ? '' : 'off'}"><span class="dname">${d}</span><span class="dnum">${dayNum(i)}</span>${isPast(i) ? '<span class="dayx gone" title="Already gone">✓</span>' : `<button class="dayx" data-action="dayx" data-day="${i}" title="${w.days[i] ? 'Skip this day' : 'Put this day back'}">${w.days[i] ? '×' : '+'}</button>`}</div>` + P.SLOTS.map((s) => cell(w.grid[i][s], i, s)).join('')).join('')}
  </div>`;
  const tubs = Object.entries(S.tubs).filter(([, n]) => n > 0);
  const tubHtml = tubs.length ? `<p class="small" style="margin-top:8px"><b>In the freezer:</b> ${tubs.map(([id, n]) => `${esc(recById(id)?.name)} ×${n}`).join(', ')}. Tap an empty slot to use one.</p>` : '';
  const hasGrid = chosen.length || tubs.length || Object.keys(lockedCells(w)).length;
  const tips = (S.tips && S.tips.plan) ? '' : `<div class="card tipcard"><h3>How Fuel works</h3><ol class="tips"><li><b>Tick meals</b> in the list below. They're placed into your week for you.</li><li><b>Cook</b> shows what to batch cook on ${DAY_FULL[w.cookDay]} and how to store it.</li><li><b>Shop</b> prices it all and finds the cheapest supermarket.</li><li>Portion sizes follow your calorie target. Targets, milk, budget and the thigh-for-breast switch all live under the <b>⚙ gear</b>, top right.</li></ol><button class="btn small" data-action="tip-done" data-tip="plan">Got it</button></div>`;
  const limitNote = st.filled < st.slots / 2 ? '' : weekFactor(w) >= 2.5 ? `These meals come to ${st.avgKcal.toLocaleString()} kcal a day even at the biggest portion size, under your ${kcalT.toLocaleString()} target. Add a snack or another meal to close the gap.` : weekFactor(w) <= 0.6 ? `These meals come to ${st.avgKcal.toLocaleString()} kcal a day even at the smallest portion size, over your ${kcalT.toLocaleString()} target. Drop a snack or a meal.` : '';
  const head = `<div class="card"><h3>${weekLabel(S.activeWeek)} <span class="muted small">Mon ${fmtDate(S.activeWeek)} – Sun ${fmtDate(addDays(S.activeWeek, 6))}</span></h3>` + (chosen.length
    ? `<div class="stat-grid"><div class="stat"><b>${st.filled}<span>/${st.slots}</span></b><span>${gone ? 'meals to go' : 'meals planned'}</span></div><div class="stat"><b>${st.avg}g</b><span>protein a day<br>target ${target}g</span></div><div class="stat"><b>${st.avgKcal.toLocaleString()}</b><span>kcal a day<br>target ${kcalT.toLocaleString()}</span></div></div>
    ${limitNote ? `<p class="small muted" style="margin-top:8px">${limitNote}</p>` : ''}
    <div class="bars" style="margin-top:26px">${bars}</div><div class="bars-labels">${P.DAYS.map((d) => `<div>${d}</div>`).join('')}</div>
    <p class="small muted">Protein a day. Green is on target.</p>`
    : `<p>Nothing planned yet.</p><p class="small muted">Tick the meals you want from the list below. They're placed into your week for you.</p><button class="btn block" style="margin-top:10px" data-action="scroll-pick">Choose meals</button>`) + `${tubHtml}</div>`;
  const nudge = S.activeWeek === S.thisMon && (todayIdx() >= 5 || !liveDays(w).some(Boolean)) ? `<div class="card tipcard"><h3>${todayIdx() >= 6 ? 'This week is done' : 'This week is nearly done'}</h3><p class="small">Plan next week now so Sunday's cook and shop are sorted.</p><button class="btn small" data-action="week" data-week="${S.nextMon}">Plan next week</button></div>` : '';
  return `${tips}${installCard()}${nudge}${head}
  ${hasGrid ? `<div class="card gridcard"><h3>Your week</h3><ul class="gridhelp"><li><b>Tap</b> any slot to change it, move it or skip it.</li><li><b>Move:</b> tap a meal, press <b>Move it</b>, then tap where it should go. Or press and hold a meal and drag it.</li><li><b>Skip:</b> tap a slot, then <b>Skip this meal</b>. Nothing is bought for it. The ✕ under a day skips the whole day.</li></ul>${gridHtml}
    ${snackBar(w)}
    <p class="small muted" style="margin:12px 0 4px">Which day do you batch cook?</p>
    <div class="day-pick">${P.DAYS.map((d, i) => `<button data-action="cookday" data-day="${i}" class="${w.cookDay === i ? 'on' : ''}">${d}</button>`).join('')}</div>
    <div class="row" style="margin-top:10px"><button class="btn ghost small" data-action="relayout">Re-arrange the week</button><button class="btn ghost small" data-action="clear-week">Clear week</button></div></div>` : ''}
  ${overflow}${lateWarnings(w)}`;
}
function pickRow(r, w, free) {
  const n = w.portions[r.id] || 0;
  const full = P.roomFor(r, free) <= 0;
  return `<div class="recipe-row pick ${r.slots[0] === 'breakfast' ? 'breakfast' : 'mains'} ${n ? 'on' : ''} ${full && !n ? 'full' : ''}" data-row="${r.id}"><input type="checkbox" class="tick" data-pick="${r.id}" ${n ? 'checked' : ''} ${full && !n ? 'disabled' : ''} aria-label="Include ${esc(r.name)}"><div class="grow"><div class="name">${esc(r.name)}</div><div class="meta">${mealMeta(r)}${full && !n ? ' <span class="badge">week full</span>' : ''}</div></div>
      ${n ? `<div class="stepper"><button data-action="dec" data-id="${r.id}">−</button><b>${n}</b><button data-action="inc" data-id="${r.id}" ${full ? 'disabled' : ''}>+</button></div>` : ''}</div>`;
}
function snackRow(r, w) { const n = w.snacks[r.id] || 0; return `<div class="recipe-row pick snack ${n ? 'on' : ''}" data-row="${r.id}"><input type="checkbox" class="tick" data-snack-pick="${r.id}" ${n ? 'checked' : ''} aria-label="Include ${esc(r.name)}"><div class="grow"><div class="name">${esc(r.name)}</div><div class="meta">${mealMeta(r)}</div></div>${n ? `<div class="stepper"><button data-action="sdec" data-id="${r.id}">−</button><b>${n}</b><button data-action="sinc" data-id="${r.id}">+</button></div>` : ''}</div>`; }
function renderPlan() {
  const w = W(); const recipes = REC();
  const q = (S.planSearch || '').toLowerCase();
  const free = P.freeSlots(w.grid, w.days);
  const mine = recipes.filter((r) => inLibrary(r.id) && !r.slots.includes('snack'));
  const visible = mine.filter((r) => !isAvoided(r));
  const hidden = mine.length - visible.length;
  const snacks = recipes.filter((r) => r.slots.includes('snack') && inLibrary(r.id) && !isAvoided(r) && (!q || r.name.toLowerCase().includes(q)));
  const snackHtml = snacks.length && (!S.planFilter || S.planFilter === 'all' || S.planFilter === 'snack') ? `<h2 class="pickgroup snack">Snacks <span>${snacks.length}</span></h2><p class="small muted" style="margin:0 0 8px">Tick one and set how many this week. Shop-bought ones are priced too.</p><div class="card pickcard snack">${snacks.map((r) => snackRow(r, w)).join('')}</div>` : '';
  const filt = S.planFilter || 'all';
  const group = (slot, title) => {
    if (filt !== 'all' && filt !== slot) return '';
    const list = visible.filter((r) => (slot === 'breakfast' ? r.slots[0] === 'breakfast' : r.slots[0] !== 'breakfast') && (!q || r.name.toLowerCase().includes(q)));
    return list.length ? `<h2 class="pickgroup ${slot}">${title} <span>${list.length}</span></h2><div class="card pickcard ${slot}">${list.map((r) => pickRow(r, w, free)).join('')}</div>` : '';
  };
  const nBreak = visible.filter((r) => r.slots[0] === 'breakfast').length, nMain = visible.length - nBreak, nSnack = recipes.filter((r) => r.slots.includes('snack') && inLibrary(r.id) && !isAvoided(r)).length;
  const filterChips = `<div class="chip-row pickfilters">${[['all', 'All'], ['breakfast', `Breakfasts · ${nBreak}`], ['mains', `Mains · ${nMain}`], ['snack', `Snacks · ${nSnack}`]].map(([k, l]) => `<button class="chip ${filt === k ? 'on' : ''}" data-action="plan-filter" data-filter="${k}">${l}</button>`).join('')}</div>`;
  const nothing = q && !visible.some((r) => r.name.toLowerCase().includes(q)) && !snacks.length ? `<p class="muted">Nothing called "${esc(S.planSearch)}" in your recipes. Try Recipes → Find more meal ideas.</p>` : '';
  const sug = !Object.keys(w.portions).length ? suggestions(6) : [];
  const upIds = Object.keys(w.useUp || {});
  const usesUp = (r) => upIds.filter((u) => r.ingredients.some((x) => x.id === u || (ingById(x.id)?.choices || []).includes(u)));
  const upList = upIds.length ? recipes.filter((r) => !r.slots.includes('snack') && !isAvoided(r)).map((r) => ({ r, u: usesUp(r) })).filter((x) => x.u.length).sort((a, b) => b.u.length - a.u.length || (metaFor(b.r).pp / (metaFor(b.r).c.cost || 1)) - (metaFor(a.r).pp / (metaFor(a.r).c.cost || 1))).slice(0, 8) : [];
  const upHtml = upIds.length ? `<div class="card"><h3>Use up what you've got</h3><p class="small muted">You marked ${upIds.map((u) => esc((ingById(u)?.name || u).toLowerCase())).join(', ')} to use up (Pantry). ${upList.length ? 'Tap a meal to add it to the week.' : 'No recipe uses those yet.'}</p>${upList.length ? `<div class="chip-row">${upList.map(({ r, u }) => `<button class="chip ${w.portions[r.id] ? 'on' : ''}" data-action="quick-pick" data-id="${r.id}">${w.portions[r.id] ? '✓' : '+'} ${esc(shortName(r))} <span class="muted">· ${u.map((x) => esc((ingById(x)?.name || x).toLowerCase().split(' ')[0])).join(', ')}</span></button>`).join('')}</div>` : ''}</div>` : '';
  const sugHtml = sug.length ? `<div class="card"><h3>Quick picks</h3><p class="small muted">The most protein for your money. Tap one to add it to the week.</p><div class="chip-row">${sug.map((r) => `<button class="chip" data-action="quick-pick" data-id="${r.id}">+ ${esc(shortName(r))} · ${metaFor(r).pp}g protein · £${metaFor(r).c.cost.toFixed(2)}</button>`).join('')}</div></div>` : '';
  return `<h1>Plan</h1>${weekSwitch()}<div id="plan-top">${planTop(w)}</div>
  <div class="card pickhead" id="pick-head"><h3>Choose your meals</h3><p class="small">Tick a meal to put it in the week. − and + set how many portions.${Object.keys(w.portions).length ? ` <b>${Object.values(w.portions).reduce((a, b) => a + b, 0)} portions picked.</b>` : ''}</p>
  <input class="search" placeholder="Search your meals" value="${esc(S.planSearch || '')}" data-plan-search>${filterChips}</div>
  ${upHtml}${sugHtml}
  <div id="plan-pick">${nothing}${filt === 'snack' ? snackHtml : ''}${group('breakfast', 'Breakfasts')}${group('mains', 'Mains (lunch or dinner)')}
  ${filt === 'snack' ? '' : snackHtml}
  ${hidden ? `<p class="small muted">${hidden} recipe${hidden > 1 ? 's' : ''} hidden because of what you don't eat (see Settings).</p>` : ''}
  <div class="card endcard"><b>That's everything in your list.</b><p class="small muted" style="margin:4px 0 10px">${REC().filter((r) => !inLibrary(r.id) && !r.slots.includes('snack')).length} more recipes are waiting under meal ideas.</p><button class="btn small" data-action="go-ideas">Find more meal ideas</button></div></div>`;
}
// Just the inside of #plan-pick, for the search box to refresh without redrawing the page.
function planPickHtml() { const tmp = document.createElement('div'); tmp.innerHTML = renderPlan(); return tmp.querySelector('#plan-pick').innerHTML; }
// Re-draw only what changed on the Plan tab: the top card/grid and the state of each pick row.
function refreshPlan() {
  const top = document.getElementById('plan-top'); const w = W();
  if (!top || S.tab !== 'plan') { render(); return; }
  top.innerHTML = planTop(w);
  const free = P.freeSlots(w.grid, w.days);
  document.querySelectorAll('.recipe-row.pick').forEach((rowEl) => { const r = recById(rowEl.dataset.row); if (!r) return; const tmp = document.createElement('div'); tmp.innerHTML = r.slots.includes('snack') ? snackRow(r, w) : pickRow(r, w, free); const fresh = tmp.firstElementChild; if (fresh.outerHTML !== rowEl.outerHTML) rowEl.replaceWith(fresh); });
}
function shortName(r) { if (!r) return ''; if (r.short) return r.short; const w = r.name.split(' '); let out = w[0]; if (w[1] && (out + ' ' + w[1]).length <= 11) out += ' ' + w[1]; return out; }
function lateWarnings(w) {
  const out = [];
  for (const [rid, n] of Object.entries(w.portions)) {
    const r = recById(rid); if (!r || !n || r.cookMinutes === 0) continue;
    const tp = P.tubPlan(r, w.grid, w.cookDay, freshMap(w));
    if (tp.late.length) out.push(`<div class="warn-box"><b>${esc(r.name)}</b> keeps ${r.fridgeDays} day${r.fridgeDays === 1 ? '' : 's'} and can't be frozen, so the ${tp.late.map((d) => P.DAYS[d]).join(', ')} portion${tp.late.length > 1 ? 's need' : ' needs'} a second cook midweek. Move ${tp.late.length > 1 ? 'them' : 'it'} earlier or swap for a freezer recipe.</div>`);
  }
  return out.join('');
}
function defaultPortions(r) { return r.slots[0] === 'breakfast' ? 4 : 3; }

// ----- Cook -----
function renderCook() {
  const w = W(); const recipes = REC(), ing = ING();
  const all = weekCounts(w);
  const fm = freshMap(w);
  const counts = weekCounts(w, { fresh: fm, skipFresh: true });
  const rs = P.runSheet(counts, recipes);
  const fresh = Object.entries(all).filter(([rid, n]) => n > 0 && recById(rid)?.cookMinutes === 0).map(([rid, n]) => ({ recipe: recById(rid), portions: n }));
  for (const c of P.freshCells(w.grid, fm)) { const r = recById(c.id); if (r) fresh.push({ recipe: r, portions: 1, day: P.DAYS[c.day] }); }
  const head = `<h1>Cook</h1>${weekSwitch()}${tipCard('cook')}`;
  if (!rs.list.length && !fresh.length) return `${head}<div class="card"><p>Nothing to cook for ${weekLabel(S.activeWeek).toLowerCase()} yet.</p><p class="small muted">Tick meals on the Plan tab and the cook list fills itself in.</p></div>`;
  const cookDay = P.DAYS[w.cookDay];
  const dayFull = DAY_FULL[w.cookDay]; const cookOn = fmtDate(cookDate(w, S.activeWeek));
  const sheet = rs.list.map((x) => `<li><b>${esc(x.recipe.name)}</b><span class="muted small">${x.portions} portion${x.portions > 1 ? 's' : ''} · ${x.recipe.cookMinutes} min · ${x.recipe.equipment.join(', ')}</span></li>`).join('');
  const grouped = {};
  for (const x of fresh) { const g = (grouped[x.recipe.id] ||= { recipe: x.recipe, portions: 0, days: [] }); g.portions += x.portions; if (x.day && !g.days.includes(x.day)) g.days.push(x.day); }
  const freshList = Object.values(grouped).map((g) => `<li><div class="row"><span class="grow"><b>${esc(g.recipe.name)}</b><span class="muted small">${g.portions} portion${g.portions > 1 ? 's' : ''} · ${g.days.length ? `on ${g.days.join(', ')}` : `${g.recipe.slots[0]}, a few minutes each time`}${g.recipe.cookMinutes ? ` · ${g.recipe.cookMinutes} min` : ''}</span></span>${g.recipe.cookMinutes > 0 && S.freshDefault[g.recipe.id] ? `<button class="btn ghost small" data-action="fresh-default" data-id="${g.recipe.id}" data-on="0">Batch it instead</button>` : ''}</div>
    ${g.recipe.cookMinutes > 0 ? `<p class="small muted" style="margin:4px 0 0">Each portion: ${P.scaleIngredients(g.recipe, 1, ing).map((i) => `${esc(i.name)} ${P.fmtQty(i.qty, i.unit)}`).join(', ')}.</p>` : ''}</li>`).join('');
  const usesRice = rs.list.some(({ recipe: r }) => (r.ingredients || []).some((x) => /rice/.test(x.id || '')));
  const cards = rs.list.map(({ recipe: r, portions: n }) => {
    const scaled = P.scaleIngredients(r, n, ing);
    const tp = P.tubPlan(r, w.grid, w.cookDay, fm);
    const reheat = { none: 'Eat it cold', microwave: 'Microwave 2–3 min, stir halfway', hob: 'Warm it through in a pan', 'air-fryer': 'Air-fryer 6 min at 180°C' }[r.reheat] || '';
    const store = [
      tp.fridge.length ? `<li><b>Fridge</b> ${tp.fridge.length} tub${tp.fridge.length > 1 ? 's' : ''} for ${dayList(tp.fridge)}. Eat by ${tp.eatBy}.</li>` : '',
      tp.freezer.length ? `<li><b>Freezer</b> ${tp.freezer.length} tub${tp.freezer.length > 1 ? 's' : ''} for ${dayList(tp.freezer)}. Move each one to the fridge the night before.</li>` : '',
      reheat ? `<li><b>Reheat</b> ${reheat}.</li>` : '',
    ].join('');
    return `<div class="card"><h3>${esc(r.name)}</h3>
      <p class="small muted" style="margin:0 0 10px">${n} portion${n > 1 ? 's' : ''} · ${r.cookMinutes} min · ${r.equipment.join(', ')} · ${P.proteinPerPortion(r, ing)}g protein a portion</p>
      <div class="seg"><button class="on">Batch on ${cookDay}</button><button data-action="fresh-default" data-id="${r.id}" data-on="1">Make fresh each time</button></div>
      <h4 class="sub">Ingredients for ${n}</h4>
      <div class="ing-list">${scaled.map((s) => `<span>${esc(s.name)}</span><b>${P.fmtQty(s.qty, s.unit)}</b>`).join('')}</div>
      <h4 class="sub">Method</h4>
      <ol class="steps">${r.method.map((m) => `<li>${esc(m)}</li>`).join('')}</ol>
      ${r.notes ? `<p class="small muted">${esc(r.notes)}</p>` : ''}
      <h4 class="sub">Then box it up · ${tp.total} tub${tp.total === 1 ? '' : 's'}</h4>
      <ul class="store">${store}</ul>
      ${tp.late.length ? `<div class="warn-box">${dayList(tp.late)}: past its fridge life by then and it doesn't freeze. Cook ${tp.late.length > 1 ? 'those' : 'that one'} fresh, or move ${tp.late.length > 1 ? 'them' : 'it'} earlier on the Plan tab.</div>` : ''}
      ${tp.total < n ? `<p class="small muted">${n - tp.total} portion${n - tp.total > 1 ? 's' : ''} not in the week grid.</p>` : ''}
    </div>`;
  }).join('');
  return `${head}
  <div class="card"><h3>Batch cook on ${dayFull} ${cookOn}</h3><p class="small muted" style="margin:0 0 8px">${w.cookDay === 6 ? 'The Sunday before the week starts. ' : ''}About ${rs.minutes} minutes. Start the longest one first and run the others alongside.</p><ol class="steps cooklist">${sheet}</ol>
  ${fresh.length ? `<h4 class="sub">Made fresh on the day</h4><ul class="clean">${freshList}</ul>` : ''}
  ${usesRice ? `<p class="small muted" style="margin-top:10px">Rice: freeze cooked rice the same day unless it's eaten within 24 hours.</p>` : ''}</div>
  ${cards}`;
}
// ----- Shop -----
// What the week needs to buy, after the pantry: shared by the Shop tab and the settings preview.
// Which options are picked for a choice ingredient this week (at least one, defaults to the first).
function chosenFor(w, it) {
  let v = w.choices && w.choices[it.id];
  if (typeof v === 'string') v = [v];
  v = (v || []).filter((c) => it.choices.includes(c));
  return v.length ? v : [it.choices[0]];
}
function shopNeeds(w, recipes) {
  const counts = weekCounts(w, { live: true }); // days already eaten don't need buying
  const base = resolveFor(w);
  const rawNeeds = P.aggregateNeeds(counts, recipes);
  const needsAll = P.aggregateNeeds(counts, recipes, base);
  const genericOf = {}; // resolved id -> generic id (for pantry keys and "used by")
  for (const id of Object.keys(needsAll)) {
    const it = ingById(id);
    if (!it?.choices?.length) continue;
    const picks = chosenFor(w, it); const qty = needsAll[id]; delete needsAll[id];
    for (const c of picks) { needsAll[c] = (needsAll[c] || 0) + qty / picks.length; genericOf[c] = id; }
  }
  const resolve = (id) => { const r = base(id); const it = ingById(r); return it?.choices?.length ? chosenFor(w, it) : [r]; };
  for (const e of extras(w)) { needsAll[e.id] = (needsAll[e.id] || 0) + e.qty; rawNeeds[e.id] = (rawNeeds[e.id] || 0) + e.qty; } // standing "also buy" items, every week
  const pantryFor = {}; for (const id of Object.keys(needsAll)) { const g = genericOf[id]; pantryFor[id] = w.pantry[id] !== undefined ? w.pantry[id] : (g && w.pantry[g] !== undefined ? w.pantry[g] : undefined); }
  return { counts, resolve, rawNeeds, needsAll, pantryFor, needs: P.netPantry(needsAll, pantryFor) };
}
// Things bought every week that aren't part of any meal (milk for the coffee, an avocado for the eggs): {id, qty} in the ingredient's unit.
function extras(w = W()) {
  const always = (S.extras || []).map((e) => ({ ...e, scope: 'always' })), week = ((w && w.extras) || []).map((e) => ({ ...e, scope: 'week' }));
  return [...always, ...week].filter((e) => ingById(e.id) && e.qty > 0);
}
function extraList(scope, w = W()) { if (scope === 'week') { w.extras ||= []; return w.extras; } S.extras ||= []; return S.extras; }
function askChoice(title, options) {
  return new Promise((resolve) => {
    openSheet(`<h3>${esc(title)}</h3><div class="stack" style="margin-top:12px">${options.map((o) => `<button class="btn block ${o.ghost ? 'ghost' : ''}" data-dlg="${esc(o.value)}"><span>${esc(o.label)}</span>${o.sub ? `<span class="sub">${esc(o.sub)}</span>` : ''}</button>`).join('')}<button class="btn ghost block" data-dlg="">Cancel</button></div>`);
    document.getElementById('sheet-inner').onclick = (e) => { const b = e.target.closest('[data-dlg]'); if (!b) return; document.getElementById('sheet-inner').onclick = null; closeSheet(); resolve(b.dataset.dlg || null); };
  });
}
const AISLES = [['protein', 'Meat, fish & eggs'], ['dairy', 'Dairy'], ['veg', 'Veg & herbs'], ['fruit', 'Fruit'], ['carb', 'Bread, rice & pasta'], ['tin', 'Tins & jars'], ['sauce', 'Sauces'], ['spice', 'Spices'], ['cupboard', 'Cupboard'], ['frozen', 'Frozen']];
function aisleOf(it) { return it?.store === 'freezer' && !['protein'].includes(it.category) ? 'frozen' : (AISLES.some(([k]) => k === it?.category) ? it.category : 'cupboard'); }
function extrasSheet(q = '') {
  const have = new Set(extras().map((e) => e.id)); const s = q.trim().toLowerCase();
  const hits = s ? ING().filter((it) => !it.hidden && !(it.choices || []).length && !have.has(it.id) && (it.name.toLowerCase().includes(s) || String(it.aka || '').toLowerCase().includes(s))).slice(0, 12) : [];
  return `<h3>Add something to the shop</h3><p class="small muted">Type what you want. Anything from the 290 priced ingredients is priced in with the rest of the list.</p>
  <label class="field" style="margin:8px 0 0">What do you want to add?<input class="search" style="width:100%;font-size:18px;margin:6px 0 0" placeholder="e.g. milk, avocado, crisps" value="${esc(q)}" data-extra-search autofocus autocapitalize="none"></label>
  <div id="extra-list" style="margin-top:8px">${hits.map((it) => `<button class="line" style="width:100%;text-align:left;background:none;border:0;border-bottom:1px solid #f3ecdc" data-action="extra-pick" data-id="${it.id}"><span class="grow"><span class="name">${esc(it.name)}</span><span class="sub">${(it.packs || []).length ? 'priced' : 'no price on file'} · sold by ${it.unit === 'each' ? 'the piece' : it.unit}</span></span></button>`).join('')}${s.length >= 2 ? `<button class="btn ghost block" style="margin-top:10px" data-action="extra-custom" data-name="${esc(q.trim())}">${hits.length ? 'Not there? ' : 'Not in the list. '}Add “${esc(q.trim())}” as my own item</button>` : ''}</div>
  <button class="btn ghost block" data-action="close-sheet" style="margin-top:10px">Done</button>`;
}
async function askExtraQty(it, current) {
  const unitWord = it.unit === 'each' ? 'how many' : `how much (${it.unit})`;
  const v = await askText(`${it.name}: ${unitWord} each week?`, it.unit === 'each' ? 'e.g. 2' : it.unit === 'ml' ? 'e.g. 2000' : 'e.g. 500');
  if (v === null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  if (!(n > 0)) { toast('Type a number'); return null; }
  return n;
}
function renderShop() {
  const w = W(); const ing = ING(), recipes = REC();
  const { counts, resolve, rawNeeds, needsAll, pantryFor, needs } = shopNeeds(w, recipes);
  const usedBy = {};
  for (const [rid, n] of Object.entries(counts)) { const r = recById(rid); if (!r) continue; for (const x of r.ingredients) for (const id of resolve(x.id)) (usedBy[id] ||= []).push(`${r.short || r.name} ×${n}`); }
  for (const e of extras(w)) (usedBy[e.id] ||= []).push(e.scope === 'week' ? 'extra this week' : 'extra every week');
  const choiceHtml = Object.keys(rawNeeds).map(ingById).filter((it) => it?.choices?.length).map((it) => { const picks = chosenFor(w, it); return `<div class="small muted" style="margin-bottom:6px"><b>${esc(it.name)}</b> · pick one or more; the amount is split between them</div><div class="chip-row">${it.choices.map((c) => `<button class="chip ${picks.includes(c) ? 'on' : ''}" data-action="choice-toggle" data-choice="${it.id}" data-val="${c}">${esc((ingById(c)?.name || c).replace(/^Frozen /, ''))}</button>`).join('')}</div>`; }).join('');
  const fullWeek = P.compareShops(needsAll, ing)[0];
  const head = `<h1>Shop</h1>${weekSwitch()}${tipCard('shop')}`;
  if (!Object.keys(needsAll).length) return `${head}<div class="card"><p>Nothing picked for ${weekLabel(S.activeWeek).toLowerCase()} yet. Tick meals on the Plan tab.</p></div><h2>Also buy every week</h2><div class="card"><p class="small muted">Things that aren't part of a meal but you always get. They're priced into the list.</p><button class="btn ghost small" data-action="extra-add" style="margin-top:4px">+ Add something</button></div>`;
  const ranked = P.compareShops(needs, ing).map((b) => {
    const notSold = b.missing.filter((m) => (ingById(m.id)?.unavailable || []).includes(b.shop));
    const unpriced = b.missing.filter((m) => !(ingById(m.id)?.unavailable || []).includes(b.shop));
    return { ...b, notSold, unpriced };
  }).sort((a, b) => (a.unpriced.length - b.unpriced.length) || (a.total - b.total));
  const byShop = Object.fromEntries(ranked.map((b) => [b.shop, b]));
  const cheapestElsewhere = (id, not) => { let m = null; for (const s of P.SHOPS) { if (s === not) continue; const l = byShop[s]?.lines.find((x) => x.id === id); if (l && (m === null || l.cost < m)) m = l.cost; } return m || 0; };
  for (const b of ranked) { b.elsewhere = P.round2(b.notSold.reduce((t, m) => t + cheapestElsewhere(m.id, b.shop), 0)); b.comparable = P.round2(b.total + b.elsewhere); }
  ranked.sort((a, b) => (a.unpriced.length - b.unpriced.length) || (a.comparable - b.comparable));
  const best = ranked[0];
  const isStock = (id) => !!ingById(id)?.staple;
  for (const b of ranked) { b.stock = P.round2(b.lines.filter((l) => isStock(l.id)).reduce((t, l) => t + l.cost, 0) + b.notSold.filter((m) => isStock(m.id)).reduce((t, m) => t + cheapestElsewhere(m.id, b.shop), 0)); b.weekly = P.round2(b.comparable - b.stock); b.elsewhereWeek = P.round2(b.notSold.filter((m) => !isStock(m.id)).reduce((t, m) => t + cheapestElsewhere(m.id, b.shop), 0)); }
  ranked.sort((a, b) => (a.unpriced.length - b.unpriced.length) || (a.comparable - b.comparable)); // everything you'd buy this week, stock-ups included
  const bestWeek = ranked[0];
  const chosen = byShop[w.shop] ? byShop[w.shop] : bestWeek;
  const split = P.cheapestSplit(needs, ing);
  const budget = S.settings.budget;
  // The budget is a WEEKLY food budget, so it is judged on the week's food. Stock-ups (oil, spices, rice, whey) are a one-off that lasts weeks:
  // they stay in the big total, but they don't make a first shop read as "over budget".
  const pct = Math.min(100, Math.round((chosen.weekly / budget) * 100));
  const oldest = ranked.map((b) => b.oldest).filter(Boolean).sort()[0];
  // shop picker: one chip per shop, total on it
  const chips = ranked.map((b) => {
    const dead = b.unpriced.length === b.missing.length && b.lines.length === 0;
    return `<button class="shopchip ${b === chosen ? 'on' : ''} ${dead ? 'dead' : ''}" data-action="pick-shop" data-shop="${b.shop}"><span>${P.SHOP_NAMES[b.shop]}</span><b>${b.lines.length ? P.gbp(b.comparable) : '—'}</b>${b === bestWeek && b.lines.length ? '<i>cheapest</i>' : b.unpriced.length ? `<i>${b.unpriced.length} unpriced</i>` : b.elsewhere ? `<i>incl. ${P.gbp(b.elsewhere)} elsewhere</i>` : '<i>&nbsp;</i>'}</button>`;
  }).join('');
  // the list for the chosen shop
  const online = { tesco: (q) => `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(q)}`, asda: (q) => `https://www.asda.com/groceries/search/${encodeURIComponent(q)}`, sainsburys: (q) => `https://www.sainsburys.co.uk/gol-ui/SearchResults/${encodeURIComponent(q)}` };
  const cheapestFor = (id) => { let m = null; for (const s of P.SHOPS) { const l = byShop[s]?.lines.find((x) => x.id === id); if (l && (m === null || l.cost < m.cost)) m = { cost: l.cost, shop: s }; } return m; };
  const lineHtml = (l) => {
    const k = `${chosen.shop}:${l.id}`; const done = !!w.ticks[k];
    const cheap = cheapestFor(l.id); const elsewhere = cheap && cheap.shop !== chosen.shop && l.cost - cheap.cost >= 0.3 ? `<span class="sub alt">${P.gbp(cheap.cost)} at ${P.SHOP_NAMES[cheap.shop]}</span>` : '';
    const link = online[chosen.shop] ? `<a class="find" href="${online[chosen.shop](l.pack.name)}" target="_blank" rel="noopener" aria-label="Find at ${P.SHOP_NAMES[chosen.shop]}">↗</a>` : '';
    const shelfName = l.pack.name.replace(/\s*\((?!\d+\s?(g|ml|kg|l)\b)[^)]*\)/g, '').trim(); // drop notes like "(Aldi has no natural skyr)" but keep sizes like "(580g)"
    return `<label class="line ${done ? 'done' : ''}"><input type="checkbox" data-tick="${k}" ${done ? 'checked' : ''}><span class="grow"><span class="name">${l.n > 1 ? `<b class="n">${l.n} ×</b> ` : ''}${esc(shelfName)}</span><span class="sub">${esc((usedBy[l.id] || []).join(', '))}</span>${elsewhere}</span><span class="cost">${P.gbp(l.cost)}</span>${link}</label>`;
  };
  // grouped by aisle so the list reads top to bottom as you walk the shop; ticked lines sink to the end of their aisle
  const aisleHtml = (ls) => { const groups = {}; for (const l of ls) (groups[aisleOf(ingById(l.id))] ||= []).push(l); return AISLES.filter(([k]) => groups[k]).map(([k, label]) => { const g = groups[k]; const sorted = [...g].sort((a, b) => (w.ticks[`${chosen.shop}:${a.id}`] ? 1 : 0) - (w.ticks[`${chosen.shop}:${b.id}`] ? 1 : 0)); return `<h4 class="aisle">${label}<span>${P.gbp(P.round2(g.reduce((t, l) => t + l.cost, 0)))}</span></h4>${sorted.map(lineHtml).join('')}`; }).join(''); };
  const weekLines = chosen.lines.filter((l) => !isStock(l.id)), stockLines = chosen.lines.filter((l) => isStock(l.id));
  const lines = aisleHtml(weekLines);
  const stockTotal = P.round2(stockLines.reduce((t, l) => t + l.cost, 0));
  const stockHtml = stockLines.length ? `<h2>Stock up <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:600">${stockLines.filter((l) => w.ticks[`${chosen.shop}:${l.id}`]).length}/${stockLines.length} ticked · ${P.gbp(stockTotal)}</span></h2><div class="card list"><p class="small muted" style="margin:4px 0 2px">Bought this week and counted in the total, but they'll last you weeks. Next week they'll be in your Pantry already.${chosen.elsewhere - chosen.elsewhereWeek > 0.004 ? ` About ${P.gbp(P.round2(chosen.elsewhere - chosen.elsewhereWeek))} of this is for ${chosen.notSold.filter((m) => isStock(m.id)).map((m) => m.name.toLowerCase()).join(', ')}, which ${P.SHOP_NAMES[chosen.shop]} doesn't sell.` : ''}</p>${aisleHtml(stockLines)}</div>` : '';
  const aisleGroups = {}; for (const l of weekLines) (aisleGroups[aisleOf(ingById(l.id))] ||= []).push(l);
  const breakdown = AISLES.filter(([k]) => aisleGroups[k]).map(([k, label]) => `${label.split(',')[0].split(' &')[0]} ${P.gbp(P.round2(aisleGroups[k].reduce((t, l) => t + l.cost, 0)))}`).join(' · ');
  const extraRows = extras(w).map((e) => { const it = ingById(e.id); const l = chosen.lines.find((x) => x.id === e.id); return `<div class="line"><span class="grow"><span class="name">${esc(it.name)}</span><span class="sub">${e.scope === 'week' ? 'this week only' : 'every week'}${l ? ` · ${esc(l.pack.name.replace(/\s*\([^)]*\)/g, ''))}` : ' · no price at this shop'}</span></span><button class="chip" data-action="extra-qty" data-id="${e.id}" data-scope="${e.scope}">${P.fmtQty(e.qty, it.unit)}${it.unit === 'each' ? (e.qty === 1 ? ' piece' : ' pieces') : ''}</button><span class="cost">${l ? P.gbp(l.cost) : '—'}</span><button class="btn ghost small" data-action="extra-remove" data-id="${e.id}" data-scope="${e.scope}" aria-label="Remove">×</button></div>`; }).join('');
  const extrasCard = `<h2>Extras</h2><div class="card">${extraRows || '<p class="small muted">Nothing extra yet. Anything you add here is priced into the list and the total above.</p>'}<button class="btn block big" data-action="extra-add" style="margin-top:${extraRows ? 12 : 6}px">+ Add something to this shop</button></div>`;
  const complete = chosen.lines.length > 0 && chosen.lines.every((l) => w.ticks[`${chosen.shop}:${l.id}`]);
  const doneBox = complete ? `<div class="done-box"><b>Shop done ✓</b> ${P.gbp(chosen.total)} at ${P.SHOP_NAMES[chosen.shop]}${w.done?.date ? ` on ${fmtDate(w.done.date)}` : ''}. Logged under Settings → Money.</div>` : '';
  const notSold = chosen.notSold.filter((m) => !isStock(m.id)).map((m) => esc(m.name)); const unpriced = chosen.unpriced.map((m) => esc(m.name));
  const missing = (notSold.length ? `<div class="warn-box">Not sold at ${P.SHOP_NAMES[chosen.shop]}: ${notSold.join(', ')} (about ${P.gbp(chosen.elsewhereWeek)} elsewhere; counted in the total above).</div>` : '') + (unpriced.length ? `<div class="warn-box">No ${P.SHOP_NAMES[chosen.shop]} price on file for: ${unpriced.join(', ')}.${chosen.shop === 'lidl' ? ' Lidl publishes no prices online.' : ''}</div>` : '');
  const done = chosen.lines.filter((l) => !isStock(l.id) && w.ticks[`${chosen.shop}:${l.id}`]).length; const weekCount = chosen.lines.filter((l) => !isStock(l.id)).length;
  // item-by-item, folded away
  const ids = Object.keys(needs).filter((id) => ingById(id));
  const SHORT = { aldi: 'Aldi', tesco: 'Tesco', asda: 'ASDA', sainsburys: 'Sains' };
  const cmpRows = ids.map((id) => { const it = ingById(id); const min = cheapestFor(id); return `<div class="cmp-row"><div class="cmp-name">${esc(it.name)}<span class="sub">${P.fmtQty(P.round1(needs[id]), it.unit)}</span></div><div class="cmp-shops">${P.SHOPS.map((s) => { const l = byShop[s]?.lines.find((x) => x.id === id); return `<span class="cmp-cell ${l && min && s === min.shop ? 'min' : ''} ${s === chosen.shop ? 'here' : ''}"><i>${SHORT[s]}</i><b>${l ? P.gbp(l.cost) : '—'}</b></span>`; }).join('')}</div></div>`; }).join('');
  const items = `<details class="fold"><summary><b>Compare item by item</b><span class="muted small">every line at every shop</span></summary><div class="cmp">${cmpRows}</div></details>`;
  // Why this much, and where the money could be saved: dearest meals, dearest lines, cheaper-elsewhere lines, the two-shop split, stock-ups.
  const mealCosts = Object.entries(counts).map(([rid, k]) => { const r = recById(rid); return r ? { r, n: k, cost: P.round2((metaFor(r).c.cost || 0) * k), pp: metaFor(r).c.cost || 0 } : null; }).filter(Boolean).sort((a, b) => b.cost - a.cost);
  const dearLines = [...chosen.lines].sort((a, b) => b.cost - a.cost).slice(0, 5);
  const cheaperElsewhere = chosen.lines.map((l) => { const c = cheapestFor(l.id); return c && c.shop !== chosen.shop && l.cost - c.cost >= 0.3 ? { l, c, save: P.round2(l.cost - c.cost) } : null; }).filter(Boolean).sort((a, b) => b.save - a.save);
  const savePot = P.round2(cheaperElsewhere.reduce((t, x) => t + x.save, 0));
  const swaps = mealCosts.filter((m) => m.pp >= 2).slice(0, 3).map((m) => { const alt = suggestions(12).find((r) => r.id !== m.r.id && !counts[r.id] && metaFor(r).c.cost > 0 && metaFor(r).c.cost < m.pp * 0.7 && r.slots.some((sl) => m.r.slots.includes(sl))); const toCost = alt ? metaFor(alt).c.cost : 0; return alt && toCost > 0 ? { from: m.r, fromPp: m.pp, to: alt, toCost, toPp: metaFor(alt).pp, save: P.round2((m.pp - toCost) * m.n) } : null; }).filter(Boolean);
  const whyHtml = chosen.lines.length ? `<details class="fold"><summary><b>Why ${P.gbp(chosen.comparable)}? Where can I save?</b><span class="muted small">what costs the most, and the cheaper options</span></summary>
    <h4 class="sub">Dearest meals this week</h4>${mealCosts.slice(0, 5).map((m) => `<div class="line"><span class="grow"><span class="name">${esc(m.r.name)}</span><span class="sub">${m.n} portion${m.n > 1 ? 's' : ''} · ${P.gbp(m.pp)} each</span></span><span class="cost">${P.gbp(m.cost)}</span></div>`).join('')}
    <h4 class="sub">Dearest items on the list</h4>${dearLines.map((l) => `<div class="line"><span class="grow"><span class="name">${l.n > 1 ? `${l.n} × ` : ''}${esc(l.pack.name.replace(/\s*\([^)]*\)/g, ''))}</span><span class="sub">${esc((usedBy[l.id] || []).join(', '))}</span></span><span class="cost">${P.gbp(l.cost)}</span></div>`).join('')}
    <h4 class="sub">Ways to save</h4>
    ${swaps.length ? swaps.map((x) => `<div class="line"><span class="grow"><span class="name">Swap ${esc(x.from.name)} for ${esc(x.to.name)}</span><span class="sub">${P.gbp(x.toCost)} a portion instead of ${P.gbp(x.fromPp)}, ${x.toPp}g protein</span></span><span class="cost alt">−${P.gbp(x.save)}</span></div>`).join('') : ''}
    ${split ? `<div class="line"><span class="grow"><span class="name">Shop at ${P.SHOP_NAMES[split.shops[0]]} and ${P.SHOP_NAMES[split.shops[1]]}</span><span class="sub">${split.baskets.map((b) => `${P.SHOP_NAMES[b.shop]} ${P.gbp(b.total)}: ${b.lines.length} items`).join(' · ')}. Only worth it if you pass both.</span></span><span class="cost alt">−${P.gbp(split.saving)}</span></div>` : ''}
    ${cheaperElsewhere.length ? `<div class="line"><span class="grow"><span class="name">${cheaperElsewhere.length} line${cheaperElsewhere.length > 1 ? 's are' : ' is'} cheaper at another shop</span><span class="sub">${cheaperElsewhere.slice(0, 4).map((x) => `${esc(ingById(x.l.id)?.name || x.l.id)} ${P.gbp(x.c.cost)} at ${P.SHOP_NAMES[x.c.shop]}`).join(' · ')}</span></span><span class="cost alt">−${P.gbp(savePot)}</span></div>` : ''}
    ${!S.settings.preferThigh && chosen.lines.some((l) => l.id === 'chicken_breast') ? `<div class="line"><span class="grow"><span class="name">Thigh fillets instead of breast</span><span class="sub">Usually cheaper per kilo. Switch it under ⚙ Settings → Shopping.</span></span></div>` : ''}
    ${chosen.stock ? `<div class="line"><span class="grow"><span class="name">${P.gbp(chosen.stock)} of this is stock-ups</span><span class="sub">Rice, oils, spices, whey: they last weeks and next week's list won't ask for them again.</span></span></div>` : ''}
    ${!swaps.length && !split && !cheaperElsewhere.length ? '<p class="small muted">You\'re already at the cheapest shop with the cheapest packs.</p>' : ''}</details>` : '';
  const splitHtml = '';
  const unpricedAll = ids.filter((id) => !(ingById(id)?.packs || []).length).map((id) => ingById(id)?.name);
  const haveIds = Object.keys(needsAll).filter((id) => pantryFor[id] !== undefined);
  const haveRows = haveIds.map((id) => { const it = ingById(id); const v = pantryFor[id]; return `<div class="line"><span class="grow"><span class="name">${esc(it?.name || id)}</span><span class="sub">${v === true ? 'plenty' : `you have ${P.fmtQty(v, it?.unit || 'g')}`} · ${esc((usedBy[id] || []).join(', '))}</span></span><button class="btn ghost small" data-action="need" data-id="${id}">Need it</button></div>`; }).join('');
  return `${head}
  ${choiceHtml ? `<div class="card">${choiceHtml}</div>` : ''}
  ${doneBox}
  <div class="card shophead"><div class="row"><span class="grow"><b class="bigtotal">${P.gbp(chosen.stock ? chosen.weekly : chosen.comparable)}</b> <span class="muted">at ${P.SHOP_NAMES[chosen.shop]}${chosen.stock ? ' · this week\'s food' : ''}</span></span><span class="muted small">budget ${P.gbp(budget)}</span></div>
    <div class="budget ${chosen.weekly > budget ? 'over' : ''}"><i style="width:${pct}%"></i></div>
    <p class="small muted">${chosen.weekly > budget ? `Over your ${P.gbp(budget)} budget by ${P.gbp(chosen.weekly - budget)}. <b>Where can I save?</b> below shows the cheaper swaps.` : `${P.gbp(budget - chosen.weekly)} of your ${P.gbp(budget)} budget left.`}</p>
    ${chosen.stock ? `<div class="stockline"><b>+ ${P.gbp(chosen.stock)} one-off stock-ups</b> = ${P.gbp(chosen.comparable)} at the till today<span>Oil, spices, rice and the like. They last weeks, so next week is just the food. <a href="#" data-action="go-pantry">Already got some? Tick them in Pantry.</a></span></div>` : ''}
    ${chosen.elsewhere ? `<p class="small muted">Includes about ${P.gbp(chosen.elsewhere)} for what ${P.SHOP_NAMES[chosen.shop]} doesn't sell, priced at the cheapest other shop.</p>` : ''}
    ${breakdown ? `<p class="small muted breakdown">${breakdown}</p>` : ''}
    <div class="row" style="gap:8px;margin-top:6px"><button class="btn small grow" data-action="share-list">Share list</button><button class="btn ghost small grow" data-action="copy-list">Copy</button>${online[chosen.shop] ? `<a class="btn ghost small grow" style="text-align:center" href="${online[chosen.shop]('')}" target="_blank" rel="noopener">Shop online</a>` : ''}</div></div>
  <button class="btn block big" data-action="extra-add" style="margin:2px 0 6px">+ Add something to this shop</button>
  <h2>Where to shop${ranked.some((b) => b.stock) ? ' <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:600">total at the till</span>' : ''}</h2><div class="shopchips">${chips}</div>
  <h2>${P.SHOP_NAMES[chosen.shop]} list <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:600">${done}/${weekCount} ticked</span></h2>
  <div class="card list">${missing}${lines || '<p class="muted">Nothing priced at this shop.</p>'}</div>
  ${stockHtml}
  ${extrasCard}
  ${whyHtml}${items}${splitHtml}
  ${unpricedAll.length ? `<div class="card" style="margin-top:10px"><h3>No price anywhere yet</h3><p class="small muted">${unpricedAll.map(esc).join(', ')}. Left out of the totals until priced.</p></div>` : ''}
  ${haveRows ? `<h2>Already in your pantry</h2><div class="card"><p class="small muted">Left off the list because it's ticked in Pantry. Tap "Need it" to put it back. Buying everything would be ${P.gbp(fullWeek.total)} at ${P.SHOP_NAMES[fullWeek.shop]}.</p>${haveRows}</div>` : ''}
  <p class="small muted">${esc(DATA.priceNote || '')}</p>`;
}
// A day that has gone: was the meal eaten? If not, it goes in the freezer as a tub and straight into next week's first free slot.
async function pastCell(w, day, slot) {
  const cur = w.grid[day][slot]; const rid = P.isTub(cur) ? P.tubRecipe(cur) : cur; const r = rid && !P.isOut(rid) ? recById(rid) : null;
  if (!r) { toast('Nothing was planned there'); return; }
  const v = await askChoice(`${P.DAYS[day]} ${slot}: ${r.name}`, [{ value: 'eaten', label: 'Eaten', sub: 'Leave it as it is' }, { value: 'freeze', label: "Didn't eat it — freeze it", sub: 'Goes in the freezer and into next week', ghost: true }, { value: 'skip', label: "Didn't eat it — bin the slot", sub: 'Just mark it as not eaten', ghost: true }]);
  if (!v || v === 'eaten') return;
  w.grid[day][slot] = 'out';
  if (v === 'freeze') {
    S.tubs[r.id] = (S.tubs[r.id] || 0) + 1;
    const nxt = S.weeks[S.nextMon]; if (nxt && !nxt.grid) relayout(nxt);
    let placed = null;
    if (nxt?.grid) for (let d = 0; d < 7 && !placed; d++) { if (!nxt.days[d]) continue; for (const sl of P.SLOTS) if (r.slots.includes(sl) && !nxt.grid[d][sl]) { nxt.grid[d][sl] = `tub:${r.id}`; S.tubs[r.id] -= 1; placed = `${P.DAYS[d]} ${sl}`; break; } }
    toast(placed ? `Frozen and put into next week: ${placed}` : 'Frozen. Tap an empty slot next week to use it');
  } else toast('Marked as not eaten');
  save(); render();
}
// First-time tip cards, one per tab. Dismissed with "Got it" (S.tips[key]); "Show the tips again" in Settings clears them.
const TIPS = {
  cook: { title: 'How Cook works', items: ['<b>Batch cook</b> lists everything for your cook day with amounts already scaled for your week.', '<b>Box it up</b> tells you what goes in the fridge, what goes in the freezer, and how to reheat it.', 'Tap a meal on the Plan grid and tick <b>make fresh</b> if you\'d rather cook it on the day.'] },
  shop: { title: 'How Shop works', items: ['The big number is <b>this week\'s food</b> at the cheapest shop, and the budget bar judges that. One-off stock-ups (oil, spices, rice) sit underneath with the total you\'d pay at the till. Tap another shop to see its list instead. <b>Why this much?</b> shows what costs most and where to save.', 'Tick lines off as you go round. When they\'re all ticked the shop is logged under <b>Settings → Money</b>.', '<b>Stock up</b> is the whey, oils, spices and rice that last weeks: counted this week, in your Pantry next week.', 'Want milk for your coffee or crisps? <b>Add something to this shop</b>, just this week or every week.'] },
  pantry: { title: 'How Pantry works', items: ['Tick what you already have and it comes off the shop list.', 'Type an amount if you only have some, or leave it blank for "plenty".', 'Stock-ups you\'ve ticked or bought carry into next week on their own.', 'Got leftovers to use? Tap <b>Use up</b> and the Plan tab suggests meals for them.'] },
};
function tipCard(key) { if (S.tips && S.tips[key]) return ''; const t = TIPS[key]; return `<div class="card tipcard"><h3>${t.title}</h3><ol class="tips">${t.items.map((i) => `<li>${i}</li>`).join('')}</ol><button class="btn small" data-action="tip-done" data-tip="${key}">Got it</button></div>`; }
// Every line at the chosen shop ticked? Then the shop is done: the total is logged for Settings → Money (and unlogged if a line is unticked).
function shopDone(w) {
  const { needs } = shopNeeds(w, REC());
  const ranked = P.compareShops(needs, ING()).map((b) => ({ ...b, unpriced: b.missing.filter((m) => !(ingById(m.id)?.unavailable || []).includes(b.shop)) })).sort((a, b) => (a.unpriced.length - b.unpriced.length) || (a.total - b.total));
  const b = ranked.find((x) => x.shop === w.shop) || ranked[0];
  const all = b && b.lines.length > 0 && b.lines.every((l) => w.ticks[`${b.shop}:${l.id}`]);
  S.spendLog ||= {};
  const stock = P.round2(b ? b.lines.filter((l) => ingById(l.id)?.staple).reduce((t, l) => t + l.cost, 0) : 0);
  if (all) { if (!w.done) { w.done = { shop: b.shop, total: P.round2(b.total), weekly: P.round2(b.total - stock), date: iso(new Date()) }; toast(`Shop done: ${P.gbp(b.total)} at ${P.SHOP_NAMES[b.shop]}`); } S.spendLog[S.activeWeek] = { ...w.done, budget: S.settings.budget }; }
  else if (w.done) { delete w.done; delete S.spendLog[S.activeWeek]; }
  return all;
}
// Plain-text version of the chosen shop's list, for sharing or pasting into an online basket.
function shopListText() {
  const w = W(); const ing = ING(), recipes = REC();
  const { needs } = shopNeeds(w, recipes);
  const ranked = P.compareShops(needs, ing).map((b) => ({ ...b, unpriced: b.missing.filter((m) => !(ingById(m.id)?.unavailable || []).includes(b.shop)) })).sort((a, b) => (a.unpriced.length - b.unpriced.length) || (a.total - b.total));
  const b = ranked.find((x) => x.shop === w.shop) || ranked[0];
  const line = (l) => `${w.ticks[`${b.shop}:${l.id}`] ? '☑' : '☐'} ${l.n > 1 ? `${l.n} × ` : ''}${l.pack.name.replace(/\s*\([^)]*\)/g, '')} — ${P.gbp(l.cost)}`;
  const grouped = (ls) => { const g = {}; for (const l of ls) (g[aisleOf(ingById(l.id))] ||= []).push(l); return AISLES.filter(([k]) => g[k]).map(([k, label]) => `${label.toUpperCase()}\n${g[k].map(line).join('\n')}`).join('\n\n'); };
  const weekLs = b.lines.filter((l) => !ingById(l.id)?.staple), stockLs = b.lines.filter((l) => ingById(l.id)?.staple);
  const weekTotal = P.round2(weekLs.reduce((t, l) => t + l.cost, 0));
  return `Fuel shop, ${weekLabel(S.activeWeek).toLowerCase()} at ${P.SHOP_NAMES[b.shop]}: ${P.gbp(b.total)}\n\n${grouped(weekLs)}${stockLs.length ? `\n\nSTOCK UP (lasts weeks) — ${P.gbp(P.round2(stockLs.reduce((t, l) => t + l.cost, 0)))}\n${stockLs.map(line).join('\n')}` : ''}\n\nMade with Fuel · fuel app`;
}

// ----- Recipes -----
const TAGS = [['budget', 'Cheap (under £1.50)'], ['high-protein', '50g+ protein'], ['cold-lunch', 'Cold lunch'], ['quick', '25 min or less'], ['breakfast', 'Breakfast'], ['snack', 'Snacks'], ['curry', 'Curry'], ['pasta', 'Pasta'], ['mexican', 'Mexican'], ['asian', 'Asian'], ['british', 'Plain & simple'], ['veggie', 'Meat-free']];
function tagsOf(r) {
  const m = metaFor(r); const t = new Set(r.tags || []);
  if (m.c.cost && m.c.cost <= 1.5) t.add('budget'); if (m.pp >= 50) t.add('high-protein'); if (r.cookMinutes <= 25) t.add('quick'); if (r.cold) t.add('cold-lunch'); if (r.slots.includes('snack')) t.add('snack'); if (r.slots[0] === 'breakfast') t.add('breakfast');
  return t;
}
function recipeRow(r, action) {
  return `<div class="recipe-row" data-action="open-recipe" data-id="${r.id}"><div class="grow"><div class="name">${esc(r.name)}</div><div class="meta">${mealMeta(r)}${S.customRecipes.some((c) => c.id === r.id) ? ' <span class="badge">yours</span>' : ''}${r.tweaked ? ' <span class="badge">edited</span>' : ''}</div></div>${action || '<span class="muted">›</span>'}</div>`;
}
function renderRecipes() {
  const q = (S.search || '').toLowerCase();
  const all = REC();
  const mine = all.filter((r) => inLibrary(r.id) && (!q || r.name.toLowerCase().includes(q)));
  const list = mine.map((r) => recipeRow(r)).join('');
  const inbox = (S.inbox || []);
  const inboxHtml = inbox.length ? `<div class="card"><h3>Waiting for Claude <span class="badge warn">${inbox.length}</span></h3>
    <ul class="clean">${inbox.map((x, i) => `<li class="row"><span class="grow small" style="word-break:break-all">${esc(x.url)}${x.note ? `<span class="sub muted">${esc(x.note)}</span>` : ''}</span><button class="btn ghost small" data-action="inbox-rm" data-i="${i}">×</button></li>`).join('')}</ul>
    <button class="btn block" data-action="inbox-copy" style="margin-top:10px">Copy the list for Claude</button>
    <p class="small muted">Paste it into a Claude chat. The recipes get priced, added here and pushed to your phone.</p></div>` : '';
  const tag = S.ideaTag || '';
  const ideas = all.filter((r) => !inLibrary(r.id) && !isAvoided(r) && (!tag || tagsOf(r).has(tag)) && (!q || r.name.toLowerCase().includes(q)));
  const ideasCount = all.filter((r) => !inLibrary(r.id) && !isAvoided(r)).length;
  const ideasHtml = S.ideasOpen ? `<div class="card" id="ideas"><h3>Meal ideas <span class="muted small">${ideasCount} not in your list</span></h3>
    <div class="chip-row"><button class="chip ${!tag ? 'on' : ''}" data-action="idea-tag" data-tag="">All</button>${TAGS.map(([k, l]) => `<button class="chip ${tag === k ? 'on' : ''}" data-action="idea-tag" data-tag="${k}">${l}</button>`).join('')}</div>
    ${ideas.length ? ideas.map((r) => recipeRow(r, `<button class="btn small" data-action="lib-add" data-id="${r.id}">+ Add</button>`)).join('') : '<p class="muted">Nothing left to add here. Try another filter, or type one in.</p>'}</div>` : '';
  return `<h1>Recipes</h1>
  <button class="btn block ${S.ideasOpen ? 'ghost' : ''}" data-action="ideas-toggle" style="margin-bottom:10px">${S.ideasOpen ? 'Hide meal ideas' : `✨ Find more meal ideas (${ideasCount})`}</button>
  ${ideasHtml}
  <div class="row" style="margin-bottom:12px"><button class="btn ghost grow" data-action="add-recipe">+ Type a recipe in</button></div>
  <input class="search" placeholder="Search ${mine.length} of your recipes" value="${esc(S.search || '')}" data-search>
  <h2>My recipes</h2><div class="card">${list || '<p class="muted">Nothing here yet. Add some from the ideas above.</p>'}</div>`;
}
function linkForm() {
  return `<h3>Add from a link</h3><p class="small muted">Instagram only opens for a logged-in browser, so the app can't read the reel itself. Paste the link here; Claude turns it into a priced recipe and pushes it to the app.</p>
  <form id="link-form"><label class="field">Reel or recipe link<input name="url" type="url" required placeholder="https://www.instagram.com/reel/…"></label>
  <label class="field">Anything to change? (optional)<input name="note" placeholder="e.g. swap thighs for breast, no coriander"></label>
  <button class="btn block" type="submit">Save to the list</button></form>`;
}
function recipeDetail(r) {
  const ing = ING();
  const custom = S.customRecipes.some((c) => c.id === r.id);
  const c = P.costPerPortion(r, ing);
  const ings = P.scaleIngredients(r, 1, ing).map((s) => `<span>${esc(s.name)}</span><b>${P.fmtQty(s.qty, s.unit)}</b>`).join('');
  const lib = inLibrary(r.id);
  return `<h3>${esc(r.name)}</h3><p class="small muted">${P.proteinPerPortion(r, ing)}g protein · ${P.kcalPerPortion(r, ing)} kcal · ~£${c.cost.toFixed(2)} a portion${c.unpriced.length ? ` (excl. ${c.unpriced.join(', ')})` : ''} · ${r.slots.join(' or ')} · ${r.cookMinutes ? r.cookMinutes + ' min' : 'no batch cook'} · ${r.cold ? 'cold ok' : 'eat hot'} · ${r.freezer ? 'freezes' : r.fridgeDays ? `fridge ${r.fridgeDays} days, no freezer` : 'make fresh'}</p>
  <h2>Per portion${r.tweaked ? ' <span class="badge">edited by you</span>' : ''}</h2><div class="ing-list">${ings}</div>
  <button class="btn ghost small" style="margin-top:8px" data-action="tweak-open" data-id="${r.id}">Change the ingredients</button>
  <h2>Method${r.tweakedMethod ? ' <span class="badge">adjusted for your changes</span>' : ''}</h2><ol class="steps">${r.method.map((m) => `<li>${esc(m)}</li>`).join('')}</ol>
  ${r.notes ? `<p class="small muted">${esc(r.notes)}</p>` : ''}
  ${r.source && r.source.startsWith('http') ? `<p class="small"><a href="${esc(r.source)}" target="_blank" rel="noopener">Source reel</a></p>` : ''}
  <div class="row" style="margin-top:12px">${lib ? `<button class="btn grow" data-action="add-portion" data-id="${r.id}">Add to ${weekLabel(S.activeWeek).toLowerCase()}</button><button class="btn ghost" data-action="lib-remove" data-id="${r.id}">Remove from my recipes</button>` : `<button class="btn grow" data-action="lib-add" data-id="${r.id}">+ Add to my recipes</button>`}${custom ? `<button class="btn danger" data-action="delete-recipe" data-id="${r.id}">Delete</button>` : ''}</div>`;
}
// Sheet for leaving ingredients out of a recipe or adding one, for this account only.
function tweakSheet(id) {
  const base = RAW_ORIGINAL(id); if (!base) return '';
  const t = (S.tweaks && S.tweaks[id]) || { drop: [], add: [] };
  const rows = base.ingredients.map((x) => { const it = ingById(x.id); const off = t.drop.includes(x.id); const sw = swapsFor(x.id); const chosen = t.add.find((a) => a.for === x.id)?.id;
    const swapHtml = off && sw.length ? `<div class="chip-row swaprow"><span class="small muted">Instead:</span>${sw.map((o) => `<button class="chip ${chosen === o.id ? 'on' : ''}" data-action="tweak-swap" data-id="${id}" data-from="${x.id}" data-to="${o.id}" data-qty="${x.qty}">${esc(o.name)}</button>`).join('')}<button class="chip ${!chosen ? 'on' : ''}" data-action="tweak-swap" data-id="${id}" data-from="${x.id}" data-to="">Nothing</button></div>` : '';
    return `<label class="check"><input type="checkbox" data-tweak-drop="${x.id}" ${off ? '' : 'checked'}><span class="grow">${esc(it?.name || x.id)}${off ? '<span class="sub">left out</span>' : ''}</span><span class="small muted">${P.fmtQty(x.qty, it?.unit || '')}</span></label>${swapHtml}`; }).join('');
  const added = t.add.filter((x) => !x.for).map((x) => { const i = t.add.indexOf(x); const it = ingById(x.id); return `<label class="check"><span class="grow">${esc(it?.name || x.id)}<span class="sub">added by you</span></span><span class="small muted">${P.fmtQty(x.qty, it?.unit || '')}</span><button class="btn ghost small" data-action="tweak-rm-add" data-id="${id}" data-i="${i}">Remove</button></label>`; }).join('');
  const opts = ING().filter((i) => !i.hidden).sort((a, b) => a.name.localeCompare(b.name)).map((i) => `<option value="${i.id}">${esc(i.name)} (${i.unit})</option>`).join('');
  return `<h3>${esc(base.name)}</h3><p class="small muted">Untick anything you don't want in it, and pick a stand-in if you like. This only changes your copy. The shop list, the numbers and the method follow it.</p>
  <div id="tweak-list">${rows}${added}</div>
  <h2>Add something</h2><div class="row"><select id="tweak-add-id" class="grow">${opts}</select><input id="tweak-add-qty" type="number" step="any" min="0" placeholder="per portion" style="width:110px"><button class="btn small" data-action="tweak-add" data-id="${id}">Add</button></div>
  <div class="row" style="margin-top:14px"><button class="btn grow" data-action="tweak-done" data-id="${id}">Done</button>${(t.drop.length || t.add.length) ? `<button class="btn ghost" data-action="tweak-reset" data-id="${id}">Back to original</button>` : ''}</div>`;
}
function setTweak(id, fn) { S.tweaks ||= {}; const t = S.tweaks[id] || { drop: [], add: [] }; fn(t); if (!t.drop.length && !t.add.length) delete S.tweaks[id]; else S.tweaks[id] = t; SCALED = { f: null, list: null, n: 0 }; META.clear(); save(); }
function recipeForm() {
  const opts = ING().map((i) => `<option value="${i.id}">${esc(i.name)} (${i.unit})</option>`).join('');
  return `<h3>Add a recipe</h3><form id="recipe-form">
  <label class="field">Name<input name="name" required></label>
  <div class="small muted">Slots</div><div class="chip-row">${P.SLOTS.map((s) => `<label class="chip"><input type="checkbox" name="slot" value="${s}" hidden>${s}</label>`).join('')}</div>
  <div class="row"><label class="field grow">Fridge days<input name="fridgeDays" type="number" min="0" max="7" value="3"></label><label class="field grow">Batch cook minutes<input name="cookMinutes" type="number" min="0" value="30"></label></div>
  <div class="chip-row"><label class="chip"><input type="checkbox" name="cold" hidden>ok cold</label><label class="chip on"><input type="checkbox" name="freezer" hidden checked>freezes</label></div>
  <label class="field">Reheat<select name="reheat"><option value="microwave">Microwave</option><option value="none">Eat cold</option><option value="hob">Hob</option><option value="air-fryer">Air-fryer</option></select></label>
  <div class="small muted" style="margin-top:8px">Ingredients per portion</div><div id="ing-rows"></div>
  <button type="button" class="btn ghost small" data-action="add-ing-row">+ ingredient</button>
  <button type="button" class="btn ghost small" data-action="new-ingredient">+ new ingredient (no price yet)</button>
  <label class="field">Method, one step per line<textarea name="method"></textarea></label>
  <label class="field">Source link (optional)<input name="source"></label>
  <button class="btn block" type="submit" style="margin-top:8px">Save recipe</button></form>
  <template id="ing-row-t"><div class="ing-row"><select name="ing">${opts}</select><input name="qty" type="number" step="any" placeholder="qty" required><button type="button" data-action="rm-row">×</button></div></template>`;
}
function newIngredientForm() {
  return `<h3>New ingredient</h3><form id="ing-form">
  <label class="field">Name<input name="name" required></label>
  <label class="field">Unit<select name="unit"><option value="g">grams</option><option value="ml">ml</option><option value="each">each</option></select></label>
  <label class="field">Protein per 100g/ml (or per each)<input name="protein" type="number" step="any" value="0"></label>
  <label class="field">Category<select name="category"><option>protein</option><option>carb</option><option>veg</option><option>fruit</option><option>dairy</option><option>tin</option><option>sauce</option><option>spice</option><option>cupboard</option></select></label>
  <label class="field">Kept in<select name="store"><option>fridge</option><option>freezer</option><option>cupboard</option></select></label>
  <p class="small muted">It'll show as "no price on file" on the Shop tab until Claude adds a price.</p>
  <button class="btn block" type="submit">Save ingredient</button></form>`;
}

// ----- Pantry -----
// Live preview for Settings: at this calorie target, what portion size results, what the week averages, and what the shop costs.
function macroPreview(kTarget, pTarget) {
  const w = W(); const ing = ING();
  const f = weekFactor(w, kTarget);
  const recipes = RAW().map((r) => (r.slots.includes('snack') ? r : { ...r, ingredients: r.ingredients.map((x) => ({ id: x.id, qty: Math.round(x.qty * f * 100) / 100 })) }));
  const rec = Object.fromEntries(recipes.map((r) => [r.id, r]));
  const active = w.days.filter(Boolean).length || 1;
  let sp = 0, sk = 0;
  for (const [id, n] of Object.entries(w.snacks || {})) { const r = rec[id]; if (r && n) { sp += P.proteinPerPortion(r, ing) * n; sk += P.kcalPerPortion(r, ing) * n; } }
  const st = P.gridStats(w.grid, recipes, ing, { protein: sp / active, kcal: sk / active }, w.days);
  const empty = !st.filled && !Object.keys(w.snacks || {}).length;
  let shop = null;
  if (!empty) { const { needs } = shopNeeds(w, recipes); const ranked = P.compareShops(needs, ing).filter((b) => !b.missing.some((m) => !(ingById(m.id)?.unavailable || []).includes(b.shop))); shop = ranked.sort((a, b) => a.total - b.total)[0] || null; }
  const pPct = Math.min(100, Math.round((st.avg / (pTarget || 1)) * 100));
  const kPct = Math.min(100, Math.round((st.avgKcal / (kTarget || 1)) * 100));
  const gapP = Math.round(pTarget - st.avg), gapK = Math.round(kTarget - st.avgKcal);
  const budget = S.settings.budget || 0;
  const capped = f >= 1.6 ? 'Meals are at their biggest (1.6×); the rest has to come from snacks.' : f <= 0.6 ? 'Meals are at their smallest (0.6×); drop a snack or a meal to go lower.' : '';
  return `<div class="macro"><div class="row"><span class="grow">${empty ? 'Nothing picked this week yet' : `Meals sized at <b>${f}×</b> to hit ${(kTarget || 0).toLocaleString()} kcal`}</span></div>
    <div class="row" style="margin-top:6px"><span class="lbl">Calories</span><div class="budget grow kcal ${kPct < 90 ? 'low' : ''}" style="margin:0"><i style="width:${kPct}%"></i></div><b class="val">${st.avgKcal.toLocaleString()}</b><span class="small muted">/ ${(kTarget || 0).toLocaleString()}</span></div>
    <div class="row" style="margin-top:6px"><span class="lbl">Protein</span><div class="budget grow ${pPct < 90 ? 'low' : ''}" style="margin:0"><i style="width:${pPct}%"></i></div><b class="val">${st.avg}g</b><span class="small muted">/ ${pTarget}g</span></div>
    ${shop ? `<div class="row" style="margin-top:6px"><span class="lbl">Shop</span><div class="budget grow ${shop.total > budget ? 'over' : ''}" style="margin:0"><i style="width:${Math.min(100, Math.round((shop.total / (budget || 1)) * 100))}%"></i></div><b class="val">${P.gbp(shop.total)}</b><span class="small muted">at ${P.SHOP_NAMES[shop.shop]} / £${budget}</span></div>` : ''}
    <p class="small muted" style="margin:6px 0 0">${empty ? 'Pick meals on Plan and come back; the bars fill from what you pick.' : `${capped ? capped + ' ' : ''}${gapP > 0 ? `${gapP}g protein short: swap in a higher-protein meal or add a protein snack.` : `Protein covered (${-gapP}g over).`}`}</p></div>`;
}
function accountCard() {
  if (!cloud.enabled) return `<p class="small muted">Everything is saved on this phone only. Sign-in and sync switch on once the app is connected to its cloud project.</p>`;
  if (cloud.status === 'error') return `<div class="bad-box">Cloud problem: ${esc(cloud.error || 'unknown')}. The app keeps working on this phone.</div>`;
  if (!cloud.user) return `<p class="small muted">Not signed in.</p>`;
  const until = cloud.planExpires ? ` until ${fmtDate(cloud.planExpires.slice(0, 10))}` : '';
  return `<div class="row"><span class="grow"><b>${esc(cloud.user.email)}</b><span class="sub muted">Access${until}${cloud.lastSync ? ` · synced ${new Date(cloud.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span></span><button class="btn ghost small" data-action="signout">Sign out</button></div>`;
}
// The door: with cloud on, you sign in, and your account has to be active. Inside, nothing is locked.
function gateScreen() {
  const el = document.getElementById('gate');
  if (!cloud.enabled || hasAccess()) { el.hidden = true; el.innerHTML = ''; el.dataset.key = ''; return false; }
  const key = [cloud.status, cloud.user?.id || '', S.authMode || 'signin', cloud.error || ''].join('|');
  if (!el.hidden && el.dataset.key === key) return true;
  el.dataset.key = key;
  const name = esc(CONFIG.APP_NAME);
  if (cloud.status === 'off' || cloud.status === 'loading') { el.innerHTML = `<div class="wrap"><div class="logo wordmark" aria-label="${name}">FU<b>£</b>L</div><h1>One moment…</h1></div>`; el.hidden = false; return true; }
  if (cloud.status === 'error') { el.innerHTML = `<div class="wrap"><div class="logo wordmark" aria-label="${name}">FU<b>£</b>L</div><h1>Can't reach the cloud.</h1><p>${esc(cloud.error || '')}</p><button class="go" data-action="gate-retry">Try again</button></div>`; el.hidden = false; return true; }
  if (!cloud.user) {
    const mode = S.authMode || 'signin';
    el.innerHTML = `<div class="wrap"><div class="logo wordmark" aria-label="${name}">FU<b>£</b>L</div><h1>${mode === 'signup' ? 'Create your account.' : 'Sign in.'}</h1><p><b>Plan. Shop. Cook.</b> High-protein meals, at the cheapest price, all cooked on Sunday ready for the week.</p>
      ${gateInstallHint()}<form id="signin-form" data-mode="${mode}"><input class="big" name="email" type="email" required placeholder="you@uni.ac.uk" autocomplete="email" style="font-size:20px;text-align:left"><input class="big" name="password" type="password" required minlength="8" placeholder="${mode === 'signup' ? 'Choose a password (8+ characters)' : 'Password'}" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" style="font-size:20px;text-align:left;margin-top:10px"><button class="go" type="submit">${mode === 'signup' ? 'Create account' : 'Sign in'}</button><div id="signin-msg" class="signin-msg" hidden></div></form>
      <p class="small" style="margin-top:14px">${mode === 'signup' ? `Already have an account? <a href="#" data-action="auth-mode" data-mode="signin" style="color:#fff;font-weight:600">Sign in</a>` : `New here? <a href="#" data-action="auth-mode" data-mode="signup" style="color:#fff;font-weight:600">Create an account</a> · <a href="#" data-action="auth-forgot" style="color:#fff">Forgot password?</a>`}</p>
      <p class="small" style="opacity:.85;margin-top:16px"><a href="terms.html" style="color:#fff">Terms</a> · <a href="privacy.html" style="color:#fff">Privacy</a></p></div>`;
  } else {
    // Stripe Payment Link: client_reference_id carries the account id to the webhook; prefilled_email saves typing.
    const url = CONFIG.CHECKOUT_URL ? `${CONFIG.CHECKOUT_URL}${CONFIG.CHECKOUT_URL.includes('?') ? '&' : '?'}client_reference_id=${encodeURIComponent(cloud.user.id)}&prefilled_email=${encodeURIComponent(cloud.user.email)}` : '';
    const n = RAW().filter((r) => !r.slots.includes('snack')).length;
    el.innerHTML = `<div class="wrap gate-access"><div class="logo wordmark" aria-label="${name}">FU<b>£</b>L</div><h1>You're in.<br>Nearly.</h1><p class="who">Signed in as <b>${esc(cloud.user.email)}</b></p>
      <div class="gcard">
        <div class="perk"><span class="ico">🍗</span><div><b>${n} recipes, all priced</b><small>Every ingredient read from Aldi, Tesco, ASDA and Sainsbury's</small></div></div>
        <div class="perk"><span class="ico">📅</span><div><b>Your week, laid out</b><small>Tick meals, get the Sunday cook list and the tubs</small></div></div>
        <div class="perk"><span class="ico">🛒</span><div><b>The cheapest shop</b><small>Item by item, shop by shop, against your budget</small></div></div>
        <div class="perk"><span class="ico">☁️</span><div><b>Synced everywhere</b><small>Phone, laptop, new phone: same plan</small></div></div>
      </div>
      ${url ? `<div class="gcard price"><div><b>${esc(CONFIG.PRICE_LABEL || '')} one-off</b><small>Pay once, keep it forever. No subscription.</small></div><a class="go" href="${esc(url)}" target="_blank" rel="noopener" data-action="buy">Buy ${name}</a></div>` : `<div class="gcard price"><div><b>${esc(CONFIG.PRICE_LABEL || '')} one-off, opening soon</b><small>Pay once, keep it forever. For now, access is by code.</small></div></div>`}
      <form id="code-form" class="gcard codecard"><label for="gate-code"><b>Have a code?</b><small>From a friend, a club, or the founder.</small></label><div class="row"><input id="gate-code" class="big grow" name="code" required placeholder="ENTER CODE" autocapitalize="characters" autocomplete="off" spellcheck="false"><button class="go" type="submit">Use it</button></div><div id="code-msg" class="signin-msg" hidden></div></form>
      <p class="gfoot"><button class="back" data-action="gate-refresh">I've paid, refresh</button><span>·</span><button class="back" data-action="signout">Sign out</button></p></div>`;
  }
  el.hidden = false; return true;
}
// What the chosen (or cheapest) shop comes to at the till right now, worked out the way the Shop tab does it (things that shop doesn't sell
// are priced at the cheapest other shop). Pantry shows it live, so ticking something visibly takes it off the bill.
function tillNow(w) {
  const { needs, needsAll } = shopNeeds(w, REC()); if (!Object.keys(needsAll).length) return null;
  const notSoldAt = (b, m) => (ingById(m.id)?.unavailable || []).includes(b.shop);
  const ranked = P.compareShops(needs, ING()).map((b) => ({ ...b, notSold: b.missing.filter((m) => notSoldAt(b, m)), unpriced: b.missing.filter((m) => !notSoldAt(b, m)) }));
  const byShop = Object.fromEntries(ranked.map((b) => [b.shop, b]));
  const elsewhere = (id, not) => { let m = null; for (const sh of P.SHOPS) { if (sh === not) continue; const l = byShop[sh]?.lines.find((x) => x.id === id); if (l && (m === null || l.cost < m)) m = l.cost; } return m || 0; };
  for (const b of ranked) b.comparable = P.round2(b.total + b.notSold.reduce((t, m) => t + elsewhere(m.id, b.shop), 0));
  ranked.sort((x, y) => (x.unpriced.length - y.unpriced.length) || (x.comparable - y.comparable));
  const chosen = byShop[w.shop] || ranked[0]; return chosen ? { shop: chosen.shop, total: chosen.comparable } : null;
}
let pantryBase = null; // the bill when Pantry was opened, so the bar can say how much this visit has taken off
function pantryPriceHtml(w) {
  const now = tillNow(w); if (!now) return '';
  if (!pantryBase || pantryBase.week !== S.activeWeek || pantryBase.shop !== now.shop) pantryBase = { week: S.activeWeek, shop: now.shop, total: now.total };
  const off = P.round2(pantryBase.total - now.total);
  return `<span>${weekLabel(S.activeWeek)}'s shop at ${P.SHOP_NAMES[now.shop]}</span><b>${P.gbp(now.total)}</b>${off > 0.004 ? `<i>${P.gbp(off)} off</i>` : ''}`;
}
function refreshPantryPrice() { const el = document.getElementById('pantryprice'); if (el) el.innerHTML = pantryPriceHtml(W()); }
function renderPantry() {
  const groups = {};
  const w = W(); w.useUp ||= {};
  const mine = pantryIds(w);
  const options = new Set(ING().flatMap((i) => i.choices || [])); // the actual fruits, not the "your pick" line
  for (const it of ING()) if (mine.has(it.id) && (!it.hidden || options.has(it.id)) && !(it.choices || []).length) (groups[it.category] ||= []).push(it);
  const order = ['protein', 'dairy', 'carb', 'veg', 'fruit', 'tin', 'sauce', 'spice', 'cupboard'];
  const row = (it) => { const v = w.pantry[it.id]; const on = v === true || typeof v === 'number'; const up = !!w.useUp[it.id];
    return `<div class="check"><input type="checkbox" data-pantry="${it.id}" ${on ? 'checked' : ''}><span class="grow">${esc(it.name)}${(it.packs || []).length ? '' : '<span class="sub">no price on file</span>'}${up ? '<span class="sub">using it up this week</span>' : ''}</span>${on ? `<button class="chip small useup ${up ? 'on' : ''}" data-action="useup" data-id="${it.id}" title="Plan meals that use this up">${up ? 'Using up' : 'Use up'}</button>` : ''}${on && !it.staple ? `<input class="qty" type="number" step="any" placeholder="plenty" data-pantry-qty="${it.id}" value="${typeof v === 'number' ? v : ''}"><span class="small muted">${it.unit === 'each' ? '' : it.unit}</span>` : ''}</div>`; };
  const q = (S.pantrySearch || '').toLowerCase();
  const LABEL = { protein: 'Meat, fish & protein', dairy: 'Dairy & eggs', carb: 'Carbs & bread', veg: 'Veg & herbs', fruit: 'Fruit', tin: 'Tins & jars', sauce: 'Sauces & condiments', spice: 'Spices & seasoning', cupboard: 'Cupboard' };
  const html = order.filter((g) => groups[g]).map((g) => {
    const items = q ? groups[g].filter((it) => it.name.toLowerCase().includes(q) || String(it.aka || '').toLowerCase().includes(q)) : groups[g];
    if (!items.length) return '';
    const ticked = groups[g].filter((it) => w.pantry[it.id] !== undefined).length;
    const open = q || ticked || ['protein', 'dairy', 'carb', 'veg'].includes(g);
    return `<details class="pantry-group" ${open ? 'open' : ''}><summary><h2>${LABEL[g] || g}</h2><span class="small muted">${ticked ? `${ticked} ticked · ` : ''}${groups[g].length}</span></summary><div class="card">${items.map(row).join('')}</div></details>`;
  }).join('');
  const ticked = Object.keys(w.pantry).length;
  return `<h1>Pantry</h1>${weekSwitch()}${tipCard('pantry')}<p class="muted" style="margin:0 0 10px">Tick what you already have and it comes off the shop list. <b>${ticked} ticked.</b></p><div class="pantryprice" id="pantryprice">${pantryPriceHtml(w)}</div>
  <div class="row" style="margin-bottom:12px"><input class="search grow" placeholder="Search the cupboard" value="${esc(S.pantrySearch || '')}" data-pantry-search><button class="btn ghost" data-action="clear-pantry">Untick all</button></div>${html}`;
}

// ---------- Settings: its own screen, opened from the gear on any tab ----------
// Settings → Money: what the shops have cost, from the weeks marked done (plus this week's planned total until it is).
function moneyCard() {
  const log = Object.entries(S.spendLog || {}).sort(([a], [b]) => a.localeCompare(b));
  const cur = S.weeks[S.thisMon]; let planned = null;
  if (cur && !cur.done && Object.keys(cur.portions || {}).length) { const { needs } = shopNeeds(cur, REC()); const b = P.compareShops(needs, ING()).sort((x, y) => x.total - y.total)[0]; if (b) planned = { shop: b.shop, total: P.round2(b.total) }; }
  if (!log.length && !planned) return `<p class="small muted">Nothing tracked yet. When every line of a week's shop is ticked, its total lands here.</p>`;
  const totals = log.map(([, v]) => v.total); const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  const under = log.filter(([, v]) => v.total <= (v.budget || S.settings.budget)).length;
  const best = totals.length ? Math.min(...totals) : 0, worst = totals.length ? Math.max(...totals) : 0;
  const stats = totals.length ? `<div class="stat-grid"><div class="stat"><b>${P.gbp(avg)}</b><span>average a week</span></div><div class="stat"><b>${P.gbp(totals.reduce((a, b) => a + b, 0))}</b><span>spent over ${totals.length} week${totals.length > 1 ? 's' : ''}</span></div><div class="stat"><b>${under}<span>/${totals.length}</span></b><span>weeks on budget</span></div></div>
    <p class="small muted" style="margin-top:8px">Cheapest week ${P.gbp(best)}, dearest ${P.gbp(worst)}. Budget ${P.gbp(S.settings.budget)} a week.</p>` : '';
  const rows = [...log].reverse().slice(0, 8).map(([k, v]) => `<div class="line"><span class="grow"><span class="name">Week of ${fmtDate(k)}</span><span class="sub">${P.SHOP_NAMES[v.shop] || v.shop}${v.date ? ` · shopped ${fmtDate(v.date)}` : ''}</span></span><span class="cost ${v.total > (v.budget || S.settings.budget) ? 'over' : ''}">${P.gbp(v.total)}</span></div>`).join('');
  const plannedRow = planned ? `<div class="line"><span class="grow"><span class="name">This week, planned</span><span class="sub">${P.SHOP_NAMES[planned.shop]} · tick off the whole shop to log it</span></span><span class="cost muted">${P.gbp(planned.total)}</span></div>` : '';
  return `${stats}${plannedRow}${rows}`;
}
function renderSettings() {
  const st = S.settings;
  const goal = (k, l) => `<option value="${k}" ${st.goal === k ? 'selected' : ''}>${l}</option>`;
  const account = !cloud.enabled
    ? `<div class="acct"><div class="avatar">☺</div><div class="grow"><b>This phone only</b><span class="sub muted">Everything is saved here. Sign-in and sync switch on with the cloud project.</span></div></div>`
    : cloud.status === 'error' ? `<div class="bad-box">Cloud problem: ${esc(cloud.error || 'unknown')}. The app keeps working on this phone.</div>`
    : !cloud.user ? `<div class="acct"><div class="avatar">?</div><div class="grow"><b>Not signed in</b></div></div>`
    : `<div class="acct"><div class="avatar">${esc((cloud.user.email || '?')[0].toUpperCase())}</div><div class="grow"><b>${esc(cloud.user.email)}</b><span class="sub muted">Full access${cloud.planExpires ? ` until ${fmtDate(cloud.planExpires.slice(0, 10))}` : ''}${cloud.lastSync ? ` · synced ${new Date(cloud.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</span></div></div>
       <div class="row" style="margin-top:12px"><button class="btn ghost grow" data-action="signout">Sign out</button></div>`;
  return `<div class="settings-head"><button class="btn ghost small" data-action="settings-back">‹ Back</button><h1>Settings</h1></div>
  <h2>Account</h2><div class="card">${account}</div>
  <h2>You</h2><div class="card">
    <div class="setgrid">
      <label class="field">Bodyweight (kg)<input type="number" inputmode="numeric" data-setting="weight" value="${st.weight}"></label>
      <label class="field">Weekly food budget (£)<input type="number" inputmode="numeric" data-setting="budget" value="${st.budget}"></label>
    </div>
    <label class="field">Goal<select data-setting-str="goal">${goal('build', 'Build muscle')}${goal('lean', 'Stay lean and strong')}${goal('lose', 'Lose fat, keep muscle')}${goal('eatwell', 'Just eat well')}</select></label>
  </div>
  <h2>Daily targets</h2><div class="card">
    <p class="small muted" style="margin:0 0 10px">Calories set the portion size: meals are scaled so the week lands on this number, and the shop list scales with them. Protein is what you aim for.</p>
    <label class="field">Calories <b data-val="kcalTarget">${(st.kcalTarget || 0).toLocaleString()}</b> kcal a day<input class="range" type="range" min="1200" max="4500" step="50" data-setting="kcalTarget" value="${st.kcalTarget || 2500}"></label>
    <label class="field">Protein <b data-val="proteinTarget">${st.proteinTarget}g</b> a day<input class="range" type="range" min="80" max="260" step="5" data-setting="proteinTarget" value="${st.proteinTarget}"></label>
    <div id="macro-preview">${macroPreview(st.kcalTarget, st.proteinTarget)}</div>
    <button class="btn ghost small" data-action="suggest-targets">Suggest targets from my weight and goal</button>
  </div>
  <h2>Things you don't eat</h2><div class="card">
    <p class="small muted" style="margin:0 0 8px">Recipes with these are hidden everywhere.</p>
    <div class="chip-row">${Object.entries(AVOID).map(([k, v]) => `<button class="chip ${st.avoid.includes(k) ? 'on' : ''}" data-action="avoid" data-id="${k}">${v.label}</button>`).join('')}</div>
    <div class="row" style="margin-top:10px"><input class="grow" id="settings-avoid-text" placeholder="Anything else, e.g. mushrooms" autocapitalize="none"><button class="btn small" data-action="settings-avoid-add">Add</button></div>${avoidTextChips('settings-avoid-rm')}
  </div>
  <h2>Money</h2><div class="card">${moneyCard()}</div>
  <h2>Shopping</h2><div class="card">
    <label class="field">Milk<select data-setting-str="milk">${[['milk', 'Dairy (semi-skimmed)'], ['oat_milk', 'Oat'], ['almond_milk', 'Almond'], ['soya_milk', 'Soya']].map(([k, l]) => `<option value="${k}" ${(st.milk || 'milk') === k ? 'selected' : ''}>${l}</option>`).join('')}</select><span class="sub">Every recipe and shop line that uses milk switches to this.</span></label>
    <label class="check"><input type="checkbox" data-setting-bool="preferThigh" ${st.preferThigh ? 'checked' : ''}><span>Buy thigh fillets instead of breast<span class="sub">Swaps every breast line on the shop list. Breast is currently cheaper per kilo at all four shops.</span></span></label>
  </div>
  ${isStandalone() ? '' : `<h2>On your phone</h2>${installCard(true)}`}
  <h2>App</h2><div class="card">
    <div class="row" style="flex-wrap:wrap;gap:8px"><button class="btn ghost small" data-action="intro">Show the intro again</button><button class="btn ghost small" data-action="tips-again">Show the tips again</button><button class="btn ghost small" data-action="export">Copy backup</button><button class="btn ghost small" data-action="import">Paste backup</button></div>
    <button class="btn danger block" data-action="reset" style="margin-top:12px">Reset everything</button>
  </div>
  <p class="small muted" style="text-align:center">${esc(CONFIG.APP_NAME)} ${APP_VERSION} · prices checked ${DATA.priceDate ? fmtDate(DATA.priceDate) : ''} · <a href="terms.html">Terms</a> · <a href="privacy.html">Privacy</a></p>`;
}

// ---------- sheet ----------
// ---------- Install: Chrome/Edge (Android, desktop) hand us a native install prompt; iPhone Safari can only Add to Home Screen ----------
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; const c = document.getElementById('install-card'); if (c) c.hidden = false; });
window.addEventListener('appinstalled', () => { installEvt = null; S.tips ||= {}; S.tips.install = true; save(); render(); toast('Fuel is on your home screen'); });
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const isIOS = () => /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
function installCard(force = false) {
  if (isStandalone()) return '';
  if (!force && S.tips && S.tips.install) return '';
  if (installEvt || !isIOS()) return `<div class="card tipcard" id="install-card" ${installEvt || force ? '' : 'hidden'}><h3>Put Fuel on your phone</h3><p class="small">One tap, no app store. It opens full screen like any other app and works offline in the shop.</p><div class="row" style="gap:8px"><button class="btn small" data-action="install">Install Fuel</button>${force ? '' : '<button class="btn ghost small" data-action="tip-done" data-tip="install">Not now</button>'}</div></div>`;
  return `<div class="card tipcard" id="install-card"><h3>Put Fuel on your home screen</h3><p class="small">iPhone doesn't let websites install themselves, so it's two taps in Safari:</p><ol class="tips"><li>Tap the <b>Share</b> button (the square with the arrow, bottom of the screen).</li><li>Scroll down and tap <b>Add to Home Screen</b>, then <b>Add</b>.</li></ol><p class="small muted">It then opens full screen, works offline in the shop and keeps you signed in.</p>${force ? '' : '<button class="btn ghost small" data-action="tip-done" data-tip="install">Not now</button>'}</div>`;
}
// Sign-in screen hint. iPhone keeps a home-screen app's sign-in separate from Safari's, so the icon goes on first;
// Instagram/TikTok/Facebook open links in their own browser, which has no Add to Home Screen at all.
const inAppBrowser = () => /Instagram|FBAN|FBAV|FB_IAB|TikTok|musical_ly|Snapchat|Line\//i.test(navigator.userAgent);
function gateInstallHint() {
  if (isStandalone()) return '';
  const steps = `<ol><li>Open this page in <b>Safari</b>.${inAppBrowser() ? ' You\'re inside another app right now: tap <b>···</b> at the top, then <b>Open in external browser</b>.' : ''}</li><li>Press <b>Share</b>.</li><li>Scroll down and press <b>Add to Home Screen</b>.</li><li>Press <b>Add</b>, then carry on in the app.</li></ol>`;
  if (inAppBrowser() && !isIOS()) return `<div class="gcard ginstall"><b>First, open this in Chrome</b><small>You're inside another app's browser, which can't install Fuel. Tap <b>···</b> at the top, then <b>Open in Chrome</b>.</small></div>`;
  if (!isIOS()) return '';
  return `<details class="gcard ginstall" open><summary><b>On iPhone? Add Fuel to your home screen</b></summary><small>Fuel isn't on the App Store yet, so it installs from Safari.</small>${steps}</details>`;
}
// In-app replacements for confirm/alert/prompt: iOS standalone web apps often don't show the built-in ones at all.
function ask(text, okLabel = 'Yes', danger = false) {
  return new Promise((resolve) => {
    openSheet(`<h3>${esc(text)}</h3><div class="row" style="margin-top:14px"><button class="btn ghost grow" data-dlg="0">Cancel</button><button class="btn grow ${danger ? 'danger' : ''}" data-dlg="1">${esc(okLabel)}</button></div>`);
    document.getElementById('sheet-inner').onclick = (e) => { const b = e.target.closest('[data-dlg]'); if (!b) return; document.getElementById('sheet-inner').onclick = null; closeSheet(); resolve(b.dataset.dlg === '1'); };
  });
}
function toast(text) { showHint(text); clearTimeout(toast.t); toast.t = setTimeout(hideHint, 2200); }
function showText(title, txt) { openSheet(`<h3>${esc(title)}</h3><textarea class="field" style="width:100%;min-height:140px" readonly>${esc(txt)}</textarea><button class="btn block" data-action="close-sheet" style="margin-top:10px">Done</button>`); }
function askText(title, placeholder) {
  return new Promise((resolve) => {
    openSheet(`<h3>${esc(title)}</h3><textarea id="ask-text" class="field" style="width:100%;min-height:140px" placeholder="${esc(placeholder)}"></textarea><div class="row" style="margin-top:10px"><button class="btn ghost grow" data-dlg="0">Cancel</button><button class="btn grow" data-dlg="1">OK</button></div>`);
    document.getElementById('sheet-inner').onclick = (e) => { const b = e.target.closest('[data-dlg]'); if (!b) return; const v = document.getElementById('ask-text').value; document.getElementById('sheet-inner').onclick = null; closeSheet(); resolve(b.dataset.dlg === '1' ? v : null); };
  });
}
// First-open questionnaire, full screen: goal → weight → budget → dislikes → summary.
const INTRO = { step: 1, goal: null };
function introOpen() { return !document.getElementById('intro').hidden; }
// Open the questionnaire for a first-time user, but never restart one that's already under way (sync ticks call this too).
function ensureIntro() { if (!S.settings.onboarded && !introOpen()) openIntro(); }
function openIntro() { INTRO.step = 1; INTRO.goal = S.settings.onboarded ? (S.settings.goal || null) : null; introStep(1); }
function introStep(n) {
  INTRO.step = n;
  const el = document.getElementById('intro');
  const dots = `<div class="dots">${[1, 2, 3, 4, 5].map((k) => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</div>`;
  const goals = [['build', 'Build muscle', 'Rugby, lifting, bulking. 2g protein per kilo, calories up.'], ['lean', 'Stay lean and strong', 'Training most days, not bulking.'], ['lose', 'Lose fat, keep muscle', 'Calories down, protein high so you stay full.'], ['eatwell', 'Just eat well', 'Healthy, cheap, sorted. No targets to chase.']];
  const wt = S.settings.weight || 85; const g = INTRO.goal || 'build';
  const budgets = [30, 40, 50, 60];
  const step = {
    1: `<div class="logo wordmark" aria-label="Fuel">FU<b>£</b>L</div><h1>What's the goal?</h1><p>This sets your daily protein and calorie targets. You can change them any time.</p>${goals.map(([k, t, d]) => `<button class="opt ${g === k ? 'on' : ''}" data-action="intro-goal" data-goal="${k}">${t}<small>${d}</small></button>`).join('')}`,
    2: `<h1>How much do you weigh?</h1><p>Kilos, roughly. Your daily protein and calorie targets come from this and your goal. Meals stay the same size; you hit the targets by what you pick.</p><input class="big" type="number" id="intro-weight" inputmode="numeric" value="${wt}" min="40" max="160"><div class="stat-row"><div><b id="iw-p">${P.proteinTargetFor(wt, g)}g</b><span>protein a day</span></div><div><b id="iw-f">${P.kcalTargetFor(wt, g).toLocaleString()}</b><span>kcal a day</span></div></div><button class="go" data-action="intro-weight">Next</button><button class="back" data-action="intro-back">Back</button>`,
    3: `<h1>Weekly food budget?</h1><p>The shop list always shows what's left against it.</p><div class="chips">${budgets.map((b) => `<button class="opt ${S.settings.budget === b ? 'on' : ''}" data-action="intro-budget" data-budget="${b}">£${b}</button>`).join('')}</div><p style="margin-bottom:6px">Or type your own</p><input class="big" type="number" id="intro-budget" inputmode="numeric" placeholder="£" min="10" max="300"><button class="go" data-action="intro-budget-custom">Next</button><button class="back" data-action="intro-back">Back</button>`,
    4: `<h1>Anything you don't eat?</h1><p>Recipes with these are hidden. Tap all that apply.</p><div class="chips">${Object.entries(AVOID).map(([k, v]) => `<button class="opt ${S.settings.avoid.includes(k) ? 'on' : ''}" data-action="intro-avoid" data-id="${k}">${v.label}</button>`).join('')}</div><p style="margin:16px 0 6px">Anything else? Allergies, or things you just don't like.</p><div class="row"><input class="big grow" id="intro-avoid-text" data-enter="intro-avoid-add" placeholder="e.g. mushrooms" autocapitalize="none" style="font-size:18px;text-align:left;margin:0"><button class="go" style="width:auto;margin:0;padding:14px 18px;font-size:16px" data-action="intro-avoid-add">Add</button></div>${avoidTextChips('intro-avoid-rm')}<p style="margin:16px 0 6px">Which milk?</p><div class="chips">${[['milk', 'Dairy'], ['oat_milk', 'Oat'], ['almond_milk', 'Almond'], ['soya_milk', 'Soya']].map(([k, l]) => `<button class="opt ${(S.settings.milk || 'milk') === k ? 'on' : ''}" data-action="intro-milk" data-id="${k}">${l}</button>`).join('')}</div><button class="go" data-action="intro-next">Next</button><button class="back" data-action="intro-back">Back</button>`,
    5: `<h1>You're set.</h1><p>Here's your setup. Snacks get picked on the Plan tab and count towards these numbers.</p><div class="stat-row"><div><b>${S.settings.proteinTarget}g</b><span>protein a day</span></div><div><b>${(S.settings.kcalTarget || 0).toLocaleString()}</b><span>kcal a day</span></div><div><b>£${S.settings.budget}</b><span>a week</span></div></div><p>Start by ticking meals. The week grid, the Sunday cook list and the cheapest shop fill themselves in. Meals are sized to your calorie target; change that, your milk or your budget any time under the <b>⚙ gear</b>, top right.</p><button class="go" data-action="intro-done">Let's plan a week</button><button class="back" data-action="intro-back">Back</button>`,
  }[n];
  el.innerHTML = `<div class="wrap">${dots}${step}</div>`; el.hidden = false;
  const wIn = document.getElementById('intro-weight');
  if (wIn) wIn.addEventListener('input', () => { const v = +wIn.value || wt; document.getElementById('iw-p').textContent = P.proteinTargetFor(v, g) + 'g'; document.getElementById('iw-f').textContent = P.kcalTargetFor(v, g).toLocaleString(); });
  // Enter / Go on a keyboard behaves like the Next button.
  el.querySelectorAll('input.big').forEach((inp) => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); (inp.dataset.enter ? el.querySelector(`[data-action="${inp.dataset.enter}"]`) : el.querySelector('button.go'))?.click(); } }));
  if (wIn) { wIn.focus(); wIn.select(); }
}
function closeIntro() { const el = document.getElementById('intro'); el.hidden = true; el.innerHTML = ''; }
document.getElementById('intro').addEventListener('click', onAction);
document.getElementById('gate').addEventListener('click', onAction);
document.getElementById('gate').addEventListener('submit', onSubmit);
function openSheet(html) { const s = document.getElementById('sheet'); document.getElementById('sheet-inner').innerHTML = html; s.hidden = false; }
function closeSheet() { document.getElementById('sheet').hidden = true; }
document.getElementById('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); else onAction(e); });
document.getElementById('sheet').addEventListener('submit', onSubmit);
document.getElementById('sheet').addEventListener('input', onInput);
document.getElementById('sheet').addEventListener('change', (e) => { if (onTweakChange(e)) return; const chip = e.target.closest('.chip'); if (chip && e.target.type === 'checkbox') chip.classList.toggle('on', e.target.checked); });

// ---------- drag and drop between grid cells ----------
const drag = { src: null, ghost: null, over: null, active: false, x: 0, y: 0, lx: 0, ly: 0, timer: null, touch: false, raf: null, scrollDir: 0 };
let picked = null; // { d, s } after a press-and-hold on touch
function cellAt(d, s) { return document.querySelector(`.cell[data-day="${d}"][data-slot="${s}"]`); }
function pickUp(cell) {
  picked = { d: +cell.dataset.day, s: cell.dataset.slot };
  document.querySelectorAll('.cell.lifted').forEach((c) => c.classList.remove('lifted'));
  cell.classList.add('lifted'); document.getElementById('view').classList.add('picking');
  navigator.vibrate?.(15);
  showHint('Now tap the slot it should move to. They swap places. Tap it again to cancel.');
}
function dropPicked(target) {
  const from = picked; picked = null; hideHint(); document.getElementById('view').classList.remove('picking');
  document.querySelectorAll('.cell.lifted').forEach((c) => c.classList.remove('lifted'));
  if (!target || target.classList.contains('off')) return;
  const to = { d: +target.dataset.day, s: target.dataset.slot };
  if (to.d === from.d && to.s === from.s) return;
  const w = W();
  const tmp = w.grid[from.d][from.s]; w.grid[from.d][from.s] = w.grid[to.d][to.s]; w.grid[to.d][to.s] = tmp;
  portionsFromGrid(); refreshPlan();
}
function showHint(text) { let h = document.getElementById('hint'); if (!h) { h = document.createElement('div'); h.id = 'hint'; document.body.appendChild(h); } h.textContent = text; h.classList.add('on'); }
function hideHint() { document.getElementById('hint')?.classList.remove('on'); }
function onDragStart(e) {
  const cell = e.target.closest('.cell'); if (!cell || cell.classList.contains('empty') || cell.classList.contains('off') || e.button > 0 || drag.src) return;
  if (picked) return; // a tap while holding something is handled by the click handler
  drag.src = cell; drag.x = drag.lx = e.clientX; drag.y = drag.ly = e.clientY; drag.active = false; drag.touch = e.pointerType !== 'mouse';
  try { cell.setPointerCapture(e.pointerId); } catch {}
  if (drag.touch) {
    // Hold still for a moment and the meal lifts under your finger; move before that and it's just a scroll.
    clearTimeout(drag.timer);
    drag.timer = setTimeout(() => { if (drag.src === cell && !drag.active) { drag.active = true; startGhost({ clientX: drag.lx, clientY: drag.ly }); navigator.vibrate?.(12); showHint('Drag it onto another meal to swap, or onto an empty slot.'); } }, 220);
  }
  cell.addEventListener('pointermove', onDragMove); cell.addEventListener('pointerup', onDragEnd); cell.addEventListener('pointercancel', onDragEnd);
}
function onDragMove(e) {
  if (!drag.src) return;
  drag.lx = e.clientX; drag.ly = e.clientY;
  const dist = Math.hypot(e.clientX - drag.x, e.clientY - drag.y);
  if (!drag.active) {
    if (drag.touch) { if (dist > 10) { clearTimeout(drag.timer); cleanupDrag(drag.src); } return; } // finger moved early: it's a scroll
    if (dist < 8) return; drag.active = true; startGhost(e);
  }
  moveGhost(e.clientX, e.clientY);
  e.preventDefault();
}
function moveGhost(x, y) {
  if (!drag.ghost) return;
  drag.ghost.style.transform = `translate(${x - drag.ghost.offsetWidth / 2}px, ${y - drag.ghost.offsetHeight * 0.65}px)`;
  drag.ghost.style.display = 'none';
  const under = document.elementFromPoint(x, y)?.closest('.cell');
  drag.ghost.style.display = '';
  const ok = under && under !== drag.src && !under.classList.contains('off');
  if (drag.over && drag.over !== under) drag.over.classList.remove('over');
  if (ok) { under.classList.add('over'); drag.over = under; } else drag.over = null;
  autoScroll(y);
}
// Dragging near the top or bottom edge scrolls the page so the whole week is reachable.
function autoScroll(y) {
  const v = document.getElementById('view'); const r = v.getBoundingClientRect();
  drag.scrollDir = y < r.top + 72 ? -1 : y > r.bottom - 72 ? 1 : 0;
  if (drag.scrollDir && !drag.raf) {
    const step = () => { if (!drag.active || !drag.scrollDir) { drag.raf = null; return; } v.scrollTop += drag.scrollDir * 9; moveGhost(drag.lx, drag.ly); drag.raf = requestAnimationFrame(step); };
    drag.raf = requestAnimationFrame(step);
  }
}
function startGhost(e) {
  document.querySelectorAll('.cell.ghost').forEach((x) => x.remove());
  const g = drag.src.cloneNode(true); g.classList.add('ghost'); g.style.width = drag.src.offsetWidth + 'px'; g.style.height = drag.src.offsetHeight + 'px';
  document.body.appendChild(g); drag.ghost = g; drag.src.classList.add('lifted'); document.getElementById('view').classList.add('dragging');
  moveGhost(e.clientX, e.clientY);
}
function cleanupDrag(src) {
  src.removeEventListener('pointermove', onDragMove); src.removeEventListener('pointerup', onDragEnd); src.removeEventListener('pointercancel', onDragEnd);
  document.querySelectorAll('.cell.ghost').forEach((x) => x.remove()); drag.over?.classList.remove('over'); if (!picked) src.classList.remove('lifted');
  if (drag.raf) cancelAnimationFrame(drag.raf);
  document.getElementById('view').classList.remove('dragging');
  drag.src = null; drag.ghost = null; drag.over = null; drag.active = false; drag.raf = null; drag.scrollDir = 0;
}
function onDragEnd(e) {
  clearTimeout(drag.timer);
  const src = drag.src; if (!src) return;
  const target = drag.over; const wasActive = drag.active; const touch = drag.touch;
  const moved = Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 8;
  cleanupDrag(src); hideHint();
  if (!wasActive) return; // a plain tap: the click handler opens the sheet
  suppressClick();
  if (e.type === 'pointercancel') return;
  if (!target) { if (touch && !moved) pickUp(src); return; } // held but not dragged: tap where it should go instead
  const w = W();
  const a = { d: +src.dataset.day, s: src.dataset.slot }, b = { d: +target.dataset.day, s: target.dataset.slot };
  const tmp = w.grid[a.d][a.s]; w.grid[a.d][a.s] = w.grid[b.d][b.s]; w.grid[b.d][b.s] = tmp;
  navigator.vibrate?.(8);
  portionsFromGrid(); refreshPlan();
}
function suppressClick() { const stop = (ev) => { ev.stopPropagation(); ev.preventDefault(); }; document.addEventListener('click', stop, { capture: true, once: true }); setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 400); }

// ---------- events ----------
function onAction(e) {
  const el = e.target.closest('[data-action]');
  if (picked && !(el && el.dataset.action === 'cell')) { dropPicked(null); }
  if (!el) return;
  const a = el.dataset.action, id = el.dataset.id; const w = W();
  if (a === 'inc' || a === 'dec') {
    if (a === 'inc' && P.roomFor(recById(id), P.freeSlots(w.grid, w.days)) <= 0) return;
    w.portions[id] = Math.max(0, (w.portions[id] || 0) + (a === 'inc' ? 1 : -1));
    if (!w.portions[id]) delete w.portions[id];
    relayout(); refreshPlan();
  } else if (a === 'week') { S.activeWeek = el.dataset.week; save(); render(); }
  else if (a === 'cookday') { w.cookDay = +el.dataset.day; relayout(); refreshPlan(); }
  else if (a === 'quick-pick') { const r = recById(id); const room = P.roomFor(r, P.freeSlots(w.grid, w.days)); if (r && w.portions[r.id]) { toast('Already in the week. Change the count in the list below.'); return; } if (r && room > 0) { if (S.library && !S.library.includes(r.id)) S.library.push(r.id); w.portions[r.id] = Math.min(defaultPortions(r), room); relayout(); render(); } else toast('No room left in the week for that'); }
  else if (a === 'relayout') { relayout(); refreshPlan(); }
  else if (a === 'dayx') { const i = +el.dataset.day; w.days[i] = !w.days[i]; relayout(w); refreshPlan(); }
  else if (a === 'need') { delete w.pantry[id]; delete (w.useUp || {})[id]; save(); render(); }
  else if (a === 'extra-add') { openSheet(extrasSheet('')); document.querySelector('[data-extra-search]')?.focus(); }
  else if (a === 'extra-custom') { const name = el.dataset.name; closeSheet(); (async () => {
    const price = await askText(`${name}: what does one cost? (£)`, 'e.g. 1.50'); if (price === null) return; const pr = parseFloat(String(price).replace(/[^0-9.]/g, '')); if (!(pr >= 0)) { toast('Type a price'); return; }
    const id = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!ingById(id)) { S.customIngredients.push({ id, name, unit: 'each', protein: 0, kcal: 0, category: 'cupboard', packs: [{ shop: 'any', name, size: 1, price: pr, checked: iso(new Date()) }] }); }
    const n = await askExtraQty(ingById(id)); if (n === null) return;
    const scope = await askChoice(`Add ${name}…`, [{ value: 'week', label: 'Just this week', sub: `${weekLabel(S.activeWeek)} only` }, { value: 'always', label: 'Every week', sub: 'Stays on the list until you remove it', ghost: true }]); if (!scope) return;
    extraList(scope).push({ id, qty: n }); shopDone(W()); save(); render(); toast(`${name} added at ${P.gbp(pr)} each (your price)`);
  })(); }
  else if (a === 'extra-pick') { const it = ingById(id); closeSheet(); askExtraQty(it).then(async (n) => { if (n === null) return; const scope = await askChoice(`Add ${it.name}…`, [{ value: 'week', label: 'Just this week', sub: `${weekLabel(S.activeWeek)} only` }, { value: 'always', label: 'Every week', sub: 'Stays on the list until you remove it', ghost: true }]); if (!scope) return; extraList(scope).push({ id, qty: n }); shopDone(W()); save(); render(); toast(scope === 'week' ? `${it.name} added to this week's shop` : `${it.name} added to every week`); }); }
  else if (a === 'extra-qty') { const it = ingById(id); askExtraQty(it).then((n) => { if (n === null) return; const e = extraList(el.dataset.scope).find((x) => x.id === id); if (e) e.qty = n; shopDone(W()); save(); render(); }); }
  else if (a === 'extra-remove') { const list = extraList(el.dataset.scope); const i = list.findIndex((x) => x.id === id); if (i >= 0) list.splice(i, 1); shopDone(W()); save(); render(); }
  else if (a === 'useup') { w.useUp ||= {}; if (w.useUp[id]) delete w.useUp[id]; else { w.useUp[id] = true; if (w.pantry[id] === undefined) w.pantry[id] = true; } save(); render(); }
  else if (a === 'pick-shop') { w.shop = el.dataset.shop; save(); render(); }
  else if (a === 'choice-toggle') {
    const it = ingById(el.dataset.choice); const cur = chosenFor(w, it); const v = el.dataset.val;
    const next = cur.includes(v) ? cur.filter((x) => x !== v) : cur.concat([v]);
    if (!next.length) { toast('Keep at least one.'); return; }
    w.choices ||= {}; w.choices[it.id] = next; save(); render();
  }
  else if (a === 'share-list' || a === 'copy-list') {
    const txt = shopListText();
    if (a === 'share-list' && navigator.share) { navigator.share({ title: 'Fuel shopping list', text: txt }).catch(() => {}); return; }
    (navigator.clipboard?.writeText(txt) || Promise.reject()).then(() => toast('List copied. Paste it anywhere.'), () => askText('Copy this list', txt));
  }
  else if (a === 'avoid') { const i = S.settings.avoid.indexOf(id); if (i >= 0) S.settings.avoid.splice(i, 1); else S.settings.avoid.push(id); save(); render(); }
  else if (a === 'settings') { if (S.tab !== 'settings') S.prevTab = S.tab; S.tab = 'settings'; save(); render({ top: true }); }
  else if (a === 'settings-back') { S.tab = S.prevTab && S.prevTab !== 'settings' ? S.prevTab : 'plan'; save(); render({ top: true }); }
  else if (a === 'install') { if (installEvt) { installEvt.prompt(); installEvt.userChoice.then(() => { installEvt = null; }); } else toast('Use your browser menu: Install app / Add to Home Screen'); }
  else if (a === 'tips-again') { S.tips = {}; save(); render(); toast('Tips are back on every tab'); }
  else if (a === 'tip-done') { S.tips ||= {}; S.tips[el.dataset.tip] = true; save(); render(); }
  else if (a === 'scroll-pick') { const v = document.getElementById('view'), h = document.getElementById('pick-head'); if (h) v.scrollTo({ top: v.scrollTop + h.getBoundingClientRect().top - v.getBoundingClientRect().top - 6 }); }
  else if (a === 'intro') openIntro();
  else if (a === 'intro-goal') { INTRO.goal = el.dataset.goal; S.settings.goal = INTRO.goal; save(); introStep(2); }
  else if (a === 'intro-weight') { const v = +document.getElementById('intro-weight').value; if (!(v >= 30 && v <= 200)) { toast('Enter a weight between 30 and 200 kg'); return; } S.settings.weight = v; S.settings.proteinTarget = P.proteinTargetFor(v, INTRO.goal || S.settings.goal); S.settings.kcalTarget = P.kcalTargetFor(v, INTRO.goal || S.settings.goal); save(); introStep(3); }
  else if (a === 'intro-budget') { S.settings.budget = +el.dataset.budget; save(); introStep(4); }
  else if (a === 'intro-budget-custom') { const raw = document.getElementById('intro-budget').value.trim(); const v = raw ? +raw : S.settings.budget; if (!(v >= 10 && v <= 300)) { toast('Type a budget between £10 and £300, or tap one above'); return; } S.settings.budget = v; save(); introStep(4); } // Next with nothing typed keeps the highlighted amount
  else if (a === 'intro-milk') { S.settings.milk = id; save(); el.parentElement.querySelectorAll('.opt').forEach((b) => b.classList.toggle('on', b === el)); }
  else if (a === 'intro-avoid') { const i = S.settings.avoid.indexOf(id); if (i >= 0) S.settings.avoid.splice(i, 1); else S.settings.avoid.push(id); save(); el.classList.toggle('on'); }
  else if (a === 'intro-avoid-add') { if (addAvoidText('intro-avoid-text')) introStep(4); else toast('Type something first'); }
  else if (a === 'intro-avoid-rm') { removeAvoidText(el.dataset.term); introStep(4); }
  else if (a === 'settings-avoid-add') { if (addAvoidText('settings-avoid-text')) render(); else toast('Type something first'); }
  else if (a === 'settings-avoid-rm') { removeAvoidText(el.dataset.term); render(); }
  else if (a === 'intro-next') { introStep(INTRO.step + 1); }
  else if (a === 'intro-back') { introStep(Math.max(1, INTRO.step - 1)); }
  else if (a === 'intro-done') { S.settings.onboarded = true; save(); closeIntro(); S.tab = 'plan'; for (const wk of Object.values(S.weeks)) relayout(wk); render({ top: true }); }
  else if (a === 'suggest-targets') { S.settings.proteinTarget = P.proteinTargetFor(S.settings.weight, S.settings.goal); S.settings.kcalTarget = P.kcalTargetFor(S.settings.weight, S.settings.goal); save(); render(); toast(`${S.settings.proteinTarget}g protein, ${S.settings.kcalTarget.toLocaleString()} kcal a day`); }
  else if (a === 'sinc' || a === 'sdec') { w.snacks[id] = Math.max(0, (w.snacks[id] || 0) + (a === 'sinc' ? 1 : -1)); if (!w.snacks[id]) delete w.snacks[id]; save(); refreshPlan(); }
  else if (a === 'fresh-default') { if (el.dataset.on === '1') S.freshDefault[id] = true; else delete S.freshDefault[id]; save(); render(); toast(el.dataset.on === '1' ? 'Made fresh each time, not batched' : 'Back on the batch list'); }
  else if (a === 'signout') { signOut().then(() => { gateScreen(); render(); }); }
  else if (a === 'gate-refresh') { recheckAccess(true); }
  else if (a === 'buy') { S.buyStarted = Date.now(); save(); }
  else if (a === 'auth-mode') { e.preventDefault(); S.authMode = el.dataset.mode; gateScreen(); }
  else if (a === 'auth-forgot') {
    e.preventDefault(); const f = document.getElementById('signin-form'); const email = f?.email?.value?.trim(); const msg = f?.querySelector('#signin-msg');
    const show = (cls, text) => { if (msg) { msg.hidden = false; msg.className = `signin-msg ${cls}`; msg.textContent = text; } else toast(text); };
    if (!email) { show('bad', 'Type your email above first, then tap Forgot password.'); return; }
    resetPassword(email).then(() => show('ok', `Reset link sent to ${email}. It can take a few minutes; check spam.`)).catch((err) => show('bad', `Couldn't send a reset link: ${err.message}`));
  }
  else if (a === 'gate-retry') { location.reload(); }
  else if (a === 'plan-filter') { S.planFilter = el.dataset.filter; save(); render(); const h = document.getElementById('pick-head'); if (h) h.scrollIntoView({ block: 'start' }); }
  else if (a === 'go-pantry') { e.preventDefault(); pantryBase = null; S.prevTab = S.tab; S.tab = 'pantry'; save(); render({ top: true }); }
  else if (a === 'go-ideas') { S.tab = 'recipes'; S.ideasOpen = true; save(); render({ top: true }); }
  else if (a === 'ideas-toggle') { S.ideasOpen = !S.ideasOpen; save(); render(); }
  else if (a === 'idea-tag') { S.ideaTag = el.dataset.tag; save(); render(); }
  else if (a === 'lib-add') { if (!S.library.includes(id)) S.library.push(id); save(); closeSheet(); render(); toast('Added to your recipes'); }
  else if (a === 'lib-remove') { S.library = S.library.filter((x) => x !== id); for (const wk of Object.values(S.weeks)) { delete wk.portions[id]; delete wk.snacks?.[id]; relayout(wk); } save(); closeSheet(); render(); toast('Removed from your recipes'); }
  else if (a === 'clear-pantry') { ask(`Untick everything for ${weekLabel(S.activeWeek).toLowerCase()}? The shop list will then include every ingredient.`, 'Untick all').then((ok) => { if (ok) { w.pantry = {}; save(); render(); toast('Pantry cleared'); } }); }
  else if (a === 'clear-week') { ask(`Clear every meal from ${weekLabel(S.activeWeek).toLowerCase()}?`, 'Clear week', true).then((ok) => { if (ok) { w.portions = {}; w.ticks = {}; relayout(); render(); } }); }
  else if (a === 'close-sheet') closeSheet();
  else if (a === 'cell' && picked) { dropPicked(el); }
  else if (a === 'cell' && isPast(+el.dataset.day)) { pastCell(w, +el.dataset.day, el.dataset.slot); }
  else if (a === 'cell') {
    const day = +el.dataset.day, slot = el.dataset.slot;
    const cur = w.grid[day][slot];
    const planned = Object.keys(w.portions).map(recById).filter(Boolean);
    const others = REC().filter((r) => !w.portions[r.id] && !isAvoided(r));
    const opt = (r) => `<option value="${r.id}" ${cur === r.id ? 'selected' : ''}>${esc(r.name)}</option>`;
    const tubs = Object.entries(S.tubs).filter(([, n]) => n > 0);
    const tubOpts = tubs.map(([id, n]) => `<option value="tub:${id}" ${cur === 'tub:' + id ? 'selected' : ''}>${esc(recById(id)?.name || id)} · freezer tub (${n} left)</option>`).join('');
    const r = P.isRecipeCell(cur) ? recById(cur) : null;
    const freshRow = r && r.cookMinutes > 0 ? `<label class="check"><input type="checkbox" id="cell-fresh" ${w.fresh[`${day}-${slot}`] ? 'checked' : ''}><span>Make this one fresh on the day<span class="sub">Left out of the batch cook; still on the shop list.</span></span></label>` : '';
    const has = P.isRecipeCell(cur) || P.isTub(cur);
    const quick = `<div class="cellquick">${has ? `<button class="btn ghost" data-action="cell-move" data-day="${day}" data-slot="${slot}"><b>↔ Move it</b><span>then tap its new slot</span></button>` : ''}${P.isOut(cur) ? `<button class="btn ghost" data-action="cell-unskip" data-day="${day}" data-slot="${slot}"><b>↩ Un-skip</b><span>make this slot free again</span></button>` : `<button class="btn ghost" data-action="cell-skip" data-day="${day}" data-slot="${slot}"><b>✕ Skip this meal</b><span>nothing is bought for it</span></button>`}</div>`;
    openSheet(`<h3>${P.DAYS[day]} ${slot}</h3>${quick}<label class="field">${has ? 'Or swap it for' : 'Or put a meal here'}<select id="cell-pick"><option value="" ${!cur ? 'selected' : ''}>— empty —</option><option value="out" ${P.isOut(cur) ? 'selected' : ''}>Skip this meal (or eating out)</option>${tubOpts ? `<optgroup label="From the freezer">${tubOpts}</optgroup>` : ''}<optgroup label="Picked this week">${planned.map(opt).join('')}</optgroup><optgroup label="Everything else">${others.map(opt).join('')}</optgroup></select></label>${freshRow}<button class="btn block" data-action="cell-set" data-day="${day}" data-slot="${slot}">Set</button>`);
  } else if (a === 'cell-move') { // same as press-and-hold: lift it, then the next tap on the grid is where it goes
    const c = cellAt(+el.dataset.day, el.dataset.slot); closeSheet(); if (c) { pickUp(c); c.scrollIntoView({ block: 'nearest' }); }
  } else if (a === 'cell-skip') { document.getElementById('cell-pick').value = 'out'; document.querySelector('#sheet [data-action="cell-set"]').click();
  } else if (a === 'cell-unskip') { document.getElementById('cell-pick').value = ''; document.querySelector('#sheet [data-action="cell-set"]').click();
  } else if (a === 'cell-set') {
    const day = +el.dataset.day, slot = el.dataset.slot, val = document.getElementById('cell-pick').value || null;
    const key = `${day}-${slot}`; const cur = w.grid[day][slot];
    const freshBox = document.getElementById('cell-fresh');
    const apply = () => {
      if (P.isTub(cur) && val !== cur) S.tubs[P.tubRecipe(cur)] = (S.tubs[P.tubRecipe(cur)] || 0) + 1; // putting a tub back
      if (P.isTub(val) && val !== cur) { const rid = P.tubRecipe(val); if (!(S.tubs[rid] > 0)) { toast('No tubs of that left'); return; } S.tubs[rid] -= 1; }
      w.grid[day][slot] = val;
      if (freshBox && val === cur) { if (freshBox.checked) w.fresh[key] = true; else delete w.fresh[key]; } else delete w.fresh[key];
      portionsFromGrid(); closeSheet(); refreshPlan();
    };
    const cooked = cookDate(w, S.activeWeek) <= iso(new Date()); // the batch cook for this week has been and gone
    if (P.isOut(val) && P.isRecipeCell(cur) && recById(cur)?.cookMinutes > 0 && cooked) {
      closeSheet();
      ask(`Have you already cooked that ${shortName(recById(cur)).toLowerCase()}? Yes puts the spare portion in your freezer for another week.`, 'Yes, it\'s cooked').then((cooked) => { if (cooked) { S.tubs[cur] = (S.tubs[cur] || 0) + 1; w.grid[day][slot] = 'out'; delete w.fresh[key]; portionsFromGrid(); refreshPlan(); } else apply(); });
      return;
    }
    apply();
  } else if (a === 'open-recipe') { const r = recById(id); if (r) openSheet(recipeDetail(r)); }
  else if (a === 'tweak-open') { openSheet(tweakSheet(id)); }
  else if (a === 'tweak-done') { const r = recById(id); for (const wk of Object.values(S.weeks)) relayout(wk); if (r) openSheet(recipeDetail(r)); else closeSheet(); render(); }
  else if (a === 'tweak-reset') { delete (S.tweaks || {})[id]; SCALED = { f: null, list: null, n: 0 }; META.clear(); save(); openSheet(tweakSheet(id)); }
  else if (a === 'tweak-rm-add') { setTweak(id, (t) => t.add.splice(+el.dataset.i, 1)); openSheet(tweakSheet(id)); }
  else if (a === 'tweak-swap') { const from = el.dataset.from, to = el.dataset.to; setTweak(id, (t) => { if (!t.drop.includes(from)) t.drop.push(from); t.add = t.add.filter((x) => x.for !== from); if (to) t.add.push({ id: to, qty: +el.dataset.qty, for: from }); }); openSheet(tweakSheet(id)); }
  else if (a === 'tweak-add') { const iid = document.getElementById('tweak-add-id').value, q = +document.getElementById('tweak-add-qty').value; if (!(q > 0)) { toast('Type how much per portion'); return; } setTweak(id, (t) => t.add.push({ id: iid, qty: q })); openSheet(tweakSheet(id)); }
  else if (a === 'add-portion') { w.portions[id] = (w.portions[id] || 0) + 1; relayout(); closeSheet(); S.tab = 'plan'; render({ top: true }); }
  else if (a === 'delete-recipe') { ask('Delete this recipe?', 'Delete', true).then((ok) => { if (ok) { S.customRecipes = S.customRecipes.filter((r) => r.id !== id); META.clear(); for (const wk of Object.values(S.weeks)) { delete wk.portions[id]; relayout(wk); } closeSheet(); render(); } }); }
  else if (a === 'add-recipe') { openSheet(recipeForm()); addIngRow(); }
  else if (a === 'add-link') openSheet(linkForm());
  else if (a === 'inbox-rm') { S.inbox.splice(+el.dataset.i, 1); save(); render(); }
  else if (a === 'inbox-copy') {
    const txt = 'Please add these to Fuel as priced recipes:\n' + S.inbox.map((x) => `- ${x.url}${x.note ? ` (${x.note})` : ''}`).join('\n');
    (navigator.clipboard?.writeText(txt) || Promise.reject()).then(() => toast('Copied. Paste it to Claude.'), () => showText('Copy this and paste it to Claude', txt));
  }
  else if (a === 'add-ing-row') addIngRow();
  else if (a === 'rm-row') el.closest('.ing-row').remove();
  else if (a === 'new-ingredient') openSheet(newIngredientForm());
  else if (a === 'export') {
    const txt = JSON.stringify({ weeks: S.weeks, activeWeek: S.activeWeek, customRecipes: S.customRecipes, customIngredients: S.customIngredients, settings: S.settings, inbox: S.inbox });
    (navigator.clipboard?.writeText(txt) || Promise.reject()).then(() => toast('Backup copied. Paste it somewhere safe.'), () => showText('Copy this backup', txt));
  } else if (a === 'import') {
    askText('Paste your backup', 'Paste the backup text here').then((txt) => { if (!txt) return; try { Object.assign(S, JSON.parse(txt)); setupWeeks(); render(); toast('Backup restored'); } catch { toast('That did not look like a backup.'); } });
  } else if (a === 'reset') { ask('Wipe plans, pantry and your own recipes on this phone?', 'Wipe', true).then((ok) => { if (ok) { localStorage.removeItem(KEY); location.reload(); } }); }
}
function addIngRow() { const t = document.getElementById('ing-row-t'); document.getElementById('ing-rows').appendChild(t.content.cloneNode(true)); }
// Ticking/unticking an ingredient in the "change the ingredients" sheet.
function onTweakChange(e) {
  const td = e.target.closest('[data-tweak-drop]'); if (!td) return false;
  const rid = e.target.closest('.sheet-inner')?.querySelector('[data-action="tweak-done"]')?.dataset.id;
  if (rid) { setTweak(rid, (t) => { const i = t.drop.indexOf(td.dataset.tweakDrop); if (td.checked) { if (i >= 0) t.drop.splice(i, 1); t.add = t.add.filter((x) => x.for !== td.dataset.tweakDrop); } else if (i < 0) t.drop.push(td.dataset.tweakDrop); }); openSheet(tweakSheet(rid)); }
  return true;
}
function onChange(e) {
  const t = e.target; const w = W();
  if (t.dataset.pick) {
    const r = recById(t.dataset.pick);
    const room = P.roomFor(r, P.freeSlots(w.grid, w.days));
    if (t.checked) { if (room <= 0) { t.checked = false; return; } w.portions[r.id] = Math.min(defaultPortions(r), room); } else delete w.portions[r.id];
    relayout(); refreshPlan();
  }
  else if (t.dataset.snackPick) { const r = recById(t.dataset.snackPick); if (t.checked) w.snacks[r.id] = 7; else delete w.snacks[r.id]; save(); refreshPlan(); }
  else if (t.dataset.settingStr) { S.settings[t.dataset.settingStr] = t.value; save(); }
  else if (t.dataset.tick) { w.ticks[t.dataset.tick] = t.checked; t.closest('.line').classList.toggle('done', t.checked); if (shopDone(w) !== !!w.done) render(); save(); }
  else if (t.dataset.settingBool) { S.settings[t.dataset.settingBool] = t.checked; save(); render(); }
  else if (t.dataset.settingStr) { S.settings[t.dataset.settingStr] = t.value; SCALED = { f: null, list: null, n: 0 }; META.clear(); save(); render(); }
  else if (t.dataset.pantry) {
    const id = t.dataset.pantry; if (t.checked) w.pantry[id] = true; else { delete w.pantry[id]; delete (w.useUp || {})[id]; } save();
    const it = ingById(id); const rowEl = t.closest('.check'); const q = rowEl.querySelector('[data-pantry-qty]');
    if (t.checked && !it.staple && !q) rowEl.insertAdjacentHTML('beforeend', `<input class="qty" type="number" step="any" placeholder="plenty" data-pantry-qty="${id}"><span class="small muted">${it.unit === 'each' ? '' : it.unit}</span>`);
    if (!t.checked) { q?.nextElementSibling?.remove(); q?.remove(); rowEl.querySelector('.useup')?.remove(); rowEl.querySelector('.sub')?.remove(); }
    else if (!rowEl.querySelector('.useup')) rowEl.querySelector('.grow').insertAdjacentHTML('afterend', `<button class="chip small useup" data-action="useup" data-id="${id}" title="Plan meals that use this up">Use up</button>`);
    refreshPantryPrice();
  }
  else if (t.dataset.pantryQty !== undefined) { const v = parseFloat(t.value); w.pantry[t.dataset.pantryQty] = Number.isFinite(v) && v > 0 ? v : true; save(); refreshPantryPrice(); }
  else if (t.dataset.setting) { S.settings[t.dataset.setting] = +t.value || 0; save(); META.clear(); const mp = document.getElementById('macro-preview'); if (mp) mp.innerHTML = macroPreview(S.settings.kcalTarget, S.settings.proteinTarget); }
}
function onInput(e) {
  if (['proteinTarget', 'kcalTarget'].includes(e.target.dataset.setting)) {
    const k = e.target.dataset.setting, v = +e.target.value; const b = e.target.closest('label').querySelector('b'); if (b) b.textContent = k === 'kcalTarget' ? v.toLocaleString() : v + 'g';
    const p = k === 'proteinTarget' ? v : S.settings.proteinTarget, c = k === 'kcalTarget' ? v : S.settings.kcalTarget;
    const mp = document.getElementById('macro-preview'); if (mp) mp.innerHTML = macroPreview(c, p); return;
  }
  const t = e.target;
  if (t.dataset.search !== undefined) { S.search = t.value; refreshCard(renderRecipes); }
  else if (t.dataset.pantrySearch !== undefined) { S.pantrySearch = t.value; const keep = document.activeElement; render(); const inp = document.querySelector('[data-pantry-search]'); if (inp) { inp.focus(); inp.setSelectionRange(inp.value.length, inp.value.length); } }
  else if (t.dataset.planSearch !== undefined) { S.planSearch = t.value; const pick = document.getElementById('plan-pick'); if (pick) pick.innerHTML = planPickHtml(); else render(); }
  else if (t.dataset.extraSearch !== undefined) { const tmp = document.createElement('div'); tmp.innerHTML = extrasSheet(t.value); document.getElementById('extra-list').innerHTML = tmp.querySelector('#extra-list').innerHTML; }
}
function refreshCard(fn) { const v = document.getElementById('view'); const card = v.querySelector('.card'); if (card) { const tmp = document.createElement('div'); tmp.innerHTML = fn(); card.innerHTML = tmp.querySelector('.card').innerHTML; } }
function onSubmit(e) {
  e.preventDefault();
  const f = e.target; const fd = new FormData(f);
  if (f.id === 'signin-form') {
    const email = String(fd.get('email')).trim(); const password = String(fd.get('password') || '');
    const mode = f.dataset.mode || 'signin';
    const msg = f.querySelector('#signin-msg'); const b = f.querySelector('button[type=submit]'); const label = b.textContent;
    const show = (cls, text) => { if (msg) { msg.hidden = false; msg.className = `signin-msg ${cls}`; msg.textContent = text; } else toast(text); };
    b.disabled = true; b.textContent = mode === 'signup' ? 'Creating…' : 'Signing in…';
    (mode === 'signup' ? signUp(email, password) : signIn(email, password))
      .then(() => { show('ok', mode === 'signup' ? 'Account created. Loading…' : 'Signed in. Loading…'); })
      .catch((err) => {
        b.disabled = false; b.textContent = label; const m = String(err.message || '');
        const friendly = /invalid login/i.test(m) ? 'Wrong email or password. New here? Tap "Create an account".'
          : /already registered|already exists/i.test(m) ? 'That email already has an account. Sign in instead.'
          : /password.*(short|least|characters)/i.test(m) ? 'Password needs to be at least 8 characters.'
          : /rate limit/i.test(m) ? 'Too many attempts. Wait a minute and try again.'
          : /invalid/i.test(m) ? 'That email address doesn\'t look right.' : m;
        show('bad', friendly);
      });
    return;
  }
  if (f.id === 'code-form') {
    const code = String(fd.get('code') || '').trim(); const msg = f.querySelector('#code-msg'); const b = f.querySelector('button[type=submit]');
    const show = (cls, text) => { msg.hidden = false; msg.className = `signin-msg ${cls}`; msg.textContent = text; };
    b.disabled = true;
    redeemCode(code).then((d) => { show('ok', `Code accepted. You have ${d.plan === 'founder' ? 'founder access' : 'full access'}${d.expires_at ? ` until ${fmtDate(String(d.expires_at).slice(0, 10))}` : ''}.`); setTimeout(() => { gateScreen(); render(); }, 900); })
      .catch((err) => { b.disabled = false; show('bad', err.message || 'Code not accepted'); });
    return;
  }
  if (f.id === 'link-form') {
    S.inbox = (S.inbox || []).concat([{ url: String(fd.get('url')).trim(), note: String(fd.get('note') || '').trim(), added: new Date().toISOString().slice(0, 10) }]);
    save(); closeSheet(); render(); return;
  }
  if (f.id === 'ing-form') {
    const name = fd.get('name').trim(); const id = 'c_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    S.customIngredients = S.customIngredients.filter((i) => i.id !== id).concat([{ id, name, unit: fd.get('unit'), protein: +fd.get('protein') || 0, category: fd.get('category'), store: fd.get('store'), packs: [] }]);
    save(); openSheet(recipeForm()); addIngRow(); return;
  }
  if (f.id === 'recipe-form') {
    const name = fd.get('name').trim(); const id = 'c_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const slots = fd.getAll('slot'); if (!slots.length) { toast('Pick at least one slot.'); return; }
    const ings = [...f.querySelectorAll('.ing-row')].map((r) => ({ id: r.querySelector('[name=ing]').value, qty: +r.querySelector('[name=qty]').value })).filter((x) => x.qty > 0);
    if (!ings.length) { toast('Add at least one ingredient.'); return; }
    const method = String(fd.get('method')).split('\n').map((s) => s.trim()).filter(Boolean);
    const r = { id, name, slots, cold: !!fd.get('cold'), reheat: fd.get('reheat'), fridgeDays: +fd.get('fridgeDays') || 0, freezer: !!fd.get('freezer'), cookMinutes: +fd.get('cookMinutes') || 0, equipment: [], source: fd.get('source') || 'yours', ingredients: ings, method, notes: '' };
    S.customRecipes = S.customRecipes.filter((x) => x.id !== id).concat([r]); if (S.library && !S.library.includes(id)) S.library.push(id); META.clear(); save(); closeSheet(); render(); toast('Saved to your recipes');
  }
}

boot();
