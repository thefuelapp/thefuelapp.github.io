import * as P from './planner.js';
import { CONFIG } from './config.js';
import { cloud, initCloud, onCloudChange, signIn, signUp, resetPassword, redeemCode, signOut, hasAccess, pullState, pushStateSoon } from './cloud.js';

const KEY = 'fuel:v1';
const APP_VERSION = 'v79';
const DATA = { ingredients: [], recipes: [] };
const S = load();
if (S.tab === 'settings') S.tab = S.prevTab && S.prevTab !== 'settings' ? S.prevTab : 'plan';

function load() {
  const base = { tab: 'plan', activeWeek: null, weeks: {}, tubs: {}, customRecipes: [], customIngredients: [], inbox: [], settings: { portion: 1, weight: 85, goal: 'build', proteinTarget: 180, snackProtein: 24, budget: 50, avoid: [] } };
  try { return { ...base, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return base; }
}
function syncable() { const { tab, search, planSearch, planFilter, pantrySearch, pantryRestOpen, ideasOpen, ideaTag, ...rest } = S; return rest; }
function save() { S.updatedAt = new Date().toISOString(); try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} pushStateSoon(syncable); }

// ING(), RAW(), weekFactor() and REC() are asked for dozens of times per tap, so each remembers its last answer and rebuilds only when what it is made from changes.
// The keys: the data arrays themselves (replaced on load), the custom lists (replaced or pushed to), the tweaks, the calorie target and the week's grid, days and snacks.
// Anything NEW that edits a recipe or ingredient object in place must call bustCaches().
let ING_C = { a: null, b: null, n: -1, list: [] };
const ING = () => { const a = DATA.ingredients, b = S.customIngredients || []; if (ING_C.a !== a || ING_C.b !== b || ING_C.n !== b.length) ING_C = { a, b, n: b.length, list: a.concat(b) }; return ING_C.list; };
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
let RAW_C = { a: null, b: null, n: -1, t: '', ing: null, list: [] };
const RAW = () => { const a = DATA.recipes, b = S.customRecipes || [], t = JSON.stringify(S.tweaks || {}), ing = ING(); if (RAW_C.a !== a || RAW_C.b !== b || RAW_C.n !== b.length || RAW_C.t !== t || RAW_C.ing !== ing) RAW_C = { a, b, n: b.length, t, ing, list: a.concat(b).map(applyTweak) }; return RAW_C.list; };
const RAW_ORIGINAL = (id) => DATA.recipes.concat(S.customRecipes).find((r) => r.id === id);
let SCALED = { f: null, list: null, n: 0 };
let RECF = { raw: null, m: new Map() }; // recipes sized for a week that isn't the live one, by factor (see recFor)
const FACTORS = new Map(); // weekFactor answers, keyed by calorie target + the week's grid, days and snacks
// Forget everything worked out from recipes, ingredients, tweaks or settings. Cheap to call; the next draw rebuilds what it needs.
function bustCaches() { RECF = { raw: null, m: new Map() }; ING_C = { a: null, b: null, n: -1, list: [] }; RAW_C = { a: null, b: null, n: -1, t: '', ing: null, list: [] }; SCALED = { f: null, list: null, n: 0 }; FACTORS.clear(); META.clear(); }
// Meals (not snacks) are scaled so the active week's picks land on the calorie target.
function mealsKcalAt1x(w) {
  const raw = RAW(); const ing = ING(); const rec = (RAW_C.byId ||= Object.fromEntries(raw.map((r) => [r.id, r])));
  const active = (w.days || []).filter(Boolean).length || 1;
  let meals = 0, snacks = 0;
  let cells = 0, skipped = 0; const by = {}; // by[slot] = { kcal, n } of what IS planned there, so an empty breakfast is filled in as a breakfast, not as a dinner
  (w.grid || []).forEach((d, i) => { if (!w.days[i]) return; for (const sl of P.SLOTS) { const v = d[sl]; const o = (by[sl] ||= { kcal: 0, n: 0, gaps: 0 }); if (P.isOut(v) || !v) { skipped += 1; o.gaps += 1; continue; } const rid = P.isTub(v) ? P.tubRecipe(v) : v; if (rid && rec[rid]) { const k = P.kcalPerPortion(rec[rid], ing); meals += k; cells += 1; o.kcal += k; o.n += 1; } } });
  // A skipped slot is a meal eaten somewhere else, and an EMPTY slot is a meal not picked yet: neither is a reason to make every other portion bigger, so each counts as an average meal
  // (the average for that slot when there is one). Without this a half-picked week hit the 2.5× cap: "160g protein a portion", "23 tins of tuna".
  if (cells && skipped) { const avg = meals / cells; for (const o of Object.values(by)) meals += (o.n ? o.kcal / o.n : avg) * o.gaps; }
  for (const [id, n] of Object.entries(w.snacks || {})) if (rec[id] && n) snacks += P.kcalPerPortion(rec[id], ing) * n;
  return { meals: meals / active, snacks: snacks / active };
}
function weekFactor(w, kcalTarget = S.settings.kcalTarget) {
  if (!w || !w.grid) return 1;
  // Remembered: this is asked ~70 times per tap and each answer used to cost a pass over the whole week. If the sum ever depends on more (goal, weight), add it to the key.
  const raw = RAW(), ing = ING(); const key = `${kcalTarget}|${JSON.stringify(w.grid)}|${JSON.stringify(w.days)}|${JSON.stringify(w.snacks || {})}`;
  let c = FACTORS.get(key);
  if (!c || c.raw !== raw || c.ing !== ing) {
    const { meals, snacks } = mealsKcalAt1x(w);
    const f = !meals || !kcalTarget ? 1 : Math.round(Math.min(2.5, Math.max(0.6, (kcalTarget - snacks) / meals)) * 20) / 20; // 0.6× to 2.5× the written recipe
    if (FACTORS.size > 12) FACTORS.clear();
    c = { f, raw, ing }; FACTORS.set(key, c);
  }
  return c.f;
}
const scaleBy = (raw, f) => raw.map((r) => (r.slots.includes('snack') ? r : { ...r, ingredients: r.ingredients.map((x) => ({ id: x.id, qty: Math.round(x.qty * f * 100) / 100 })) }));
const REC = () => {
  const raw = RAW(); const w = S.weeks?.[S.activeWeek];
  const f = weekFactor(w);
  if (SCALED.f !== f || SCALED.raw !== raw) { SCALED = { f, raw, n: raw.length, list: scaleBy(raw, f) }; META.clear(); }
  return SCALED.list;
};
// The same recipes sized for ANY week object: the other week, or a what-if copy of this one (Shop's "Switch" buttons price a change on a copy, never on the live week). Leaves SCALED and META alone.
function recFor(w) {
  if (!w || w === S.weeks?.[S.activeWeek]) return REC();
  const raw = RAW(), f = weekFactor(w); if (SCALED.raw === raw && SCALED.f === f && SCALED.list) return SCALED.list;
  if (RECF.raw !== raw || RECF.m.size > 8) RECF = { raw, m: new Map() };
  if (!RECF.m.has(f)) RECF.m.set(f, scaleBy(raw, f)); return RECF.m.get(f);
}
const inLibrary = (id) => !S.library || S.library.includes(id);
const ingById = (id) => ING().find((i) => i.id === id);
// What actually gets bought for an ingredient id: the week's fruit pick, thighs instead of breast.
function resolveFor(w, thigh = S.settings.preferThigh) { // thigh can be passed in so a what-if price never has to flip the real setting
  return (id) => {
    if (id === 'chicken_breast' && thigh) return 'chicken_thigh';
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
// Today as a local calendar day (same trick as mondayOf; iso(new Date()) is a day behind just after midnight in BST).
const todayISO = () => { const d = new Date(); return iso(new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))); };
// Optional use-by dates: S.useBy = { ingredientId: 'YYYY-MM-DD' }. Lives outside the weeks because the food does. Absent = none, so old saved data just works.
const perishable = (it) => !!it && !it.staple && it.category !== 'tin';
function useByDue() { const t = todayISO(); return Object.entries(S.useBy || {}).map(([id, date]) => ({ id, date, it: ingById(id), ...(P.useByState(date, t) || {}) })).filter((x) => x.it && (x.state === 'soon' || x.state === 'past')).sort((a, b) => a.days - b.days); }
// A date only makes sense while the thing is ticked as "got it" in some week; once it is unticked everywhere the date goes too.
function dropUseBy(id) { if (S.useBy && ![S.thisMon, S.nextMon].some((k) => S.weeks[k]?.pantry?.[id] !== undefined)) delete S.useBy[id]; }
// The ONE gentle banner (Pantry top, and inside the use-up card on Plan). Never blocks anything; past-date food gets no meal ideas, only the reminder.
function useByInner(where) {
  const due = useByDue(); if (!due.length) return '';
  const t = todayISO(), soon = due.filter((x) => x.state === 'soon'), past = due.filter((x) => x.state === 'past');
  return `<div class="warn-box useby-banner">${soon.length ? `<b>Use soon:</b> ${soon.map((x) => `${esc(x.it.name.toLowerCase())} (${P.useByDay(x.date, t)})`).join(', ')}. ` : ''}${past.length ? `<b>Past its date:</b> ${past.map((x) => esc(x.it.name.toLowerCase())).join(', ')}. If in doubt, throw it out.` : ''}<div class="row" style="margin-top:8px;gap:8px">${soon.length && where === 'pantry' ? `<button class="btn small" data-action="useby-meals">Meals that use ${soon.length > 1 ? 'them' : 'it'}</button>` : ''}<button class="btn small ghost" data-action="useby-clear">${due.length > 1 ? 'All dealt with' : 'Dealt with'}</button></div></div>`;
}
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
  S.useBy ||= {}; { const cut = addDays(todayISO(), -3); for (const [id, d] of Object.entries(S.useBy)) if (!(/^\d{4}-\d{2}-\d{2}$/.test(d) && d >= cut)) delete S.useBy[id]; } // optional use-by dates; long-gone ones tidy themselves away
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

// One line under each page title: where this page sits in Plan, Shop, Cook (n = 0 for the two extras).
const stepLine = (n, txt) => `<p class="stepline"><b>${n ? `Step ${n} of 3` : 'Extra'}</b>${txt}</p>`;

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
    DATA.ingredients = i.items; DATA.recipes = r.items; bustCaches(); DATA.priceNote = i.checkedNote; DATA.priceDate = (i.items.flatMap((x) => x.packs || []).map((p) => p.checked).sort().pop()) || '';
  } catch (e) {
    document.getElementById('view').innerHTML = `<div class="bad-box">Couldn't load the recipe data. ${esc(e.message)}</div>`;
    return;
  }
  setupWeeks();
  document.getElementById('tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { justAdded.clear(); if (b.dataset.tab !== S.tab) pantryBase = null; S.tab = b.dataset.tab; planAdd = null; save(); render({ top: true }); } });
  const v = document.getElementById('view');
  v.addEventListener('click', onAction); v.addEventListener('change', onChange); v.addEventListener('input', onInput);
  // Shop's "Where can I save?" fold: its switches are only worked out once it is opened. 'toggle' doesn't bubble, hence capture; the equality test stops the redrawn, already-open fold looping.
  v.addEventListener('toggle', (e) => { if (e.target.classList?.contains('pantry-rest') && !S.pantrySearch && !!S.pantryRestOpen !== e.target.open) { S.pantryRestOpen = e.target.open; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} } }, true); // this device only, so no cloud push
  v.addEventListener('toggle', (e) => { const id = e.target.dataset?.cook; if (id) { if (e.target.open) cookOpen.add(id); else cookOpen.delete(id); } }, true);
  v.addEventListener('toggle', (e) => { if (e.target.id !== 'savefold' || e.target.open === saveOpen) return; saveOpen = e.target.open; if (saveOpen) render(); }, true);
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
function rollWeeks() { const before = S.thisMon; setupWeeks(); if (S.thisMon !== before) { if (!S.weeks[S.activeWeek]) S.activeWeek = S.thisMon; planAdd = null; save(); render({ top: true }); toast('New week: your plan has moved along.'); } }
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
    const keepTab = S.tab; Object.assign(S, remote.data, { tab: keepTab }); bustCaches(); setupWeeks(); planAdd = null; save(); render(); toast('Synced from your account');
    if (S.settings.onboarded && introOpen()) closeIntro();
  } else pushStateSoon(syncable);
}

// The 1 and 2 on the tab bar turn into ticks: Plan once a meal is picked, Shop once the list is all ticked off. Cook never does (the app can't know you cooked).
function markTabs() { const w = W(); if (!w) return; const d = { plan: Object.values(w.portions || {}).some((n) => n > 0), shop: !!w.done }; document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('done', !!d[b.dataset.tab])); }
function render(opts = {}) {
  if (S.tab !== 'shop') { saveUndo = null; saveOpen = false; } // leaving Shop drops the Undo: the week may be edited elsewhere
  const view = document.getElementById('view'); const y = view.scrollTop;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === S.tab)); markTabs();
  const page = ({ plan: renderPlan, cook: renderCook, shop: renderShop, recipes: renderRecipes, pantry: renderPantry, settings: renderSettings })[S.tab] || renderPlan;
  view.classList.toggle('has-dock', page === renderPlan); // Plan ends in the sticky dock: #view's bottom padding is taken off the sticky area, which left the dock floating 48px above the tab bar
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
function suggestions(n = 6) { const list = REC(), ing = ING(), raw = (RAW_C.byId ||= Object.fromEntries(RAW().map((r) => [r.id, r]))); // ranked on the recipe as written: protein per £ is the same at any portion size, but the rounded resized numbers are not, and the first Quick pick used to swap the chips under your thumb
  return list.filter((r) => inLibrary(r.id) && !r.slots.includes('snack') && !isAvoided(r) && r.cookMinutes > 0).map((r) => { const o = raw[r.id] || r, c = P.costPerPortion(o, ing).cost; return { r, score: c ? P.proteinPerPortion(o, ing) / c : 0 }; }).sort((a, b) => b.score - a.score).slice(0, n).map((x) => x.r); }
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
// The navy bar that stays at the bottom of the Plan page (inside #view, above the tab bar): how many meals are in, and the button for what comes next.
function planDock(w) {
  if (!planAdd) return `<div class="plandock two" id="plan-dock"><button class="btn ghost" data-action="plan-add">+ Add meals</button><button class="btn sun" data-action="go-tab" data-to="shop">Next: Shop</button></div>`;
  const st = P.gridStats(liveGrid(w), REC(), ING(), snackExtra(w), liveDays(w));
  if (!st.filled) return `<div class="plandock" id="plan-dock"><span class="grow"><b>Tick a meal to start</b><small>It goes straight into your week.</small></span></div>`;
  return `<div class="plandock" id="plan-dock"><span class="grow"><b>${st.filled >= st.slots ? `${st.slots} of ${st.slots} · week full` : `${st.filled} of ${st.slots} meals picked`}</b><small>${(w.overflow || []).length ? `Some portions won't fit` : `${st.avg}g protein · target ${S.settings.proteinTarget}g`}</small></span><button class="btn sun" data-action="plan-week">See my week</button></div>`;
}
function planTop(w) {
  const nudge = S.activeWeek === S.thisMon && (todayIdx() >= 5 || !liveDays(w).some(Boolean)) ? `<div class="card tipcard"><h3>${todayIdx() >= 6 ? 'This week is done' : 'This week is nearly done'}</h3><p class="small">Plan next week now so Sunday's cook and shop are sorted.</p><button class="btn small" data-action="week" data-week="${S.nextMon}">Plan next week</button></div>` : '';
  if (planAdd) return nudge; // Add meals view: the meal list is the page, so nothing above it may grow or shrink while you tick
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
  const tips = (S.tips && S.tips.plan) ? '' : `<div class="card tipcard"><h3>How Fuel works</h3><ol class="tips"><li><b>Plan.</b> Tick the meals you fancy. Fuel fits them into your week.</li><li><b>Shop.</b> Your list is priced at four supermarkets. Buy from the cheapest.</li><li><b>Cook.</b> Batch cook on ${DAY_FULL[w.cookDay]}, box it up, and the week is sorted.</li></ol><p class="small">Targets, budget and milk are under the ⚙ gear, top right.</p><button class="btn small" data-action="tip-done" data-tip="plan">Got it</button></div>`;
  const limitNote = st.filled < st.slots / 2 ? '' : weekFactor(w) >= 2.5 ? `These meals come to ${st.avgKcal.toLocaleString()} kcal a day even at the biggest portion size, under your ${kcalT.toLocaleString()} target. Add a snack or another meal to close the gap.` : weekFactor(w) <= 0.6 ? `These meals come to ${st.avgKcal.toLocaleString()} kcal a day even at the smallest portion size, over your ${kcalT.toLocaleString()} target. Drop a snack or a meal.` : '';
  const head = `<div class="card"><h3>Your numbers</h3>` + (chosen.length
    ? `<div class="stat-grid"><div class="stat"><b>${st.filled}<span>/${st.slots}</span></b><span>${gone ? 'meals to go' : 'meals planned'}</span></div><div class="stat"><b>${st.avg}g</b><span>protein a day<br>target ${target}g</span></div><div class="stat"><b>${st.avgKcal.toLocaleString()}</b><span>kcal a day<br>target ${kcalT.toLocaleString()}</span></div></div>
    ${limitNote ? `<p class="small muted" style="margin-top:8px">${limitNote}</p>` : ''}
    <div class="bars" style="margin-top:26px">${bars}</div><div class="bars-labels">${P.DAYS.map((d) => `<div>${d}</div>`).join('')}</div>
    <p class="small muted">Protein a day. Green is on target.</p>`
    : `<p><b>Nothing planned yet.</b></p><p class="small muted">Pick a few meals and Fuel fits them into your week.</p><button class="btn block" style="margin-top:10px" data-action="plan-add">Choose meals</button>`) + `${tubHtml}</div>`;
  return `${tips}${nudge}${dueOnPlan().length ? useUpCard(w, true) : ''}${head}
  ${hasGrid ? `<div class="card gridcard"><h3>Your week</h3><ul class="gridhelp"><li><b>Tap a meal</b> to swap it, move it or skip it. The ✕ under a day skips the whole day.</li></ul>${gridHtml}
    ${snackBar(w)}
    <p class="small muted" style="margin:12px 0 4px">Which day do you batch cook?</p>
    <div class="day-pick">${P.DAYS.map((d, i) => `<button data-action="cookday" data-day="${i}" class="${w.cookDay === i ? 'on' : ''}">${d}</button>`).join('')}</div>
    <div class="row" style="margin-top:10px"><button class="btn ghost small" data-action="relayout">Re-arrange the week</button><button class="btn ghost small" data-action="clear-week">Clear week</button></div></div>` : ''}
  ${installCard()}${overflow}${lateWarnings(w)}`;
}
function pickRow(r, w, free) {
  const n = w.portions[r.id] || 0;
  const full = P.roomFor(r, free) <= 0;
  return `<div class="recipe-row pick ${r.slots[0] === 'breakfast' ? 'breakfast' : 'mains'} ${n ? 'on' : ''} ${full && !n ? 'full' : ''}" data-row="${r.id}"><input type="checkbox" class="tick" data-pick="${r.id}" ${n ? 'checked' : ''} ${full && !n ? 'disabled' : ''} aria-label="Include ${esc(r.name)}"><div class="grow"><div class="name">${esc(r.name)}</div><div class="meta">${mealMeta(r)}${full && !n ? ' <span class="badge">week full</span>' : ''}</div></div>
      ${n ? `<div class="stepper"><button data-action="dec" data-id="${r.id}">−</button><b>${n}</b><button data-action="inc" data-id="${r.id}" ${full ? 'disabled' : ''}>+</button></div>` : ''}</div>`;
}
function snackRow(r, w) { const n = w.snacks[r.id] || 0; return `<div class="recipe-row pick snack ${n ? 'on' : ''}" data-row="${r.id}"><input type="checkbox" class="tick" data-snack-pick="${r.id}" ${n ? 'checked' : ''} aria-label="Include ${esc(r.name)}"><div class="grow"><div class="name">${esc(r.name)}</div><div class="meta">${mealMeta(r)}</div></div>${n ? `<div class="stepper"><button data-action="sdec" data-id="${r.id}">−</button><b>${n}</b><button data-action="sinc" data-id="${r.id}">+</button></div>` : ''}</div>`; }
// The 'use up' and 'Quick picks' cards under the search box. Their own function so refreshPlan() can keep them fresh (Quick picks goes once anything is ticked).
// The "use up" card: things marked Use up in Pantry, plus anything whose optional use-by date is within 3 days (worked out now, nothing stored).
// Past-date food never gets meal ideas. With a date due, the card moves to the top of "Your week" so it is seen; otherwise it sits under the search box as before.
const dueOnPlan = () => (S.activeWeek === S.thisMon ? useByDue() : []);
function useUpCard(w, top = false) {
  const due = dueOnPlan(), dueSoon = due.filter((x) => x.state === 'soon').map((x) => x.id);
  const marked = Object.keys(w.useUp || {}).filter((u) => !dueSoon.includes(u)); const upIds = [...dueSoon, ...marked]; const res = resolveFor(w);
  if (!upIds.length && !due.length) return '';
  const usesUp = (r) => upIds.filter((u) => r.ingredients.some((x) => x.id === u || res(x.id) === u || (ingById(x.id)?.choices || []).includes(u))); // res(): "use up chicken thighs" works when thighs stand in for breast
  const upList = upIds.length ? REC().filter((r) => !r.slots.includes('snack') && !isAvoided(r)).map((r) => ({ r, u: usesUp(r) })).filter((x) => x.u.length).sort((a, b) => (top ? !!w.portions[b.r.id] - !!w.portions[a.r.id] : 0) || b.u.length - a.u.length || (metaFor(b.r).pp / (metaFor(b.r).c.cost || 1)) - (metaFor(a.r).pp / (metaFor(a.r).c.cost || 1))).slice(0, top ? 5 : 8) : []; // above the grid: short, and meals already in the week first so you can see it is covered
  return `<div class="card" id="useup-card"><h3>${due.length ? 'Use these first' : `Use up what you've got`}</h3>${due.length ? useByInner('plan') : ''}${marked.length ? `<p class="small muted">You marked ${marked.map((u) => esc((ingById(u)?.name || u).toLowerCase())).join(', ')} to use up (Pantry).</p>` : ''}${upIds.length ? `<p class="small muted">${!upList.length ? 'None of your recipes use those yet.' : upList.some((x) => w.portions[x.r.id]) ? 'The ticked meals are already in your week. Tap another to add it.' : 'Tap a meal to add it to the week.'}</p>` : ''}${upList.length ? `<div class="chip-row">${upList.map(({ r, u }) => `<button class="chip ${w.portions[r.id] ? 'on' : ''}" data-action="quick-pick" data-id="${r.id}">${w.portions[r.id] ? '✓' : '+'} ${esc(shortName(r))} <span class="muted">· ${u.map((x) => esc((ingById(x)?.name || x).toLowerCase().split(' ')[0])).join(', ')}</span></button>`).join('')}</div>` : ''}</div>`;
}
function planSug(w) { return !planAdd && dueOnPlan().length ? '' : useUpCard(w); } // Quick picks went (21 Sep: "go straight to the meals"); use-up suggestions stay
function renderPlan() {
  const w = W(); const recipes = REC();
  if (planAdd === null) planAdd = !(Object.values(w.portions).some((n) => n > 0) || Object.values(S.tubs || {}).some((n) => n > 0) || Object.keys(lockedCells(w)).length); // same test as the grid: an empty week opens on the meal list
  const q = ''; // the search box went (21 Sep): an old saved search must never hide meals
  const free = P.freeSlots(w.grid, w.days);
  const mine = recipes.filter((r) => inLibrary(r.id) && !justAdded.has(r.id) && !r.slots.includes('snack'));
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
  // More meals: the recipes not in your list yet, as the same tickable rows. Ticking one adds it to your list AND your week, so "I don't fancy these" never means leaving Plan.
  const tag = S.ideaTag || ''; const extraAll = recipes.filter((r) => (!inLibrary(r.id) || justAdded.has(r.id)) && !r.slots.includes('snack') && !isAvoided(r)); const moreCount = extraAll.length;
  const extra = extraAll.filter((r) => !tag || tagsOf(r).has(tag));
  const moreHtml = !moreCount ? '' : planMore ? `<h2 class="pickgroup more" id="more-meals">More meals <span>${moreCount}</span></h2><div class="chip-row"><button class="chip ${!tag ? 'on' : ''}" data-action="idea-tag" data-tag="">All</button>${TAGS.filter(([k]) => k !== 'snack').map(([k, l]) => `<button class="chip ${tag === k ? 'on' : ''}" data-action="idea-tag" data-tag="${k}">${l}</button>`).join('')}</div>
    <div class="card pickcard more">${extra.map((r) => pickRow(r, w, free)).join('') || '<p class="small muted">Nothing under that filter.</p>'}</div><button class="btn ghost block" data-action="plan-more" style="margin-bottom:10px">Hide more meals</button>`
    : `<button class="btn ghost block" data-action="plan-more" id="more-meals" style="margin:4px 0 10px">+ More meals · ${moreCount}</button>`;
  const nBreak = visible.filter((r) => r.slots[0] === 'breakfast').length, nMain = visible.length - nBreak, nSnack = recipes.filter((r) => r.slots.includes('snack') && inLibrary(r.id) && !isAvoided(r)).length;
  const filterChips = `<div class="chip-row pickfilters">${[['all', 'All'], ['breakfast', `Breakfasts · ${nBreak}`], ['mains', `Mains · ${nMain}`], ['snack', `Snacks · ${nSnack}`]].map(([k, l]) => `<button class="chip ${filt === k ? 'on' : ''}" data-action="plan-filter" data-filter="${k}">${l}</button>`).join('')}${moreCount ? `<button class="chip more" data-action="plan-more">+ More meals · ${moreCount}</button>` : ''}</div>`;
  const nothing = q && !visible.some((r) => r.name.toLowerCase().includes(q)) && !snacks.length ? `<p class="muted">Nothing called "${esc(S.planSearch)}" in your recipes. Try Recipes → Find more meal ideas.</p>` : '';
  return `<h1>Plan</h1>${stepLine(1, planAdd ? 'Tick the meals you want this week.' : `Here's your week. Tap a meal to change it.`)}${weekSwitch()}<div id="plan-top">${planTop(w)}</div>
  <div class="card pickhead" id="pick-head"><h3>Choose your meals</h3>${filterChips}</div>
  <div id="plan-sug">${planSug(w)}</div>
  <div id="plan-pick">${nothing}${filt === 'snack' ? snackHtml : ''}${group('breakfast', 'Breakfasts')}${group('mains', 'Mains (lunch or dinner)')}
  ${filt === 'snack' ? '' : snackHtml}
  ${hidden ? `<p class="small muted">${hidden} recipe${hidden > 1 ? 's' : ''} hidden because of what you don't eat (see Settings).</p>` : ''}
  ${moreHtml}</div>${planDock(w)}`;
}
// Just the inside of #plan-pick, for the search box to refresh without redrawing the page.
function planPickHtml() { const tmp = document.createElement('div'); tmp.innerHTML = renderPlan(); return tmp.querySelector('#plan-pick').innerHTML; }
// Re-draw without the page moving under your thumb. iPhones don't keep your place when things above you grow or shrink
// (the week grid appears above the meal list on the first tick), so: note where a reference element sits on screen, redraw, scroll it back there.
// sel = a selector inside #view (looked up again after the redraw, because the element may have been replaced). No match = plain redraw.
function holdPlace(sel, fn) {
  const v = document.getElementById('view');
  const a0 = sel ? v.querySelector(sel) : null; const y0 = a0 ? a0.getBoundingClientRect().top : null;
  const oa = v.style.overflowAnchor; v.style.overflowAnchor = 'none'; // browsers that keep your place themselves would otherwise do it twice
  try { fn(); } finally {
    const a1 = y0 === null ? null : v.querySelector(sel);
    if (a1) { const d = a1.getBoundingClientRect().top - y0; if (Math.abs(d) >= 0.5) v.scrollTop += d; }
    v.style.overflowAnchor = oa;
  }
}
const rowSel = (id) => `.recipe-row.pick[data-row="${CSS.escape(id)}"]`;
// Re-draw only what changed on the Plan tab (top card/grid, the cards under the search box, each pick row), keeping `anchor` (the tapped row, or the grid) where it is on screen.
function refreshPlan(anchor = '.grid') {
  const top = document.getElementById('plan-top'); const w = W();
  if (!top || S.tab !== 'plan') { render(); return; }
  if (planAdd === false && !(Object.values(w.portions).some((x) => x > 0) || Object.values(S.tubs || {}).some((x) => x > 0) || Object.keys(lockedCells(w)).length)) { planAdd = null; holdPlace(anchor, () => render()); return; } // the last meal just went: "Here's your week" and "Next: Shop" would be wrong now, so fall back to the Add meals view (same test as renderPlan)
  holdPlace(anchor, () => {
    top.innerHTML = planTop(w);
    const sug = document.getElementById('plan-sug'); if (sug) { const h = planSug(w); if (sug._html !== h) { sug.innerHTML = h; sug._html = h; } }
    const free = P.freeSlots(w.grid, w.days); const tmp = document.createElement('div');
    document.querySelectorAll('.recipe-row.pick').forEach((rowEl) => {
      const r = recById(rowEl.dataset.row); if (!r) return;
      tmp.innerHTML = r.slots.includes('snack') ? snackRow(r, w) : pickRow(r, w, free); const fresh = tmp.firstElementChild;
      if (fresh.outerHTML === rowEl.outerHTML) return;
      const hadFocus = rowEl.contains(document.activeElement); rowEl.replaceWith(fresh);
      if (hadFocus) fresh.querySelector('input.tick')?.focus({ preventScroll: true });
    });
    const dock = document.getElementById('plan-dock'); if (dock) { const h = planDock(w); if (dock.outerHTML !== h) dock.outerHTML = h; }
  });
  markTabs();
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
  const head = `<h1>Cook</h1>${stepLine(3, 'Cook once, box it up.')}${weekSwitch()}`;
  if (!rs.list.length && !fresh.length) return `${head}<div class="card"><p><b>Nothing to cook yet.</b></p><p class="small muted">Pick your meals first and your cook list builds itself.</p><button class="btn block" style="margin-top:10px" data-action="go-tab" data-to="plan">Pick my meals</button></div>`;
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
    return `<details class="fold cookfold" data-cook="${r.id}" ${cookOpen.has(r.id) ? 'open' : ''}><summary><b>${esc(r.name)}</b><span class="muted small">${n} portion${n > 1 ? 's' : ''} · ${r.cookMinutes} min · ${r.equipment.join(', ')} · ${tp.fridge.length ? `${tp.fridge.length} fridge` : ''}${tp.fridge.length && tp.freezer.length ? ', ' : ''}${tp.freezer.length ? `${tp.freezer.length} freezer` : ''}</span></summary>
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
    </details>`;
  }).join('');
  return `${head}
  <div class="card"><h3>Batch cook on ${dayFull} ${cookOn}</h3><p class="small muted" style="margin:0 0 8px">About ${rs.minutes} min. Longest first, the rest alongside.</p><ol class="steps cooklist">${sheet}</ol>
  ${fresh.length ? `<h4 class="sub">Made fresh on the day</h4><ul class="clean">${freshList}</ul>` : ''}
  ${usesRice ? `<p class="small muted" style="margin-top:10px">Rice: freeze cooked rice the same day unless it's eaten within 24 hours.</p>` : ''}</div>
  <h2>Recipes <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:600">tap one to open it</span></h2>
  ${cards}
  ${S.activeWeek === S.thisMon ? `<div class="card nextcard"><b>All boxed up?</b><p class="small muted">That's the week sorted. When you're ready, line up the next one.</p><button class="btn block" data-action="go-tab" data-to="plan" data-week="${S.nextMon}">Plan next week</button></div>` : `<div class="card nextcard"><b>All boxed up?</b><p class="small muted">That's next week sorted.</p><button class="btn block" data-action="go-tab" data-to="plan">Back to Plan</button></div>`}`;
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
function shopNeeds(w, recipes, thigh = S.settings.preferThigh) {
  const counts = weekCounts(w, { live: true }); // days already eaten don't need buying
  const base = resolveFor(w, thigh);
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
// ONE place that prices a week's shop. Every screen that shows a shop total (Shop, Pantry bar, Settings, the shared list, the spend log) reads chosen.comparable from here, so two different totals can never show again.
// comparable = what you pay if you go to that shop, with anything it doesn't sell priced at the cheapest other shop. all = true prices the week as if the Pantry were empty.
function shopTotals(w, { recipes = recFor(w), all = false, thigh = S.settings.preferThigh } = {}) {
  const sn = shopNeeds(w, recipes, thigh); const isStock = (id) => !!ingById(id)?.staple;
  const ranked = P.compareShops(all ? sn.needsAll : sn.needs, ING()).map((b) => { const notSold = b.missing.filter((m) => (ingById(m.id)?.unavailable || []).includes(b.shop)); return { ...b, notSold, unpriced: b.missing.filter((m) => !notSold.includes(m)) }; });
  const byShop = Object.fromEntries(ranked.map((b) => [b.shop, b]));
  const cheapestElsewhere = (id, not) => { let m = null; for (const s of P.SHOPS) { if (s === not) continue; const l = byShop[s]?.lines.find((x) => x.id === id); if (l && (m === null || l.cost < m)) m = l.cost; } return m || 0; };
  for (const b of ranked) {
    b.elsewhere = P.round2(b.notSold.reduce((t, m) => t + cheapestElsewhere(m.id, b.shop), 0));
    b.comparable = P.round2(b.total + b.elsewhere); // THE price
    b.stock = P.round2(b.lines.filter((l) => isStock(l.id)).reduce((t, l) => t + l.cost, 0) + b.notSold.filter((m) => isStock(m.id)).reduce((t, m) => t + cheapestElsewhere(m.id, b.shop), 0)); // how much of THE price is one-off stock-ups
    b.weekly = P.round2(b.comparable - b.stock);
    b.elsewhereWeek = P.round2(b.notSold.filter((m) => !isStock(m.id)).reduce((t, m) => t + cheapestElsewhere(m.id, b.shop), 0));
  }
  ranked.sort((a, b) => (a.unpriced.length - b.unpriced.length) || (a.comparable - b.comparable));
  return { ...sn, ranked, byShop, cheapestElsewhere, isStock, best: ranked[0] || null, chosen: byShop[w.shop] || ranked[0] || null };
}
function tillNow(w, o) { const t = shopTotals(w, o); return Object.keys(t.needsAll).length && t.chosen ? { shop: t.chosen.shop, total: t.chosen.comparable, stock: t.chosen.stock } : null; }

// ----- Shop → "Where can I save?": switches Fuel can make for you -----
let saveUndo = null;  // the week as it was before the last switch. Memory only: never saved, never synced.
let saveOpen = false; // the fold stays open across the redraw a switch causes; the switches are only worked out while it is open
// A throwaway copy of a week to try a change on. The live week is never touched, so nothing can be saved or drawn half-changed.
const whatIf = (w) => ({ ...w, grid: w.grid.map((d) => ({ ...d })), fresh: { ...(w.fresh || {}) } });
// Make the changes on a week (the live one, or a copy). The thigh switch is a setting, not part of the week, so it is only reported back.
function applyIdeas(w, ideas) {
  let meals = 0, thigh = false;
  for (const x of ideas) {
    if (x.kind === 'swap') { for (const [i, sl] of P.swapRecipe(w.grid, x.from, x.to, todayIdx())) if (w.fresh) delete w.fresh[`${i}-${sl}`]; meals += 1; }
    else if (x.kind === 'shop') w.shop = x.shop;
    else if (x.kind === 'thigh') thigh = true;
  }
  return { meals, thigh };
}
// What the till would really come to with these switches made. Meals are resized to the calorie target from the grid and packs come in fixed sizes, so trying it is the only honest price.
function tillIf(w, ideas) { const x = whatIf(w); const r = applyIdeas(x, ideas); return tillNow(x, { thigh: r.thigh || S.settings.preferThigh })?.total ?? null; }
function saveIdeas(w) {
  const now = tillNow(w); const list = []; if (!now || !w.grid) return { list, all: 0 };
  const T0 = shopTotals(w); const started = T0.chosen.lines.some((l) => w.ticks?.[`${T0.chosen.shop}:${l.id}`]); if (started) return { list, all: 0, started }; // something is already in the basket (or the shop is done): a switch now would promise money that is already spent and rewrite the logged total
  const from = todayIdx(); const counts = P.gridCounts(liveGrid(w));
  const dear = Object.entries(counts).map(([rid, n]) => { const r = recById(rid); return r && !r.slots.includes('snack') ? { r, n, pp: metaFor(r).c.cost || 0, protein: metaFor(r).pp } : null; }).filter((m) => m && m.pp >= 1.5).sort((a, b) => b.pp * b.n - a.pp * a.n).slice(0, 3);
  const pool = suggestions(40).map((r) => ({ r, cost: metaFor(r).c.cost || 0, protein: metaFor(r).pp })); // suggestions() is already only your recipes, and nothing with a food you avoid
  const used = new Set(); const opts = [];
  for (const m of dear) {
    const slots = new Set(); w.grid.forEach((d, i) => { if (i >= from) for (const sl of P.SLOTS) if (d[sl] === m.r.id) slots.add(sl); });
    // a fair swap: not in the week already, cheaper a portion on paper, protein within 80%, allowed in every slot the old meal sits in. The paper price only shortlists (cheapest 12); the till decides.
    const cands = pool.filter((c) => c.r.id !== m.r.id && !isAvoided(c.r) && !counts[c.r.id] && c.cost > 0 && c.cost < m.pp && c.protein >= m.protein * 0.8 && [...slots].every((sl) => c.r.slots.includes(sl))).sort((a, b) => a.cost - b.cost).slice(0, 12);
    const ideas = [];
    for (const c of cands) {
      const idea = { kind: 'swap', key: `swap:${m.r.id}:${c.r.id}`, from: m.r.id, to: c.r.id, title: `Swap ${m.r.short || m.r.name} for ${c.r.short || c.r.name}`, sub: `${m.n} portion${m.n > 1 ? 's' : ''} · ${c.protein}g protein each instead of ${m.protein}g` };
      const x = whatIf(w); applyIdeas(x, [idea]); if (!P.keepsInPlace(c.r, x.grid, x.cookDay, freshMap(x))) continue; // it would go off where the old meal sits
      const t = tillNow(x)?.total ?? null; idea.save = t === null ? 0 : P.round2(now.total - t); if (idea.save >= 1) ideas.push(idea);
    }
    if (ideas.length) opts.push(ideas.sort((a, b) => b.save - a.save));
  }
  // Biggest saving first, so the top row is the best single switch and tapping down the list never undercuts a bigger promise further down.
  opts.sort((a, b) => b[0].save - a[0].save);
  for (const ideas of opts) {
    // Switches share packs (two chicken meals split one tray), so each one is priced twice: on its own (what its button promises) and on top of the switches already listed (so "make all" adds up to more, not less).
    let best = null; const soFar = list.length ? tillIf(w, list) : now.total;
    for (const idea of ideas) {
      if (used.has(idea.to)) continue;
      const t2 = list.length ? tillIf(w, [...list, idea]) : null; idea.extra = !list.length ? idea.save : t2 === null || soFar === null ? 0 : P.round2(soFar - t2);
      if (idea.extra >= 1 && (!best || idea.extra > best.extra)) best = idea; // every row shown is worth making together with the rows above it
    }
    if (best) { list.push(best); used.add(best.to); }
  }
  const T = shopTotals(w); const ticked = Object.entries(w.ticks || {}).some(([k, on]) => on && k.startsWith(`${T.chosen.shop}:`)); // ticks belong to a shop: don't offer to move a shop that is under way
  if (T.best && T.best !== T.chosen && !T.best.unpriced.length && !ticked && T.chosen.comparable - T.best.comparable >= 0.5) list.push({ kind: 'shop', key: `shop:${T.best.shop}`, shop: T.best.shop, save: P.round2(T.chosen.comparable - T.best.comparable), title: `Shop at ${P.SHOP_NAMES[T.best.shop]} instead`, sub: 'The same list, cheaper there.' });
  if (!S.settings.preferThigh && !avoidedIds().has('chicken_thigh') && T.chosen.lines.some((l) => l.id === 'chicken_breast')) { const idea = { kind: 'thigh', key: 'thigh', title: 'Thigh fillets instead of breast', sub: 'Stays on every week until you switch it back in Settings.' }; const t = tillIf(w, [idea]); idea.save = t === null ? 0 : P.round2(now.total - t); if (idea.save >= 0.5) list.push(idea); } // only when it truly is cheaper this week
  const allT = list.length > 1 ? tillIf(w, list) : null;
  const all = allT === null ? 0 : P.round2(now.total - allT);
  return { list, all: all > Math.max(0, ...list.map((x) => x.save)) ? all : 0 }; // switches share packs, so together they can save less than one alone: then there is no "all" button
}
function restoreSave(u) { const w = S.weeks[u.week]; if (!w) return; w.grid = u.grid; w.portions = u.portions; w.overflow = u.overflow; w.fresh = u.fresh; if (u.shop === undefined) delete w.shop; else w.shop = u.shop; if (u.done) w.done = u.done; else delete w.done; S.spendLog ||= {}; if (u.log) S.spendLog[u.week] = u.log; else delete S.spendLog[u.week]; if (!!S.settings.preferThigh !== u.thigh) { S.settings.preferThigh = u.thigh; bustCaches(); } }
// The Undo on offer, if the week is still exactly as the switch left it (a sync, a restore or a Plan edit in between drops it).
function undoFor(w) { const u = saveUndo; return u && u.week === S.activeWeek && u.after === JSON.stringify([w.grid, w.shop, !!S.settings.preferThigh]) ? u : null; }
function applySave(key) {
  const w = W(); const before = tillNow(w); if (!before) return;
  const ideas = saveIdeas(w); const todo = key ? ideas.list.filter((x) => x.key === key) : ideas.list; // worked out again from the live week, so a stale button can never make a stale switch
  if (!todo.length) { render(); return; }
  const snap = { week: S.activeWeek, grid: JSON.parse(JSON.stringify(w.grid)), portions: { ...w.portions }, overflow: JSON.parse(JSON.stringify(w.overflow || [])), fresh: { ...(w.fresh || {}) }, shop: w.shop, thigh: !!S.settings.preferThigh, done: w.done ? { ...w.done } : null, log: S.spendLog?.[S.activeWeek] ? { ...S.spendLog[S.activeWeek] } : null };
  w.fresh ||= {}; const { meals, thigh } = applyIdeas(w, todo); if (thigh) { S.settings.preferThigh = true; bustCaches(); } if (meals) portionsFromGrid(w);
  const after = tillNow(w); const saved = after ? P.round2(before.total - after.total) : 0;
  if (saved <= 0) { restoreSave(snap); save(); render(); toast('That would not save anything this week'); return; }
  const shopTo = todo.find((x) => x.kind === 'shop');
  const what = [meals ? `Switched ${meals} meal${meals > 1 ? 's' : ''}` : '', shopTo ? `${meals ? 'now' : 'Now'} shopping at ${P.SHOP_NAMES[shopTo.shop]}` : '', thigh ? `${meals || shopTo ? 'thigh' : 'Thigh'} instead of breast` : ''].filter(Boolean).join(', ');
  snap.text = `${what}. ${P.gbp(saved)} cheaper.`; snap.after = JSON.stringify([w.grid, w.shop, !!S.settings.preferThigh]); saveUndo = snap; saveOpen = true;
  shopDone(w); save(); render(); toast(snap.text);
  document.querySelector('.undo-box')?.scrollIntoView({ block: 'center' }); // the fold got shorter, so the page slid past the Undo box: bring it back where the thumb is
}
function undoSave() { const u = undoFor(W()); saveUndo = null; if (u) { restoreSave(u); shopDone(W()); save(); toast('Put back how it was'); } render(); }
function renderShop() {
  const w = W(); const ing = ING(), recipes = REC();
  const T = shopTotals(w, { recipes }); const { counts, resolve, rawNeeds, needsAll, pantryFor, needs, ranked, byShop, isStock, chosen } = T; const bestWeek = T.best;
  const usedBy = {};
  for (const [rid, n] of Object.entries(counts)) { const r = recById(rid); if (!r) continue; for (const x of r.ingredients) for (const id of resolve(x.id)) (usedBy[id] ||= []).push(`${r.short || r.name} ×${n}`); }
  for (const e of extras(w)) (usedBy[e.id] ||= []).push(e.scope === 'week' ? 'extra this week' : 'extra every week');
  const choiceHtml = Object.keys(rawNeeds).map(ingById).filter((it) => it?.choices?.length).map((it) => { const picks = chosenFor(w, it); return `<div class="small muted" style="margin-bottom:6px"><b>${esc(it.name)}</b> · pick yours</div><div class="chip-row">${it.choices.map((c) => `<button class="chip ${picks.includes(c) ? 'on' : ''}" data-action="choice-toggle" data-choice="${it.id}" data-val="${c}">${esc((ingById(c)?.name || c).replace(/^Frozen /, ''))}</button>`).join('')}</div>`; }).join('');
  const shopTop = `<h1>Shop</h1>${stepLine(2, 'Your list, priced.')}${weekSwitch()}`; const head = shopTop + tipCard('shop');
  if (!Object.keys(needsAll).length) return `${head}<div class="card"><p><b>Nothing to buy yet.</b></p><p class="small muted">Pick your meals first and your list builds itself.</p><button class="btn block" style="margin-top:10px" data-action="go-tab" data-to="plan">Pick my meals</button></div><h2>Also buy every week</h2><div class="card"><p class="small muted">Things that aren't part of a meal but you always get. They're priced into the list.</p><button class="btn ghost small" data-action="extra-add" style="margin-top:4px">+ Add something</button></div>`;
  const split = P.cheapestSplit(needs, ing);
  const budget = S.settings.budget;
  // The budget is judged on the one total. If only one-off stock-ups push it over we say so kindly (amber, not red): next week is just the food.
  const verdict = P.budgetVerdict(chosen.comparable, chosen.stock, budget);
  const oldest = ranked.map((b) => b.oldest).filter(Boolean).sort()[0];
  // shop picker: one chip per shop, total on it
  const chips = ranked.map((b) => {
    const dead = b.unpriced.length === b.missing.length && b.lines.length === 0;
    return `<button class="shopchip ${b === chosen ? 'on' : ''} ${dead ? 'dead' : ''}" data-action="pick-shop" data-shop="${b.shop}"><span>${P.SHOP_NAMES[b.shop]}</span><b>${b.lines.length ? P.gbp(b.comparable) : '—'}</b>${b === bestWeek && b.lines.length ? '<i>cheapest</i>' : b.unpriced.length ? `<i>${b.unpriced.length} unpriced</i>` : b.notSold.length ? `<i>${b.notSold.length} not sold here</i>` : '<i>&nbsp;</i>'}</button>`;
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
  const stockNames = [...stockLines.map((l) => ingById(l.id)?.name), ...chosen.notSold.filter((m) => isStock(m.id)).map((m) => m.name)].filter(Boolean).map((n) => n.replace(/\s*\([^)]*\)/g, '').toLowerCase());
  const stockList = stockNames.slice(0, 3).join(', ') + (stockNames.length > 3 ? ` and ${stockNames.length - 3} more` : '');
  const stockHtml = stockLines.length ? `<h2>Stock up <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:600">${stockLines.filter((l) => w.ticks[`${chosen.shop}:${l.id}`]).length}/${stockLines.length} ticked · ${P.gbp(chosen.stock)}</span></h2><div class="card list"><p class="small muted" style="margin:4px 0 2px">Bought this week and already in the price above, but they'll last you weeks. Next week they'll be in your Pantry already.${chosen.elsewhere - chosen.elsewhereWeek > 0.004 ? ` That includes ${chosen.notSold.filter((m) => isStock(m.id)).map((m) => m.name.toLowerCase()).join(', ')}, which ${P.SHOP_NAMES[chosen.shop]} doesn't sell.` : ''}</p>${aisleHtml(stockLines)}</div>` : '';
  const aisleGroups = {}; for (const l of weekLines) (aisleGroups[aisleOf(ingById(l.id))] ||= []).push(l);
  const breakdown = AISLES.filter(([k]) => aisleGroups[k]).map(([k, label]) => `${label.split(',')[0].split(' &')[0]} ${P.gbp(P.round2(aisleGroups[k].reduce((t, l) => t + l.cost, 0)))}`).concat(chosen.stock ? [`Stock-ups ${P.gbp(chosen.stock)}`] : [], chosen.elsewhereWeek ? [`From another shop ${P.gbp(chosen.elsewhereWeek)}`] : []).join(' · '); // adds up to the one total, so it lives under "Why £X?" and not beside the big number
  const extraRows = extras(w).map((e) => { const it = ingById(e.id); const l = chosen.lines.find((x) => x.id === e.id); return `<div class="line"><span class="grow"><span class="name">${esc(it.name)}</span><span class="sub">${e.scope === 'week' ? 'this week only' : 'every week'}${l ? ` · ${esc(l.pack.name.replace(/\s*\([^)]*\)/g, ''))}` : ' · no price at this shop'}</span></span><button class="chip" data-action="extra-qty" data-id="${e.id}" data-scope="${e.scope}">${P.fmtQty(e.qty, it.unit)}${it.unit === 'each' ? (e.qty === 1 ? ' piece' : ' pieces') : ''}</button><span class="cost">${l ? P.gbp(l.cost) : '—'}</span><button class="btn ghost small" data-action="extra-remove" data-id="${e.id}" data-scope="${e.scope}" aria-label="Remove">×</button></div>`; }).join('');
  const extrasCard = `${extraRows ? `<h2>Extras</h2><div class="card">${extraRows}</div>` : ''}<button class="btn ghost block" data-action="extra-add" style="margin:10px 0 4px">+ Add something to this shop</button>`; // Cameron: keep the extras, lose the text around them
  const complete = chosen.lines.length > 0 && chosen.lines.every((l) => w.ticks[`${chosen.shop}:${l.id}`]);
  const doneBox = complete ? `<div class="done-box"><b>Shop done ✓</b> ${P.gbp(chosen.comparable)} at ${P.SHOP_NAMES[chosen.shop]}${w.done?.date ? ` on ${fmtDate(w.done.date)}` : ''}. Logged under Settings → Money.</div>` : '';
  const notSold = chosen.notSold.filter((m) => !isStock(m.id)).map((m) => esc(m.name)); const unpriced = chosen.unpriced.map((m) => esc(m.name));
  const missing = (notSold.length ? `<div class="warn-box">Not sold at ${P.SHOP_NAMES[chosen.shop]}: ${notSold.join(', ')}. Pick ${notSold.length > 1 ? 'them' : 'it'} up elsewhere; the price above already counts ${notSold.length > 1 ? 'them' : 'it'}.</div>` : '') + (unpriced.length ? `<div class="warn-box">No ${P.SHOP_NAMES[chosen.shop]} price on file for: ${unpriced.join(', ')}.${chosen.shop === 'lidl' ? ' Lidl publishes no prices online.' : ''}</div>` : '');
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
  // Switches are priced by really trying them (see saveIdeas), and only while the fold is open so the page stays quick.
  const ideas = saveOpen ? saveIdeas(w) : { list: [], all: 0 }; const undo = undoFor(w);
  const ideaRow = (x) => `<div class="line saverow"><span class="grow"><span class="name">${esc(x.title)}</span><span class="sub">${esc(x.sub)}</span></span><span class="cost alt">−${P.gbp(x.save)}</span><button class="btn small" data-action="save-switch" data-key="${esc(x.key)}">Switch</button></div>`;
  const undoHtml = undo ? `<div class="done-box undo-box"><span>${esc(undo.text)}</span><button class="btn ghost small" data-action="save-undo">Undo</button></div>` : '';
  const whyHtml = chosen.lines.length ? `<details class="fold" id="savefold" ${saveOpen ? 'open' : ''}><summary><b>Where can I save?</b><span class="muted small">cheaper switches, made for you</span></summary>
    ${undoHtml}
    ${ideas.list.map(ideaRow).join('') || `<p class="small muted">${!saveOpen ? 'Working out the switches…' : undo ? 'Nothing else worth switching.' : ideas.started ? (w.done ? 'This shop is done.' : 'Untick your list to see switches again.') : 'Nothing cheaper that keeps your protein up.'}</p>`}
    ${ideas.list.length > 1 && ideas.all > 0 ? `<button class="btn block" data-action="save-all" style="margin-top:10px">Make all these switches · ${P.gbp(ideas.all)} cheaper</button>` : ''}
    </details>` : ''; // Cameron: just the switches. The price-of-everything lists went.
  const splitHtml = '';
  const unpricedAll = ids.filter((id) => !(ingById(id)?.packs || []).length).map((id) => ingById(id)?.name);
  const haveIds = Object.keys(needsAll).filter((id) => pantryFor[id] !== undefined);
  const full = haveIds.length ? shopTotals(w, { recipes, all: true }).byShop[chosen.shop] : null; const pantrySave = full ? P.round2(full.comparable - chosen.comparable) : 0; // a saving, not a second total
  const haveRows = haveIds.map((id) => { const it = ingById(id); const v = pantryFor[id]; return `<div class="line"><span class="grow"><span class="name">${esc(it?.name || id)}</span><span class="sub">${v === true ? 'plenty' : `you have ${P.fmtQty(v, it?.unit || 'g')}`} · ${esc((usedBy[id] || []).join(', '))}</span></span><button class="btn ghost small" data-action="need" data-id="${id}">Need it</button></div>`; }).join('');
  // Cupboard check. New people never open Pantry, see the full first-shop price and think Fuel is dear. So the question comes to them, here, under the price:
  // tap what you already own and watch the number fall. It is the same tick as Pantry (w.pantry), shown until they say they are done for this week.
  if (cup.week !== S.activeWeek) cup = { week: S.activeWeek, ids: new Set(), costs: {}, base: null };
  const startedShop = chosen.lines.some((l) => w.ticks[`${chosen.shop}:${l.id}`]);
  const cupPool = [...chosen.lines.map((l) => ({ id: l.id, cost: l.cost })), ...chosen.notSold.map((m) => ({ id: m.id, cost: T.cheapestElsewhere(m.id, chosen.shop) }))].filter((x) => ingById(x.id) && !cup.ids.has(x.id));
  const cupOrder = [...cupPool.filter((x) => isStock(x.id)).sort((x, y) => y.cost - x.cost), ...cupPool.filter((x) => !isStock(x.id)).sort((x, y) => x.cost - y.cost)]; // cupboard basics first (most likely owned), then the cheap everyday bits
  const cupMine = [...cup.ids].filter((id) => w.pantry[id] !== undefined);
  let cupHtml = '';
  if (!w.done && !w.cupChecked && !startedShop && (cupOrder.length || cupMine.length)) {
    cup.base ??= chosen.comparable; const off = P.round2(cup.base - chosen.comparable); const shown = cupOrder.slice(0, 14);
    const chipName = (id) => esc((ingById(id)?.name || id).replace(/\s*\([^)]*\)/g, ''));
    cupHtml = `<div class="card cupcheck"><h3>Already got any of this?${off > 0 ? ` <b class="cupoff">${P.gbp(off)} off</b>` : ''}</h3><p class="small muted" style="margin:0 0 6px">Tap it and it comes off your shop.</p>
    <div class="chip-row">${cupMine.map((id) => `<button class="chip on" data-action="cup-tick" data-id="${id}">✓ ${chipName(id)}</button>`).join('')}${shown.map((x) => `<button class="chip" data-action="cup-tick" data-id="${x.id}" data-cost="${x.cost}">${chipName(x.id)}${x.cost ? `<small>${P.gbp(x.cost)}</small>` : ''}</button>`).join('')}</div>
    
    <div class="row" style="gap:8px;margin-top:8px"><button class="btn small grow" data-action="cup-done">${cupMine.length ? `Done · shop is now ${P.gbp(chosen.comparable)}` : 'Nothing, I need it all'}</button><button class="btn ghost small grow" data-action="go-pantry">${cupOrder.length > shown.length ? `See all ${cupOrder.length + cupMine.length}` : 'Full cupboard'}</button></div></div>`;
  }
  const verdictLine = verdict.state === 'ok' ? `${P.gbp(verdict.left)} under budget` : verdict.state === 'stock' ? `${P.gbp(verdict.over)} over, only because of one-off stock-ups` : `${P.gbp(verdict.over)} over budget. <a href="#" data-action="open-save"><b>Where can I save?</b></a>`;
  const inc = [chosen.stock ? `${P.gbp(chosen.stock)} of stock-ups that last weeks` : '', chosen.elsewhere ? `${P.gbp(chosen.elsewhere)} from another shop (${P.SHOP_NAMES[chosen.shop]} doesn't sell it)` : ''].filter(Boolean).join(' and ');
  // Cameron (21 Sep): "there's so much stuff in the way". The page is now: already got it? → THE price → where to shop → the list → extras → next. Everything else is a closed fold or gone.
  return `${shopTop}
  ${doneBox}
  ${cupHtml}
  <div class="card shophead"><div class="row"><span class="grow"><b class="bigtotal">${P.gbp(chosen.comparable)}</b> <span class="muted">at ${P.SHOP_NAMES[chosen.shop]}</span></span><span class="muted small">budget ${P.gbp(budget)}</span></div>
    <div class="budget ${verdict.state === 'over' ? 'over' : verdict.state === 'stock' ? 'low' : ''}"><i style="width:${verdict.pct}%"></i></div>
    <p class="small muted">${verdictLine}</p>
    ${inc ? `<p class="small muted stockline">Includes ${inc}.</p>` : ''}
    <div class="shopchips">${chips}</div>
  </div>
  ${whyHtml}
  ${choiceHtml ? `<div class="card">${choiceHtml}</div>` : ''}
  <h2>${P.SHOP_NAMES[chosen.shop]} list <span class="muted" style="text-transform:none;letter-spacing:0;font-weight:600">${done}/${weekCount} ticked</span></h2>
  <div class="card list">${missing}${lines || '<p class="muted">Nothing priced at this shop.</p>'}</div>
  ${stockHtml}
  ${extrasCard}
  <div class="row" style="gap:8px;margin:6px 0 10px"><button class="btn ghost small grow" data-action="share-list">Share list</button><button class="btn ghost small grow" data-action="copy-list">Copy</button>${online[chosen.shop] ? `<a class="btn ghost small grow" style="text-align:center" href="${online[chosen.shop]('')}" target="_blank" rel="noopener">Shop online</a>` : ''}</div>
  ${unpricedAll.length ? `<div class="card"><h3>No price anywhere yet</h3><p class="small muted">${unpricedAll.map(esc).join(', ')}. Left out of the total.</p></div>` : ''}
  ${haveRows ? `<details class="fold"><summary><b>Already in your pantry</b><span class="muted small">${haveIds.length} left off the list${pantrySave > 0.004 ? ` · ${P.gbp(pantrySave)} saved` : ''}</span></summary>${haveRows}</details>` : ''}
  <button class="btn block big" data-action="go-tab" data-to="cook" style="margin-top:14px">Next: Cook</button>
  <details class="fold" style="margin-top:12px"><summary><span class="muted small">About these prices</span></summary><p class="small muted">${esc(DATA.priceNote || '')}</p></details>`;
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
  shop: { title: 'How Shop works', items: ['The big number is <b>what you pay at the till</b>. Tap another shop to see its price.', 'Tick things off as you go round. A finished shop is saved under <b>Settings → Money</b>.', 'Over budget? <b>Where can I save?</b> can make cheaper switches for you.'] },
  pantry: { title: 'How Pantry works', items: [`The top list is only what this week's meals need. The rest of your cupboard is folded away underneath.`, 'Only got some? Type how much. Something needs eating? Tap <b>Use up</b>, or add a use-by date.'] },
};
function tipCard(key) { if (S.tips && S.tips[key]) return ''; const t = TIPS[key]; return `<div class="card tipcard"><h3>${t.title}</h3><ol class="tips">${t.items.map((i) => `<li>${i}</li>`).join('')}</ol><button class="btn small" data-action="tip-done" data-tip="${key}">Got it</button></div>`; }
// Every line at the chosen shop ticked? Then the shop is done: the total is logged for Settings → Money (and unlogged if a line is unticked).
function shopDone(w) {
  const b = shopTotals(w).chosen; // the same shop and the same number as the Shop page
  const all = b && b.lines.length > 0 && b.lines.every((l) => w.ticks[`${b.shop}:${l.id}`]);
  S.spendLog ||= {};
  if (all) { if (!w.done) { w.done = { shop: b.shop, total: b.comparable, weekly: b.weekly, date: iso(new Date()) }; toast(`Shop done: ${P.gbp(b.comparable)} at ${P.SHOP_NAMES[b.shop]}`); } else { w.done.shop = b.shop; w.done.total = b.comparable; w.done.weekly = b.weekly; } S.spendLog[S.activeWeek] = { ...w.done, budget: S.settings.budget }; } // an extra added after the last tick keeps the log in step with the page
  else if (w.done) { delete w.done; delete S.spendLog[S.activeWeek]; }
  return all;
}
// Plain-text version of the chosen shop's list, for sharing or pasting into an online basket.
function shopListText() {
  const w = W(); const b = shopTotals(w).chosen;
  const line = (l) => `${w.ticks[`${b.shop}:${l.id}`] ? '☑' : '☐'} ${l.n > 1 ? `${l.n} × ` : ''}${l.pack.name.replace(/\s*\([^)]*\)/g, '')} — ${P.gbp(l.cost)}`;
  const grouped = (ls) => { const g = {}; for (const l of ls) (g[aisleOf(ingById(l.id))] ||= []).push(l); return AISLES.filter(([k]) => g[k]).map(([k, label]) => `${label.toUpperCase()}\n${g[k].map(line).join('\n')}`).join('\n\n'); };
  const weekLs = b.lines.filter((l) => !ingById(l.id)?.staple), stockLs = b.lines.filter((l) => ingById(l.id)?.staple);
  return `Fuel shop, ${weekLabel(S.activeWeek).toLowerCase()} at ${P.SHOP_NAMES[b.shop]}: ${P.gbp(b.comparable)}\n\n${grouped(weekLs)}${stockLs.length ? `\n\nSTOCK UP (lasts weeks, included in the price above)\n${stockLs.map(line).join('\n')}` : ''}${b.notSold.length ? `\n\nNOT SOLD AT ${P.SHOP_NAMES[b.shop].toUpperCase()} (get elsewhere, about ${P.gbp(b.elsewhere)}, included in the price above)\n${b.notSold.map((m) => `☐ ${m.name}`).join('\n')}` : ''}\n\nMade with Fuel · fuel app`;
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
  return `<h1>Recipes</h1>${stepLine(0, 'Every meal you can pick from. Add your own here too.')}
  <button class="btn block ${S.ideasOpen ? 'ghost' : ''}" data-action="ideas-toggle" style="margin-bottom:10px">${S.ideasOpen ? 'Hide meal ideas' : `✨ Find more meal ideas (${ideasCount})`}</button>
  ${ideasHtml}
  <div class="row" style="margin-bottom:12px"><button class="btn ghost grow" data-action="add-recipe">+ Type a recipe in</button></div>
  <input class="search" placeholder="Search ${mine.length} of your recipes" value="${esc(S.search || '')}" data-search>
  <h2>My recipes</h2><div class="card">${list || '<p class="muted">Nothing here yet. Add some from the ideas above.</p>'}</div>
  <div class="card nextcard"><b>Found something you fancy?</b><p class="small muted">Every meal here is on the Plan page, ready to tick.</p><button class="btn block" data-action="go-tab" data-to="plan">Back to Plan</button></div>`;
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
function setTweak(id, fn) { S.tweaks ||= {}; const t = S.tweaks[id] || { drop: [], add: [] }; fn(t); if (!t.drop.length && !t.add.length) delete S.tweaks[id]; else S.tweaks[id] = t; bustCaches(); save(); }
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
  if (!empty) { const c = shopTotals(w, { recipes }).chosen; shop = c && c.lines.length ? { shop: c.shop, total: c.comparable } : null; } // same shop and number as the Shop page, at the target being previewed
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
const cookOpen = new Set(); // Cook: which recipe folds are open (this visit only)
const justAdded = new Set(); // meals ticked under "More meals" this visit: they stay in that section (under your thumb) until you close it, then join your list
let planMore = false; // Plan's "More meals" section (recipes not in your list yet), opened from the picker so nobody is sent off to Recipes and stranded
let planAdd = null; // Plan page: true = Add meals view, false = Your week view, null = decide from the week. Never saved.
let cup = { week: null, ids: new Set(), costs: {}, base: null }; // Shop's cupboard check this visit: what was tapped (so it can be untapped) and the bill when the card first showed
let pantryBase = null; // the bill when Pantry was opened, so the bar can say how much this visit has taken off
function pantryPriceHtml(w) {
  const now = tillNow(w); if (!now) return '';
  if (!pantryBase || pantryBase.week !== S.activeWeek || pantryBase.shop !== now.shop) pantryBase = { week: S.activeWeek, shop: now.shop, total: now.total };
  const off = P.round2(pantryBase.total - now.total);
  return `<span>${weekLabel(S.activeWeek)}'s shop at ${P.SHOP_NAMES[now.shop]}</span><b>${P.gbp(now.total)}</b>${off > 0.004 ? `<i>${P.gbp(off)} off</i>` : ''}`;
}
function refreshPantryPrice() { const el = document.getElementById('pantryprice'); if (el) el.innerHTML = pantryPriceHtml(W()); }
// Pantry = your cupboard. FIRST what this week's plan needs (so nothing shows up that you can't place, like tuna with no tuna meal), THEN everything
// else your recipes use, folded away. Ticks still live in w.pantry, so the shop list and the price bar work exactly as before.
let pantryCtx = { need: {}, cost: {} }; // what this week's plan needs, and roughly what each line costs at the current shop
const useByOpen = new Set(); // rows whose optional use-by box was opened this visit
const useByChip = (id) => { const d = (S.useBy || {})[id]; const l = d ? P.useByLabel(d, todayISO()) : ''; return l ? `<span class="badge ${l === 'Past its date' ? 'bad' : 'warn'} datechip">${l}</span>` : ''; };
function pantryRow(it) {
  const w = W(); const v = w.pantry[it.id]; const on = v === true || typeof v === 'number'; const up = !!(w.useUp || {})[it.id];
  const need = pantryCtx.need[it.id], cost = pantryCtx.cost[it.id], date = (S.useBy || {})[it.id] || '';
  const sub = need > 0 ? `<span class="sub need">${on ? 'Needed' : 'To buy'}: ${P.fmtQty(it.unit === 'each' ? Math.ceil(need - 0.01) : need < 10 ? P.round1(need) : Math.round(need), it.unit)}${cost ? ` · ${on ? 'saves' : 'ticking saves'} about ${P.gbp(cost)}` : ''}</span>` : ((it.packs || []).length ? '' : '<span class="sub">no price on file</span>');
  const dateBox = on && perishable(it) ? (date || useByOpen.has(it.id) ? `<label class="useby">Use by <input type="date" data-useby="${it.id}" value="${esc(date)}"></label>` : `<button class="chip small useup" data-action="useby-add" data-id="${it.id}">+ Use-by date</button>`) : '';
  const upChip = `<button class="chip small useup ${up ? 'on' : ''}" data-action="useup" data-id="${it.id}" title="Plan meals that use this up">${up ? 'Using up' : 'Use up'}</button>`;
  // Staples only get the Use up chip, so it stays on the first line; everything else gets a second line (chip, amount, optional date) only while ticked.
  return `<div class="check prow" data-prow="${it.id}"><input type="checkbox" data-pantry="${it.id}" ${on ? 'checked' : ''}><span class="grow">${esc(it.name)}<span class="datechip-slot">${useByChip(it.id)}</span>${sub}${up ? '<span class="sub upnote">using it up this week</span>' : ''}</span>${on && it.staple ? upChip : ''}${on && !it.staple ? `<div class="have">${upChip}<input class="qty" type="number" inputmode="decimal" step="any" placeholder="plenty" data-pantry-qty="${it.id}" value="${typeof v === 'number' ? v : ''}"><span class="small muted">${it.unit === 'each' ? '' : it.unit}</span>${dateBox}</div>` : ''}</div>`;
}
function refreshPantryCount() { const c = document.getElementById('pantry-week-count'); if (c) { const all = document.querySelectorAll('.pweek input[data-pantry]'); c.textContent = `${[...all].filter((i) => i.checked).length} of ${all.length} ticked`; } }
function renderPantry() {
  const w = W(); w.useUp ||= {};
  const t = shopTotals(w, { all: true }); const needsAll = t.needsAll; // the shared totals helper, priced as if the cupboard were empty: what each line would cost
  const away = (t.chosen?.notSold || []).map((m) => [m.id, t.cheapestElsewhere(m.id, t.chosen.shop)]).filter((x) => x[1] > 0); // things this shop does not sell are in THE price at the cheapest other shop, so ticking them saves that
  pantryCtx = { need: needsAll, cost: Object.fromEntries([...(t.chosen?.lines || []).map((l) => [l.id, l.cost]), ...away]), away: new Set(away.map((x) => x[0])) };
  const mine = pantryIds(w); for (const id of Object.keys(needsAll)) mine.add(id);
  const options = new Set(ING().flatMap((i) => i.choices || [])); // the actual fruits, not the "your pick" line
  const listed = ING().filter((it) => mine.has(it.id) && (!it.hidden || options.has(it.id)) && !(it.choices || []).length);
  const q = (S.pantrySearch || '').toLowerCase();
  const hit = (it) => !q || it.name.toLowerCase().includes(q) || String(it.aka || '').toLowerCase().includes(q);
  const order = ['protein', 'dairy', 'carb', 'veg', 'fruit', 'tin', 'sauce', 'spice', 'cupboard'];
  const LABEL = { protein: 'Meat, fish & protein', dairy: 'Dairy & eggs', carb: 'Carbs & bread', veg: 'Veg & herbs', fruit: 'Fruit', tin: 'Tins & jars', sauce: 'Sauces & condiments', spice: 'Spices & seasoning', cupboard: 'Cupboard' };
  const byCat = (a, b) => order.indexOf(a.category) - order.indexOf(b.category);
  const wk = listed.filter((it) => needsAll[it.id] > 0).sort(byCat), rest = listed.filter((it) => !(needsAll[it.id] > 0));
  const wkHit = wk.filter(hit), wkTicked = wk.filter((it) => w.pantry[it.id] !== undefined).length;
  const sec = (title, items) => (items.length ? `<h4 class="psub">${title}</h4>${items.map(pantryRow).join('')}` : '');
  const label = weekLabel(S.activeWeek).toLowerCase(), whose = S.activeWeek === S.nextMon ? `next week's` : `this week's`;
  const weekHtml = !wk.length ? `<div class="card pweek"><p class="small muted" style="margin:0">Nothing planned for ${label} yet. Pick your meals and what they need shows up here, ready to tick off.</p><button class="btn small" style="margin-top:10px" data-action="go-tab" data-to="plan">Pick my meals</button></div>`
    : wkHit.length ? `<div class="card pweek">${sec('Fresh, chilled and tins', wkHit.filter((it) => !it.staple))}${sec('Cupboard basics: oil, spices, rice and the like', wkHit.filter((it) => it.staple))}</div>` : '';
  const groups = {}; for (const it of rest) (groups[it.category] ||= []).push(it);
  const groupsHtml = order.filter((g) => groups[g]).map((g) => {
    const items = groups[g].filter(hit); if (!items.length) return '';
    const ticked = groups[g].filter((it) => w.pantry[it.id] !== undefined).length;
    return `<details class="pantry-group" ${q || ticked ? 'open' : ''}><summary><h2>${LABEL[g] || g}</h2><span class="small muted">${ticked ? `${ticked} ticked · ` : ''}${groups[g].length}</span></summary><div class="card">${items.map(pantryRow).join('')}</div></details>`;
  }).join('');
  const restTicked = rest.filter((it) => w.pantry[it.id] !== undefined).length;
  const restHtml = rest.length && (!q || groupsHtml) ? `<details class="pantry-rest" ${q || S.pantryRestOpen ? 'open' : ''}><summary><span><b>The rest of your cupboard</b><small>Things your other recipes use. None of it is needed ${label}, so none of it is on the shop list.</small><small class="cnt">${rest.length} things${restTicked ? ` · ${restTicked} ticked` : ''}</small></span></summary>${groupsHtml}</details>` : '';
  const none = q && !wkHit.length && !groupsHtml ? `<p class="muted">Nothing called "${esc(S.pantrySearch)}" in your cupboard.</p>` : '';
  return `<h1>Pantry</h1>${stepLine(0, `<strong>This is your cupboard.</strong> Tick anything you already have at home and it comes off the shop list.`)}${weekSwitch()}${tipCard('pantry')}<div id="useby-banner">${useByInner('pantry')}</div><div class="pantryprice" id="pantryprice">${pantryPriceHtml(w)}</div>
  <div class="row" style="margin-bottom:12px"><input class="search grow" placeholder="Search the cupboard" value="${esc(S.pantrySearch || '')}" data-pantry-search><button class="btn ghost" data-action="clear-pantry">Untick all</button></div>
  <h2 class="pweekhead">On ${whose} shopping list${wk.length ? ` <span class="muted" id="pantry-week-count">${wkTicked} of ${wk.length} ticked</span>` : ''}</h2>${wk.length ? `<p class="small muted" style="margin:-4px 0 8px">Only what your planned meals need. Got it already? Tick it.</p>` : ''}${weekHtml}${restHtml}${none}
  <div class="card nextcard"><b>Ticked what you have?</b><p class="small muted">Your shop list and its price are already up to date.</p><button class="btn block" data-action="go-tab" data-to="shop">Back to Shop</button></div>`;
}

// ---------- Settings: its own screen, opened from the gear on any tab ----------
// Settings → Money: what the shops have cost, from the weeks marked done (plus this week's planned total until it is).
function moneyCard() {
  const log = Object.entries(S.spendLog || {}).sort(([a], [b]) => a.localeCompare(b));
  const cur = S.weeks[S.thisMon]; let planned = null;
  if (cur && !cur.done && Object.keys(cur.portions || {}).length) { const c = shopTotals(cur).chosen; if (c && c.lines.length) planned = { shop: c.shop, total: c.comparable }; }
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
    <p class="small muted" style="margin:8px 0 0">Change your goal or weight and your daily targets and portion sizes change with it.</p>
  </div>
  <h2>Daily targets</h2><div class="card">
    <p class="small muted" style="margin:0 0 10px">Calories set the portion size: meals are scaled so the week lands on this number, and the shop list scales with them. Protein is what you aim for.</p>
    <label class="field">Calories <b data-val="kcalTarget">${(st.kcalTarget || 0).toLocaleString()}</b> kcal a day<input class="range" type="range" min="1200" max="4500" step="50" data-setting="kcalTarget" value="${st.kcalTarget || 2500}"></label>
    <label class="field">Protein <b data-val="proteinTarget">${st.proteinTarget}g</b> a day<input class="range" type="range" min="80" max="260" step="5" data-setting="proteinTarget" value="${st.proteinTarget}"></label>
    <div id="macro-preview">${macroPreview(st.kcalTarget, st.proteinTarget)}</div>
    <button class="btn ghost small" data-action="suggest-targets">Reset targets to match my weight and goal</button>
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
  <p class="small muted" style="text-align:center">${esc(CONFIG.APP_NAME)} ${APP_VERSION} · prices checked ${DATA.priceDate ? fmtDate(DATA.priceDate) : ''} · <a href="terms.html">Terms</a> · <a href="privacy.html">Privacy</a></p>
  <p class="small muted screenfacts" style="text-align:center;font-size:11px;opacity:.7;margin-top:-6px">${esc(screenFacts())}</p>`;
}

// ---------- sheet ----------
// ---------- Install: Chrome/Edge (Android, desktop) hand us a native install prompt; iPhone Safari can only Add to Home Screen ----------
let installEvt = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); installEvt = e; const c = document.getElementById('install-card'); if (c) c.hidden = false; });
window.addEventListener('appinstalled', () => { installEvt = null; S.tips ||= {}; S.tips.install = true; save(); render(); toast('Fuel is on your home screen'); });
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
// One line that tells us, from a screenshot of Settings, how this phone really lays the app out (the iPhone tab bar was guessed at five times without it).
const screenFacts = () => { try { const p = document.createElement('div'); p.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)'; document.body.appendChild(p); const cs = getComputedStyle(p), t = Math.round(parseFloat(cs.paddingTop) || 0), b = Math.round(parseFloat(cs.paddingBottom) || 0); p.remove(); const c = document.documentElement.classList, r = document.getElementById('tabs').getBoundingClientRect(); return `screen ${screen.width}×${screen.height} · view ${innerWidth}×${innerHeight} · safe ${t}/${b} · tabs ${Math.round(r.top)} to ${Math.round(r.bottom)} · ${isStandalone() ? 'home-screen' : 'browser'}${c.contains('is-ios-app') ? (c.contains('ios-under') ? ' · under' : ' · default') : ''}${c.contains('ios-short') ? ' · short' : ''}`; } catch (e) { return ''; } };
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
function toast(text, ms = 2200) { showHint(text); clearTimeout(toast.t); toast.t = setTimeout(hideHint, ms); }
const GOAL_NAMES = { build: 'Build muscle', lean: 'Stay lean and strong', lose: 'Lose fat, keep muscle', eatwell: 'Just eat well' };
// Calories set the portion size, so new targets mean new portions. Settings is updated in place (no redraw: focus stays put when you tab from weight to budget).
// Returns true when the active week's portions really changed size (they do not on an empty week or at the 0.6x / 2.5x limits), so the toast never claims it wrongly.
function setTargets(kcal, prot) {
  const st = S.settings, w = W(), before = weekFactor(w); st.kcalTarget = kcal; st.proteinTarget = prot; bustCaches(); if (w && w.done) shopDone(w); save(); // a finished shop's logged total follows the resize, so Shop and Settings → Money never disagree
  for (const [k, v] of [['kcalTarget', kcal], ['proteinTarget', prot]]) {
    const r = document.querySelector(`#view input[data-setting="${k}"]`); if (r) r.value = v;
    const b = document.querySelector(`#view [data-val="${k}"]`); if (b) b.textContent = k === 'kcalTarget' ? v.toLocaleString() : v + 'g';
  }
  const mp = document.getElementById('macro-preview'); if (mp) mp.innerHTML = macroPreview(kcal, prot);
  return weekFactor(w) !== before;
}
// Goal or bodyweight changed: the targets move with them, worked out the same way as the set-up questions. Sliders that were set by hand are never overwritten without asking.
async function retarget(oldWeight, oldGoal) {
  const st = S.settings, t = P.retargetFor(st, oldWeight, oldGoal); if (!t) return;
  const name = oldGoal !== st.goal ? `"${GOAL_NAMES[st.goal] || 'your goal'}"` : 'your new weight', nums = `${t.kcal.toLocaleString()} kcal and ${t.prot}g protein a day`;
  if (t.byHand && !(await ask(`You set your own targets. Change them to ${nums} to fit ${name}?`, 'Update targets'))) return;
  const resized = setTargets(t.kcal, t.prot);
  toast(`Targets now ${nums}.${resized ? ' Portions resized to match.' : ''}`, 3500);
}
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
    2: `<h1>How much do you weigh?</h1><p>Kilos, roughly. Your daily protein and calorie targets come from this and your goal. Portions are sized to fit your calories.</p><input class="big" type="number" id="intro-weight" inputmode="numeric" value="${wt}" min="40" max="160"><div class="stat-row"><div><b id="iw-p">${P.proteinTargetFor(wt, g)}g</b><span>protein a day</span></div><div><b id="iw-f">${P.kcalTargetFor(wt, g).toLocaleString()}</b><span>kcal a day</span></div></div><button class="go" data-action="intro-weight">Next</button><button class="back" data-action="intro-back">Back</button>`,
    3: `<h1>Weekly food budget?</h1><p>The shop list always shows what's left against it.</p><div class="chips">${budgets.map((b) => `<button class="opt ${S.settings.budget === b ? 'on' : ''}" data-action="intro-budget" data-budget="${b}">£${b}</button>`).join('')}</div><p style="margin-bottom:6px">Or type your own</p><input class="big" type="number" id="intro-budget" inputmode="numeric" placeholder="£" min="10" max="300"><button class="go" data-action="intro-budget-custom">Next</button><button class="back" data-action="intro-back">Back</button>`,
    4: `<h1>Anything you don't eat?</h1><p>Recipes with these are hidden. Tap all that apply.</p><div class="chips">${Object.entries(AVOID).map(([k, v]) => `<button class="opt ${S.settings.avoid.includes(k) ? 'on' : ''}" data-action="intro-avoid" data-id="${k}">${v.label}</button>`).join('')}</div><p style="margin:16px 0 6px">Anything else? Allergies, or things you just don't like.</p><div class="row"><input class="big grow" id="intro-avoid-text" data-enter="intro-avoid-add" placeholder="e.g. mushrooms" autocapitalize="none" style="font-size:18px;text-align:left;margin:0"><button class="go" style="width:auto;margin:0;padding:14px 18px;font-size:16px" data-action="intro-avoid-add">Add</button></div>${avoidTextChips('intro-avoid-rm')}<p style="margin:16px 0 6px">Which milk?</p><div class="chips">${[['milk', 'Dairy'], ['oat_milk', 'Oat'], ['almond_milk', 'Almond'], ['soya_milk', 'Soya']].map(([k, l]) => `<button class="opt ${(S.settings.milk || 'milk') === k ? 'on' : ''}" data-action="intro-milk" data-id="${k}">${l}</button>`).join('')}</div><button class="go" data-action="intro-next">Next</button><button class="back" data-action="intro-back">Back</button>`,
    5: `<h1>You're set.</h1><p>Fuel is three steps. The numbers on the bar at the bottom follow them.</p><ol class="introsteps"><li><b>Plan.</b> Tick the meals you want. We fit them into your week.</li><li><b>Shop.</b> Your list, priced at four supermarkets.</li><li><b>Cook.</b> One batch cook, then box it up.</li></ol><div class="stat-row"><div><b>${S.settings.proteinTarget}g</b><span>protein a day</span></div><div><b>${(S.settings.kcalTarget || 0).toLocaleString()}</b><span>kcal a day</span></div><div><b>£${S.settings.budget}</b><span>a week</span></div></div><p class="small">Meals are sized to your calorie target. Change that, your milk or your budget any time under the <b>⚙ gear</b>, top right.</p><button class="go" data-action="intro-done">Pick my meals</button><button class="back" data-action="intro-back">Back</button>`,
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
    relayout(); refreshPlan(rowSel(id));
  } else if (a === 'week') { S.activeWeek = el.dataset.week; planAdd = null; save(); render(); }
  else if (a === 'cookday') { w.cookDay = +el.dataset.day; relayout(); refreshPlan(); }
  else if (a === 'quick-pick') { const r = recById(id); const room = P.roomFor(r, P.freeSlots(w.grid, w.days)); if (r && w.portions[r.id]) { toast('Already in the week. Change the count in the list below.'); return; } if (r && room > 0) { if (S.library && !S.library.includes(r.id)) S.library.push(r.id); w.portions[r.id] = Math.min(defaultPortions(r), room); relayout(); holdPlace(el.closest('#useup-card') ? '#useup-card' : '#pick-head', () => render()); } else toast('No room left in the week for that'); }
  else if (a === 'relayout') { relayout(); refreshPlan(); }
  else if (a === 'dayx') { const i = +el.dataset.day; w.days[i] = !w.days[i]; relayout(w); refreshPlan(); }
  else if (a === 'need') { delete w.pantry[id]; delete (w.useUp || {})[id]; dropUseBy(id); save(); render(); }
  else if (a === 'extra-add') { openSheet(extrasSheet('')); document.querySelector('[data-extra-search]')?.focus(); }
  else if (a === 'extra-custom') { const name = el.dataset.name; closeSheet(); (async () => {
    const price = await askText(`${name}: what does one cost? (£)`, 'e.g. 1.50'); if (price === null) return; const pr = parseFloat(String(price).replace(/[^0-9.]/g, '')); if (!(pr >= 0)) { toast('Type a price'); return; }
    const id = 'custom_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
    if (!ingById(id)) { S.customIngredients.push({ id, name, unit: 'each', protein: 0, kcal: 0, category: 'cupboard', packs: [{ shop: 'any', name, size: 1, price: pr, checked: iso(new Date()) }] }); bustCaches(); }
    const n = await askExtraQty(ingById(id)); if (n === null) return;
    const scope = await askChoice(`Add ${name}…`, [{ value: 'week', label: 'Just this week', sub: `${weekLabel(S.activeWeek)} only` }, { value: 'always', label: 'Every week', sub: 'Stays on the list until you remove it', ghost: true }]); if (!scope) return;
    extraList(scope).push({ id, qty: n }); shopDone(W()); save(); render(); toast(`${name} added at ${P.gbp(pr)} each (your price)`);
  })(); }
  else if (a === 'extra-pick') { const it = ingById(id); closeSheet(); askExtraQty(it).then(async (n) => { if (n === null) return; const scope = await askChoice(`Add ${it.name}…`, [{ value: 'week', label: 'Just this week', sub: `${weekLabel(S.activeWeek)} only` }, { value: 'always', label: 'Every week', sub: 'Stays on the list until you remove it', ghost: true }]); if (!scope) return; extraList(scope).push({ id, qty: n }); shopDone(W()); save(); render(); toast(scope === 'week' ? `${it.name} added to this week's shop` : `${it.name} added to every week`); }); }
  else if (a === 'extra-qty') { const it = ingById(id); askExtraQty(it).then((n) => { if (n === null) return; const e = extraList(el.dataset.scope).find((x) => x.id === id); if (e) e.qty = n; shopDone(W()); save(); render(); }); }
  else if (a === 'extra-remove') { const list = extraList(el.dataset.scope); const i = list.findIndex((x) => x.id === id); if (i >= 0) list.splice(i, 1); shopDone(W()); save(); render(); }
  else if (a === 'useby-add') { useByOpen.add(id); const rowEl = el.closest('.check'), it = ingById(id); if (rowEl && it) { rowEl.outerHTML = pantryRow(it); const inp = document.querySelector(`input[data-useby="${CSS.escape(id)}"]`); if (inp) { inp.focus({ preventScroll: true }); try { inp.showPicker(); } catch {} } } }
  else if (a === 'useby-clear') { for (const x of useByDue()) delete S.useBy[x.id]; save(); render(); toast('Use-by dates cleared'); }
  else if (a === 'useby-meals') { pantryBase = null; S.activeWeek = S.thisMon; S.tab = 'plan'; planAdd = null; save(); render({ top: true }); document.getElementById('useup-card')?.scrollIntoView({ block: 'start' }); }
  else if (a === 'useup') { w.useUp ||= {}; if (w.useUp[id]) delete w.useUp[id]; else { w.useUp[id] = true; if (w.pantry[id] === undefined) w.pantry[id] = true; } save(); render(); }
  else if (a === 'pick-shop') { w.shop = el.dataset.shop; save(); render(); }
  else if (a === 'save-switch') applySave(el.dataset.key);
  else if (a === 'save-all') applySave(null);
  else if (a === 'save-undo') undoSave();
  else if (a === 'open-save') { e.preventDefault(); saveOpen = true; render(); document.getElementById('savefold')?.scrollIntoView({ block: 'start' }); }
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
  else if (a === 'tip-done') { S.tips ||= {}; S.tips[el.dataset.tip] = true; save(); holdPlace(S.tab === 'plan' ? '#pick-head' : '', () => render()); }
  else if (a === 'plan-add') { planAdd = true; render({ top: true }); }
  else if (a === 'plan-week') { planAdd = false; render({ top: true }); }
  // Next-step buttons inside a page. They must not carry data-tab (that lives on the tab bar only), so they name the tab in data-to; data-week also switches week.
  else if (a === 'go-tab') { if (el.dataset.week && S.weeks[el.dataset.week]) S.activeWeek = el.dataset.week; if (el.dataset.to !== S.tab) pantryBase = null; S.tab = el.dataset.to; planAdd = null; save(); render({ top: true }); }
  else if (a === 'scroll-pick') { const v = document.getElementById('view'), h = document.getElementById('pick-head'); if (h) v.scrollTo({ top: v.scrollTop + h.getBoundingClientRect().top - v.getBoundingClientRect().top - 6 }); }
  else if (a === 'intro') openIntro();
  else if (a === 'intro-goal') { INTRO.goal = el.dataset.goal; S.settings.goal = INTRO.goal; bustCaches(); save(); introStep(2); }
  else if (a === 'intro-weight') { const v = +document.getElementById('intro-weight').value; if (!(v >= 30 && v <= 200)) { toast('Enter a weight between 30 and 200 kg'); return; } S.settings.weight = v; S.settings.proteinTarget = P.proteinTargetFor(v, INTRO.goal || S.settings.goal); S.settings.kcalTarget = P.kcalTargetFor(v, INTRO.goal || S.settings.goal); bustCaches(); save(); introStep(3); }
  else if (a === 'intro-budget') { S.settings.budget = +el.dataset.budget; save(); introStep(4); }
  else if (a === 'intro-budget-custom') { const raw = document.getElementById('intro-budget').value.trim(); const v = raw ? +raw : S.settings.budget; if (!(v >= 10 && v <= 300)) { toast('Type a budget between £10 and £300, or tap one above'); return; } S.settings.budget = v; save(); introStep(4); } // Next with nothing typed keeps the highlighted amount
  else if (a === 'intro-milk') { S.settings.milk = id; bustCaches(); save(); el.parentElement.querySelectorAll('.opt').forEach((b) => b.classList.toggle('on', b === el)); }
  else if (a === 'intro-avoid') { const i = S.settings.avoid.indexOf(id); if (i >= 0) S.settings.avoid.splice(i, 1); else S.settings.avoid.push(id); save(); el.classList.toggle('on'); }
  else if (a === 'intro-avoid-add') { if (addAvoidText('intro-avoid-text')) introStep(4); else toast('Type something first'); }
  else if (a === 'intro-avoid-rm') { removeAvoidText(el.dataset.term); introStep(4); }
  else if (a === 'settings-avoid-add') { if (addAvoidText('settings-avoid-text')) render(); else toast('Type something first'); }
  else if (a === 'settings-avoid-rm') { removeAvoidText(el.dataset.term); render(); }
  else if (a === 'intro-next') { introStep(INTRO.step + 1); }
  else if (a === 'intro-back') { introStep(Math.max(1, INTRO.step - 1)); }
  else if (a === 'intro-done') { S.settings.onboarded = true; save(); closeIntro(); S.tab = 'plan'; planAdd = null; for (const wk of Object.values(S.weeks)) relayout(wk); render({ top: true }); }
  else if (a === 'suggest-targets') { const resized = setTargets(P.kcalTargetFor(S.settings.weight, S.settings.goal), P.proteinTargetFor(S.settings.weight, S.settings.goal)); toast(`${S.settings.kcalTarget.toLocaleString()} kcal and ${S.settings.proteinTarget}g protein a day.${resized ? ' Portions resized to match.' : ''}`, 3500); }
  else if (a === 'sinc' || a === 'sdec') { w.snacks[id] = Math.max(0, (w.snacks[id] || 0) + (a === 'sinc' ? 1 : -1)); if (!w.snacks[id]) delete w.snacks[id]; save(); refreshPlan(rowSel(id)); }
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
  else if (a === 'plan-more') { planMore = !planMore; justAdded.clear(); render(); if (planMore) document.getElementById('more-meals')?.scrollIntoView({ block: 'start' }); }
  else if (a === 'plan-filter') { S.planFilter = el.dataset.filter; save(); render(); const h = document.getElementById('pick-head'); if (h) h.scrollIntoView({ block: 'start' }); }
  else if (a === 'cup-tick') { const id = el.dataset.id; if (cup.ids.has(id) && w.pantry[id] !== undefined) { delete w.pantry[id]; delete (w.useUp || {})[id]; cup.ids.delete(id); } else { w.pantry[id] = true; cup.ids.add(id); } save(); holdPlace('.cupcheck', () => render()); const t = tillNow(w); if (t) toast(`Shop is now ${P.gbp(t.total)}`); } // the price card has scrolled away by now, so say the new price where the thumb is
  else if (a === 'cup-done') { const off = cup.base === null ? 0 : P.round2(cup.base - (tillNow(w)?.total ?? cup.base)); w.cupChecked = true; save(); render(); toast(off > 0 ? `Cupboard checked. ${P.gbp(off)} off your shop.` : 'Cupboard checked'); }
  else if (a === 'go-pantry') { e.preventDefault(); pantryBase = null; S.prevTab = S.tab; S.tab = 'pantry'; save(); render({ top: true }); }
  else if (a === 'go-ideas') { S.tab = 'recipes'; S.ideasOpen = true; save(); render({ top: true }); }
  else if (a === 'ideas-toggle') { S.ideasOpen = !S.ideasOpen; save(); render(); }
  else if (a === 'idea-tag') { S.ideaTag = el.dataset.tag; save(); holdPlace('#more-meals, #ideas', () => render()); }
  else if (a === 'lib-add') { if (!S.library.includes(id)) S.library.push(id); save(); closeSheet(); render(); toast('Added to your recipes'); }
  else if (a === 'lib-remove') { S.library = S.library.filter((x) => x !== id); for (const wk of Object.values(S.weeks)) { delete wk.portions[id]; delete wk.snacks?.[id]; relayout(wk); } save(); closeSheet(); render(); toast('Removed from your recipes'); }
  else if (a === 'clear-pantry') { ask(`Untick everything for ${weekLabel(S.activeWeek).toLowerCase()}? Everything your meals need goes back on the shop list.`, 'Untick all').then((ok) => { if (ok) { const had = Object.keys(w.pantry); w.pantry = {}; w.useUp = {}; had.forEach(dropUseBy); useByOpen.clear(); save(); render(); toast('Pantry cleared'); } }); }
  else if (a === 'clear-week') { ask(`Clear every meal from ${weekLabel(S.activeWeek).toLowerCase()}?`, 'Clear week', true).then((ok) => { if (ok) { w.portions = {}; w.ticks = {}; relayout(); planAdd = null; render({ top: true }); } }); }
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
  else if (a === 'tweak-reset') { delete (S.tweaks || {})[id]; bustCaches(); save(); openSheet(tweakSheet(id)); }
  else if (a === 'tweak-rm-add') { setTweak(id, (t) => t.add.splice(+el.dataset.i, 1)); openSheet(tweakSheet(id)); }
  else if (a === 'tweak-swap') { const from = el.dataset.from, to = el.dataset.to; setTweak(id, (t) => { if (!t.drop.includes(from)) t.drop.push(from); t.add = t.add.filter((x) => x.for !== from); if (to) t.add.push({ id: to, qty: +el.dataset.qty, for: from }); }); openSheet(tweakSheet(id)); }
  else if (a === 'tweak-add') { const iid = document.getElementById('tweak-add-id').value, q = +document.getElementById('tweak-add-qty').value; if (!(q > 0)) { toast('Type how much per portion'); return; } setTweak(id, (t) => t.add.push({ id: iid, qty: q })); openSheet(tweakSheet(id)); }
  else if (a === 'add-portion') { w.portions[id] = (w.portions[id] || 0) + 1; relayout(); closeSheet(); S.tab = 'plan'; planAdd = null; render({ top: true }); }
  else if (a === 'delete-recipe') { ask('Delete this recipe?', 'Delete', true).then((ok) => { if (ok) { S.customRecipes = S.customRecipes.filter((r) => r.id !== id); bustCaches(); for (const wk of Object.values(S.weeks)) { delete wk.portions[id]; relayout(wk); } closeSheet(); render(); } }); }
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
    askText('Paste your backup', 'Paste the backup text here').then((txt) => { if (!txt) return; try { Object.assign(S, JSON.parse(txt)); bustCaches(); setupWeeks(); planAdd = null; render(); toast('Backup restored'); } catch { toast('That did not look like a backup.'); } });
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
    if (t.checked) { if (room <= 0) { t.checked = false; return; } if (!inLibrary(r.id)) { S.library.push(r.id); justAdded.add(r.id); toast('Added to your meals'); } w.portions[r.id] = Math.min(defaultPortions(r), room); } else delete w.portions[r.id]; // a tick under "More meals" adds the recipe to your list as well as your week
    relayout(); refreshPlan(rowSel(r.id));
  }
  else if (t.dataset.snackPick) { const r = recById(t.dataset.snackPick); if (t.checked) w.snacks[r.id] = 7; else delete w.snacks[r.id]; save(); refreshPlan(rowSel(r.id)); }
  else if (t.dataset.tick) { w.ticks[t.dataset.tick] = t.checked; t.closest('.line').classList.toggle('done', t.checked); const was = !!w.done; shopDone(w); save(); if (was !== !!w.done) render(); } // redraw only when the shop becomes done or stops being done (green box, tick on the Shop tab); the old test compared after the change, so it never fired
  else if (t.dataset.settingBool) { S.settings[t.dataset.settingBool] = t.checked; bustCaches(); save(); render(); }
  else if (t.dataset.settingStr) {
    // Goal moves the calorie and protein targets (and so the portions) in place; milk and the rest just redraw.
    const k = t.dataset.settingStr, oldGoal = S.settings.goal; S.settings[k] = t.value; bustCaches(); save();
    if (k === 'goal') retarget(S.settings.weight, oldGoal); else render();
  }
  else if (t.dataset.pantry) {
    // Redraw just this row from the one row builder (the old hand-patching deleted the wrong line when you unticked).
    const id = t.dataset.pantry; const hadDate = !!(S.useBy || {})[id];
    if (t.checked) w.pantry[id] = true; else { delete w.pantry[id]; delete (w.useUp || {})[id]; dropUseBy(id); useByOpen.delete(id); } save();
    if (hadDate && !t.checked) { holdPlace(`[data-prow="${CSS.escape(id)}"]`, () => render()); return; }
    const it = ingById(id); const rowEl = t.closest('.check'); if (it && rowEl) { rowEl.outerHTML = pantryRow(it); document.querySelector(`input[data-pantry="${CSS.escape(id)}"]`)?.focus({ preventScroll: true }); }
    refreshPantryPrice(); refreshPantryCount();
  }
  else if (t.dataset.useby !== undefined) { // optional use-by date: update the chip and banner in place so the iPhone date picker is not closed mid-use
    const id = t.dataset.useby; S.useBy ||= {}; if (/^\d{4}-\d{2}-\d{2}$/.test(t.value)) S.useBy[id] = t.value; else delete S.useBy[id]; save();
    const slot = t.closest('.check')?.querySelector('.datechip-slot'); if (slot) slot.innerHTML = useByChip(id); const b = document.getElementById('useby-banner'); if (b) b.innerHTML = useByInner('pantry');
  }
  else if (t.dataset.pantryQty !== undefined) { const v = parseFloat(t.value); w.pantry[t.dataset.pantryQty] = Number.isFinite(v) && v > 0 ? v : true; save(); refreshPantryPrice(); }
  else if (t.dataset.setting) {
    const k = t.dataset.setting, v = +t.value || 0, oldWeight = S.settings.weight;
    if (k === 'weight' && !(v >= 30 && v <= 200)) { t.value = oldWeight || ''; toast('Enter a weight between 30 and 200 kg'); return; }
    S.settings[k] = v; bustCaches(); if (W() && W().done) shopDone(W()); save();
    if (k === 'weight') { retarget(oldWeight, S.settings.goal); return; } // a new weight moves the targets, same as a new goal
    const mp = document.getElementById('macro-preview'); if (mp) mp.innerHTML = macroPreview(S.settings.kcalTarget, S.settings.proteinTarget);
  }
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
    bustCaches(); save(); openSheet(recipeForm()); addIngRow(); return;
  }
  if (f.id === 'recipe-form') {
    const name = fd.get('name').trim(); const id = 'c_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_');
    const slots = fd.getAll('slot'); if (!slots.length) { toast('Pick at least one slot.'); return; }
    const ings = [...f.querySelectorAll('.ing-row')].map((r) => ({ id: r.querySelector('[name=ing]').value, qty: +r.querySelector('[name=qty]').value })).filter((x) => x.qty > 0);
    if (!ings.length) { toast('Add at least one ingredient.'); return; }
    const method = String(fd.get('method')).split('\n').map((s) => s.trim()).filter(Boolean);
    const r = { id, name, slots, cold: !!fd.get('cold'), reheat: fd.get('reheat'), fridgeDays: +fd.get('fridgeDays') || 0, freezer: !!fd.get('freezer'), cookMinutes: +fd.get('cookMinutes') || 0, equipment: [], source: fd.get('source') || 'yours', ingredients: ings, method, notes: '' };
    S.customRecipes = S.customRecipes.filter((x) => x.id !== id).concat([r]); if (S.library && !S.library.includes(id)) S.library.push(id); bustCaches(); save(); closeSheet(); render(); toast('Saved to your recipes');
  }
}

boot();
