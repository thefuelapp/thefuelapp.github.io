import * as P from './planner.js';
import { CONFIG } from './config.js';
import { cloud, initCloud, onCloudChange, signIn, signUp, resetPassword, updatePassword, redeemCode, signOut, deleteAccount, hasAccess, refreshAccess, pullState, pushState, pushStateSoon, setReferral, claimMates } from './cloud.js';
import { anonId, captureAttribution, carryCodeToHomeScreen, attribution, track, setOptOut, mateCode, savedMateCode, mateStatus, growthReady, codeKind } from './growth.js';
import { planWeek } from './autoplan.js';
import { trialEndFor, loanBudget, cheapestProtein, mealCost, weightTrend, adjustSuggestion, learnFromMeals, checkinDue } from './insights.js';

const KEY = 'fuel:v1';
const APP_VERSION = 'v102';
// One line per update, newest first: shown once on Home after an update and under More → What's new.
const WHATS_NEW = [
  ['v102', '26 Nov 2026', 'A safety pass. A paid plan now opens with no signal. Forgot password lets you set a new one. Signing in as someone else on the same phone never shows or mixes the last person\'s plan, and Sign out can clear the phone. Two phones on one account pick up each other\'s changes. You can delete your account in Settings. Fields have sensible limits and the keyboard no longer covers a sheet.'],
  ['v101', '26 Nov 2026', 'Cook is rebuilt: how long is left, the next recipe as one big photo with Start cooking on it, and a page for each recipe where you tick ingredients off as you get them out. Finish a recipe and it is marked cooked. Settings now looks like your phone settings: tap a row and it opens from the bottom. Shop is tidier underneath the list. And it feels more like an app: swipe right to go back, flick a sheet down to close it, a small tap you can feel on buttons, the right keyboard for numbers and email, and tap the tab you are on to jump to the top.'],
  ['v100', '26 Nov 2026', 'A whole new look. Home shows your week at a glance, with photos of the meals you are eating: tap one and it opens on Cook. Choosing meals is now a wall of photos. Every recipe has a Start cooking button that shows one step at a time, with a timer and what that step needs, and keeps the screen awake. Fourteen colour themes under Settings, Look. Everything else works the way it did.'],
  ['v99', '23 Nov 2026', 'A faster shopping list. It now starts at the top of Shop, each item is one short line, and a ticked item drops into In the trolley at the bottom so the list gets shorter as you go. Ticked something by mistake? Tap Undo, or open In the trolley and tap it to put it back. Shop prices and savings are under one button at the top.'],
  ['v98', '23 Nov 2026', 'The chicken burrito bowl gets a street corn side (sweetcorn, red onion, jalapeños and coriander in yoghurt, from @panaceapalm) and coriander and lemon in the rice. The chicken, rice and beans are the same amounts as before, so the bowl has more protein, and one tin of sweetcorn does four bowls. Also, the chicken curry is now a spicy red one: paprika, cumin, turmeric, chilli and garam masala on top of the madras powder.'],
  ['v94', '3 Nov 2026', 'Portions stay in line with the recipes. Each meal is sized once for your targets (protein first, carbs to your calories, never more than 1.5× the recipe), and that one size is what the tiles, the week, Shop and Cook all show, so nothing moves as you pick. A day that is short says so: add a snack.'],
  ['v93', '3 Nov 2026', 'New: cucumber tuna salad on toast, a no-cook cold lunch from @allsnackco.'],
  ['v91', '2 Nov 2026', 'Meal tiles now show each meal sized for you (a typical main or breakfast for your targets), so the numbers no longer change as you pick. Four more from @cookingforgains_: creamy bacon chicken ranch pasta (slow cooker), creamy sun-dried tomato chicken & rice, BBQ bacon chicken wraps, and the steak yum yum bowls are now beef & egg chipotle bowls with a mince-or-steak pick (Shop → Where can I save?). Each recipe is sized so every day lands on your calorie and protein targets, not just the week on average. Calories show on every meal when you choose. The chicken & egg smashes cook chicken breast instead of buying a roast chicken, and the beef rice bowl uses less mince: same dishes, about a third cheaper. Recipes and Pantry have a Back button.'],
  ['v90', '27 Oct 2026', 'Portions are sized in two parts: rice, pasta, oats and potatoes fill your calories, and the meat, fish, eggs and dairy are sized to your protein target, so a high-protein week no longer means extra meat and a bigger shop. Each day in the week grid now shows its calories under the protein. Cheaper swaps in the new recipes: thin-cut frying steak, whole eggs and grated cheddar in the yum yum bowls; black beans, passata and cheddar in the burritos; honey in the chipotle smash.'],
  ['v89', '27 Oct 2026', '7 new recipes from Instagram: chipotle and creamy chicken & egg smash, steak & egg yum yum bowls, slow cooker chicken burritos, one-dish oven chicken biryani, a beef & egg chilli mayo rice bowl and apple crumble overnight oats.'],
  ['v88', '25 Oct 2026', 'Clearer everywhere: the whole week on one screen in bright colours, a new meal picker (tap Add), a status card on Home, the price first on Shop, the cook day on Cook, bigger text and buttons.'],
  ['v87', '23 Oct 2026', 'New here? The app opens on Plan with one button, Plan my week for me, until your first week is planned.'],
  ['v86', '24 Oct 2026', 'A Home tab that answers five questions, the Sunday check-in that plans next week from what happened, cook tonight when you join midweek, Shop led by the food number, light and dark, and a free week that always runs to a Sunday night.'],
  ['v85', '3 Oct 2026', 'Every meal box in the week grid the same size.'],
  ['v84', '3 Oct 2026', 'Upgrade button on the free-week card.'],
  ['v82', '3 Oct 2026', 'A sharper look: paper background, one loud colour, icons on the tab bar.'],
  ['v81', '3 Oct 2026', 'Free first week, Plan my week for me, share your week, bring 3 mates and it\u2019s free for life.'],
];
const DATA = { ingredients: [], recipes: [] };
const S = load();
if (S.tab === 'settings') S.tab = S.prevTab && S.prevTab !== 'settings' ? S.prevTab : 'home';
// v100 looks: fourteen colour sets, one design. Each is a page colour, a text colour, a panel (the light card on a dark page, or the
// dark card on a light one), a second surface, and ONE accent. applyTheme writes them to <html> as CSS variables; styles.css reads only those.
// The same table lives in design/redesign-2026-11/build_g.py (THEMES), where the looks were drawn.
const LOOKS = {
  bw: { name: 'Black and white', dark: true, pg: '8, 8, 8', tx: '#f4f4f4', txc: '244, 244, 244', p: '#ececec', pt: '#0a0a0a', ptc: '10, 10, 10', s2: '#1b1b1b', ac: '#ffffff', onac: '#0a0a0a', tabbg: '#f4f4f4', tabtx: 'rgba(10, 10, 10, .75)', tabon: '#0a0a0a', tabontx: '#ffffff' },
  wg: { name: 'White and green', dark: false, pg: '243, 246, 234', tx: '#101410', txc: '16, 20, 16', p: '#ffffff', pt: '#101410', ptc: '16, 20, 16', s2: '#dae7c7', ac: '#08482d', onac: '#ffffff', tabbg: '#ffffff', tabtx: 'rgba(16, 20, 16, .7)', tabon: '#08482d', tabontx: '#ffffff' },
  midnight: { name: 'Midnight', dark: true, pg: '14, 27, 46', tx: '#f3ebda', txc: '243, 235, 218', p: '#f3ebda', pt: 'rgb(14, 27, 46)', ptc: '14, 27, 46', s2: '#19293f', ac: '#ffd21f', onac: '#14120a', tabbg: '#f3ebda', tabtx: 'rgba(14, 27, 46, .78)', tabon: 'rgb(14, 27, 46)', tabontx: '#f3ebda' },
  pine: { name: 'Pine', dark: true, pg: '16, 39, 28', tx: '#eee2c8', txc: '243, 235, 218', p: '#eee2c8', pt: 'rgb(16, 39, 28)', ptc: '16, 39, 28', s2: '#1b3527', ac: '#f56b2a', onac: '#1d0d04', tabbg: '#eee2c8', tabtx: 'rgba(16, 39, 28, .78)', tabon: 'rgb(16, 39, 28)', tabontx: '#eee2c8' },
  plum: { name: 'Plum', dark: true, pg: '36, 20, 43', tx: '#efe5da', txc: '243, 235, 218', p: '#efe5da', pt: 'rgb(36, 20, 43)', ptc: '36, 20, 43', s2: '#34203c', ac: '#ff7ec3', onac: '#2a0a1c', tabbg: '#efe5da', tabtx: 'rgba(36, 20, 43, .78)', tabon: 'rgb(36, 20, 43)', tabontx: '#efe5da' },
  charcoal: { name: 'Charcoal', dark: true, pg: '27, 26, 24', tx: '#f0ebe1', txc: '243, 235, 218', p: '#f0ebe1', pt: 'rgb(27, 26, 24)', ptc: '27, 26, 24', s2: '#2a2825', ac: '#ff5a3c', onac: '#230a05', tabbg: '#f0ebe1', tabtx: 'rgba(27, 26, 24, .78)', tabon: 'rgb(27, 26, 24)', tabontx: '#f0ebe1' },
  sea: { name: 'Deep sea', dark: true, pg: '9, 44, 54', tx: '#f2ebdd', txc: '243, 235, 218', p: '#f2ebdd', pt: 'rgb(9, 44, 54)', ptc: '9, 44, 54', s2: '#12404c', ac: '#ff6f4d', onac: '#240b04', tabbg: '#f2ebdd', tabtx: 'rgba(9, 44, 54, .78)', tabon: 'rgb(9, 44, 54)', tabontx: '#f2ebdd' },
  wine: { name: 'Wine', dark: true, pg: '54, 15, 26', tx: '#f2e7d6', txc: '243, 235, 218', p: '#f2e7d6', pt: 'rgb(54, 15, 26)', ptc: '54, 15, 26', s2: '#4a1a28', ac: '#f4b63f', onac: '#221402', tabbg: '#f2e7d6', tabtx: 'rgba(54, 15, 26, .78)', tabon: 'rgb(54, 15, 26)', tabontx: '#f2e7d6' },
  espresso: { name: 'Espresso', dark: true, pg: '40, 27, 20', tx: '#f1e7d6', txc: '243, 235, 218', p: '#f1e7d6', pt: 'rgb(40, 27, 20)', ptc: '40, 27, 20', s2: '#3a2a20', ac: '#b9dc6a', onac: '#18230a', tabbg: '#f1e7d6', tabtx: 'rgba(40, 27, 20, .78)', tabon: 'rgb(40, 27, 20)', tabontx: '#f1e7d6' },
  varsity: { name: 'Varsity', dark: true, pg: '17, 22, 68', tx: '#efebe0', txc: '243, 235, 218', p: '#efebe0', pt: 'rgb(17, 22, 68)', ptc: '17, 22, 68', s2: '#1e2660', ac: '#c9f23f', onac: '#1a2305', tabbg: '#efebe0', tabtx: 'rgba(17, 22, 68, .78)', tabon: 'rgb(17, 22, 68)', tabontx: '#efebe0' },
  slate: { name: 'Slate', dark: true, pg: '28, 37, 43', tx: '#eef0e9', txc: '243, 235, 218', p: '#eef0e9', pt: 'rgb(28, 37, 43)', ptc: '28, 37, 43', s2: '#283640', ac: '#5fe3ab', onac: '#062418', tabbg: '#eef0e9', tabtx: 'rgba(28, 37, 43, .78)', tabon: 'rgb(28, 37, 43)', tabontx: '#eef0e9' },
  olive: { name: 'Olive', dark: true, pg: '37, 40, 22', tx: '#efead5', txc: '243, 235, 218', p: '#efead5', pt: 'rgb(37, 40, 22)', ptc: '37, 40, 22', s2: '#343821', ac: '#ff8c2e', onac: '#251103', tabbg: '#efead5', tabtx: 'rgba(37, 40, 22, .78)', tabon: 'rgb(37, 40, 22)', tabontx: '#efead5' },
  daynavy: { name: 'Daylight navy', dark: false, pg: '244, 238, 224', tx: '#0e1b2e', txc: '14, 27, 46', p: '#0e1b2e', pt: 'rgb(244, 238, 224)', ptc: '244, 238, 224', s2: '#e9e0cc', ac: '#ffd21f', onac: '#14120a', mark: '#0e1b2e', tabbg: '#0e1b2e', tabtx: 'rgba(244, 238, 224, .8)', tabon: 'rgb(244, 238, 224)', tabontx: '#0e1b2e' },
  daygreen: { name: 'Daylight green', dark: false, pg: '242, 238, 226', tx: '#10271c', txc: '16, 39, 28', p: '#10271c', pt: 'rgb(242, 238, 226)', ptc: '242, 238, 226', s2: '#e4e0cf', ac: '#f56b2a', onac: '#1d0d04', tabbg: '#10271c', tabtx: 'rgba(242, 238, 226, .8)', tabon: 'rgb(242, 238, 226)', tabontx: '#10271c' },
};
const DEFAULT_LOOK = 'midnight';
const lookKey = () => (LOOKS[S.look] ? S.look : DEFAULT_LOOK);
const isDark = () => LOOKS[lookKey()].dark;
function applyTheme() {
  const k = lookKey(), L = LOOKS[k], d = document.documentElement;
  d.dataset.look = k; d.dataset.theme = L.dark ? 'dark' : 'light'; { const [r, g, b] = [1, 3, 5].map((i) => parseInt(L.p.slice(i, i + 2), 16)); d.dataset.p = (r * 299 + g * 587 + b * 114) / 1000 > 140 ? 'light' : 'dark'; } // is the contrast panel itself light or dark (White and green has a white one on a light page) // "dark"/"light" pick which of the older rules apply; the colours themselves are the variables below
  const v = { '--pgc': L.pg, '--bg': `rgb(${L.pg})`, '--text': L.tx, '--txc': L.txc, '--panel': L.s2, '--p': L.p, '--pt': L.pt, '--ptc': L.ptc, '--accent': L.ac, '--onac': L.onac, '--mark': L.mark || L.ac,
    '--tabbg': L.tabbg, '--tabtx': L.tabtx, '--tabon': L.tabon, '--tabontx': L.tabontx };
  for (const [name, val] of Object.entries(v)) d.style.setProperty(name, val);
  const m = document.querySelector('meta[name="theme-color"]'); if (m) m.content = `rgb(${L.pg})`;
}
applyTheme();

function baseState() { return { tab: 'plan', activeWeek: null, weeks: {}, tubs: {}, customRecipes: [], customIngredients: [], inbox: [], settings: { portion: 1, weight: 85, goal: 'build', proteinTarget: 180, snackProtein: 24, budget: 50, avoid: [] } }; }
function load() {
  const base = baseState();
  try { return { ...base, ...cleanState(JSON.parse(localStorage.getItem(KEY) || '{}')) }; } catch { return base; }
}
// v102: anything that comes from outside the app's own forms (a pasted backup, the copy saved to an account, a hand-edited save) is cut
// down to safe shapes before it is used: ids are plain letters and numbers, text has a length limit, lists have a size limit.
// Text is always shown through esc(), so this is the second lock on the door, not the only one.
function cleanState(o) {
  if (!o || typeof o !== 'object' || Array.isArray(o)) return {};
  const out = {}; for (const k of Object.keys(o)) if (!['__proto__', 'constructor', 'prototype'].includes(k)) out[k] = o[k];
  const str = (v, n) => String(v ?? '').slice(0, n); const arr = (v, n) => (Array.isArray(v) ? v : []).slice(0, n);
  const idOk = (id) => typeof id === 'string' && /^[A-Za-z0-9_-]{1,90}$/.test(id); const word = (v, d) => (typeof v === 'string' && /^[A-Za-z0-9 _&-]{1,30}$/.test(v) ? v : d);
  if ('customRecipes' in out) out.customRecipes = arr(out.customRecipes, 300).filter((r) => r && typeof r === 'object' && idOk(r.id) && arr(r.slots, 6).some((x) => typeof x === 'string')).map((r) => ({ ...r, name: str(r.name, 120) || 'Recipe', source: str(r.source, 120), notes: str(r.notes, 2000), ...(r.short ? { short: str(r.short, 40) } : {}), reheat: word(r.reheat, 'microwave'),
    slots: arr(r.slots, 6).filter((x) => typeof x === 'string' && /^[a-z]{1,12}$/.test(x)), method: arr(r.method, 60).map((m) => str(m, 1500)), equipment: arr(r.equipment, 10).map((x) => str(x, 40)), ingredients: arr(r.ingredients, 80).filter((x) => x && idOk(x.id)).map((x) => ({ ...x, qty: +x.qty || 0 })) })).filter((r) => r.slots.length);
  if ('customIngredients' in out) out.customIngredients = arr(out.customIngredients, 500).filter((i) => i && typeof i === 'object' && idOk(i.id)).map((i) => ({ ...i, name: str(i.name, 120) || 'Ingredient', unit: word(i.unit, 'g'), category: word(i.category, 'other'), store: word(i.store, 'cupboard'), protein: +i.protein || 0, packs: arr(i.packs, 30) }));
  if ('inbox' in out) out.inbox = arr(out.inbox, 200).filter((x) => x && typeof x === 'object' && /^https?:\/\//i.test(String(x.url || ''))).map((x) => ({ url: str(x.url, 600), note: str(x.note, 400), added: str(x.added, 10) }));
  if ('weeks' in out) { const w = {}; if (out.weeks && typeof out.weeks === 'object' && !Array.isArray(out.weeks)) for (const k of Object.keys(out.weeks)) if (/^\d{4}-\d{2}-\d{2}$/.test(k) && out.weeks[k] && typeof out.weeks[k] === 'object') w[k] = out.weeks[k]; out.weeks = w; }
  if ('settings' in out) { const st = out.settings && typeof out.settings === 'object' && !Array.isArray(out.settings) ? { ...out.settings } : {}; delete st.__proto__; st.avoid = arr(st.avoid, 40).filter((x) => typeof x === 'string' && x.length <= 30); if ('avoidText' in st) st.avoidText = arr(st.avoidText, 40).map((x) => str(x, 40).toLowerCase()).filter(Boolean); out.settings = { ...baseState().settings, ...st }; }
  if ('look' in out && typeof out.look !== 'string') delete out.look;
  if ('tab' in out && !['home', 'plan', 'shop', 'cook', 'more', 'recipes', 'pantry', 'settings'].includes(out.tab)) out.tab = 'home';
  if ('library' in out) out.library = arr(out.library, 2000).filter(idOk);
  return out;
}
function syncable() { const { tab, search, planSearch, planFilter, pantrySearch, pantryRestOpen, ideasOpen, ideaTag, ...rest } = S; return rest; }
function save() {
  S.updatedAt = new Date().toISOString();
  if (cloud.enabled && !cloud.user && S.settings?.onboarded) S.signedOutEdits = true; // used on sign-in: this phone has its own plan, so ask before replacing it
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {}
  pushStateSoon(syncable); notePlanned();
}

// ---------- the free first week, and who can use the app ----------
// Everyone gets every feature free: no account, no card. Since v86 the clock starts at the first PLANNED week (7+ meals), not at
// first open, and always ends on a Sunday night (insights.trialEndFor), so nobody is cut off mid-week with a list half ticked.
// Then "Keep your plan: £4.99 once", or free for life once 3 mates have planned a week with their code. A creator's code makes
// it 14 days (S.trial.days, from growth.js codeKind). Saves from before v86 keep S.stepPlanned as their planAt; the old end
// (first open + 7 days) still counts if it is later, so nobody's free week got shorter.
const TRIAL_DAYS = 7;
function trialStart() { if (!S.trial?.start) { S.trial = { start: new Date().toISOString() }; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} } return S.trial.start; }
const trialPlanAt = () => S.trial?.planAt || S.stepPlanned || null;
function trialEnd() {
  const t = S.trial || {}; const e = trialEndFor({ planAt: trialPlanAt(), planWeek: t.planWeek || null, days: t.days || TRIAL_DAYS }); if (!e) return null;
  const old = t.start ? new Date(Date.parse(t.start) + TRIAL_DAYS * 86400000) : null; return old && old > e ? old : e;
}
function trialLeft() { const e = trialEnd(); if (!e) return TRIAL_DAYS; return Math.max(0, Math.ceil((e.getTime() - Date.now()) / 86400000)); }
const trialActive = () => { const e = trialEnd(); return !e || Date.now() < e.getTime(); };
const trialTotalDays = () => { const e = trialEnd(), a = trialPlanAt(); return e && a ? Math.max(TRIAL_DAYS, Math.round((e.getTime() - Date.parse(a)) / 86400000)) : TRIAL_DAYS; };
const trialDay = () => Math.min(trialTotalDays(), Math.max(1, trialTotalDays() - trialLeft() + 1));
const dayName = (d) => d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' }).replace(',', '');
const onTrial = () => cloud.enabled && !paidUp() && !matesUnlocked() && trialActive();
// The free week, said plainly wherever it matters: which day you're on, when it ends, and that nothing is charged by itself.
function trialSegs() { const n = trialTotalDays(), d = trialEnd() ? trialDay() : 0; return `<div class="fw-seg" style="grid-template-columns:repeat(${n},1fr)">${Array.from({ length: n }, (_, i) => `<i class="${i < d ? 'on' : ''}${i === d - 1 ? ' now' : ''}"></i>`).join('')}</div>`; }
function freeWeekCard() {
  if (!onTrial() || !trialEnd()) return ''; // v87: nothing about free weeks or upgrading until they have planned a week (the clock only starts then)
  const left = trialLeft(), soon = left <= 2;
  const head = soon ? (left === 1 ? 'Last free day' : '2 free days left') : `Free week · ${left} day${left === 1 ? '' : 's'} left`;
  return `<div class="freeweek ${soon ? 'soon' : ''}" id="freeweek"><div class="fw-top"><span class="fw-eyebrow">${ic('gift', 15)}${head}</span><button class="fw-more" data-action="trial">How it works</button></div>${trialSegs()}
    <button class="btn block fw-upgrade" data-action="buy-open">Upgrade · ${esc(CONFIG.PRICE_LABEL || '£4.99')} once<span>Yours for life. No subscription.</span></button></div>`;
}
const matesUnlocked = () => !!S.mate?.unlocked;
const paidUp = () => cloud.enabled && hasAccess(); // an account with access: bought, a code, or claimed mates
function canUse() { return !cloud.enabled || hasAccess() || trialActive() || matesUnlocked(); }
// v87: someone who has never put a meal in any week is still "new". New people open on Plan (not Home) and see one clear first step.
const everPlanned = () => !!S.stepPlanned || Object.values(S.weeks || {}).some((w) => Object.values(w.portions || {}).some((n) => n > 0));
// "Planned a week" (the goal the launch plan counts): a week with at least 7 meals in it. It also starts the free-week clock.
function notePlanned() {
  if (S.stepPlanned) return;
  const key = Object.keys(S.weeks || {}).sort().find((k) => Object.values(S.weeks[k].portions || {}).reduce((t, n) => t + n, 0) >= 7);
  if (!key) return;
  S.stepPlanned = new Date().toISOString(); S.trial = { ...(S.trial || {}), planAt: S.stepPlanned, planWeek: key }; track('planned');
  try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {}
  refreshTrialPill();
}

// ING(), RAW() and REC() are asked for dozens of times per tap, so each remembers its last answer and rebuilds only when what it is made from changes.
// The keys: the data arrays themselves (replaced on load), the custom lists (replaced or pushed to), the tweaks and the two targets. Never the week (v94).
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
  const ingredients = r.ingredients.flatMap((x) => { if (!drop.has(x.id)) return [x]; const sw = (t.add || []).find((a) => a.for === x.id); return sw ? [{ id: sw.id, qty: sw.qty, ...(x.side ? { side: true } : {}) }] : []; }).concat((t.add || []).filter((x) => !x.for).map((x) => ({ id: x.id, qty: x.qty })));
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
let SCALED = { key: '', raw: null, list: null };
// Forget everything worked out from recipes, ingredients, tweaks or settings. Cheap to call; the next draw rebuilds what it needs.
function bustCaches() { ING_C = { a: null, b: null, n: -1, list: [] }; RAW_C = { a: null, b: null, n: -1, t: '', ing: null, list: [] }; SCALED = { key: '', raw: null, list: null }; META.clear(); }
const rawById = () => { const list = RAW(); return (RAW_C.byId ||= Object.fromEntries(list.map((r) => [r.id, r]))); };
const sizeTargets = (kcal = S.settings.kcalTarget, protein = S.settings.proteinTarget) => ({ kcal: kcal || 0, protein: protein || 0 });
// Every recipe at its size for this person (v94, P.sizeAll): one size per recipe from the two targets, protein first, carbs to the calories,
// never more than 1.5× the recipe as written. The same list feeds the picker tiles, the Recipes list, the week grid, Shop and Cook, so a
// meal's numbers never move as meals are picked. Rebuilt when the recipes, the tweaks or the targets change; never when the week does.
const REC = () => {
  const raw = RAW(), t = sizeTargets(), key = `${t.kcal}|${t.protein}`;
  if (SCALED.key !== key || SCALED.raw !== raw) { SCALED = { key, raw, list: P.sizeAll(raw, t, ING()) }; META.clear(); }
  return SCALED.list;
};
// The sizes a week's meals get at a pair of targets, as one string: setTargets asks whether the portions really changed.
function weekSizes(w, kcal, protein) { const ing = ING(), raw = rawById(); return Object.entries(w?.portions || {}).filter(([id, n]) => n > 0 && raw[id]).map(([id]) => { const f = P.sizeFor(raw[id], sizeTargets(kcal, protein), ing); return `${id}:${f.p}/${f.c}`; }).join(','); }
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

// ---------- weeks ----------
const iso = (d) => d.toISOString().slice(0, 10);
function mondayOf(date) { const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate())); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return iso(d); }
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
// v88: small line icons beside labels (same stroke style as the tab bar). Decorative: aria-hidden.
const ICON = {
  cal: '<rect x="3.5" y="4.5" width="17" height="16" rx="3.5"/><path d="M8 2.8v3.4M16 2.8v3.4M3.5 9.5h17"/>',
  basket: '<path d="M4.5 9h15l-1.3 9.2a2 2 0 0 1-2 1.8H7.8a2 2 0 0 1-2-1.8z"/><path d="M8.5 9 11 4M15.5 9 13 4M9.5 13v3.5M14.5 13v3.5"/>',
  pan: '<path d="M3.5 11.5h17v2a6.5 6.5 0 0 1-6.5 6.5h-4a6.5 6.5 0 0 1-6.5-6.5z"/><path d="M8.5 3.5c-1 1.2 1 2.3 0 3.5M12 3.5c-1 1.2 1 2.3 0 3.5M15.5 3.5c-1 1.2 1 2.3 0 3.5"/>',
  flame: '<path d="M12 3c1 3 4 4.5 4 8.5a4 4 0 0 1-8 0c0-1.5.5-2.5 1.2-3.3.3 1 .9 1.6 1.8 1.8C10.5 8 11 5.5 12 3z"/>',
  pound: '<path d="M15.5 6.5a3.5 3.5 0 0 0-6.5 1.8V15l-2 2.5h10M7.5 12.5h6"/>',
  tub: '<rect x="3.5" y="8" width="17" height="12" rx="2"/><path d="M3.5 11.5h17M8 8V5.5h8V8"/>',
  snow: '<path d="M12 3v18M4.2 7.5l15.6 9M19.8 7.5l-15.6 9"/>',
  gift: '<path d="M20 12v8H4v-8M2 7h20v5H2zM12 7v13M12 7c-2-4-7-3-5 0M12 7c2-4 7-3 5 0"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2h-15zM10 20a2 2 0 0 0 4 0"/>',
  scale: '<path d="M12 3v3M4 20h16M6 20V9h12v11M9 13h6"/>',
  book: '<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v16H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5V4.5M8 6h8"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  go: '<path d="M7 17 17 7M9 7h8v8"/>',
  left: '<path d="M15 5l-7 7 7 7"/>',
  right: '<path d="M9 5l7 7-7 7"/>',
  down: '<path d="M5 9l7 7 7-7"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  share: '<path d="M12 15V3.5M7.5 8 12 3.5 16.5 8M5 12.5V19a1.5 1.5 0 0 0 1.5 1.5h11A1.5 1.5 0 0 0 19 19v-6.5"/>',
  copy: '<rect x="8.5" y="8.5" width="12" height="12" rx="2.5"/><path d="M15.5 8.5V6A2.5 2.5 0 0 0 13 3.5H6A2.5 2.5 0 0 0 3.5 6v7A2.5 2.5 0 0 0 6 15.5h2.5"/>',
  user: '<circle cx="12" cy="8.5" r="4"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cog: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
};
const ic = (k, s = 18) => `<svg class="ico" width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[k]}</svg>`;
// v88: one solid colour per meal (planner.mealColours). Pass the week's map so two meals in one week never share a colour.
function weekColours(w) { const ids = new Set(); for (const day of w.grid || []) for (const v of Object.values(day)) { if (P.isRecipeCell(v)) ids.add(v); else if (P.isTub(v)) ids.add(P.tubRecipe(v)); } return P.mealColours([...ids]); }
// v100: a meal's colour is one of eight tones made from the look's own colours (styles.css --t0..--t7), not a rainbow.
const toneOf = (id, map) => { const c = (map && map.get(id)) || P.mealColour(id); const i = P.MEAL_COLOURS.findIndex(([bg]) => bg === c.bg); return i < 0 ? 0 : i; };
const mealStyle = (id, map) => { const i = toneOf(id, map); return `background:var(--t${i});color:var(--t${i}f)`; };
// v100: every recipe has a photo of a similar dish (img/meals, credits in img/meals/CREDITS.md). Shown where meals are chosen and cooked, and on Home.
const photoOf = (r) => { const k = r && (r.photo || RAW().find((x) => x.id === r.id)?.photo); return k ? `img/meals/${k}.jpg` : ''; };
const photoImg = (r, cls = '') => { const src = photoOf(r); return src ? `<img class="mph ${cls}" src="${src}" alt="" loading="lazy" decoding="async">` : `<span class="mph none ${cls}"></span>`; };
const cellStyle = (id) => mealStyle(id);   // the old name, kept for the snack chips and anything else that still calls it
const cookShort = (w) => { const c = cookDate(w, S.activeWeek); return `${DAY_FULL[new Date(c + 'T00:00:00Z').getUTCDay() === 0 ? 6 : new Date(c + 'T00:00:00Z').getUTCDay() - 1]} ${fmtDate(c)}`; };
// The cook-day chips: Tonight / Tomorrow for this week, day names otherwise; gone days disabled (Sunday = the Sunday before the week).
function cookDayChips(w) {
  const t = todayISO(), tm = addDays(t, 1);
  const days = [6, 0, 1, 2, 3, 4, 5].map((i) => ({ i, date: i === 6 ? addDays(S.activeWeek, -1) : addDays(S.activeWeek, i) })); // in date order: a Sunday cook is the Sunday before the week
  return `<div class="day-pick">${days.map(({ i, date }) => { const gone = date < t; const label = date === t ? 'Tonight' : date === tm ? 'Tomorrow' : P.DAYS[i]; return `<button data-action="cookday" data-day="${i}" class="${w.cookDay === i ? 'on' : ''}${gone ? ' gone' : ''}" ${gone ? 'disabled' : ''} title="${i === 6 ? 'The Sunday before the week' : ''}">${label}</button>`; }).join('')}</div>`;
}
// The date you actually cook for this week: a Sunday cook is the Sunday before the week starts.
function cookDate(w, key) { return w.cookDay === 6 ? addDays(key, -1) : addDays(key, w.cookDay); }
// "today (Tue 20 Oct)", "tomorrow (Wed 21 Oct)" or "on Sunday 18 Oct": the cook day as a person would say it.
function cookLabel(w, key) { const c = cookDate(w, key), t = todayISO(); const d = `${new Date(c + 'T00:00:00Z').toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })} ${fmtDate(c)}`; return c === t ? `today, ${d}` : c === addDays(t, 1) ? `tomorrow, ${d}` : `on ${d}`; }
function addDays(isoDate, n) { const d = new Date(isoDate + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return iso(d); }
// '20 Sep 2026' or '6–13 Sep 2026' from ISO dates (the house style says 'Sep', the locale says 'Sept')
function dateRange(dates) { const v = [...new Set(dates.filter(Boolean))].sort(); if (!v.length) return ''; const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const [a, z] = [v[0], v[v.length - 1]].map((x) => x.split('-').map(Number)); return a.join() === z.join() ? `${a[2]} ${M[a[1] - 1]} ${a[0]}` : `${a[2]}${a[1] !== z[1] ? ' ' + M[a[1] - 1] : ''}${a[0] !== z[0] ? ' ' + a[0] : ''}–${z[2]} ${M[z[1] - 1]} ${z[0]}`; }
// When the prices on one shop's list were read: its own packs, plus the other shops' packs for anything it doesn't sell.
function listDates(T, b) { return [...b.lines.map((l) => l.pack?.checked), ...b.notSold.map((m) => { let best = null; for (const o of T.ranked) { if (o === b) continue; const l = o.lines.find((x) => x.id === m.id); if (l && (!best || l.cost < best.cost)) best = l; } return best?.pack?.checked; })]; }
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
  { const keepFrom = addDays(thisMon, -7); for (const k of Object.keys(S.weeks)) if (k < keepFrom) delete S.weeks[k]; } // last week stays one more week, for the Sunday check-in
  if (!S.weeks[thisMon]) { const w = blankWeek(); const t = (new Date().getDay() + 6) % 7; for (let i = 0; i < t; i++) w.days[i] = false; if (t > 0) w.cookDay = t; S.weeks[thisMon] = w; } // first open mid-week: the days already gone are off, and the cook is today (not the Sunday that has gone)
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
  return `<div class="wtabs" role="tablist">${[S.thisMon, S.nextMon].map((k) => `<button role="tab" aria-selected="${S.activeWeek === k}" class="${S.activeWeek === k ? 'on' : ''}" data-action="week" data-week="${k}">${weekLabel(k)}<small>${fmtDate(k)} – ${fmtDate(addDays(k, 6))}</small></button>`).join('')}</div>`;
}

// One line under each page title: where this page sits in Plan, Shop, Cook (n = 0 for the two extras).
const titleRow = (title, n, txt) => (txt ? `<h1>${title}</h1>${stepLine(n, txt)}` : `<div class="titlerow"><h1>${title}</h1>${stepLine(n, '')}</div>`); // v88: the step eyebrow sits beside the title when there is nothing else to say
const stepLine = (n, txt) => `<p class="stepline"><b>${n ? `Step ${n} of 3` : 'Extra'}</b>${txt ? ' ' + txt : ''}</p>`;

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
  // Where this device came from (?r=tt, ?c=CODE) is kept from its first visit; each step is counted once per device, anonymously.
  captureAttribution(); carryCodeToHomeScreen(); setOptOut(() => S.settings?.countSteps === false); trialStart();
  { const a = attribution(); if (a.code && !S.trial?.codeAsked) codeKind(a.code).then((k) => { S.trial = { ...(S.trial || {}), codeAsked: true }; if (k?.kind === 'creator') { S.trial.days = 14; S.trial.codeName = k.name || ''; } save(); refreshTrialPill(); }).catch(() => {}); } // a creator's code: 14 free days, and the set-up screen says whose
  { const m = savedMateCode(); if (m && !S.mate) S.mate = { ...m }; else if (S.mate?.code && !m) try { localStorage.setItem('fuel:mate', JSON.stringify({ code: S.mate.code, secret: S.mate.secret })); } catch {} }
  track('open'); if (isStandalone()) track('home');
  try {
    const [i, r] = await Promise.all([fetch('data/ingredients.json').then((x) => x.json()), fetch('data/recipes.json').then((x) => x.json())]);
    DATA.ingredients = i.items; DATA.recipes = r.items; bustCaches(); DATA.priceNote = i.checkedNote; DATA.priceDates = i.items.flatMap((x) => x.packs || []).filter((p) => P.SHOPS.includes(p.shop)).map((p) => p.checked).filter(Boolean); DATA.priceDate = [...DATA.priceDates].sort().pop() || '';
  } catch (e) {
    document.getElementById('view').innerHTML = `<div class="bad-box">Couldn't load the recipe data. ${esc(e.message)}</div>`;
    return;
  }
  setupWeeks();
  // v87: until the first week is planned, the app opens on Plan (Home has nothing to answer yet), and "what's new" is only for people who were here before
  if (!everPlanned() && S.tab === 'home') S.tab = 'plan';
  if (!S.settings.onboarded) S.seenVersion = APP_VERSION;
  document.getElementById('tabs').addEventListener('click', (e) => { const b = e.target.closest('button'); if (b) { haptic('tick'); if (b.dataset.tab === S.tab && !(S.tab === 'cook' && cookView) && document.getElementById('view').scrollTop > 0) { document.getElementById('view').scrollTo({ top: 0, behavior: 'smooth' }); return; } justAdded.clear(); if (b.dataset.tab !== S.tab) pantryBase = null; if (b.dataset.tab === 'cook') cookView = null; S.tab = b.dataset.tab; planAdd = null; save(); render({ top: true }); } });
  const v = document.getElementById('view');
  v.addEventListener('click', onAction); v.addEventListener('change', onChange); v.addEventListener('input', onInput);
  // Shop's "Where can I save?" fold: its switches are only worked out once it is opened. 'toggle' doesn't bubble, hence capture; the equality test stops the redrawn, already-open fold looping.
  v.addEventListener('toggle', (e) => { if (e.target.classList?.contains('pantry-rest') && !S.pantrySearch && !!S.pantryRestOpen !== e.target.open) { S.pantryRestOpen = e.target.open; try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} } }, true); // this device only, so no cloud push
  v.addEventListener('toggle', (e) => { if (e.target.id !== 'savefold' || e.target.open === saveOpen) return; saveOpen = e.target.open; if (saveOpen) render(); }, true);
  v.addEventListener('toggle', (e) => { if (e.target.id === 'pricefold') priceOpen = e.target.open; else if (e.target.id === 'trolleyfold') trolleyOpen = e.target.open; }, true);
  v.addEventListener('pointerdown', onDragStart);
  v.addEventListener('touchmove', (e) => { if (drag.active) e.preventDefault(); }, { passive: false });
  v.addEventListener('contextmenu', (e) => { if (e.target.closest('.cell')) e.preventDefault(); });
  render();
  // No sign-in wall: the free week opens straight into set-up. The door only appears once the free week is over and nothing else unlocks it.
  if (canUse()) ensureIntro();
  onCloudChange(async () => {
    const gated = gateScreen();
    if (cloud.user && document.querySelector('#sheet-inner #signin-form') && !document.getElementById('sheet').hidden) closeSheet(); // signed in from a sheet
    if (cloud.user && cloud.user.id !== syncedFor) { syncedFor = cloud.user.id; lastPull = Date.now(); await syncOnSignIn(); afterSignIn(); hardeningReady().then((ok) => { HARD_OK = ok; if (ok && S.tab === 'settings') render(); }); }
    if (!cloud.user) syncedFor = null; // signing out and back in (or in as someone else) runs the sync again
    if (cloud.recovery && cloud.user) { cloud.recovery = false; newPassSheet(); } // arrived from a "reset my password" email
    if (cloud.user && !gated) noteOpen();
    if (!gated) ensureIntro();
    if (S.tab === 'pantry' || S.tab === 'settings') render(); else refreshTrialPill();
    if (S.pendingBuy && cloud.user && !hasAccess()) { S.pendingBuy = false; save(); closeSheet(); buySheet(); }
  });
  if (cloud.enabled) { cloud.status = 'loading'; gateScreen(); }
  initCloud();
  growthReady().then((ok) => { GROWTH_OK = ok; if (!ok) return; if (S.tab === 'settings') render(); const g = document.getElementById('gate'); if (!g.hidden) { g.dataset.key = ''; gateScreen(); } if (S.mate?.code && !hasAccess()) refreshMates(); }); // a mate may have planned their week since last time
  // Coming back from Stripe: re-check access without a manual refresh, and keep checking for a minute after a Buy tap.
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') { recheckAccess(false); rollWeeks(); syncOnFocus(); } });
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
  if (hasAccess()) { S.buyStarted = 0; save(); track('paid'); closeSheet(); gateScreen(); toast('Payment received. FU£L is yours for life.'); if (!S.settings.onboarded) ensureIntro(); else render({ top: true }); }
  else if (manual) toast('Not unlocked yet. Give it a few seconds and try again.');
}

// On any sign-in (at boot or from the gate): take the account's saved copy if it's newer, otherwise send this phone's copy up.
let syncedFor = null;
// Put the account's copy on this phone. What belongs to the phone (which tab, the free-week clock, the mate code) stays.
function applyRemote(data, msg) {
  const rd = cleanState(data);
  const keep = { tab: S.tab, trial: S.trial, mate: S.mate || rd.mate, refSent: { ...(rd.refSent || {}), ...(S.refSent || {}) }, stepPlanned: S.stepPlanned || rd.stepPlanned, owner: cloud.user?.id || S.owner };
  if (rd.trial?.start && S.trial?.start && rd.trial.start < S.trial.start) keep.trial = rd.trial; // the earlier free-week start wins
  Object.assign(S, rd, keep); bustCaches(); setupWeeks(); planAdd = null; applyTheme(); save(); render(); if (msg) toast(msg);
  if (S.settings.onboarded && introOpen()) closeIntro();
}
async function syncOnSignIn() {
  const remote = await pullState(); const uid = cloud.user?.id; if (!uid) return;
  // v102: a different person's plan is on this phone (they signed out, someone else signed in). It is never shown to the new
  // account and never saved into it: the phone starts from that account's own copy, or from blank.
  if (S.owner && S.owner !== uid) {
    const mate = S.mate; for (const k of Object.keys(S)) delete S[k];
    Object.assign(S, baseState(), cleanState(remote?.data || {}), { owner: uid, tab: 'home', mate, signedOutEdits: false });
    bustCaches(); setupWeeks(); planAdd = null; cookView = null; cookGot.clear(); applyTheme(); save(); render({ top: true }); ensureIntro(); return;
  }
  S.owner = uid;
  const planned = (st) => Object.values(st?.weeks || {}).some((w) => Object.keys(w.portions || {}).length);
  let useRemote = !!(remote && remote.updated_at && (!S.updatedAt || remote.updated_at > S.updatedAt));
  // The free week means people now plan BEFORE signing in. If this phone and the account both have a plan, ask which to keep
  // (otherwise a newer phone copy would quietly replace the account's, or the other way round).
  if (remote?.data && planned(remote.data) && planned(S) && S.signedOutEdits) {
    const pick = await askChoice('This phone and your account both have a plan. Which do you want?', [
      { value: 'account', label: 'The one saved to my account', sub: remote.updated_at ? `Last changed ${fmtDate(remote.updated_at.slice(0, 10))}` : '' },
      { value: 'phone', label: 'The one on this phone', sub: 'It replaces the account copy', ghost: true }]);
    useRemote = pick !== 'phone';
  } else if (remote?.data && planned(remote.data) && !planned(S)) useRemote = true;
  S.signedOutEdits = false;
  if (useRemote && remote?.data) applyRemote(remote.data, 'Synced from your account');
  else pushStateSoon(syncable);
}
// Two phones on one account: when the app comes back to the front, take the other phone's changes if they are newer (at most twice a minute,
// and never while a sheet, the set-up or the cooking steps are open).
let lastPull = 0;
async function syncOnFocus() {
  if (!cloud.user || Date.now() - lastPull < 30000 || !document.getElementById('sheet').hidden || introOpen() || CM.id) return;
  lastPull = Date.now(); const uid = cloud.user.id;
  const remote = await pullState(); if (!remote?.data || !cloud.user || cloud.user.id !== uid || S.owner !== uid) return;
  const theirs = Date.parse(remote.data.updatedAt || ''), mine = Date.parse(S.updatedAt || '');
  if (!(theirs > mine) || !document.getElementById('sheet').hidden) return;
  applyRemote(remote.data, 'Updated from your other device');
}

// The 1 and 2 on the tab bar turn into ticks: Plan once a meal is picked, Shop once the list is all ticked off. Cook never does (the app can't know you cooked).
const SUB_SCREENS = ['recipes', 'pantry', 'settings']; // screens reached from More (or a link), not from the tab bar: they carry a Back button
function markTabs() { const w = W(); if (!w) return; const d = { plan: Object.values(w.portions || {}).some((n) => n > 0), shop: !!w.done }; document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('done', !!d[b.dataset.tab])); }
function render(opts = {}) {
  if (S.tab !== 'shop') { saveUndo = null; saveOpen = false; priceOpen = false; trolleyOpen = false; hideUndo(); } // leaving Shop drops the Undo: the week may be edited elsewhere
  const view = document.getElementById('view'); const y = view.scrollTop;
  document.querySelectorAll('#tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === S.tab || (b.dataset.tab === 'more' && ['recipes', 'pantry', 'settings'].includes(S.tab)))); markTabs();
  const page = ({ home: renderHome, more: renderMore, plan: renderPlan, cook: renderCook, shop: renderShop, recipes: renderRecipes, pantry: renderPantry, settings: renderSettings })[S.tab] || renderHome;
  const body = page(); const inRecipe = S.tab === 'cook' && !!cookView; // the recipe page and the screens under More carry their own Back, so no brand bar
  view.classList.toggle('has-dock', page === renderPlan || inRecipe); view.classList.toggle('bare', inRecipe);
  const bar = `<div class="brandbar">${S.tab === 'settings' ? '' : `<button class="gear" data-action="settings" aria-label="Settings" title="Settings"><svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg></button>`}<span class="wordmark" aria-label="Fuel">FU<b>£</b>L</span>${S.tab === 'settings' ? '' : trialPill()}</div>`;
  view.innerHTML = (inRecipe || SUB_SCREENS.includes(S.tab) ? '' : bar) + body;
  view.scrollTop = opts.top ? 0 : y;
  view.classList.remove('push', 'pop'); // a page turn never outlives the next draw (an animation paused in the background would leave the page dim)
  if (opts.anim) { void view.offsetWidth; view.classList.add(opts.anim); view.addEventListener('animationend', () => view.classList.remove('push', 'pop'), { once: true }); }
}

// ----- Home (v86): one card per question. Am I on budget? Am I hitting protein? Do I need to cook? Is it working over the term? What's next? -----
// One point per week for the spend chart: a till total from a check-in or a ticked-off shop counts as real (filled); a planned week's list price is hollow.
function spendSeries() {
  const log = S.spendLog || {}; const pts = [];
  for (const k of [...new Set([...Object.keys(log), ...Object.keys(S.weeks)])].sort()) {
    const v = log[k];
    if (v && v.total > 0) { pts.push({ key: k, total: v.weekly ?? v.total, kind: v.source === 'till' ? 'till' : 'shop', meals: v.meals || 0 }); continue; }
    const wk = S.weeks[k]; if (!wk || !wk.grid || !Object.values(wk.portions || {}).some((n) => n > 0)) continue;
    const c = shopTotals(wk).chosen; if (c && c.lines.length) pts.push({ key: k, total: c.weekly, kind: 'list', meals: P.gridStats(wk.grid, REC(), ING(), snackExtra(wk), wk.days).filled });
  }
  return pts.slice(-8);
}
function sparkline(pts, { refY = null, H = 92, W = 300 } = {}) {
  const pad = 16; const vals = pts.map((p) => p.v); const maxY = Math.max(refY || 0, ...vals) * 1.12 || 1, minY = refY != null ? 0 : Math.min(...vals) * 0.98;
  const x = (i) => (pts.length === 1 ? W / 2 : pad + (i * (W - 2 * pad)) / (pts.length - 1)); const y = (v) => H - 16 - (((v - minY) / (maxY - minY || 1)) * (H - 34));
  const line = pts.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const dots = pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="4" class="${p.hollow ? 'hollow' : ''}"><title>${esc(p.title || '')}</title></circle>`).join('');
  const labels = pts.map((p, i) => `<text x="${x(i).toFixed(1)}" y="${H - 2}" text-anchor="${i === 0 && pts.length > 1 ? 'start' : i === pts.length - 1 && pts.length > 1 ? 'end' : 'middle'}">${esc(p.label)}</text>`).join('');
  const last = pts[pts.length - 1]; const lastLabel = `<text x="${x(pts.length - 1).toFixed(1)}" y="${(y(last.v) - 9).toFixed(1)}" text-anchor="end" class="val">${esc(last.valLabel || '')}</text>`;
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none">${refY != null ? `<line x1="0" x2="${W}" y1="${y(refY).toFixed(1)}" y2="${y(refY).toFixed(1)}" class="refline"/>` : ''}<polyline points="${line}"/>${dots}${labels}${lastLabel}</svg>`;
}
// v100 Home: where the week is at. Three step chips, the next thing to do with one arrow, and a thin line for how far through you are.
function homeTop(w) {
  const recipes = REC(), ing = ING();
  const planned = Object.values(w.portions || {}).some((n) => n > 0) || Object.keys(lockedCells(w)).length > 0;
  const T = planned ? shopTotals(w) : null; const c = T ? T.chosen : null; const lines = c ? c.lines : []; // every line on the list, basics included, so Home and Shop count the same
  const ticked = c ? lines.filter((l) => w.ticks[`${c.shop}:${l.id}`]).length : 0;
  const rs = planned ? P.runSheet(weekCounts(w, { fresh: freshMap(w), skipFresh: true }), recipes) : null;
  const cookGone = planned && cookDate(w, S.activeWeek) < todayISO();
  const due = checkinWeeks();
  const steps = [{ k: 'plan', word: 'Plan', done: planned }, { k: 'shop', word: 'Shop', done: !!w.done }, { k: 'cook', word: 'Cook', done: planned && ((cookGone && !!w.done) || cookedAll(w)) }];
  const left = steps.filter((x) => !x.done).length; const now = steps.findIndex((x) => !x.done);
  const chips = `<div class="hsteps">${steps.map((x, i) => `${i ? '<i></i>' : ''}<button class="${x.done ? 'done' : i === now ? 'now' : ''}" data-action="go-tab" data-to="${x.k}">${x.word}${x.done ? ic('check', 14) : ''}</button>`).join('')}<span>${left ? `${left} to go` : 'All done'}</span></div>`;
  let next = null;
  if (due.length) next = { eye: 'Sunday check-in', title: due[0] === S.thisMon ? 'Check in on this week' : `Check in on ${fmtDate(due[0])}`, sub: 'Under a minute', attrs: `data-action="checkin-start" data-week="${due[0]}"` };
  else if (!planned) next = null;
  else if (now === 1) next = { eye: 'Next · step 2 of 3', title: c && lines.length ? `Shop at ${esc(P.SHOP_NAMES[c.shop])}` : 'Shop', sub: c && lines.length ? `${lines.length - ticked} to get${ticked ? ` · ${ticked} in the trolley` : ''}` : 'Your list is ready', attrs: 'data-action="go-tab" data-to="shop"' };
  else if (now === 2) next = { eye: 'Next · step 3 of 3', title: `Cook ${cookShort(w)}${cookGone ? ' · gone' : ''}`, sub: rs && rs.list.length ? `${rs.list.length} recipe${rs.list.length === 1 ? '' : 's'} · ${rs.minutes} min` : 'Nothing to batch cook', attrs: 'data-action="go-tab" data-to="cook"' };
  else if (S.activeWeek === S.thisMon) next = { eye: 'Week sorted', title: 'Plan next week', sub: `${fmtDate(S.nextMon)} – ${fmtDate(addDays(S.nextMon, 6))}`, attrs: `data-action="go-tab" data-to="plan" data-week="${S.nextMon}"` };
  const nextHtml = next ? `<button class="nextrow" ${next.attrs}><span class="grow"><small>${next.eye}</small><b>${next.title}</b><span>${next.sub}</span></span><i>${ic('go', 20)}</i></button><div class="pline"><i style="width:${Math.round(((3 - left) / 3) * 100)}%"></i></div>` : '';
  const nxt = S.weeks[S.nextMon]; const nextPlanned = Object.values(nxt?.portions || {}).some((n) => n > 0);
  const nudge = S.activeWeek === S.thisMon && todayIdx() >= 5 && !nextPlanned && now !== -1 ? `<button class="hlink" data-action="go-tab" data-to="plan" data-week="${S.nextMon}">Next week is not planned yet${ic('go', 14)}</button>` : '';
  return chips + nextHtml + nudge;
}
// v100: this week's meals as photos, on Home. Tapping one opens it on Cook.
function homeMenu(w) {
  const items = Object.entries(P.gridCounts(w.grid)).filter(([id, n]) => n > 0 && recById(id)).sort((a, b) => b[1] - a[1]);
  if (!items.length) return '';
  return `<div class="hmenu-h"><h2>On the menu</h2><span>Tap one to cook it</span></div><div class="hmenu">${items.map(([id, n]) => { const r = recById(id); return `<button class="hmeal" data-action="cook-open" data-id="${id}" aria-label="${esc(r.name)}: open on Cook">${photoImg(r)}<span class="mt-scrim"></span><b class="mt-cnt">×${n}</b><span class="mt-txt"><b class="mt-name">${esc(r.name)}</b><span>${r.cookMinutes ? `${r.cookMinutes} min` : 'No cooking'}</span></span></button>`; }).join('')}</div>`;
}
function renderHome() {
  const w = W(); const recipes = REC(), ing = ING(); const st0 = S.settings;
  const other = S.activeWeek === S.thisMon ? S.nextMon : S.thisMon; const lab = weekLabel(S.activeWeek); const sp = lab.indexOf(' ');
  const head = `<div class="hhead"><h1 class="stack">${sp > 0 ? `${lab.slice(0, sp)}<br>` : ''}<span>${sp > 0 ? lab.slice(sp + 1) : lab}<sup>${fmtDate(S.activeWeek)} – ${fmtDate(addDays(S.activeWeek, 6))}</sup></span></h1><button class="hswitch" data-action="week" data-week="${other}">${weekLabel(other)}${ic('go', 14)}</button></div>`;
  const next = homeTop(w);
  const wn = S.seenVersion !== APP_VERSION ? `<div class="card whatsnew"><span class="lbl">New in ${APP_VERSION}</span><p class="small" style="margin:4px 0 8px">${esc(WHATS_NEW[0][2])}</p><button class="btn ghost small" data-action="whatsnew-seen">Got it</button></div>` : '';
  const planned = Object.values(w.portions || {}).some((n) => n > 0) || Object.keys(lockedCells(w)).length;
  if (!planned) return `${head}${next}<p class="lit">Nothing planned yet. Your targets are <b>${st0.proteinTarget}g</b> of protein and <b>${(st0.kcalTarget || 0).toLocaleString()}</b> kcal a day, on <b>£${st0.budget}</b> a week.</p><span class="ring"><button class="btn block" data-action="autoplan">Plan my week for me</button></span><button class="btn ghost block" style="margin-top:10px" data-action="go-tab" data-to="plan">Choose meals myself</button>${freeWeekCard()}${wn}`;
  const st = P.gridStats(liveGrid(w), recipes, ing, snackExtra(w), liveDays(w)); const c = shopTotals(w).chosen; const budget = st0.budget, target = st0.proteinTarget;
  const food = c ? c.weekly : 0; const pm = mealCost(food, st.filled); const over = food > budget + 0.004;
  const live = w.days.map((on, i) => on && !isPast(i)); const lowDays = st.perDay.map((p, i) => ({ p, i })).filter(({ p, i }) => live[i] && p < target);
  const pair = `<div class="pair"><button class="pc onp" data-action="go-tab" data-to="shop"><small>Food at ${c ? esc(P.SHOP_NAMES[c.shop]) : 'the shop'}</small><b>${P.gbp(food)}</b><span class="${over ? 'bad' : ''}">${over ? `${P.gbp(food - budget)} over your ${P.gbp(budget)}` : `${P.gbp(budget - food)} under your ${P.gbp(budget)}`}</span></button><button class="pc" data-action="go-tab" data-to="plan"><small>Protein a day</small><b>${st.avg}g</b><span class="${lowDays.length ? 'bad' : ''}">${lowDays.length ? `${lowDays.length} day${lowDays.length > 1 ? 's' : ''} short of ${target}g` : `On target · ${target}g`}</span></button></div>`;
  const daysLeft = live.filter(Boolean).length; const freezer = Object.values(S.tubs || {}).reduce((t, n) => t + n, 0);
  const rows = `<div class="hrows"><div><span>Meals to go</span><b>${st.filled}${S.activeWeek === S.thisMon && todayIdx() > 0 ? ` · ${daysLeft} day${daysLeft === 1 ? '' : 's'} left` : ''}</b></div>${pm ? `<div><span>A meal costs</span><b>${P.gbp(pm)}</b></div>` : ''}<div><span>Cook day</span><b>${cookShort(w)}</b></div>${freezer ? `<div><span>In the freezer</span><b>${freezer} tub${freezer > 1 ? 's' : ''}</b></div>` : ''}</div>`;
  const max = Math.max(target * 1.2, ...st.perDay);
  const bars = st.perDay.map((p, i) => `<div class="bar ${p < target ? 'low' : ''} ${live[i] ? '' : 'off'}"><b>${live[i] ? p : ''}</b><i style="height:${Math.round((p / max) * 100)}%"></i></div>`).join('');
  const first = lowDays[0]; const fixLine = first ? `${DAY_FULL[first.i]} is ${target - first.p}g short: a snack fixes it.` : '';
  const protCard = `<div class="card"><span class="lbl">Protein by day · target ${target}g</span><div class="bars" style="margin-top:22px">${bars}</div><div class="bars-labels">${P.DAYS.map((d) => `<div>${d}</div>`).join('')}</div>${fixLine ? `<p class="small muted" style="margin:6px 0 0">${fixLine}</p>` : ''}</div>`;
  const pts = spendSeries(); let spend = '';
  if (pts.filter((p) => p.kind !== 'list').length >= 2) { // v88: a chart needs two weeks
    const logged = pts.filter((p) => p.kind !== 'list'); const spent = logged.reduce((t, p) => t + p.total, 0), meals = logged.reduce((t, p) => t + (p.meals || 0), 0);
    const svg = sparkline(pts.map((p) => ({ v: p.total, hollow: p.kind === 'list', label: fmtDate(p.key), title: `${fmtDate(p.key)}: ${P.gbp(p.total)} (${p.kind === 'till' ? 'till' : p.kind === 'shop' ? 'shop ticked off' : 'list price'})`, valLabel: P.gbp(p.total) })), { refY: budget });
    spend = `<div class="card"><span class="lbl">Spend by week · budget ${P.gbp(budget)}</span>${svg}<p class="small muted" style="margin:4px 0 0">Filled dot: the till, or a shop ticked off. Hollow: the list price.${logged.length ? ` ${logged.length} week${logged.length > 1 ? 's' : ''} logged: ${P.gbp(spent)}${meals ? `, ${meals} meals, ${P.gbp(spent / meals)} a meal` : ''}. Tesco meal deal £3.85, Clubcard price (Which?, 2026).` : ''}</p></div>`;
  }
  let weight = ''; const wt = weightTrend(S.weights);
  if (wt) {
    const goalName = { build: 'building muscle', lean: 'staying lean', lose: 'losing fat', eatwell: 'eating well' }[st0.goal] || st0.goal;
    const svg = sparkline(wt.points.slice(-8).map((p) => ({ v: p.kg, label: fmtDate(p.date), title: `${fmtDate(p.date)}: ${p.kg} kg`, valLabel: `${p.kg} kg` })));
    const sug = st0.adjustTargets === false ? null : adjustSuggestion(st0.goal, S.weights, todayISO(), S.adjSnooze);
    const verdict = wt.points.length < 3 || wt.days < 21 ? `${wt.points.length} weigh-in${wt.points.length > 1 ? 's' : ''}. After 3 weeks there's enough to read a trend.` : sug ? '' : st0.goal === 'build' ? `Up ${wt.change} kg over ${wt.days} days: moving the right way for ${goalName}.` : st0.goal === 'lose' ? `${wt.change} kg over ${wt.days} days: moving the right way for ${goalName}.` : `${wt.change >= 0 ? '+' : ''}${wt.change} kg over ${wt.days} days.`;
    weight = `<div class="card"><div class="row"><span class="grow lbl">${ic('scale', 15)}Weight · ${goalName}</span><button class="btn ghost small" data-action="weigh-add">Add today</button></div>${svg}<p class="small muted" style="margin:4px 0 0">${esc(verdict)}</p></div>`
      + (sug ? `<div class="card adjust"><span class="lbl">A nudge, if you want it</span><p class="small" style="margin:4px 0 8px">${esc(sug.reason)} For ${goalName}, the usual move is ${sug.kcal > 0 ? '+' : '−'}200 kcal a day: every portion and the shop list resize. A rule of thumb, not medical advice.</p><div class="row" style="gap:8px"><button class="btn small" data-action="adjust-yes" data-kcal="${sug.kcal}">Yes, ${sug.kcal > 0 ? 'add' : 'take off'} 200 kcal</button><button class="btn ghost small" data-action="adjust-later">Not now</button></div></div>` : '');
  }
  return `${head}${next}${pair}${homeMenu(w)}${rows}${freeWeekCard()}${protCard}${spend}${weight}${wn}`;
}
// ----- More: everything that isn't a step. Recipes, Pantry and Settings are the same pages as before, reached from here. -----
// v101: one kind of row everywhere a list of settings or links is shown. A group is a rounded panel; a row shows a label, its value and an arrow.
const gr = (label, val, attrs, o = {}) => `<button class="gr ${o.cls || ''}" ${attrs}>${o.icon ? ic(o.icon, 20) : ''}<span class="gr-l">${label}${o.sub ? `<small>${o.sub}</small>` : ''}</span>${val ? `<span class="gr-v">${val}</span>` : ''}${o.plain ? '' : ic('right', 16)}</button>`;
const grLink = (label, href, o = {}) => `<a class="gr" href="${href}" ${o.blank ? 'target="_blank" rel="noopener"' : ''}>${o.icon ? ic(o.icon, 20) : ''}<span class="gr-l">${label}</span>${ic('right', 16)}</a>`;
const gsw = (label, key, on, sub = '') => `<label class="gr"><span class="gr-l">${label}${sub ? `<small>${sub}</small>` : ''}</span><input type="checkbox" class="switch" role="switch" data-setting-bool="${key}" ${on ? 'checked' : ''}></label>`;
const gl = (head, rows, foot = '') => `${head ? `<h2>${head}</h2>` : ''}<div class="gl">${rows}</div>${foot ? `<p class="gl-foot">${foot}</p>` : ''}`;
function renderMore() {
  const due = checkinWeeks(); const done = (S.checkins || {})[S.thisMon];
  return `<h1>More</h1>
  ${gl('', gr('Recipes', `${REC().filter((r) => inLibrary(r.id)).length} in your list`, 'data-action="go-tab" data-to="recipes"', { icon: 'book' }) + gr('Pantry', 'What you have', 'data-action="go-tab" data-to="pantry"', { icon: 'tub' }) + gr('Settings', '', 'data-action="go-tab" data-to="settings"', { icon: 'cog' }))}
  ${gl('Sunday check-in', due.map((k) => gr(`Check in on ${k === S.thisMon ? 'this week' : `the week of ${fmtDate(k)}`}`, 'Due', `data-action="checkin-start" data-week="${k}"`, { icon: 'check', cls: 'due' })).join('') + (due.includes(S.thisMon) ? '' : gr(done ? 'Check in on this week again' : 'Check in on this week early', done ? 'Done' : '', `data-action="checkin-start" data-week="${S.thisMon}"`, { icon: 'check' })), 'Three taps: what got eaten, the till, the portions. Next week plans itself from it.')}
  ${gl('About', gr('What is new', APP_VERSION, 'data-action="set-sheet" data-sheet="whatsnew"') + grLink('Terms', 'terms.html') + grLink('Privacy', 'privacy.html'))}
  <p class="gl-foot" style="text-align:center;margin-top:18px">${esc(CONFIG.APP_NAME)} ${APP_VERSION}<br>Meal photos show a similar dish, from Unsplash photographers.</p>`;
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
function addAvoidText(inputId) { const inp = document.getElementById(inputId); const v = (inp?.value || '').trim().toLowerCase().slice(0, 40); if (!v) return false; S.settings.avoidText ||= []; if (S.settings.avoidText.length >= 40) return false; if (!S.settings.avoidText.includes(v)) S.settings.avoidText.push(v); save(); return true; }
function removeAvoidText(term) { S.settings.avoidText = (S.settings.avoidText || []).filter((t) => t !== term); save(); }
function suggestions(n = 6) { const list = REC(), ing = ING(), raw = (RAW_C.byId ||= Object.fromEntries(RAW().map((r) => [r.id, r]))); // ranked on the recipe as written: protein per £ is the same at any portion size, but the rounded resized numbers are not, and the first Quick pick used to swap the chips under your thumb
  return list.filter((r) => inLibrary(r.id) && !r.slots.includes('snack') && !isAvoided(r) && r.cookMinutes > 0).map((r) => { const o = raw[r.id] || r, c = P.costPerPortion(o, ing).cost; return { r, score: c ? P.proteinPerPortion(o, ing) / c : 0 }; }).sort((a, b) => b.score - a.score).slice(0, n).map((x) => x.r); }
const META = new Map();
// A meal's protein, calories and cost at its size for this person (REC()): the same numbers on the picker tiles, the Recipes list, the week grid, Shop and Cook.
function metaFor(r) { let m = META.get(r.id); if (!m) { const ing = ING(); m = { pp: P.proteinPerPortion(r, ing), kcal: P.kcalPerPortion(r, ing), c: P.costPerPortion(r, ing) }; META.set(r.id, m); } return m; }
function mealMeta(r) {
  const { pp, kcal, c } = metaFor(r);
  const cost = c.cost ? `~£${c.cost.toFixed(2)}` : '';
  const flex = '';
  const cold = r.cold ? '<span class="badge ok">cold ok</span>' : '';
  const fz = r.freezer ? '<span class="badge">freezes</span>' : (r.fridgeDays ? `<span class="badge warn">fridge ${r.fridgeDays}d</span>` : '<span class="badge">made fresh</span>');
  return `${pp}g protein · ${kcal.toLocaleString()} kcal${cost ? ` · ${cost} a portion` : ''} ${flex}${cold}${fz}`;
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
  if (!items.length) return `<div class="snackline"><span>${ic('flame', 15)}Snacks: none yet</span><button class="btn ghost small" data-action="add-snacks">+ Add snacks</button></div>`;
  const total = items.reduce((a, [, n]) => a + n, 0);
  const ex = snackExtra(w);
  return `<div class="snackbar"><div class="row"><b class="grow">Snacks</b><span class="small muted">${total} this week · +${Math.round(ex.protein)}g protein a day</span></div><div class="chip-row" style="margin:6px 0 0">${items.map(([id, n]) => `<button class="chip meal" data-action="add-snacks" style="${cellStyle(id)}">${esc(shortName(recById(id)))} × ${n}</button>`).join('')}</div></div>`;
}
// The navy bar that stays at the bottom of the Plan page (inside #view, above the tab bar): how many meals are in, and the button for what comes next.
function planDock(w) {
  if (!planAdd) return ''; // v88: the planned week ends in its own buttons (Change meals, Next: Shop); nothing floats over the grid
  const st = P.gridStats(liveGrid(w), REC(), ING(), snackExtra(w), liveDays(w));
  if (!st.filled && !everPlanned()) return ''; // v87: a new person's first screen has one instruction (the start card), not a second one in the dock
  if (!st.filled) return `<div class="plandock" id="plan-dock"><span class="grow"><b>Add a meal to start</b><small>It goes straight into your week.</small></span></div>`;
  return `<div class="plandock" id="plan-dock"><span class="grow"><b>${st.filled >= st.slots ? `Week full · ${st.slots} meals` : `${st.filled} of ${st.slots} meals`}</b><small>${(w.overflow || []).length ? `Some portions won't fit` : `${st.avg}g protein a day · target ${S.settings.proteinTarget}g`}</small></span><button class="btn sun" data-action="plan-week">Done</button></div>`;
}
function planTop(w) {
  const nudge = S.activeWeek === S.thisMon && (todayIdx() >= 5 || !liveDays(w).some(Boolean)) ? `<div class="card tipcard"><h3>${todayIdx() >= 6 ? 'This week is done' : 'This week is nearly done'}</h3><p class="small">Plan next week now so Sunday's cook and shop are sorted.</p><button class="btn small" data-action="week" data-week="${S.nextMon}">Plan next week</button></div>` : '';
  if (planAdd) return nudge; // Add meals view: the meal list is the page, so nothing above it may grow or shrink while you tick
  const recipes = REC(), ing = ING();
  const st = P.gridStats(liveGrid(w), recipes, ing, snackExtra(w), liveDays(w)); // gone days don't count as planned
  const gone = w.days.filter((on, i) => on && isPast(i)).length;
  const target = S.settings.proteinTarget;
  const kcalT = S.settings.kcalTarget || 0;
  const chosen = Object.keys(w.portions).filter((id) => w.portions[id] > 0);
  const overflow = (w.overflow || []).map((o) => `<div class="warn-box">${esc(recById(o.id)?.name)}: ${o.unplaced} portion${o.unplaced > 1 ? 's' : ''} won't fit in the week. Drop the count or move something.</div>`).join('');
  const fm = freshMap(w);
  // v88: one solid colour per meal in this week (tubs count as their recipe)
  const colours = weekColours(w);
  const cell = (v, i, s) => {
    if (!w.days[i]) return `<div class="cell off"></div>`;
    if (isPast(i)) { const r = v && !P.isOut(v) ? recById(P.isTub(v) ? P.tubRecipe(v) : v) : null; return `<button class="cell past" data-action="cell" data-day="${i}" data-slot="${s}"><span class="cname">${r ? esc(r.name) : P.isOut(v) ? 'Not eaten' : '—'}</span>${r ? '<span class="ctag">✓ eaten · tap if not</span>' : ''}</button>`; }
    if (!v) return `<button class="cell empty" data-action="cell" data-day="${i}" data-slot="${s}">+ add</button>`;
    if (P.isOut(v)) return `<button class="cell out" data-action="cell" data-day="${i}" data-slot="${s}"><span class="cname">Skipped</span><span class="ctag">nothing bought</span></button>`;
    if (P.isTub(v)) { const r = recById(P.tubRecipe(v)); return `<button class="cell tubcell" style="${mealStyle(P.tubRecipe(v), colours)}" data-action="cell" data-day="${i}" data-slot="${s}"><span class="cname">${esc(r?.name || '')}</span><span class="ctag">from the freezer</span></button>`; }
    const r = recById(v); if (!r) return `<button class="cell empty" data-action="cell" data-day="${i}" data-slot="${s}">+ add</button>`;
    const isFresh = !!fm[`${i}-${s}`];
    const tp = P.tubPlan(r, w.grid, w.cookDay, fm);
    const cls = isFresh || tp.fresh ? 'freshcell' : tp.freezer.includes(i) ? 'frozen' : tp.late.includes(i) ? 'late' : '';
    return `<button class="cell ${cls}" style="${mealStyle(v, colours)}" data-action="cell" data-day="${i}" data-slot="${s}" draggable="false"><span class="cname">${esc(r.name)}</span></button>`;
  };
  const dayNum = (i) => { const d = new Date(S.activeWeek + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i); return d.getUTCDate(); };
  const live = w.days.map((on, i) => on && !isPast(i));
  const gridHtml = `<div class="grid2">
    <div class="hd"></div>${P.SLOTS.map((s) => `<div class="hd">${({ breakfast: 'Breakfast', lunch: 'Lunch', dinner: 'Dinner' })[s]}</div>`).join('')}<div class="hd tot" title="Protein and calories a day">${ic('flame', 14)}<span>kcal</span></div>
    ${P.DAYS.map((d, i) => (isPast(i) ? `<div class="dlab gone"><b>${d}</b><span>${dayNum(i)}</span><i>✓</i></div>` : `<button class="dlab ${w.days[i] ? '' : 'off'}" data-action="day-sheet" data-day="${i}" aria-label="${DAY_FULL[i]} ${dayNum(i)}: skip or put back"><b>${d}</b><span>${dayNum(i)}</span></button>`) + P.SLOTS.map((s) => cell(w.grid[i][s], i, s)).join('') + `<div class="pday ${P.dayProteinState(st.perDay[i], target, live[i])}" ${live[i] ? `aria-label="${st.perDay[i]}g protein, ${st.kcalPerDay[i].toLocaleString()} kcal"` : ''}>${live[i] ? `<b>${st.perDay[i]}g</b><span>${st.kcalPerDay[i].toLocaleString()}</span>` : '–'}</div>`).join('')}
  </div>`;
  const tubs = Object.entries(S.tubs).filter(([, n]) => n > 0);
  const tubHtml = tubs.length ? `<p class="small" style="margin:10px 0 0"><b>In the freezer:</b> ${tubs.map(([id, n]) => `${esc(recById(id)?.name)} ×${n}`).join(', ')}. Tap an empty slot to use one.</p>` : '';
  const hasGrid = chosen.length || tubs.length || Object.keys(lockedCells(w)).length;
  const tips = (S.tips && S.tips.plan) ? '' : `<div class="card tipcard"><h3>How Fuel works</h3><ol class="tips"><li><b>Plan.</b> Tick the meals you fancy. Fuel fits them into your week.</li><li><b>Shop.</b> Your list is priced at four supermarkets. Buy from the cheapest.</li><li><b>Cook.</b> Batch cook on ${DAY_FULL[w.cookDay]}, box it up, and the week is sorted.</li></ol><p class="small">Targets, budget and milk are under the ⚙ gear, top right.</p><button class="btn small" data-action="tip-done" data-tip="plan">Got it</button></div>`;
  const gridTip = (S.tips && S.tips.grid) ? '' : `<div class="gridhelp gridtip"><span><b>Tap a meal</b> to swap or move it. <b>Tap a day</b> to skip it.</span><button class="btn ghost small" data-action="tip-done" data-tip="grid">Got it</button></div>`;
  const dayK = st.kcalPerDay.filter((k, i) => live[i] && k > 0), avgK = dayK.length ? Math.round(dayK.reduce((a, b) => a + b, 0) / dayK.length) : 0; // the days with meals in, so a half-planned week is not averaged with its empty days
  const limitNote = st.filled < st.slots / 2 || !avgK ? '' : avgK < kcalT * 0.93 ? `The planned days come to ${avgK.toLocaleString()} kcal, under your ${kcalT.toLocaleString()} target. Portions stay in line with the recipes (1.5× at most), so add a snack or two to close the gap.` : avgK > kcalT * 1.07 ? `The planned days come to ${avgK.toLocaleString()} kcal, over your ${kcalT.toLocaleString()} target. Drop a snack or swap in a lighter meal.` : '';
  // Joined midweek? Say so, and offer tonight / tomorrow as the cook day (the default is already today for a week that has started).
  let midweek = '';
  const goneDays = S.activeWeek === S.thisMon ? todayIdx() : 0;
  if (goneDays > 0 && goneDays < 6 && chosen.length) {
    const rs = P.runSheet(weekCounts(w, { fresh: fm, skipFresh: true }), recipes); const t = todayIdx();
    midweek = `<div class="card midweek"><b>Started on a ${DAY_FULL[t]}?</b><div class="chips" style="margin:6px 0 8px"><em>${goneDays} day${goneDays > 1 ? 's' : ''} gone</em><em>${st.slots} meals</em><em>cook ${cookLabel(w, S.activeWeek)}</em><em>${rs.list.length} recipe${rs.list.length === 1 ? '' : 's'} · ${rs.minutes} min</em></div>${cookDayChips(w)}</div>`;
  }
  const c = chosen.length ? shopTotals(w).chosen : null;
  const strip = chosen.length
    ? `<div class="card numstrip"><div><b>${st.filled}<small>/${st.slots}</small></b><span>${ic('cal', 14)}${gone ? 'to go' : 'meals'}</span></div><div><b>${st.avg}g<small>/${target}</small></b><span>${ic('flame', 14)}protein a day</span></div><div><b>${c && c.lines.length ? P.gbp(c.weekly) : '—'}</b><span>${ic('pound', 14)}${c && c.lines.length ? `at ${esc(P.SHOP_NAMES[c.shop])}` : 'food'}</span></div></div>${limitNote ? `<p class="small muted" style="margin:-4px 0 10px">${limitNote}</p>` : ''}`
    : `<div class="card"><p><b>Nothing planned yet.</b></p><p class="small muted">Pick a few meals and Fuel fits them into your week.</p><button class="btn block" style="margin-top:10px" data-action="autoplan">Plan my week for me</button><button class="btn ghost block" style="margin-top:8px" data-action="plan-add">Choose meals myself</button>${tubHtml}</div>`;
  const gone0 = cookDate(w, S.activeWeek) < todayISO();
  return `${tips}${nudge}${dueOnPlan().length ? useUpCard(w, true) : ''}${strip}
  ${hasGrid ? `<div class="card gridcard">${gridHtml}${gridTip}${tubHtml}${snackBar(w)}
    <div class="rowbtns"><button class="btn" data-action="plan-add">Change meals</button></div>
    <div class="rowbtns"><button class="btn ghost" data-action="cookday-sheet">${ic('pan', 16)}Cook day: ${P.DAYS[w.cookDay]} ${fmtDate(cookDate(w, S.activeWeek))}${gone0 ? ' <span style="color:#c81e4a;white-space:nowrap">· gone</span>' : ''}</button></div>
    <div class="rowbtns quiet">${st.filled ? '<button class="btn ghost small" data-action="share-week">Share my week</button>' : ''}<button class="btn ghost small" data-action="relayout">Re-arrange</button><button class="btn ghost small" data-action="clear-week">Clear week</button></div></div>${midweek}<button class="btn block big sun nextbtn" data-action="go-tab" data-to="shop">Next: Shop</button>` : ''}
  ${installCard()}${overflow}${lateWarnings(w)}`;
}
// v88: the meal picker is a menu. Each meal is a tile in its own colour: protein big, then the name, price, time and how it keeps,
// and one Add button that becomes − n this week +. Same actions as before (inc/dec, sinc/sdec); Add = what ticking used to do.
function mealTile(r, w, free, colours) {
  const snack = r.slots.includes('snack');
  const n = (snack ? w.snacks[r.id] : w.portions[r.id]) || 0;
  const full = !snack && P.roomFor(r, free) <= 0;
  const { pp, kcal, c } = metaFor(r);
  const keeps = r.cookMinutes === 0 ? 'no cooking' : r.freezer ? 'freezes' : r.fridgeDays ? `fridge ${r.fridgeDays} days` : 'cook fresh';
  const l2 = [c.cost ? P.gbp(c.cost) : '', r.cookMinutes ? `${r.cookMinutes} min` : '', keeps].filter(Boolean).join(' · ');
  const [inc, dec, add] = snack ? ['sinc', 'sdec', 'snack-add'] : ['inc', 'dec', 'pick-add'];
  const ctl = n ? `<div class="mt-step"><button data-action="${dec}" data-id="${r.id}" aria-label="One fewer">−</button><span aria-label="${n} in your week"><b>×${n}</b></span><button data-action="${inc}" data-id="${r.id}" ${full ? 'disabled' : ''} aria-label="One more">+</button></div>`
    : `<button class="mt-add" ${full ? 'disabled' : `data-action="${add}" data-id="${r.id}"`} aria-label="${full ? 'Your week is full' : `Add ${esc(r.name)}`}"><i>${full ? 'Full' : '+'}</i></button>`;
  return `<div class="mtile ${n ? 'on' : ''} ${full && !n ? 'full' : ''}" data-row="${r.id}">${photoImg(r)}<span class="mt-scrim"></span><div class="mt-txt"><b class="mt-name">${esc(r.name)}</b><span>${pp}g protein · ${kcal.toLocaleString()} kcal</span><span>${l2}</span></div>${ctl}</div>`;
}
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
  const listOpen = planAdd || !everPlanned(); // v88: a planned week shows the grid; the meal list sits behind Change meals
  let pick = '';
  if (listOpen) {
    const free = P.freeSlots(w.grid, w.days); const colours = weekColours(w);
    const slotOf = (r) => (r.slots.includes('snack') ? 'snack' : r.slots[0] === 'breakfast' ? 'breakfast' : 'mains');
    const pool = recipes.filter((r) => !isAvoided(r));
    const isMine = (r) => inLibrary(r.id) && !justAdded.has(r.id);
    const hidden = recipes.filter((r) => isMine(r) && isAvoided(r)).length;
    let tab = S.planFilter;
    if (!['breakfast', 'mains', 'snack'].includes(tab)) tab = Object.entries(w.portions).some(([id, n]) => n > 0 && recById(id)?.slots[0] === 'breakfast') ? 'mains' : 'breakfast';
    const count = (k) => pool.filter((r) => slotOf(r) === k && isMine(r)).length;
    const inWeek = (r) => ((slotOf(r) === 'snack' ? w.snacks[r.id] : w.portions[r.id]) || 0) > 0;
    const mine = pool.filter((r) => slotOf(r) === tab && isMine(r)).sort((x, y) => inWeek(y) - inWeek(x));
    const extraAll = pool.filter((r) => slotOf(r) === tab && !isMine(r));
    const tag = S.ideaTag || ''; const extra = extraAll.filter((r) => !tag || tagsOf(r).has(tag));
    const tiles = (list) => `<div class="mtiles">${list.map((r) => mealTile(r, w, free, colours)).join('')}</div>`;
    const tabs = `<div class="pickseg" id="pick-tabs" role="tablist">${[['breakfast', 'Breakfast'], ['mains', 'Lunch & dinner'], ['snack', 'Snacks']].map(([k, l]) => `<button role="tab" aria-selected="${tab === k}" class="${tab === k ? 'on' : ''}" data-action="plan-filter" data-filter="${k}">${l}<small>${count(k)}</small></button>`).join('')}</div>`;
    const st = P.gridStats(liveGrid(w), recipes, ING(), snackExtra(w), liveDays(w));
    const note = tab === 'snack' ? '<p class="small muted" style="margin:0 0 10px">Shop-bought ones are priced too.</p>' : st.filled >= st.slots ? '<div class="gridhelp" style="margin:0 0 10px">Your week is full. Take a meal down to add another.</div>' : '';
    const tagTags = TAGS.filter(([k]) => k !== 'snack' && k !== 'breakfast' && extraAll.some((r) => tagsOf(r).has(k)));
    const tagChips = tagTags.length > 1 ? `<div class="chip-row"><button class="chip ${!tag ? 'on' : ''}" data-action="idea-tag" data-tag="">All</button>${tagTags.map(([k, l]) => `<button class="chip ${tag === k ? 'on' : ''}" data-action="idea-tag" data-tag="${k}">${l}</button>`).join('')}</div>` : '';
    const moreHtml = !extraAll.length ? '' : planMore
      ? `<h2 class="pickgroup more" id="more-meals">More ideas <span>${extraAll.length}</span></h2>${tagChips}${extra.length ? tiles(extra) : '<p class="small muted">Nothing under that filter.</p>'}<button class="btn ghost block" data-action="plan-more" style="margin:12px 0 10px">Hide more ideas</button>`
      : `<button class="btn ghost block" data-action="plan-more" id="more-meals" style="margin:12px 0 10px">More ideas · ${extraAll.length}</button>`;
    const st0 = S.settings;
    const start = !everPlanned()
      ? `<div class="card starthero" id="pick-head"><h3>Plan your week</h3><p class="small muted" style="margin:2px 0 12px">Your targets: <b>${st0.proteinTarget}g protein</b> a day · <b>${(st0.kcalTarget || 0).toLocaleString()} kcal</b> · <b>£${st0.budget}</b> a week</p><button class="btn block autoplanbtn" data-action="autoplan">Plan my week for me</button><p class="small muted" style="margin:8px 0 0">One tap fills your week to those targets and prices it at four supermarkets. Swap any meal after.</p></div><h2 class="orpick">Or pick the meals yourself</h2>`
      : Object.values(w.portions).some((n) => n > 0) ? '' : `<div class="card pickhead" id="pick-head"><button class="btn block autoplanbtn" data-action="autoplan">Plan my week for me</button><p class="small muted" style="margin:8px 0 0">One tap fills the week to your targets and budget. Or add meals yourself below.</p></div>`;
    pick = `${start}${tabs}${note}${mine.length ? tiles(mine) : '<p class="small muted">None in your list yet: see More ideas.</p>'}${hidden ? `<p class="small muted" style="margin-top:10px">${hidden} hidden because of what you don't eat (Settings).</p>` : ''}${moreHtml}`;
  }
  return `${titleRow('Plan', 1, !everPlanned() ? 'Plan your week first. Shop and Cook come next.' : planAdd ? 'Add meals to your week.' : '')}${weekSwitch()}<div id="plan-top">${planTop(w)}</div>
  <div id="plan-sug">${planSug(w)}</div>
  <div id="plan-pick">${pick}</div>${planDock(w)}`;
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
const rowSel = (id) => `#plan-pick [data-row="${CSS.escape(id)}"]`;
// Re-draw only what changed on the Plan tab (top card/grid, the cards under the search box, each pick row), keeping `anchor` (the tapped row, or the grid) where it is on screen.
function refreshPlan(anchor = '.grid2') {
  const top = document.getElementById('plan-top'); const w = W();
  if (!top || S.tab !== 'plan') { render(); return; }
  if (planAdd === false && !(Object.values(w.portions).some((x) => x > 0) || Object.values(S.tubs || {}).some((x) => x > 0) || Object.keys(lockedCells(w)).length)) { planAdd = null; holdPlace(anchor, () => render()); return; } // the last meal just went: "Here's your week" and "Next: Shop" would be wrong now, so fall back to the Add meals view (same test as renderPlan)
  holdPlace(anchor, () => {
    top.innerHTML = planTop(w);
    const sug = document.getElementById('plan-sug'); if (sug) { const h = planSug(w); if (sug._html !== h) { sug.innerHTML = h; sug._html = h; } }
    const free = P.freeSlots(w.grid, w.days); const colours = weekColours(w); const tmp = document.createElement('div');
    document.querySelectorAll('#plan-pick [data-row]').forEach((rowEl) => {
      const r = recById(rowEl.dataset.row); if (!r) return;
      tmp.innerHTML = mealTile(r, w, free, colours); const fresh = tmp.firstElementChild;
      if (fresh.outerHTML === rowEl.outerHTML) return;
      const hadFocus = rowEl.contains(document.activeElement); rowEl.replaceWith(fresh);
      if (hadFocus) (fresh.querySelector('.mt-step button:last-child') || fresh.querySelector('.mt-add'))?.focus({ preventScroll: true });
    });
    const dock = document.getElementById('plan-dock'); const dh = planDock(w);
    if (dock) { if (dock.outerHTML !== dh) dock.outerHTML = dh; } else if (dh) document.getElementById('view').insertAdjacentHTML('beforeend', dh); // v87: a new person has no dock until the first tick
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

// ----- Cook (v101): how long is left, the next recipe as one big photo with Start cooking on it, the rest as posters. Each opens its own page. -----
const hm = (m) => (m >= 60 ? `${Math.floor(m / 60)}h${m % 60 ? ` ${String(m % 60).padStart(2, '0')}` : ''}` : `${m} min`);
const REHEAT = { none: 'Eat it cold', microwave: 'Microwave 2–3 min, stir halfway', hob: 'Warm it through in a pan', 'air-fryer': 'Air-fryer 6 min at 180°C' };
function cookData(w) {
  const all = weekCounts(w), fm = freshMap(w);
  const rs = P.runSheet(weekCounts(w, { fresh: fm, skipFresh: true }), REC());
  const fresh = Object.entries(all).filter(([rid, n]) => n > 0 && recById(rid)?.cookMinutes === 0).map(([rid, n]) => ({ recipe: recById(rid), portions: n }));
  for (const c of P.freshCells(w.grid, fm)) { const r = recById(c.id); if (r) fresh.push({ recipe: r, portions: 1, day: P.DAYS[c.day] }); }
  const grouped = {};
  for (const x of fresh) { const g = (grouped[x.recipe.id] ||= { recipe: x.recipe, portions: 0, days: [] }); g.portions += x.portions; if (x.day && !g.days.includes(x.day)) g.days.push(x.day); }
  return { rs, fm, fresh: Object.values(grouped) };
}
const cookedAll = (w) => { const l = cookData(w).rs.list; return l.length > 0 && l.every((x) => (w.cooked || {})[x.recipe.id]); };
function renderCook() {
  const w = W(); const { rs, fm, fresh } = cookData(w);
  if (cookView && !rs.list.some((x) => x.recipe.id === cookView) && !fresh.some((x) => x.recipe.id === cookView)) cookView = null;
  if (cookView) return cookPage(w, cookView, rs, fm, fresh);
  const head = `${titleRow('Cook', 3, '')}${weekSwitch()}`;
  if (!rs.list.length && !fresh.length) return `${head}<p class="lit">Nothing to cook yet. <b>Pick your meals</b> and the cook list builds itself.</p><button class="btn block" data-action="go-tab" data-to="plan">Pick my meals</button>`;
  const cookOn = cookDate(w, S.activeWeek), t = todayISO(); const gone = cookOn < t;
  const ck = w.cooked || {}; const todo = rs.list.filter((x) => !ck[x.recipe.id]); const minsLeft = todo.reduce((m, x) => m + x.recipe.cookMinutes, 0);
  const whenWord = cookOn === t ? 'tonight' : cookOn === addDays(t, 1) ? 'tomorrow' : `on ${P.DAYS[w.cookDay]}`;
  const headCard = rs.list.length ? `<div class="card shophead slim ckhead"><div class="row"><span class="grow">${todo.length ? `<b class="bigtotal">${hm(minsLeft)}</b> <span class="muted">to cook ${whenWord}</span>` : `<b class="bigtotal">Done</b> <span class="muted">all ${rs.list.length} cooked</span>`}</span><span class="leftn"><b>${todo.length}</b> left</span></div>
    <div class="budget prog"><i style="width:${Math.round(((rs.list.length - todo.length) / rs.list.length) * 100)}%"></i></div></div>` : '';
  const dayRow = `<button class="tapr ${gone ? 'gone' : ''}" data-action="cookday-sheet"><span class="grow"><b>Cook day</b><span>${cookShort(w)}${gone ? ' · gone' : ''}</span></span><em>Change</em></button>`;
  const facts = (x) => `${x.portions} portion${x.portions > 1 ? 's' : ''} · ${x.recipe.cookMinutes} min`;
  const next = todo[0]; const pos = (x) => rs.list.indexOf(x) + 1;
  const hero = next ? `<div class="ckhero" data-cook="${next.recipe.id}"><button class="ckhero-open" data-action="cook-view" data-id="${next.recipe.id}" aria-label="${esc(next.recipe.name)}: open the recipe">${photoImg(next.recipe)}<span class="mt-scrim"></span><span class="ck-n">${pos(next)} of ${rs.list.length}</span><span class="mt-txt"><small>${todo.length === rs.list.length ? 'Start here' : 'Up next'}</small><b class="mt-name">${esc(next.recipe.name)}</b><span>${facts(next)} · ${esc(next.recipe.equipment.join(', '))}</span></span></button><button class="btn block" data-action="cm-open" data-id="${next.recipe.id}">Start cooking</button></div>` : '';
  const rest = rs.list.filter((x) => x !== next);
  const tiles = rest.length ? `<div class="ckgrid">${rest.map((x) => `<button class="cktile ${ck[x.recipe.id] ? 'cooked' : ''}" data-action="cook-view" data-id="${x.recipe.id}" data-cook="${x.recipe.id}">${photoImg(x.recipe)}<span class="mt-scrim"></span><span class="ck-n">${ck[x.recipe.id] ? `${ic('check', 14)}Cooked` : pos(x)}</span><span class="mt-txt"><b class="mt-name">${esc(x.recipe.name)}</b><span>${facts(x)}</span></span></button>`).join('')}</div>` : '';
  const freshRows = fresh.length ? `<h2>Made fresh, not batched</h2><div class="gl">${fresh.map((g) => `<button class="gr" data-action="cook-view" data-id="${g.recipe.id}" data-cookfresh="${g.recipe.id}">${photoImg(g.recipe, 'thumb')}<span class="gr-l">${esc(g.recipe.name)}<small>${g.portions} portion${g.portions > 1 ? 's' : ''} · ${g.days.length ? `on ${g.days.join(', ')}` : `${g.recipe.slots[0]}, a few minutes each`}</small></span>${ic('right', 16)}</button>`).join('')}</div>` : '';
  const usesRice = rs.list.some(({ recipe: r }) => (r.ingredients || []).some((x) => /rice/.test(x.id || '')));
  const nextRow = S.activeWeek === S.thisMon
    ? `<button class="nextrow" data-action="go-tab" data-to="plan" data-week="${S.nextMon}"><span class="grow"><small>All boxed up?</small><b>Plan next week</b><span>${fmtDate(S.nextMon)} – ${fmtDate(addDays(S.nextMon, 6))}</span></span><i>${ic('go', 20)}</i></button>`
    : `<button class="nextrow" data-action="go-tab" data-to="home"><span class="grow"><small>All boxed up?</small><b>Back to Home</b><span>See how the week adds up</span></span><i>${ic('go', 20)}</i></button>`;
  return `${head}${headCard}${dayRow}${hero}${tiles}${freshRows}
  ${usesRice ? `<p class="small muted" style="margin:14px 0 0">Rice: freeze cooked rice the same day unless it is eaten within 24 hours.</p>` : ''}
  <div style="margin-top:22px">${nextRow}</div>`;
}
// One recipe on its own page: the photo, three numbers, what to get out (tick as you go), the method, where the tubs go. Start cooking stays at the bottom.
function cookPage(w, id, rs, fm, fresh) {
  const r = recById(id); const ing = ING(); const batch = rs.list.find((x) => x.recipe.id === id); const fr = fresh.find((x) => x.recipe.id === id);
  const n = batch ? batch.portions : 1; const mt = metaFor(r);
  const scaled = P.scaleIngredients(r, n, ing); const tp = batch ? P.tubPlan(r, w.grid, w.cookDay, fm) : null; const cooked = !!(w.cooked || {})[id];
  const eye = batch ? `${rs.list.indexOf(batch) + 1} of ${rs.list.length} · ${cooked ? 'cooked' : `batch on ${P.DAYS[w.cookDay]}`}` : `Made fresh${fr && fr.days.length ? ` on ${fr.days.join(', ')}` : ''}`;
  const fact = (v, l) => `<div><b>${v}</b><span>${l}</span></div>`;
  const facts = batch ? `<div class="rp-facts">${fact(n, n === 1 ? 'portion' : 'portions')}${fact(r.cookMinutes, 'minutes')}${fact(tp.total, tp.total === 1 ? 'tub' : 'tubs')}</div>`
    : `<div class="rp-facts">${fact(fr ? fr.portions : 1, 'this week')}${fact(`${Math.round(mt.pp)}g`, 'protein each')}${r.cookMinutes ? fact(r.cookMinutes, 'minutes') : fact(Math.round(mt.kcal), 'kcal each')}</div>`;
  const seg = r.cookMinutes > 0 ? `<div class="seg"><button class="${batch ? 'on' : ''}" ${batch ? '' : `data-action="fresh-default" data-id="${id}" data-on="0"`}>Batch on ${P.DAYS[w.cookDay]}</button><button class="${batch ? '' : 'on'}" ${batch ? `data-action="fresh-default" data-id="${id}" data-on="1"` : ''}>Make fresh each time</button></div>` : '';
  const ingRows = scaled.map((x, i) => { const k = `${id}:${i}`; return `<label class="gr tickrow ${cookGot.has(k) ? 'done' : ''}"><input type="checkbox" data-cookgot="${k}" ${cookGot.has(k) ? 'checked' : ''}><span class="gr-l">${esc(x.name)}</span><span class="gr-v">${P.fmtQty(x.qty, x.unit)}</span></label>`; }).join('');
  const store = tp ? [tp.fridge.length ? ['Fridge', `${tp.fridge.length} tub${tp.fridge.length > 1 ? 's' : ''} for ${dayList(tp.fridge)}. Eat by ${tp.eatBy}.`] : null, tp.freezer.length ? ['Freezer', `${tp.freezer.length} tub${tp.freezer.length > 1 ? 's' : ''} for ${dayList(tp.freezer)}. Move each one to the fridge the night before.`] : null, REHEAT[r.reheat] ? ['Reheat', `${REHEAT[r.reheat]}.`] : null].filter(Boolean) : [];
  return `<div class="rp-hero">${photoImg(r)}<span class="mt-scrim"></span><button class="rp-back" data-action="cook-back" aria-label="Back to Cook">${ic('left', 20)}</button><div class="rp-t"><small>${eye}</small><h1>${esc(r.name)}</h1></div></div>
  ${facts}${seg}
  <h2>${batch ? `Get out, for ${n}` : 'Get out, for each portion'}</h2><div class="gl onp">${ingRows}</div>
  <h2>Method</h2><ol class="rp-steps">${r.method.map((m, i) => `<li><b>${i + 1}</b><p>${esc(m)}</p></li>`).join('')}</ol>
  ${r.notes ? `<p class="rp-note">${esc(r.notes)}</p>` : ''}
  ${store.length ? `<h2>Then box it up</h2><div class="gl">${store.map(([a, b]) => `<div class="gr"><span class="gr-l">${a}<small>${b}</small></span></div>`).join('')}</div>` : ''}
  ${tp && tp.late.length ? `<div class="warn-box">${dayList(tp.late)}: past its fridge life by then and it does not freeze. Cook ${tp.late.length > 1 ? 'those' : 'that one'} fresh, or move ${tp.late.length > 1 ? 'them' : 'it'} earlier on the Plan tab.</div>` : ''}
  ${tp && tp.total < n ? `<p class="small muted">${n - tp.total} portion${n - tp.total > 1 ? 's' : ''} not in the week grid.</p>` : ''}
  ${batch ? `<button class="btn ghost block" style="margin-top:18px" data-action="cook-done" data-id="${id}" data-on="${cooked ? 0 : 1}">${cooked ? 'Cooked. Tap to undo' : 'Mark as cooked'}</button>` : ''}
  ${r.method.length ? `<div class="ckdock"><button class="btn block" data-action="cm-open" data-id="${id}">Start cooking<span> · one step at a time</span></button></div>` : ''}`;
}
// ----- Cook mode (v100): one step on the screen with the photo, a timer when the step has a time in it, and what that step needs. -----
const CM = { id: null, step: 0, timer: null, tick: null, lock: null };
function cmSteps(r, w) {
  const tp = P.tubPlan(r, w.grid, w.cookDay, freshMap(w));
  const reheat = REHEAT[r.reheat] || '';
  const box = !(weekCounts(w, { fresh: freshMap(w), skipFresh: true })[r.id] > 0) ? [] : [tp.fridge.length ? `Fridge: ${tp.fridge.length} tub${tp.fridge.length > 1 ? 's' : ''} for ${dayList(tp.fridge)}. Eat by ${tp.eatBy}.` : '', tp.freezer.length ? `Freezer: ${tp.freezer.length} tub${tp.freezer.length > 1 ? 's' : ''} for ${dayList(tp.freezer)}. Move each one to the fridge the night before.` : '', reheat ? `To reheat: ${reheat.charAt(0).toLowerCase() + reheat.slice(1)}.` : ''].filter(Boolean);
  return [...r.method.map((t) => ({ t })), ...(box.length ? [{ t: `Box it up. ${box.join(' ')}`, box: true }] : [])];
}
// The first sentence is what to do now: it is bright, the rest of the step sits back a little.
function cmLit(t) { const m = t.match(/^(.+?[.!?])(\s+[\s\S]+)$/); return m ? `<b>${esc(m[1])}</b><span>${esc(m[2])}</span>` : `<b>${esc(t)}</b>`; }
function cmTime(t) { const h = t.match(/(\d+)\s*(?:hours?|hrs?)\b/i); if (h) return { mins: +h[1] * 60, label: `${h[1]} hour` }; const m = t.match(/(\d+)(?:\s*(?:-|–|to)\s*\d+)?\s*(?:minutes?|mins?)\b/i); return m && +m[1] > 0 ? { mins: +m[1], label: `${m[1]} minute` } : null; }
const cmClock = (ms) => { const sec = Math.max(0, Math.round(ms / 1000)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), x = sec % 60; return `${h ? `${h}:${String(m).padStart(2, '0')}` : m}:${String(x).padStart(2, '0')}`; };
function cmRender() {
  const el = document.getElementById('cookmode'); const w = W(); const r = recById(CM.id); if (!el || !r) { cmClose(); return; }
  const steps = cmSteps(r, w); const k = Math.min(CM.step, steps.length - 1); const stp = steps[k]; const last = k === steps.length - 1;
  const n = weekCounts(w, { fresh: freshMap(w), skipFresh: true })[r.id] || weekCounts(w)[r.id] || 1;
  const low = stp.t.toLowerCase();
  const need = stp.box ? [] : P.scaleIngredients(r, n, ING()).filter((x) => { const kw = keywordFor({ name: x.name }); return kw && low.includes(kw); });
  const time = stp.box ? null : cmTime(stp.t); const run = CM.timer;
  const timer = run ? `<button class="cm-timer on" data-action="cm-timer-stop"><span id="cm-clock">${run.done ? 'Time is up' : cmClock(run.end - Date.now())}</span><small>${run.done ? 'Tap to clear' : `${esc(run.what)} · tap to stop`}</small></button>`
    : time ? `<button class="cm-timer" data-action="cm-timer" data-mins="${time.mins}">${ic('clock', 18)}Start a ${time.label} timer</button>` : '';
  el.innerHTML = `<div class="cm-photo">${photoImg(r)}<span class="cm-fade"></span></div>
    <div class="cm-top"><button data-action="cm-close" aria-label="Close cook mode">${ic('left', 18)}<span>${esc(r.name)}</span></button><em>${n} portion${n > 1 ? 's' : ''}</em></div>
    <div class="cm-body"><div class="cm-prog">${steps.map((_, i) => `<i class="${i < k ? 'on' : i === k ? 'now' : ''}"></i>`).join('')}</div>
      <p class="cm-eye">Step ${k + 1} of ${steps.length}${last ? ' · last one' : ` · ${steps.length - 1 - k} to go`}</p>
      <p class="cm-step">${cmLit(stp.t)}</p>
      ${timer}
      ${need.length ? `<p class="cm-need"><b>You need</b> ${need.map((x) => `${P.fmtQty(x.qty, x.unit)} ${esc(x.name.replace(/\s*\([^)]*\)/g, '').toLowerCase())}`).join(' · ')}</p>` : ''}
      ${k === 0 && r.notes ? `<p class="cm-need">${esc(r.notes)}</p>` : ''}</div>
    <div class="cm-nav"><button class="btn ghost" data-action="${k === 0 ? 'cm-close' : 'cm-back'}">${k === 0 ? 'Close' : 'Back'}</button><button class="btn" data-action="${last ? 'cm-done' : 'cm-next'}">${last ? 'Done' : 'Next step'}</button></div>`;
  el.hidden = false;
}
async function cmOpen(id) { CM.id = id; CM.step = 0; cmRender(); try { CM.lock = await navigator.wakeLock?.request('screen'); } catch {} }
function cmClose() { const el = document.getElementById('cookmode'); if (el) { el.hidden = true; el.innerHTML = ''; } cmTimerStop(); CM.id = null; try { CM.lock?.release(); } catch {} CM.lock = null; }
function cmTimerStop() { clearInterval(CM.tick); CM.tick = null; CM.timer = null; }
function cmTimerStart(mins) {
  cmTimerStop(); const r = recById(CM.id); CM.timer = { end: Date.now() + mins * 60000, what: `Step ${CM.step + 1}`, done: false };
  CM.tick = setInterval(() => {
    const t = CM.timer; if (!t) return; const leftMs = t.end - Date.now(); const c = document.getElementById('cm-clock');
    if (leftMs <= 0 && !t.done) { t.done = true; clearInterval(CM.tick); CM.tick = null; haptic('warn'); navigator.vibrate?.([300, 150, 300, 150, 300]); cmBeep(); if (CM.id) cmRender(); else toast(`${r ? r.name : 'Timer'}: time is up`, 5000); return; }
    if (c) c.textContent = cmClock(leftMs);
  }, 500);
  cmRender();
}
function cmBeep() { try { const A = window.AudioContext || window.webkitAudioContext; const ctx = new A(); [0, 0.35, 0.7].forEach((at) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; o.connect(g); g.connect(ctx.destination); g.gain.setValueAtTime(0.25, ctx.currentTime + at); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + at + 0.25); o.start(ctx.currentTime + at); o.stop(ctx.currentTime + at + 0.26); }); setTimeout(() => ctx.close(), 1500); } catch {} }

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
  <label class="field" style="margin:8px 0 0">What do you want to add?<input class="search" style="width:100%;font-size:18px;margin:6px 0 0" placeholder="e.g. milk, avocado, crisps" value="${esc(q)}" data-extra-search autofocus maxlength="60" inputmode="search" enterkeyhint="search" autocapitalize="none" autocorrect="off" spellcheck="false"></label>
  <div id="extra-list" style="margin-top:8px">${hits.map((it) => `<button class="line" style="width:100%;text-align:left;background:none;border:0;border-bottom:1px solid #f3ecdc" data-action="extra-pick" data-id="${it.id}"><span class="grow"><span class="name">${esc(it.name)}</span><span class="sub">${(it.packs || []).length ? 'priced' : 'no price on file'} · sold by ${it.unit === 'each' ? 'the piece' : it.unit}</span></span></button>`).join('')}${s.length >= 2 ? `<button class="btn ghost block" style="margin-top:10px" data-action="extra-custom" data-name="${esc(q.trim())}">${hits.length ? 'Not there? ' : 'Not in the list. '}Add “${esc(q.trim())}” as my own item</button>` : ''}</div>
  <button class="btn ghost block" data-action="close-sheet" style="margin-top:10px">Done</button>`;
}
async function askExtraQty(it, current) {
  const unitWord = it.unit === 'each' ? 'how many' : `how much (${it.unit})`;
  const v = await askNumber(`${it.name}: ${unitWord} each week?`, it.unit === 'each' ? '2' : it.unit === 'ml' ? '2000' : '500', it.unit === 'each' ? '' : it.unit);
  if (v === null) return null;
  const n = parseFloat(String(v).replace(/[^0-9.]/g, ''));
  if (!(n > 0)) { toast('Type a number'); return null; }
  return n;
}
// ONE place that prices a week's shop. Every screen that shows a shop total (Shop, Pantry bar, Settings, the shared list, the spend log) reads chosen.comparable from here, so two different totals can never show again.
// comparable = what you pay if you go to that shop, with anything it doesn't sell priced at the cheapest other shop. all = true prices the week as if the Pantry were empty.
function shopTotals(w, { recipes = REC(), all = false, thigh = S.settings.preferThigh } = {}) {
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

// ----- "Plan my week for me": one tap fills a sensible week to the person's targets, budget and dislikes (autoplan.js) -----
function autoPlan(seed = 1, opts = {}) {
  if (S.activeWeek === S.thisMon && W().days.filter((on, i) => on && !isPast(i)).length < 2) { S.activeWeek = S.nextMon; toast('This week is nearly over, so here is next week.'); }
  const w = W(); const before = seed > 1 && Object.keys(w.portions || {}).length ? { ...w.portions } : null; // "Try another week": steer away from this one
  if (S.activeWeek === S.thisMon) for (let i = 0; i < 7; i++) if (isPast(i) && !P.SLOTS.some((sl) => P.isRecipeCell(w.grid?.[i]?.[sl]))) w.days[i] = false; // gone, empty days: nothing to plan
  toast('Planning your week…', 4000);
  setTimeout(() => {
    const raw = RAW(), learn = learnFromMeals(S.meals); // what the Sunday check-ins taught us: skipped-twice mains are left out, eaten-every-time ones get a nudge
    const pool = raw.filter((r) => !r.slots.includes('snack') && !isAvoided(r) && !(learn.dropped.has(r.id) && r.slots[0] !== 'breakfast'));
    const args = { P, ING: ING(), core: new Set(raw.filter((r) => r.core).map((r) => r.id)), liked: learn.liked, days: liveDays(w), cookDay: w.cookDay, kcal: S.settings.kcalTarget, protein: S.settings.proteinTarget, budget: S.settings.budget,
      pantry: w.pantry || {}, resolve: resolveFor(w), choiceOf: (id) => { const it = ingById(id); return it?.choices?.length ? chosenFor(w, it) : null; }, seed, differentFrom: before };
    let r = planWeek({ ...args, pool: before ? pool : pool.filter((x) => inLibrary(x.id)) }); // "Try another week" draws on every recipe they eat, so it really is another week
    if (!r || !r.ok) { const r2 = planWeek({ ...args, pool, seed: seed + 100 }); if (r2 && (!r || (r2.ok && !r.ok) || (!r.ok && r2.overBudget + r2.shortProtein < r.overBudget + r.shortProtein))) r = r2; } // widen to every recipe they eat
    hideHint();
    if (!r) { toast('Couldn’t build a week from what you eat. Tick meals yourself below.', 3500); return; }
    for (const id of Object.keys(r.portions)) if (S.library && !S.library.includes(id)) S.library.push(id);
    w.portions = { ...r.portions }; w.overflow = []; relayout(w); planAdd = false; planMore = false; S.tab = 'plan'; save(); render({ top: true });
    const changed = [...(opts.changed || [])]; const nm = (id) => shortName(recById(id)).toLowerCase();
    const kept = Object.keys(r.portions).filter((id) => learn.liked.has(id)); if (kept.length) changed.push(`Kept ${kept.map(nm).join(', ')}: eaten every time.`);
    const dropped = [...learn.dropped].filter((id) => inLibrary(id) && recById(id)); if (dropped.length) changed.push(`Left out ${dropped.map(nm).join(', ')}: skipped twice. Still in your list if you want it back.`);
    const tubs = Object.values(S.tubs || {}).reduce((t, n) => t + n, 0); if (tubs) changed.push(`${tubs} freezer tub${tubs > 1 ? 's' : ''} to use first: tap an empty slot in the week.`);
    if (seed > 1) changed.push('A different week from the last one.');
    autoPlanSheet(r, seed, { changed });
  }, 40);
}
const NUM_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen', 'Twenty', 'Twenty-one'];
const numWord = (n) => NUM_WORDS[n] || String(n);
// v100: the result reads as one sentence with the numbers lit, then the four shops. What the plan learned and the 3-mates deal follow. extra.changed = lines for "What changed".
async function autoPlanSheet(r, seed, extra = {}) {
  const w = W(); const st = P.gridStats(liveGrid(w), REC(), ING(), snackExtra(w), liveDays(w)); const c = shopTotals(w).chosen; if (!c) return;
  const food = c.weekly, stock = c.stock, shop = P.SHOP_NAMES[c.shop];
  const notes = [];
  if (food > S.settings.budget + 0.004) notes.push(`£${S.settings.budget} is tight for ${st.filled} high-protein meals, so this is the cheapest sensible week FU£L could find.`);
  if (st.avg < S.settings.proteinTarget) notes.push(`It comes to ${S.settings.proteinTarget - st.avg}g a day under your protein target. A snack closes the gap.`);
  if (S.settings.kcalTarget && st.avgKcal < S.settings.kcalTarget * 0.93) notes.push(`It comes to ${st.avgKcal.toLocaleString()} kcal a day against your ${S.settings.kcalTarget.toLocaleString()}: meals stay in line with the recipes, so a snack or two fills the rest.`);
  const T = shopTotals(w); const under = S.settings.budget - food;
  const shops = T.ranked.filter((x) => x.lines.length).map((x) => `<div class="${x === T.best ? 'best' : ''}"><b>${esc(P.SHOP_NAMES[x.shop])}</b>${x === T.best ? '<em>Cheapest</em>' : ''}<span>${P.gbp(x.weekly)}</span></div>`).join('');
  const img = `<p class="lit">${numWord(st.filled)} meal${st.filled === 1 ? '' : 's'}. <b>${st.avg}g</b> of protein a day. <b>${P.gbp(food)}</b> at ${esc(shop)}${under > 0.004 ? `, <b>${P.gbp(under)}</b> under your budget` : ''}.</p><div class="shoprows onp">${shops}</div>`;
  const changed = (extra.changed || []).filter(Boolean);
  openSheet(`<span class="lbl">Your week is planned</span>
    ${img}
    ${stock > 0.004 ? `<p class="small">A first shop adds <b>${P.gbp(stock)}</b> of basics (oil, spices, rice). On Shop, tap what you already have.</p>` : ''}
    ${notes.map((n) => `<p class="small muted">${n}</p>`).join('')}
    ${changed.length ? `<div class="changed"><span class="lbl">What changed</span><ul class="clean small">${changed.map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>` : ''}
    <p class="small muted">Tap any meal in the week to swap it.</p>
    ${matesHtml(false)}
    <div class="stack" style="margin-top:14px"><button class="btn block" data-action="autoplan-keep">${onTrial() ? 'Start my free week' : 'Looks good'}</button><div class="row" style="gap:8px"><button class="btn ghost grow" data-action="autoplan" data-seed="${seed + 1}">Try another</button><button class="btn ghost grow" data-action="share-week">Share it</button></div></div>`);
}

// ----- Share card: a picture of this week's real numbers, for a Story, with the person's own link -----
async function drawShareCard(w) {
  const st = P.gridStats(liveGrid(w), REC(), ING(), snackExtra(w), liveDays(w)); const c = shopTotals(w).chosen;
  if (!st.filled || !c) return null;
  let code = S.mate?.code || ''; if (!code && cloud.enabled) { try { const m = await mateCode(); S.mate = { ...(S.mate || {}), ...m }; save(); code = m.code; } catch {} }
  const url = `${shareBase()}${code ? `?c=${code}` : ''}`;
  const meals = Object.entries(w.portions).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).map(([id, n]) => [(recById(id)?.name || id).replace(/\s*\([^)]*\)/g, ''), n]);
  try { await document.fonts.load('800 80px Manrope'); await document.fonts.load('600 40px Manrope'); } catch {}
  const cv = document.createElement('canvas'); cv.width = 1080; cv.height = 1920; const g = cv.getContext('2d');
  const LK = LOOKS[lookKey()]; const navy = LK.tx, pink = LK.mark || LK.ac, sun = LK.ac, cream = `rgb(${LK.pg})`, muted = `rgba(${LK.txc}, .62)`; // v100: the card is drawn in the look you have chosen
  g.fillStyle = cream; g.fillRect(0, 0, 1080, 1920);
  g.fillStyle = sun; g.fillRect(0, 0, 1080, 14);
  const word = (x, y, size) => { g.font = `800 ${size}px Manrope, sans-serif`; g.textBaseline = 'alphabetic'; let cx = x; for (const [t, col] of [['FU', navy], ['£', pink], ['L', navy]]) { g.fillStyle = col; g.fillText(t, cx, y); cx += g.measureText(t).width; } };
  word(90, 210, 76);
  g.fillStyle = muted; g.font = '600 40px Manrope, sans-serif'; g.fillText(`My week · ${weekLabel(S.activeWeek).toLowerCase()}`, 90, 300);
  const big = (y, a, b, col = navy) => { g.font = '800 150px Manrope, sans-serif'; g.fillStyle = col; g.fillText(a, 86, y); const wA = g.measureText(a).width; g.font = '600 54px Manrope, sans-serif'; g.fillStyle = navy; g.fillText(b, 86 + wA + 24, y); };
  big(520, String(st.filled), 'meals');
  big(720, P.gbp(c.weekly), `food at ${P.SHOP_NAMES[c.shop]}`, pink);
  big(920, `${st.avg}g`, 'protein a day');
  g.fillStyle = navy; g.fillRect(90, 1000, 900, 4);
  g.font = '600 46px Manrope, sans-serif'; const rows = Math.min(7, meals.length); const gap = Math.min(96, Math.floor(540 / Math.max(1, rows))); let y = 1090 + Math.max(0, (540 - gap * rows) / 2);
  const fit = (t, max) => { if (g.measureText(t).width <= max) return t; while (t.length > 4 && g.measureText(t + '…').width > max) t = t.slice(0, -1); return t.trimEnd() + '…'; };
  for (const [n, k] of meals.slice(0, 7)) { g.fillStyle = navy; g.fillText(fit(n, 780), 90, y); g.fillStyle = muted; const t = `×${k}`; g.fillText(t, 990 - g.measureText(t).width, y); y += gap; }
  if (meals.length > 7) { g.fillStyle = muted; g.fillText(`and ${meals.length - 7} more`, 90, y); }
  g.fillStyle = LK.p; g.fillRect(0, 1640, 1080, 280);
  g.fillStyle = LK.pt; g.font = '700 48px Manrope, sans-serif'; g.fillText('Planned in FU£L. First week free.', 90, 1745);
  g.fillStyle = LK.pt; g.font = '600 42px Manrope, sans-serif'; g.fillText(url.replace('https://', ''), 90, 1820);
  g.fillStyle = `rgba(${LK.ptc}, .6)`; g.font = '500 30px Manrope, sans-serif'; g.fillText(`Prices checked ${dateRange(listDates(shopTotals(w), c))}`, 90, 1880);
  const blob = await new Promise((res) => cv.toBlob(res, 'image/png')); if (!blob) return null;
  return { blob, url, text: `My week: ${st.filled} meals, ${P.gbp(c.weekly)} of food at ${P.SHOP_NAMES[c.shop]}, ${st.avg}g protein a day. Planned in FU£L:` };
}
async function shareWeek() {
  const card = await drawShareCard(W()); if (!card) { toast('Plan some meals first'); return; }
  const { blob, url, text } = card; const file = new File([blob], 'my-fuel-week.png', { type: 'image/png' });
  try { if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text, url }); track('shared'); return; } } catch (e) { if (e?.name === 'AbortError') return; }
  const src = URL.createObjectURL(blob);
  openSheet(`<h3>Your week, ready to post</h3><p class="small muted">Press and hold the picture to save it, then add it to your Story with your link.</p><img src="${src}" alt="My week in FU£L" style="width:100%;border-radius:14px;margin:8px 0;box-shadow:0 4px 18px rgba(27,26,46,.15)"><button class="btn block" data-action="copy-link" data-url="${esc(url)}">Copy my link</button><button class="btn ghost block" data-action="close-sheet" style="margin-top:8px">Done</button>`);
  track('shared');
}

// ----- Shop → "Where can I save?": switches Fuel can make for you -----
let saveUndo = null;  // the week as it was before the last switch. Memory only: never saved, never synced.
let priceOpen = false, trolleyOpen = false; // v99 Shop: the 'Prices by shop and savings' fold and the 'In the trolley' fold, this visit
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
// What the till would really come to with these switches made. Meals are sized to the targets and packs come in fixed sizes, so trying it is the only honest price.
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
  const shopTop = `${titleRow('Shop', 2, '')}${weekSwitch()}`; const head = shopTop + tipCard('shop');
  if (!Object.keys(needsAll).length) return `${head}<p class="lit">Nothing to buy yet. <b>Pick your meals</b> and the list builds itself.</p><button class="btn block" data-action="go-tab" data-to="plan">Pick my meals</button>${gl('Also buy every week', gr('Add something', '', 'data-action="extra-add"', { icon: 'plus' }), 'Things that are not part of a meal but you always get. They are priced into the list.')}`;
  const split = P.cheapestSplit(needs, ing);
  const budget = S.settings.budget;
  // The budget is judged on the one total. If only one-off stock-ups push it over we say so kindly (amber, not red): next week is just the food.
  const verdict = P.budgetVerdict(chosen.weekly, 0, budget); // v86: the budget is judged on the week's food; one-off basics are shown on their own
  const oldest = ranked.map((b) => b.oldest).filter(Boolean).sort()[0];
  // shop picker: one chip per shop, total on it
  const chips = ranked.map((b) => {
    const dead = b.unpriced.length === b.missing.length && b.lines.length === 0;
    const tag = b === bestWeek && b.lines.length ? '<em>Cheapest</em>' : b.notSold.length ? `<em class="q">${b.notSold.length} not sold</em>` : b.unpriced.length ? `<em class="q">${b.unpriced.length} unpriced</em>` : '';
    return `<button class="shopbtn ${b === chosen ? 'on' : ''} ${dead ? 'dead' : ''}" data-action="pick-shop" data-shop="${b.shop}" aria-pressed="${b === chosen}"><span class="sn"><b>${P.SHOP_NAMES[b.shop]}</b>${tag}</span><span class="pr">${b.lines.length ? P.gbp(b.weekly) : '—'}</span></button>`;
  }).join('');
  // the list for the chosen shop
  const online = { tesco: (q) => `https://www.tesco.com/groceries/en-GB/search?query=${encodeURIComponent(q)}`, asda: (q) => `https://www.asda.com/groceries/search/${encodeURIComponent(q)}`, sainsburys: (q) => `https://www.sainsburys.co.uk/gol-ui/SearchResults/${encodeURIComponent(q)}` };
  const cheapestFor = (id) => { let m = null; for (const s of P.SHOPS) { const l = byShop[s]?.lines.find((x) => x.id === id); if (l && (m === null || l.cost < m.cost)) m = { cost: l.cost, shop: s }; } return m; };
  // v99: one short line per item (what it is, then the pack to pick up), the whole row is the tick, and a ticked line leaves the list for
  // "In the trolley" at the end, so the list gets shorter as you shop. Basics sit in their aisles with everything else.
  const tickKey = (l) => `${chosen.shop}:${l.id}`;
  const lineHtml = (l) => {
    const k = tickKey(l); const done = !!w.ticks[k];
    const shelfName = l.pack.name.replace(/\s*\((?!\d+\s?(g|ml|kg|l)\b)[^)]*\)/g, '').trim(); // drop notes like "(Aldi has no natural skyr)" but keep sizes like "(580g)"
    const what = (ingById(l.id)?.name || shelfName).replace(/\s*\([^)]*\)/g, '').trim();
    const size = (shelfName.match(/\d+(?:\.\d+)?\s?(?:kg|g|ml|l|cl)\b|\d+\s?(?:pack|pk)\b/gi) || []).pop() || ''; // the pack size leads the second line, where a long shelf name would otherwise cut it off
    return `<label class="line ${done ? 'done' : ''}"><input type="checkbox" data-tick="${k}" data-what="${esc(what)}" ${done ? 'checked' : ''}><span class="grow"><span class="name">${l.n > 1 ? `<b class="n">${l.n} ×</b> ` : ''}${esc(what)}</span><span class="sub">${esc(size ? `${size} · ${shelfName.replace(size, '').replace(/\s{2,}/g, ' ').trim()}` : shelfName)}</span></span><span class="cost">${P.gbp(l.cost)}</span></label>`;
  };
  // grouped by aisle so the list reads top to bottom as you walk the shop
  const aisleHtml = (ls) => { const groups = {}; for (const l of ls) (groups[aisleOf(ingById(l.id))] ||= []).push(l); return AISLES.filter(([k]) => groups[k]).map(([k, label]) => `<h4 class="aisle">${label}<span>${groups[k].length}</span></h4>${groups[k].map(lineHtml).join('')}`).join(''); };
  const weekLines = chosen.lines.filter((l) => !isStock(l.id));
  const toGet = chosen.lines.filter((l) => !w.ticks[tickKey(l)]), got = chosen.lines.filter((l) => w.ticks[tickKey(l)]);
  const lines = aisleHtml(toGet);
  const trolleyHtml = got.length ? `<details class="trolley" id="trolleyfold" ${trolleyOpen ? 'open' : ''}><summary>In the trolley <span>${got.length}</span><i>Tap one to put it back</i></summary>${got.map(lineHtml).join('')}</details>` : '';
  const aisleGroups = {}; for (const l of weekLines) (aisleGroups[aisleOf(ingById(l.id))] ||= []).push(l);
  const breakdown = AISLES.filter(([k]) => aisleGroups[k]).map(([k, label]) => `${label.split(',')[0].split(' &')[0]} ${P.gbp(P.round2(aisleGroups[k].reduce((t, l) => t + l.cost, 0)))}`).concat(chosen.stock ? [`Stock-ups ${P.gbp(chosen.stock)}`] : [], chosen.elsewhereWeek ? [`From another shop ${P.gbp(chosen.elsewhereWeek)}`] : []).join(' · '); // adds up to the one total, so it lives under "Why £X?" and not beside the big number
  const extraRows = extras(w).map((e) => { const it = ingById(e.id); const l = chosen.lines.find((x) => x.id === e.id); return `<div class="line"><span class="grow"><span class="name">${esc(it.name)}</span><span class="sub">${e.scope === 'week' ? 'this week only' : 'every week'}${l ? ` · ${esc(l.pack.name.replace(/\s*\([^)]*\)/g, ''))}` : ' · no price at this shop'}</span></span><button class="chip" data-action="extra-qty" data-id="${e.id}" data-scope="${e.scope}">${P.fmtQty(e.qty, it.unit)}${it.unit === 'each' ? (e.qty === 1 ? ' piece' : ' pieces') : ''}</button><span class="cost">${l ? P.gbp(l.cost) : '—'}</span><button class="btn ghost small" data-action="extra-remove" data-id="${e.id}" data-scope="${e.scope}" aria-label="Remove">×</button></div>`; }).join('');
  const extrasCard = extraRows ? `<h2>Extras</h2><div class="card">${extraRows}</div>` : '';
  const complete = chosen.lines.length > 0 && chosen.lines.every((l) => w.ticks[`${chosen.shop}:${l.id}`]);
  const doneBox = complete ? `<div class="done-box"><b>Shop done ✓</b> ${P.gbp(chosen.comparable)} at ${P.SHOP_NAMES[chosen.shop]}${w.done?.date ? ` on ${fmtDate(w.done.date)}` : ''}. Logged under Settings → Money.</div>` : '';
  const notSold = chosen.notSold.map((m) => esc(m.name.replace(/\s*\([^)]*\)/g, ''))); const unpriced = chosen.unpriced.map((m) => esc(m.name));
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
  if (cup.week !== S.activeWeek) { cup = { week: S.activeWeek, ids: new Set(), costs: {}, base: null }; cupOpen = false; }
  const startedShop = chosen.lines.some((l) => w.ticks[`${chosen.shop}:${l.id}`]);
  const cupPool = [...chosen.lines.map((l) => ({ id: l.id, cost: l.cost })), ...chosen.notSold.map((m) => ({ id: m.id, cost: T.cheapestElsewhere(m.id, chosen.shop) }))].filter((x) => ingById(x.id) && !cup.ids.has(x.id));
  const cupOrder = [...cupPool.filter((x) => isStock(x.id)).sort((x, y) => y.cost - x.cost), ...cupPool.filter((x) => !isStock(x.id)).sort((x, y) => x.cost - y.cost)]; // cupboard basics first (most likely owned), then the cheap everyday bits
  const cupMine = [...cup.ids].filter((id) => w.pantry[id] !== undefined);
  let cupHtml = '';
  if (!w.done && !w.cupChecked && !startedShop && (cupOrder.length || cupMine.length)) {
    cup.base ??= chosen.comparable; const off = P.round2(cup.base - chosen.comparable);
    const basics = chosen.stock > 0.004; const shown = basics ? cupOrder.filter((x) => isStock(x.id)).slice(0, 16) : cupOrder.slice(0, 14);
    const chipName = (id) => esc((ingById(id)?.name || id).replace(/\s*\([^)]*\)/g, ''));
    const open = cupOpen || cupMine.length > 0;
    const title = basics ? `First shop? Add ${P.gbp(chosen.stock)} of basics` : 'Already got any of this?';
    const line = basics ? `Oil, rice, spices, stock. Bought once, then in your pantry. At the till today: <b>${P.gbp(chosen.comparable)}</b>.` : 'Tap what you have and it comes off the list.';
    cupHtml = `<div class="card cupcheck"><h3>${title}${off > 0 ? ` <b class="cupoff">${P.gbp(off)} off</b>` : ''}</h3><p class="small muted" style="margin:0 0 6px">${line}</p>
    ${open ? `<div class="chip-row">${cupMine.map((id) => `<button class="chip on" data-action="cup-tick" data-id="${id}">✓ ${chipName(id)}</button>`).join('')}${shown.map((x) => `<button class="chip" data-action="cup-tick" data-id="${x.id}" data-cost="${x.cost}">${chipName(x.id)}${x.cost ? `<small>${P.gbp(x.cost)}</small>` : ''}</button>`).join('')}</div>
    <div class="rowbtns"><button class="btn" data-action="cup-done">${cupMine.length ? `Done · shop is now ${P.gbp(chosen.comparable)}` : 'Done'}</button><button class="btn ghost" data-action="go-pantry">${cupOrder.length > shown.length ? `See all ${cupOrder.length + cupMine.length}` : 'Full cupboard'}</button></div>`
    : `<div class="rowbtns"><button class="btn ghost" data-action="cup-open">I've got some already</button><button class="btn" data-action="cup-done">I need them all</button></div>`}</div>`;
  }
  // The two numbers people screenshot: the cheapest protein on the list, and what a meal works out at (the meal deal is a reference, not a claim).
  const stS = P.gridStats(liveGrid(w), recipes, ing, snackExtra(w), liveDays(w)); const cp = cheapestProtein(chosen.lines.filter((l) => ['protein', 'dairy'].includes(ingById(l.id)?.category)), ingById); const pm = mealCost(chosen.weekly, stS.filled);
  const factsHtml = cp || pm ? `<div class="pair ${cp && pm ? '' : 'one'}" style="margin-top:22px">${pm ? `<div class="pc onp"><small>A meal costs</small><b>${P.gbp(pm)}</b><span>Tesco meal deal £3.85, Clubcard price (Which?, 2026)</span></div>` : ''}${cp ? `<div class="pc"><small>Cheapest protein</small><b>${cp.pencePer30g >= 100 ? P.gbp(cp.pencePer30g / 100) : `${cp.pencePer30g}p`}</b><span>for 30g · ${esc(cp.name.replace(/\s*\([^)]*\)/g, '').toLowerCase())}</span></div>` : ''}</div>` : '';
  const toolRows = gl('', gr('Add something to this shop', '', 'data-action="extra-add"', { icon: 'plus' }) + gr('Share the list', '', 'data-action="share-list"', { icon: 'share' }) + gr('Copy the list', '', 'data-action="copy-list"', { icon: 'copy', plain: true }) + (online[chosen.shop] ? grLink(`Shop online at ${P.SHOP_NAMES[chosen.shop]}`, online[chosen.shop](''), { icon: 'basket', blank: true }) : ''));
  const cd = cookData(w).rs; const nextRow = `<button class="nextrow" data-action="go-tab" data-to="cook"><span class="grow"><small>Next · step 3 of 3</small><b>Cook ${cookShort(w)}</b><span>${cd.list.length ? `${cd.list.length} recipe${cd.list.length === 1 ? '' : 's'} · ${hm(cd.minutes)}` : 'Nothing to batch cook'}</span></span><i>${ic('go', 20)}</i></button>`;
  // v88: price → where are you shopping → basics → save fold → the list → stock-ups → extras → facts → share → next
  const verdictHtml = verdict.state === 'ok' ? `<p class="verdict ok">✓ ${P.gbp(verdict.left)} under your ${P.gbp(budget)}</p>` : `<p class="verdict over">${P.gbp(verdict.over)} over your ${P.gbp(budget)} · <a href="#" data-action="open-save">Where can I save?</a></p>`;
  return `${shopTop}
  ${doneBox}
  <div class="card shophead slim"><div class="row"><span class="grow"><b class="bigtotal">${P.gbp(chosen.weekly)}</b> <span class="muted">at ${P.SHOP_NAMES[chosen.shop]}</span></span><span class="leftn"><b>${toGet.length}</b> left</span></div>
    <div class="budget prog"><i style="width:${chosen.lines.length ? Math.round(got.length / chosen.lines.length * 100) : 0}%"></i></div>
    ${verdictHtml}${chosen.stock > 0.004 ? `<p class="small muted" style="margin:2px 0 0">Plus ${P.gbp(chosen.stock)} of cupboard basics, bought once.</p>` : ''}
  </div>
  <details class="fold" id="pricefold" ${priceOpen ? 'open' : ''}><summary><b>Prices by shop and savings</b><span class="muted small">${cupHtml ? 'Compare shops and tick off what you own' : bestWeek && bestWeek.lines.length ? `${P.SHOP_NAMES[bestWeek.shop]} is cheapest this week` : 'Compare the four shops'}</span></summary>
    <div class="shops" style="margin-top:10px">${chips}</div>
    ${cupHtml}
    ${whyHtml}
    ${choiceHtml ? `<div class="card">${choiceHtml}</div>` : ''}
  </details>
  ${missing}
  <div class="card list main onp"><div class="listhead"><h3>${P.SHOP_NAMES[chosen.shop]} shopping list</h3><span>${toGet.length ? `${toGet.length} to get` : 'All done'}</span></div>${lines || (got.length ? '<p class="muted" style="margin:6px 0">Everything is in the trolley.</p>' : '<p class="muted">Nothing priced at this shop.</p>')}${trolleyHtml}</div>
  ${extrasCard}
  ${toolRows}
  ${factsHtml}
  ${unpricedAll.length ? `<div class="card"><h3>No price anywhere yet</h3><p class="small muted">${unpricedAll.map(esc).join(', ')}. Left out of the total.</p></div>` : ''}
  ${haveRows ? `<details class="fold"><summary><b>Already in your pantry</b><span class="muted small">${haveIds.length} left off the list${pantrySave > 0.004 ? ` · ${P.gbp(pantrySave)} saved` : ''}</span></summary>${haveRows}</details>` : ''}
  <div style="margin-top:22px">${nextRow}</div>
  <details class="fold quiet"><summary><b>About these prices</b></summary><p class="small muted">Prices on this week's lists were read on: ${T.ranked.filter((b) => b.lines.length).map((b) => `${P.SHOP_NAMES[b.shop]} ${dateRange(listDates(T, b))}`).join(' · ')}.</p><p class="small muted">${esc(DATA.priceNote || '')}</p></details>`;
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
// ----- The Sunday check-in (v86): three taps on Sunday, and next week is planned from what actually happened -----
// CI is the check-in under way; nothing is saved until the last tap. S.checkins[week], S.meals (eaten/skipped per recipe), S.weights,
// S.spendLog (the till total) and S.tubs (uneaten portions that freeze) are what it leaves behind.
let CI = null;
function checkinWeeks() { const t = (new Date().getDay() + 6) % 7; return Object.keys(S.weeks).filter((k) => k <= S.thisMon && checkinDue({ weekKey: k, thisMon: S.thisMon, todayIdx: t, planned: Object.values(S.weeks[k].portions || {}).some((n) => n > 0), hasCheckin: !!(S.checkins || {})[k] })).sort(); }
function checkinStart(key) {
  const w = S.weeks[key]; if (!w) { toast('Nothing to check in'); return; } if (!w.grid) relayout(w);
  const planned = {}; w.grid.forEach((d) => { for (const sl of P.SLOTS) { const v = d[sl]; const rid = P.isRecipeCell(v) ? v : P.isTub(v) ? P.tubRecipe(v) : null; if (rid && recById(rid)) planned[rid] = (planned[rid] || 0) + 1; } });
  if (!Object.keys(planned).length) { toast('Nothing was planned that week'); return; }
  const c = shopTotals(w).chosen;
  CI = { week: key, step: 1, planned, eaten: { ...planned }, out: 0, till: w.done?.total ?? null, listPrice: c ? c.comparable : null, shop: w.done?.shop || c?.shop || 'aldi', shopName: c ? P.SHOP_NAMES[c.shop] : '', items: c ? c.lines.length : 0, portions: 'same', weight: '' };
  checkinStep(1);
}
function checkinMealsAfter() { const m = JSON.parse(JSON.stringify(S.meals || {})); for (const [rid, p] of Object.entries(CI.planned)) { const e = CI.eaten[rid] || 0; const x = (m[rid] ||= { eaten: 0, skipped: 0, weeks: 0 }); x.eaten += e; x.skipped += Math.max(0, p - e); x.weeks = (x.weeks || 0) + (e > 0 ? 1 : 0); } return m; }
function checkinTarget() { return CI.week < S.thisMon ? S.thisMon : S.nextMon; } // "next week" after last week's check-in is this week
function checkinPreview() {
  const learn = learnFromMeals(checkinMealsAfter()); const out = []; const nm = (id) => shortName(recById(id)).toLowerCase();
  const kept = Object.keys(CI.planned).filter((id) => learn.liked.has(id)); if (kept.length) out.push(`Keep ${kept.map(nm).join(', ')}: eaten every time.`);
  const dropped = Object.keys(CI.planned).filter((id) => learn.dropped.has(id)); if (dropped.length) out.push(`Leave out ${dropped.map(nm).join(', ')}: skipped twice. Still in your list.`);
  const tubs = Object.entries(CI.planned).reduce((t, [rid, p]) => t + (recById(rid)?.freezer ? Math.max(0, p - (CI.eaten[rid] || 0)) : 0), 0) + Object.values(S.tubs || {}).reduce((t, n) => t + n, 0);
  if (tubs) out.push(`Use ${tubs} freezer tub${tubs > 1 ? 's' : ''} first, so you buy less.`);
  if (CI.out) out.push(`You ate out ${CI.out >= 3 ? '3 or more times' : CI.out === 1 ? 'once' : 'twice'}: mark a meal "out" next week and the shop drops.`);
  if (CI.portions === 'more') out.push('Calorie target up 10%: bigger carb portions where the recipes allow, and the shop list with them.'); if (CI.portions === 'less') out.push('Calorie target down 10%: smaller carb portions.');
  if (!out.length) out.push('Plan a fresh week to your targets and budget.');
  return out;
}
function checkinStep(n) {
  CI.step = n; const label = CI.week === S.thisMon ? 'this week' : `the week of ${fmtDate(CI.week)}`;
  const dots = `<div class="ci-steps">${[1, 2, 3].map((k) => `<i class="${k <= n ? 'on' : ''}"></i>`).join('')}</div>`;
  let body = '';
  if (n === 1) {
    const rows = Object.entries(CI.planned).map(([rid, p]) => { const e = CI.eaten[rid] || 0; return `<div class="line ci-row"><span class="grow"><span class="name">${esc(recById(rid)?.name || rid)}</span><span class="sub">planned ×${p}${e < p ? ` · <b class="ci-skip">${p - e} not eaten</b>` : ' · all eaten'}</span></span><span class="stepper ${e ? '' : 'zero'}"><button data-action="checkin-eaten" data-id="${rid}" data-d="-1">−</button><b>${e}</b><button data-action="checkin-eaten" data-id="${rid}" data-d="1" ${e >= p ? 'disabled' : ''}>+</button></span></div>`; }).join('');
    const uneaten = Object.entries(CI.planned).map(([rid, p]) => [rid, p - (CI.eaten[rid] || 0)]).filter(([, k]) => k > 0);
    const freeze = uneaten.filter(([rid]) => recById(rid)?.freezer), bin = uneaten.filter(([rid]) => !recById(rid)?.freezer); const nm = (rid) => shortName(recById(rid)).toLowerCase();
    body = `<h3>How did ${label} go?</h3><p class="small muted">Pre-filled from your week. Turn down anything you didn't eat.</p><div class="card list ci-list">${rows}</div>
      ${uneaten.length ? `<div class="card"><span class="lbl">Not eaten</span><p class="small" style="margin:4px 0 0">${freeze.length ? `${freeze.map(([rid, k]) => `${k} ${nm(rid)}`).join(', ')}: into the freezer as tubs, offered first next week.` : ''}${bin.length ? ` ${bin.map(([rid, k]) => `${k} ${nm(rid)}`).join(', ')}: ${bin.length === 1 && bin[0][1] === 1 ? 'that one doesn\u2019t' : 'those don\u2019t'} freeze, so just a skip.` : ''}</p></div>` : ''}
      <div class="card"><span class="lbl">Ate out or got a takeaway?</span><div class="chip-row" style="margin-top:6px">${[0, 1, 2, 3].map((k) => `<button class="chip ${CI.out === k ? 'on' : ''}" data-action="checkin-out" data-n="${k}">${k === 3 ? '3+' : k === 1 ? '1 time' : k}</button>`).join('')}</div><p class="small muted" style="margin:6px 0 0">Only so next week's plan isn't bigger than you need.</p></div>
      <button class="btn block" data-action="checkin-next">Next</button><button class="btn ghost block" data-action="close-sheet" style="margin-top:8px">Not now</button>`;
  } else if (n === 2) {
    const log = Object.values(S.spendLog || {}).filter((v) => v && v.total > 0); const tot = log.reduce((t, v) => t + v.total, 0);
    body = `<h3>What did the shop come to?</h3><p class="small muted">Off the receipt. It makes your spend chart real.</p>
      <div class="card"><span class="lbl">The list said</span><div><b class="mid">${CI.listPrice != null ? P.gbp(CI.listPrice) : '—'}</b> <span class="small muted">at ${esc(CI.shopName)} · ${CI.items} item${CI.items === 1 ? '' : 's'}</span></div>
        <input class="big" id="ci-till" type="number" inputmode="decimal" step="0.01" min="0" placeholder="£ at the till" value="${CI.till != null ? CI.till : ''}" style="margin-top:10px;width:100%;font-size:22px;text-align:center"><p class="small muted" style="margin:6px 0 0">Type the till total, or leave it and the list price counts.</p></div>
      <div class="card"><span class="lbl">Where did you shop?</span><div class="chip-row" style="margin-top:6px">${['aldi', 'tesco', 'sainsburys', 'asda', 'lidl', 'other'].map((k) => `<button class="chip ${CI.shop === k ? 'on' : ''}" data-action="checkin-shop" data-shop="${k}">${k === 'other' ? 'Other' : P.SHOP_NAMES[k]}</button>`).join('')}</div></div>
      ${log.length ? `<div class="card"><span class="lbl">So far this term</span><div class="row" style="margin-top:6px"><div class="grow"><b class="mid">${P.gbp(tot)}</b><span class="sub muted">${log.length} week${log.length > 1 ? 's' : ''} of food</span></div><div class="grow"><b class="mid">${P.gbp(tot / log.length)}</b><span class="sub muted">a week on average</span></div></div></div>` : ''}
      <button class="btn block" data-action="checkin-next">Next</button><button class="btn ghost block" data-action="checkin-skip-till" style="margin-top:8px">Skip, no receipt</button><button class="btn ghost block" data-action="checkin-back" style="margin-top:8px">Back</button>`;
  } else {
    const nextPlanned = Object.values(S.weeks[checkinTarget()]?.portions || {}).some((k) => k > 0);
    const rule = S.settings.goal === 'build' ? 'Build muscle: if your weight is flat for 3 weeks, FU£L offers +200 kcal a day and every portion resizes.' : S.settings.goal === 'lose' ? 'Lose fat: if your weight hasn\u2019t moved in 3 weeks, FU£L offers −200 kcal a day.' : 'Kept for your trend on Home.';
    body = `<h3>How were the portions?</h3><p class="small muted">This sizes next week.</p>
      <div class="card"><div class="chip-row">${[['less', 'Too much'], ['same', 'Just right'], ['more', 'Not enough']].map(([k, l]) => `<button class="chip ${CI.portions === k ? 'on' : ''}" data-action="checkin-portions" data-p="${k}">${l}</button>`).join('')}</div><p class="small muted" style="margin:6px 0 0">"Not enough" adds about 10% to every portion next week, and the shop list follows. "Too much" takes 10% off.</p></div>
      <div class="card"><span class="lbl">Weight today · optional</span><input class="big" id="ci-weight" type="number" inputmode="decimal" step="0.1" min="30" max="200" placeholder="kg" value="${CI.weight}" style="margin-top:8px;width:100%;font-size:22px;text-align:center"><p class="small muted" style="margin:6px 0 0">${rule} A rule of thumb, not medical advice, and never changed without your say-so.</p></div>
      <div class="card"><span class="lbl">Next week will</span><ul class="clean small" style="margin:6px 0 0">${checkinPreview().map((x) => `<li>${esc(x)}</li>`).join('')}</ul></div>
      <button class="btn block" data-action="checkin-plan">${nextPlanned ? 'Done' : 'Plan next week'}</button><button class="btn ghost block" data-action="checkin-back" style="margin-top:8px">Back</button>`;
  }
  openSheet(`${dots}${body}`);
}
function checkinReadInputs() { const t = document.getElementById('ci-till'); if (t) CI.till = t.value === '' ? null : +t.value; const wgt = document.getElementById('ci-weight'); if (wgt) CI.weight = wgt.value; }
function checkinFinish() {
  const key = CI.week, w = S.weeks[key], today = todayISO();
  S.meals = checkinMealsAfter();
  S.tubs ||= {}; for (const [rid, p] of Object.entries(CI.planned)) { const k = p - (CI.eaten[rid] || 0); if (k > 0 && recById(rid)?.freezer) S.tubs[rid] = (S.tubs[rid] || 0) + k; }
  const till = CI.till != null && CI.till >= 0 ? P.round2(CI.till) : null; const total = till ?? CI.listPrice;
  S.spendLog ||= {}; if (total != null) S.spendLog[key] = { ...(S.spendLog[key] || {}), shop: CI.shop, total, weekly: till ?? (w?.done?.weekly ?? total), budget: S.settings.budget, date: S.spendLog[key]?.date || today, source: till != null ? 'till' : 'list', meals: Object.values(CI.planned).reduce((t, n) => t + n, 0) };
  const kg = +CI.weight; if (kg >= 30 && kg <= 200) { S.weights = (S.weights || []).filter((x) => x.date !== today); S.weights.push({ date: today, kg: Math.round(kg * 10) / 10 }); S.weights.sort((a, b) => a.date.localeCompare(b.date)); S.weights = S.weights.slice(-60); }
  if (CI.portions !== 'same') setTargets(Math.round((S.settings.kcalTarget * (CI.portions === 'more' ? 1.1 : 0.9)) / 50) * 50, S.settings.proteinTarget);
  S.checkins ||= {}; S.checkins[key] = { at: new Date().toISOString(), planned: { ...CI.planned }, eaten: { ...CI.eaten }, out: CI.out, till, shop: CI.shop, portions: CI.portions, weight: kg >= 30 ? kg : null };
  track('checkin'); save();
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
  return `<div class="navbar"><button class="navback" data-action="screen-back">${ic('left', 18)}Back</button></div><h1>Recipes</h1>${stepLine(0, 'Every meal you can pick from.')}
  <button class="btn block ${S.ideasOpen ? 'ghost' : ''}" data-action="ideas-toggle" style="margin-bottom:10px">${S.ideasOpen ? 'Hide meal ideas' : `✨ Find more meal ideas (${ideasCount})`}</button>
  ${ideasHtml}
  <div class="row" style="margin-bottom:12px"><button class="btn ghost grow" data-action="add-recipe">+ Type a recipe in</button></div>
  <input class="search" placeholder="Search ${mine.length} of your recipes" value="${esc(S.search || '')}" data-search maxlength="60" inputmode="search" enterkeyhint="search" autocapitalize="none" autocorrect="off" spellcheck="false">
  <h2>My recipes</h2><div class="card">${list || '<p class="muted">Nothing here yet. Add some from the ideas above.</p>'}</div>
  <div class="card nextcard"><b>Found something you fancy?</b><p class="small muted">Every meal here is on the Plan page, ready to tick.</p><button class="btn block" data-action="go-tab" data-to="plan">Back to Plan</button></div>`;
}
function linkForm() {
  return `<h3>Add from a link</h3><p class="small muted">Instagram only opens for a logged-in browser, so the app can't read the reel itself. Paste the link here; Claude turns it into a priced recipe and pushes it to the app.</p>
  <form id="link-form"><label class="field">Reel or recipe link<input name="url" type="url" inputmode="url" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go" required maxlength="600" placeholder="https://www.instagram.com/reel/…"></label>
  <label class="field">Anything to change? (optional)<input name="note" maxlength="300" placeholder="e.g. swap thighs for breast, no coriander"></label>
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
  <h2>Add something</h2><div class="row"><select id="tweak-add-id" class="grow">${opts}</select><input id="tweak-add-qty" type="number" inputmode="decimal" step="any" min="0" placeholder="per portion" style="width:110px"><button class="btn small" data-action="tweak-add" data-id="${id}">Add</button></div>
  <div class="row" style="margin-top:14px"><button class="btn grow" data-action="tweak-done" data-id="${id}">Done</button>${(t.drop.length || t.add.length) ? `<button class="btn ghost" data-action="tweak-reset" data-id="${id}">Back to original</button>` : ''}</div>`;
}
function setTweak(id, fn) { S.tweaks ||= {}; const t = S.tweaks[id] || { drop: [], add: [] }; fn(t); if (!t.drop.length && !t.add.length) delete S.tweaks[id]; else S.tweaks[id] = t; bustCaches(); save(); }
function recipeForm() {
  const opts = ING().map((i) => `<option value="${i.id}">${esc(i.name)} (${i.unit})</option>`).join('');
  return `<h3>Add a recipe</h3><form id="recipe-form">
  <label class="field">Name<input name="name" required maxlength="80" enterkeyhint="next"></label>
  <div class="small muted">Slots</div><div class="chip-row">${P.SLOTS.map((s) => `<label class="chip"><input type="checkbox" name="slot" value="${s}" hidden>${s}</label>`).join('')}</div>
  <div class="row"><label class="field grow">Fridge days<input name="fridgeDays" type="number" inputmode="numeric" min="0" max="7" value="3"></label><label class="field grow">Batch cook minutes<input name="cookMinutes" type="number" inputmode="numeric" min="0" value="30"></label></div>
  <div class="chip-row"><label class="chip"><input type="checkbox" name="cold" hidden>ok cold</label><label class="chip on"><input type="checkbox" name="freezer" hidden checked>freezes</label></div>
  <label class="field">Reheat<select name="reheat"><option value="microwave">Microwave</option><option value="none">Eat cold</option><option value="hob">Hob</option><option value="air-fryer">Air-fryer</option></select></label>
  <div class="small muted" style="margin-top:8px">Ingredients per portion</div><div id="ing-rows"></div>
  <button type="button" class="btn ghost small" data-action="add-ing-row">+ ingredient</button>
  <button type="button" class="btn ghost small" data-action="new-ingredient">+ new ingredient (no price yet)</button>
  <label class="field">Method, one step per line<textarea name="method" maxlength="8000"></textarea></label>
  <label class="field">Source link (optional)<input name="source" maxlength="80"></label>
  <button class="btn block" type="submit" style="margin-top:8px">Save recipe</button></form>
  <template id="ing-row-t"><div class="ing-row"><select name="ing">${opts}</select><input name="qty" type="number" inputmode="decimal" step="any" placeholder="qty" required><button type="button" data-action="rm-row">×</button></div></template>`;
}
function newIngredientForm() {
  return `<h3>New ingredient</h3><form id="ing-form">
  <label class="field">Name<input name="name" required maxlength="80" enterkeyhint="next"></label>
  <label class="field">Unit<select name="unit"><option value="g">grams</option><option value="ml">ml</option><option value="each">each</option></select></label>
  <label class="field">Protein per 100g/ml (or per each)<input name="protein" type="number" inputmode="decimal" step="any" value="0"></label>
  <label class="field">Category<select name="category"><option>protein</option><option>carb</option><option>veg</option><option>fruit</option><option>dairy</option><option>tin</option><option>sauce</option><option>spice</option><option>cupboard</option></select></label>
  <label class="field">Kept in<select name="store"><option>fridge</option><option>freezer</option><option>cupboard</option></select></label>
  <p class="small muted">It'll show as "no price on file" on the Shop tab until Claude adds a price.</p>
  <button class="btn block" type="submit">Save ingredient</button></form>`;
}

// ----- Pantry -----
// Live preview for Settings: at these targets, what portion sizes result, what the week averages, and what the shop costs.
function macroPreview(kTarget, pTarget) {
  const w = W(); const ing = ING();
  const t = sizeTargets(kTarget, pTarget), raw = rawById();
  const recipes = P.sizeAll(RAW(), t, ing);
  const sizes = Object.entries(w.portions || {}).filter(([id, n]) => n > 0 && raw[id]).map(([id]) => P.sizeFor(raw[id], t, ing));
  const range = (k) => { const v = sizes.map((x) => x[k]); if (!v.length) return '1×'; const lo = Math.min(...v), hi = Math.max(...v); return lo === hi ? `${lo}×` : `${lo}–${hi}×`; };
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
  const capped = gapK > kTarget * 0.07 ? `${gapK.toLocaleString()} kcal short a day: meals stay in line with the recipes (1.5× at most), so add a snack or two.` : gapK < -kTarget * 0.07 ? `${(-gapK).toLocaleString()} kcal over a day: drop a snack or swap in a lighter meal.` : '';
  return `<div class="macro"><div class="row"><span class="grow">${empty ? 'Nothing picked this week yet' : `Portions: <b>${range('p')}</b> the recipe · carbs <b>${range('c')}</b>`}</span></div>
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
// The door. Since v81 nobody meets it on the way in: the first week is free with no account. It appears only when the free week is over
// and nothing else unlocks the app (a purchase, a code, or three mates), and offers exactly that: keep your plan for £4.99 once, or get it free.
function checkoutUrl() { return CONFIG.CHECKOUT_URL && cloud.user ? `${CONFIG.CHECKOUT_URL}${CONFIG.CHECKOUT_URL.includes('?') ? '&' : '?'}client_reference_id=${encodeURIComponent(cloud.user.id)}&prefilled_email=${encodeURIComponent(cloud.user.email)}` : ''; }
function authFormHtml(mode, dark) {
  const link = '';
  return `<form id="signin-form" data-mode="${mode}"><input class="big ${dark ? '' : 'field'}" name="email" type="email" inputmode="email" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="next" required maxlength="254" placeholder="you@uni.ac.uk" autocomplete="email" style="font-size:18px;text-align:left"><input class="big ${dark ? '' : 'field'}" name="password" type="password" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="go" required minlength="8" maxlength="72" placeholder="${mode === 'signup' ? 'Choose a password (8+ characters)' : 'Password'}" autocomplete="${mode === 'signup' ? 'new-password' : 'current-password'}" style="font-size:18px;text-align:left;margin-top:10px"><button class="${dark ? 'go' : 'btn block'}" type="submit" style="margin-top:10px">${mode === 'signup' ? 'Make my account' : 'Sign in'}</button><div id="signin-msg" class="signin-msg" hidden></div></form>
    <p class="small" style="margin-top:12px">${mode === 'signup' ? `Already have an account? <a href="#" data-action="auth-mode" data-mode="signin" ${link}>Sign in</a>` : `New here? <a href="#" data-action="auth-mode" data-mode="signup" ${link}>Make an account</a> · <a href="#" data-action="auth-forgot" ${link}>Forgot password?</a>`}</p>`;
}
let HARD_OK = false; // "Delete my account" only shows once the server can do it (supabase/hardening.sql)
let hardAsk = null;
function hardeningReady() { hardAsk ||= cloud.client.rpc('fuel_hardening').then(({ data, error }) => !error && !!data?.ok, () => false); return hardAsk; }
function newPassSheet() {
  openSheet(`<h3>Choose a new password</h3><p class="small muted" style="margin:0 0 12px">For ${esc(cloud.user?.email || 'your account')}.</p><form id="newpass-form"><input class="big field" name="password" type="password" required minlength="8" maxlength="72" autocomplete="new-password" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="New password (8+ characters)" style="width:100%;font-size:18px;text-align:left"><button class="btn block" type="submit" style="margin-top:10px">Save password</button><div id="newpass-msg" class="signin-msg" hidden></div></form>`);
}
const badPassword = (p) => (!p.trim() ? 'A password cannot be only spaces.' : p !== p.trim() ? 'A password cannot start or end with a space.' : p.length < 8 ? 'Password needs to be at least 8 characters.' : '');
let GROWTH_OK = false; // the mates card only shows once the backend for it answers (supabase/growth.sql)
function matesHtml(dark) {
  if (!GROWTH_OK) return '';
  const m = S.mate; const n = Math.min(3, m?.planned || 0);
  const dots = [0, 1, 2].map((i) => `<i class="${i < n ? 'on' : ''}"></i>`).join('');
  return `<div class="${dark ? 'gcard' : 'card'} matescard"><b>Or get it free: bring 3 mates</b><small>When 3 friends plan a week with your link, FU£L is yours for life.</small>
    <div class="matedots">${dots}<span>${n} of 3</span></div>
    <div class="row" style="gap:8px;margin-top:8px"><button class="${dark ? 'go' : 'btn small'}" data-action="mates-share" style="${dark ? 'width:auto;margin:0;padding:11px 16px' : ''}">Send my link</button>${m?.code ? `<span class="small" style="opacity:.85">Your code <b>${esc(m.code)}</b></span>` : ''}</div></div>`;
}
function gateScreen() {
  const el = document.getElementById('gate');
  if (canUse()) { el.hidden = true; el.innerHTML = ''; el.dataset.key = ''; return false; }
  const key = [cloud.status, cloud.user?.id || '', S.authMode || 'signup', cloud.error || '', S.mate?.planned || 0].join('|');
  if (!el.hidden && el.dataset.key === key) return true;
  el.dataset.key = key;
  const name = esc(CONFIG.APP_NAME);
  // A signed-in buyer coming back after their free week: wait for the account to load rather than flash the door at them.
  if (cloud.status === 'off' || cloud.status === 'loading') { el.innerHTML = `<div class="wrap"><div class="logo wordmark" aria-label="${name}">FU<b>£</b>L</div><h1>One moment…</h1></div>`; el.hidden = false; return true; }
  const weeks = Object.values(S.weeks).filter((w) => Object.keys(w.portions || {}).length).length;
  const url = checkoutUrl();
  const price = esc(CONFIG.PRICE_LABEL || '£4.99');
  const buy = !CONFIG.CHECKOUT_URL ? '' : cloud.user
    ? `<div class="gcard price"><div><b>${price} once</b><small>Pay once, keep it forever. No subscription.</small></div><a class="go" href="${esc(url)}" target="_blank" rel="noopener" data-action="buy">Keep my plan</a></div>
       <p class="gfoot"><button class="back" data-action="gate-refresh">I've paid, refresh</button><span>·</span><button class="back" data-action="signout">Sign out</button></p>`
    : (S.authMode || 'signup') === 'signup' ? `<div class="gcard"><b>Make an account to keep it</b><small>Then pay ${price} once. Your plan comes with you.</small>${authFormHtml('signup', true)}</div>`
    : `<div class="gcard"><b>Sign in to keep it</b><small>Already bought FU£L or used a code? Sign in and it opens.</small>${authFormHtml('signin', true)}</div>`;
  const code = cloud.user ? `<form id="code-form" class="gcard codecard"><label for="gate-code"><b>Have a code?</b><small>From a friend, a club, or the founder.</small></label><div class="row"><input id="gate-code" class="big grow" name="code" required maxlength="40" placeholder="ENTER CODE" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go"><button class="go" type="submit">Use it</button></div><div id="code-msg" class="signin-msg" hidden></div></form>` : '';
  el.innerHTML = `<div class="wrap gate-access"><div class="logo wordmark" aria-label="${name}">FU<b>£</b>L</div><h1>Your free week's up.</h1>
    <p>${weeks ? `Your ${weeks > 1 ? `${weeks} weeks` : 'week'}, your recipes and your shop lists are all still here.` : 'Everything you set up is still here.'} Keep them for ${price}, once.</p>
    ${buy}${matesHtml(true)}${code}
    <p class="small" style="margin-top:16px"><a href="terms.html">Terms</a> · <a href="privacy.html">Privacy</a></p></div>`;
  el.hidden = false; return true;
}
// Small sheets used from anywhere in the app: the account form, the way to buy, and the free-week explainer.
function accountSheet(mode = 'signup', why = '') {
  S.authMode = mode;
  if (!why && S.pendingBuy) why = `Your purchase is saved to your account, so it works on any phone. Then you pay ${esc(CONFIG.PRICE_LABEL || '£4.99')} once.`;
  openSheet(`<h3>${mode === 'signup' ? 'Save your plan to an account' : 'Sign in'}</h3><p class="small muted" style="margin:0 0 12px">${why || 'Then it syncs to any phone or laptop, and nothing is lost if this phone is.'}</p>${authFormHtml(mode, false)}<button class="btn ghost block" data-action="close-sheet" style="margin-top:6px">Not now</button>`);
}
function buySheet() {
  if (!CONFIG.CHECKOUT_URL) { toast('Buying opens soon. For now, access is by code.'); return; }
  if (!cloud.user) { S.pendingBuy = true; save(); accountSheet('signup', `Make an account first, so your purchase is saved to it and works on any phone. Then you pay ${esc(CONFIG.PRICE_LABEL || '£4.99')} once.`); return; }
  openSheet(`<h3>Keep FU£L for life</h3><p class="small muted" style="margin:0 0 12px">${esc(CONFIG.PRICE_LABEL || '£4.99')} once. No subscription, nothing to cancel. Paying opens Stripe; come back here when it's done.</p><a class="btn block" href="${esc(checkoutUrl())}" target="_blank" rel="noopener" data-action="buy">Pay ${esc(CONFIG.PRICE_LABEL || '£4.99')}</a><button class="btn ghost block" data-action="gate-refresh" style="margin-top:8px">I've paid, refresh</button><button class="btn ghost block" data-action="close-sheet" style="margin-top:8px">Not now</button>`);
}
function trialSheet() {
  const price = esc(CONFIG.PRICE_LABEL || '£4.99');
  if (paidUp() || matesUnlocked()) { openSheet(`<h3>FU£L is yours for life</h3><p class="small muted">${paidUp() ? esc(cloud.user?.email || '') : 'Three mates planned a week with your link.'}</p><button class="btn ghost block" data-action="close-sheet" style="margin-top:8px">Close</button>`); return; }
  const left = trialLeft();
  const e = trialEnd(), days = S.trial?.days || TRIAL_DAYS;
  openSheet(`<h3>${!e ? `Your free ${days === 14 ? 'fortnight' : 'week'}` : left ? `Free week: day ${trialDay()} of ${trialTotalDays()}` : 'Your free week has ended'}</h3>${e && left ? trialSegs() : ''}
    <ol class="fw-steps">
      <li><b>${!e ? `Plan a week and your free ${days} days start.` : `Days 1 to ${trialTotalDays()}: everything's free.`}</b> Every recipe, the shop prices, the cook plan. No account, no card.${!e ? ' The clock only starts once you have a week planned, and it always runs to a Sunday night.' : ''}</li>
      <li><b>${!e ? 'After that' : left ? `After ${dayName(e)}` : 'Now'}: keep it for ${price}, once.</b> Not a subscription. Nothing renews, ever.</li>
      ${GROWTH_OK ? `<li><b>Or free for life.</b> When 3 mates plan a week with your link.</li>` : ''}
    </ol>
    <p class="fw-promise">We never ask for a card during the free week, so you can't be charged by surprise. If you don't keep it, nothing happens.</p>
    <button class="btn block" data-action="buy-open">Upgrade now · ${price} once</button>${matesHtml(false)}
    <button class="btn ghost block" data-action="close-sheet" style="margin-top:8px">${left ? 'Carry on free' : 'Close'}</button>`);
}
// The small "Free week · 5 days left" pill in the top bar (tap: the sheet above). Gone once paid.
function trialPill() { if (!cloud.enabled || paidUp() || matesUnlocked()) return ''; const left = trialLeft(); const e = trialEnd(); return `<button class="trialpill ${e && left <= 2 ? 'soon' : ''}" data-action="trial">${!e ? `Free week${S.trial?.days === 14 ? ' · 14 days' : ''}` : left ? `Free until ${dayName(e)}` : 'Free week over'}</button>`; }
function refreshTrialPill() { const b = document.querySelector('.brandbar .trialpill'); const html = S.tab === 'settings' ? '' : trialPill(); if (b) b.outerHTML = html || ''; else if (html) document.querySelector('.brandbar')?.insertAdjacentHTML('beforeend', html); }
// After any sign-in: say which code this account came with (once), make three mates' unlock permanent, count the step.
async function afterSignIn() {
  const uid = cloud.user?.id; if (!uid) return;
  S.refSent ||= {};
  if (!S.refSent[uid]) { const a = attribution(); try { await setReferral(a.code, a.src, anonId()); S.refSent[uid] = true; save(); } catch {} }
  if (S.mate?.unlocked && !hasAccess()) { try { const r = await claimMates(S.mate.code, S.mate.secret); if (r?.ok) toast('Free for life: your 3 mates did it.'); } catch {} }
  track('account');
}
// How many mates have planned a week with this phone's code (asked at most every 10 minutes unless forced).
let matesAsked = 0;
async function refreshMates(force = false) {
  if (!S.mate?.code || (!force && Date.now() - matesAsked < 600000)) return;
  matesAsked = Date.now();
  try {
    const st = await mateStatus(); if (!st) return;
    const was = !!S.mate.unlocked; S.mate.planned = st.planned; S.mate.unlocked = !!st.unlocked; save();
    if (st.unlocked && !was) { toast('3 mates planned their week. FU£L is yours for life.', 3500); if (cloud.user) afterSignIn(); }
    gateScreen(); refreshTrialPill();
    document.querySelectorAll('.matescard').forEach((c) => { const d = document.createElement('div'); d.innerHTML = matesHtml(c.classList.contains('gcard')); c.replaceWith(d.firstElementChild); });
  } catch {}
}
const shareBase = () => 'https://thefuelapp.github.io/';
async function shareMates() {
  let m; try { m = await mateCode(); } catch { toast('Can’t make your link right now. Try again in a minute.'); return; }
  S.mate = { ...(S.mate || {}), ...m }; save();
  const url = `${shareBase()}?c=${m.code}`;
  const text = `I plan my week of food with FU£L: high-protein meals, the cheapest shop, all cooked on Sunday. Your first week's free. If you plan a week with my link it helps me get it free:`;
  try { if (navigator.share) { await navigator.share({ title: 'FU£L', text, url }); track('shared'); return; } } catch (e) { if (e?.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(`${text} ${url}`); toast('Link copied. Paste it to your mates.'); track('shared'); } catch { showText('Send this to your mates', `${text} ${url}`); }
}
// What the chosen (or cheapest) shop comes to at the till right now, worked out the way the Shop tab does it (things that shop doesn't sell
// are priced at the cheapest other shop). Pantry shows it live, so ticking something visibly takes it off the bill.
let cookView = null; // Cook: the recipe whose page is open (this visit only)
const cookGot = new Set(); // Cook: ingredients ticked off while getting things out (this visit only)
let setSheet = null; // Settings: which sheet is open, so a change inside it can redraw it
const justAdded = new Set(); // meals ticked under "More meals" this visit: they stay in that section (under your thumb) until you close it, then join your list
let planMore = false; // Plan's "More meals" section (recipes not in your list yet), opened from the picker so nobody is sent off to Recipes and stranded
let planAdd = null; // Plan page: true = Add meals view, false = Your week view, null = decide from the week. Never saved.
let cup = { week: null, ids: new Set(), costs: {}, base: null };
let cupOpen = false; // v88 Shop: the basics card opened into its tick-what-you-own list (this visit) // Shop's cupboard check this visit: what was tapped (so it can be untapped) and the bill when the card first showed
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
  return `<div class="navbar"><button class="navback" data-action="screen-back">${ic('left', 18)}Back</button></div><h1>Pantry</h1>${stepLine(0, `<strong>Your cupboard.</strong> Tick what you have; it comes off the shop list.`)}${weekSwitch()}${tipCard('pantry')}<div id="useby-banner">${useByInner('pantry')}</div><div class="pantryprice" id="pantryprice">${pantryPriceHtml(w)}</div>
  <div class="row" style="margin-bottom:12px"><input class="search grow" placeholder="Search the cupboard" value="${esc(S.pantrySearch || '')}" data-pantry-search maxlength="60" inputmode="search" enterkeyhint="search" autocapitalize="none" autocorrect="off" spellcheck="false"><button class="btn ghost" data-action="clear-pantry">Untick all</button></div>
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
const MILKS = [['milk', 'Dairy (semi-skimmed)'], ['oat_milk', 'Oat'], ['almond_milk', 'Almond'], ['soya_milk', 'Soya']];
// v101 Settings: grouped rows like the phone's own Settings. A row shows the value; tapping it opens a sheet from the bottom to change it.
function renderSettings() {
  const st = S.settings; const wt = weightTrend(S.weights); const open = (k) => `data-action="set-sheet" data-sheet="${k}"`;
  const access = !cloud.enabled ? '' : paidUp() ? `Yours for life${cloud.planExpires ? ` until ${fmtDate(cloud.planExpires.slice(0, 10))}` : ''}` : matesUnlocked() ? 'Free for life: 3 mates planned a week' : !trialEnd() ? `Free ${S.trial?.days === 14 ? 'fortnight' : 'week'} · starts when you plan a week` : trialLeft() ? `Free week, day ${trialDay()} of ${trialTotalDays()} · free until ${dayName(trialEnd())}` : 'Free week over';
  const canBuy = cloud.enabled && !paidUp() && !matesUnlocked();
  const prof = (av, name, sub) => `<div class="gr prof"><span class="avatar">${av}</span><span class="gr-l">${name}${sub ? `<small>${sub}</small>` : ''}${onTrial() && trialEnd() ? trialSegs() : ''}</span></div>`;
  const account = !cloud.enabled ? prof(ic('user', 22), 'This phone only', 'Everything is saved here.')
    : (cloud.status === 'error' ? `<div class="bad-box" style="margin:10px 14px">Cloud problem: ${esc(cloud.error || 'unknown')}. The app keeps working on this phone.</div>` : '')
      + (!cloud.user ? prof(ic('user', 22), 'Your plan lives on this phone', access) + gr('Save to an account', '', 'data-action="account" data-mode="signup"') + gr('Sign in', '', 'data-action="account" data-mode="signin"')
        : prof(esc((cloud.user.email || '?')[0].toUpperCase()), esc(cloud.user.email), `${access}${cloud.lastSync ? ` · synced ${new Date(cloud.lastSync).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}`) + (paidUp() ? '' : gr('Have a code?', '', 'data-action="code-sheet"')) + gr('Sign out', '', 'data-action="signout"', { plain: true }) + (HARD_OK ? gr('Delete my account', '', 'data-action="delete-account"', { plain: true, cls: 'warnrow' }) : ''))
      + (canBuy && CONFIG.CHECKOUT_URL ? gr('Upgrade', `${esc(CONFIG.PRICE_LABEL || '£4.99')} once, for life`, 'data-action="buy-open"', { cls: 'accent' }) : '')
      + (canBuy && GROWTH_OK ? gr('Or free for life: bring 3 mates', `${Math.min(3, S.mate?.planned || 0)} of 3`, open('mates')) : '');
  const L = LOOKS[lookKey()]; const avoidN = st.avoid.length + (st.avoidText || []).length;
  const log = Object.values(S.spendLog || {}); const avg = log.length ? log.reduce((t, v) => t + v.total, 0) / log.length : 0;
  return `<div class="navbar"><button class="navback" data-action="settings-back">${ic('left', 18)}Back</button></div><h1>Settings</h1>
  ${gl('', account)}
  ${gl('You', gr('Bodyweight', `${st.weight} kg`, open('weight')) + gr('Weekly food budget', `£${st.budget}`, open('budget')) + gr('Goal', GOAL_NAMES[st.goal] || '', open('goal')), `Change these and the targets and portions follow.${S.loan ? ` £${S.loan.perWeek} a week from £${S.loan.left} till ${fmtDate(S.loan.until)}. <a href="#" data-action="loan-clear">Forget this</a>` : ''}`)}
  ${gl('Daily targets', gr('Calories', `${(st.kcalTarget || 0).toLocaleString()} kcal`, open('targets')) + gr('Protein', `${st.proteinTarget}g`, open('targets')), 'Protein sizes the meat, fish and eggs. Calories size the rice, pasta and bread.')}
  ${gl('Look', gr('Colours', `<i class="lchip mini" style="background:rgb(${L.pg})"><i style="background:${L.p}"></i><i style="background:${L.ac}"></i></i>${L.name}`, open('look')))}
  ${gl('Food', gr('Things you do not eat', avoidN ? `${avoidN} hidden` : 'None', open('avoid')) + gr('Milk', (MILKS.find(([k]) => k === (st.milk || 'milk')) || MILKS[0])[1], open('milk')) + gsw('Thigh fillets instead of breast', 'preferThigh', !!st.preferThigh, 'Swaps every breast line. Breast is cheaper per kilo right now.'))}
  ${gl('Weigh-ins', gr('Add a weigh-in', wt ? `${wt.latest} kg · ${fmtDate(wt.points[wt.points.length - 1].date)}` : 'None yet', 'data-action="weigh-add"') + gsw('Suggest target changes', 'adjustTargets', st.adjustTargets !== false, 'Offers +200 or −200 kcal from your weigh-ins. Never automatic.'))}
  ${gl('Money', gr('Spending by week', avg ? `${P.gbp(avg)} average` : 'Nothing logged yet', open('money')))}
  ${gl('App', (isStandalone() ? '' : gr('Put FU£L on your home screen', '', open('install'))) + (cloud.enabled ? gsw('Count my visits, anonymously', 'countSteps', st.countSteps !== false, 'Which steps people get stuck on. A random number for this phone, never your name, email or plan.') : '') + gr('Show the intro again', '', 'data-action="intro"', { plain: true }) + gr('Show the tips again', '', 'data-action="tips-again"', { plain: true }) + gr('Copy a backup', '', 'data-action="export"', { plain: true }) + gr('Paste a backup', '', 'data-action="import"', { plain: true }))}
  ${gl('About', gr('What is new', APP_VERSION, open('whatsnew')) + grLink('Terms', 'terms.html') + grLink('Privacy', 'privacy.html'))}
  ${gl('', `<button class="gr danger" data-action="reset"><span class="gr-l">Reset everything</span></button>`)}
  <p class="gl-foot" style="text-align:center;margin-top:18px">${esc(CONFIG.APP_NAME)} ${APP_VERSION} · prices checked ${dateRange(DATA.priceDates || [])}</p>
  ${new URLSearchParams(location.search).has('debug') ? `<p class="small muted screenfacts" style="text-align:center;font-size:12px;opacity:.7;margin-top:-6px">${esc(screenFacts())}</p>` : ''}`;
}
// What each Settings row opens. One function so a change made inside a sheet can redraw it in place.
function settingsSheet(kind) {
  const st = S.settings; const done = `<button class="btn block" data-action="close-sheet" style="margin-top:16px">Done</button>`;
  const opts = (key, list, cur) => `<div class="gl">${list.map(([k, l]) => `<button class="gr opt ${cur === k ? 'on' : ''}" data-action="set-pick" data-key="${key}" data-val="${k}"><span class="gr-l">${l}</span>${cur === k ? ic('check', 18) : ''}</button>`).join('')}</div>`;
  const num = (key, title, note, unit, val, attrs) => `<h3>${title}</h3><p class="small muted" style="margin:0 0 12px">${note}</p><form id="set-num" data-key="${key}"><div class="numfield"><input class="big" name="v" type="number" ${attrs} value="${val}" enterkeyhint="done" autocomplete="off" required><span>${unit}</span></div><button class="btn block" type="submit" style="margin-top:14px">Save</button></form>`;
  if (kind === 'weight') return num('weight', 'Bodyweight', 'Your calorie and protein targets follow your weight.', 'kg', st.weight, 'inputmode="decimal" step="0.1" min="30" max="200"');
  if (kind === 'budget') return num('budget', 'Weekly food budget', 'What you want to spend on food in a week.', '£ a week', st.budget, 'inputmode="numeric" step="1" min="10" max="300"');
  if (kind === 'goal') return `<h3>Your goal</h3><p class="small muted" style="margin:0 0 12px">Targets and portions follow it.</p>${opts('goal', Object.entries(GOAL_NAMES), st.goal)}`;
  if (kind === 'milk') return `<h3>Milk</h3><p class="small muted" style="margin:0 0 12px">Every recipe and shop line switches.</p>${opts('milk', MILKS, st.milk || 'milk')}`;
  if (kind === 'targets') return `<h3>Daily targets</h3><p class="small muted" style="margin:0 0 14px">Protein sizes the meat, fish and eggs; calories size the rice, pasta and bread. Never more than 1.5× a recipe.</p>
    <label class="field">Calories <b data-val="kcalTarget">${(st.kcalTarget || 0).toLocaleString()}</b> kcal a day<input class="range" type="range" min="1200" max="4500" step="50" data-setting="kcalTarget" value="${st.kcalTarget || 2500}"></label>
    <label class="field">Protein <b data-val="proteinTarget">${st.proteinTarget}g</b> a day<input class="range" type="range" min="80" max="260" step="5" data-setting="proteinTarget" value="${st.proteinTarget}"></label>
    <div id="macro-preview">${macroPreview(st.kcalTarget, st.proteinTarget)}</div>
    <button class="btn ghost block" data-action="suggest-targets" style="margin-top:12px">Reset to match my weight and goal</button>${done}`;
  if (kind === 'look') return `<h3>Colours</h3><p class="small muted" style="margin:0 0 12px">Tap one. It changes straight away.</p><div class="looks">${Object.entries(LOOKS).map(([k, L]) => `<button class="look ${lookKey() === k ? 'on' : ''}" data-action="look" data-look="${k}" aria-pressed="${lookKey() === k}"><span class="lchip" style="background:rgb(${L.pg})"><i style="background:${L.p}"></i><i style="background:${L.ac}"></i></span><b>${L.name}</b>${lookKey() === k ? ic('check', 16) : ''}</button>`).join('')}</div>${done}`;
  if (kind === 'avoid') return `<h3>Things you do not eat</h3><p class="small muted" style="margin:0 0 12px">Hidden from every list.</p><div class="chip-row">${Object.entries(AVOID).map(([k, v]) => `<button class="chip ${st.avoid.includes(k) ? 'on' : ''}" data-action="avoid" data-id="${k}">${v.label}</button>`).join('')}</div>
    <div class="row" style="margin-top:12px;gap:8px"><input class="grow" id="settings-avoid-text" maxlength="40" placeholder="Anything else, e.g. mushrooms" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done"><button class="btn small" data-action="settings-avoid-add">Add</button></div>${avoidTextChips('settings-avoid-rm')}${done}`;
  if (kind === 'money') return `<h3>Spending by week</h3>${moneyCard()}${done}`;
  if (kind === 'install') return `${installCard(true)}${done}`;
  if (kind === 'mates') return `${matesHtml(false)}${done}`;
  if (kind === 'whatsnew') return `<h3>What is new</h3><div class="wnlist">${WHATS_NEW.map(([v, d, t]) => `<div><b>${v} · ${d}</b><p>${esc(t)}</p></div>`).join('')}</div>${done}`;
  return '';
}
function openSet(kind) { openSheet(settingsSheet(kind), () => { if (['settings', 'more'].includes(S.tab)) render(); }); setSheet = kind; if (kind === 'mates') refreshMates(); const f = document.querySelector('#sheet .numfield input'); if (f) { f.focus(); f.select?.(); } }
function refreshSet() { if (!setSheet || document.getElementById('sheet').hidden) return false; const inner = document.getElementById('sheet-inner'), y = inner.scrollTop; inner.innerHTML = settingsSheet(setSheet); inner.scrollTop = y; return true; }

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
  return `<details class="gcard ginstall"><summary><b>On iPhone? Add FU£L to your home screen first</b></summary><small>FU£L isn't on the App Store yet, so it installs from Safari. Do it before you plan: the home-screen app keeps its own copy of your plan.</small>${steps}</details>`;
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
// The targets set the portion sizes (P.sizeFor), so new targets mean new portions. Settings is updated in place (no redraw: focus stays put when you tab from weight to budget).
// Returns true when the active week's portions really changed size (they do not on an empty week or at the 0.5× / 1.5× limits), so the toast never claims it wrongly.
function setTargets(kcal, prot) {
  const st = S.settings, w = W(), before = weekSizes(w, st.kcalTarget, st.proteinTarget); st.kcalTarget = kcal; st.proteinTarget = prot; bustCaches(); if (w && w.done) shopDone(w); save(); // a finished shop's logged total follows the resize, so Shop and Settings → Money never disagree
  for (const [k, v] of [['kcalTarget', kcal], ['proteinTarget', prot]]) {
    const r = document.querySelector(`#view input[data-setting="${k}"]`); if (r) r.value = v;
    const b = document.querySelector(`#view [data-val="${k}"]`); if (b) b.textContent = k === 'kcalTarget' ? v.toLocaleString() : v + 'g';
  }
  const mp = document.getElementById('macro-preview'); if (mp) mp.innerHTML = macroPreview(kcal, prot);
  return weekSizes(w, kcal, prot) !== before;
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
function askNumber(title, placeholder, unit = '') {
  return new Promise((resolve) => {
    openSheet(`<h3>${esc(title)}</h3><form id="ask-num"><div class="numfield"><input class="big" id="ask-num-v" type="text" inputmode="decimal" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="done" placeholder="${esc(placeholder)}">${unit ? `<span>${esc(unit)}</span>` : ''}</div><div class="row" style="margin-top:14px;gap:8px"><button type="button" class="btn ghost grow" data-dlg="0">Cancel</button><button type="submit" class="btn grow" data-dlg="1">OK</button></div></form>`);
    const inner = document.getElementById('sheet-inner'); const done = (ok) => { const v = document.getElementById('ask-num-v')?.value ?? ''; inner.onclick = null; closeSheet(); resolve(ok ? v : null); };
    inner.querySelector('form').onsubmit = (e) => { e.preventDefault(); e.stopPropagation(); done(true); };
    inner.onclick = (e) => { const b = e.target.closest('[data-dlg="0"]'); if (b) done(false); };
    document.getElementById('ask-num-v').focus();
  });
}
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
function ensureIntro() { if (!S.settings.onboarded && !introOpen()) { openIntro(); track('setup'); } }
function openIntro() { INTRO.goal = S.settings.onboarded ? (S.settings.goal || null) : null; introStep(S.settings.onboarded ? 1 : 0); } // v100: a new person sees the welcome screen first
function introStep(n) {
  INTRO.step = n;
  const el = document.getElementById('intro');
  const dots = n ? `<p class="istep">Step ${n} of 5${n < 5 ? ` · ${5 - n} to go` : ''}</p><div class="pline"><i style="width:${n * 20}%"></i></div>` : '';
  const arc = ['curry', 'chilli', 'fajitas', 'bolognese', 'eggs'].map((k, i) => `<div style="transform:translateX(${(i - 2) * 100}px) translateZ(${((i - 2) ** 2) * 16}px) rotateY(${-(i - 2) * 18}deg)"><img src="img/meals/${k}.jpg" alt=""></div>`).join('');
  const freeDays = cloud.enabled && !paidUp() ? (S.trial?.days || TRIAL_DAYS) : 0;
  const goals = [['build', 'Build muscle', 'Rugby, lifting, bulking. 2g protein per kilo, calories up.'], ['lean', 'Stay lean and strong', 'Training most days, not bulking.'], ['lose', 'Lose fat, keep muscle', 'Calories down, protein high so you stay full.'], ['eatwell', 'Just eat well', 'Healthy, cheap, sorted. No targets to chase.']];
  const wt = S.settings.weight || 85; const g = INTRO.goal || 'build'; const picked = INTRO.goal; // nothing looks chosen until they choose
  const budgets = [30, 40, 50, 60];
  const step = {
    0: `<div class="wl"><span class="wlmark" aria-label="Fuel">FU<b>£</b>L</span>${freeDays ? `<span class="wl-badge">${S.trial?.codeName ? esc(S.trial.codeName) + '\u2019s code · ' : ''}Free for ${freeDays} days</span>` : ''}<h1>A week of meals, sorted on Sunday.</h1><p>Plan high-protein meals, shop at the cheapest price, cook once.</p><div class="wl-arc">${arc}</div><span class="ring"><button class="go" data-action="intro-start">Build my week</button></span><p class="wl-fine">${freeDays ? 'No account. No card.' : 'Five quick questions.'}</p></div>`,
    1: `${gateInstallHint()}<h1>What's the goal?</h1><p>This sets your daily protein and calorie targets. You can change them any time.</p>${goals.map(([k, t, d]) => `<button class="opt ${picked === k ? 'on' : ''}" data-action="intro-goal" data-goal="${k}">${t}<small>${d}</small></button>`).join('')}`,
    2: `<h1>How much do you weigh?</h1><p>Kilos, roughly. Your daily protein and calorie targets come from this and your goal. Meals are sized to them, never more than 1.5× the recipe.</p><input class="big" type="number" id="intro-weight" inputmode="decimal" placeholder="kg" value="${S.settings.onboarded ? wt : ''}" min="30" max="200"><div class="stat-row"><div><b id="iw-p">${S.settings.onboarded ? `${P.proteinTargetFor(wt, g)}g` : '—'}</b><span>protein a day</span></div><div><b id="iw-f">${S.settings.onboarded ? P.kcalTargetFor(wt, g).toLocaleString() : '—'}</b><span>kcal a day</span></div></div><button class="go" data-action="intro-weight">Next</button><button class="back" data-action="intro-back">Back</button>`,
    3: `<h1>Weekly food budget?</h1><p>The shop list always shows what's left against it.</p><div class="chips">${budgets.map((b) => `<button class="opt ${S.settings.budget === b ? 'on' : ''}" data-action="intro-budget" data-budget="${b}">£${b}</button>`).join('')}</div><p style="margin-bottom:6px">Or type your own</p><input class="big" type="number" id="intro-budget" inputmode="numeric" placeholder="£" min="10" max="300"><p style="margin:14px 0 6px">Or work it out from what's left</p><div class="row" style="gap:8px"><input class="big grow" type="number" id="intro-loan-left" inputmode="numeric" placeholder="£ left" value="${S.loan?.left || ''}" style="margin:0"><input class="big grow" type="date" id="intro-loan-until" value="${S.loan?.until || ''}" style="margin:0;font-size:16px"></div><p class="small" id="intro-loan-out" style="margin:8px 0 0;min-height:1.4em"></p><button class="go" data-action="intro-budget-custom">Next</button><button class="back" data-action="intro-back">Back</button>`,
    4: `<h1>Anything you don't eat?</h1><p>Recipes with these are hidden. Tap all that apply.</p><div class="chips">${Object.entries(AVOID).map(([k, v]) => `<button class="opt ${S.settings.avoid.includes(k) ? 'on' : ''}" data-action="intro-avoid" data-id="${k}">${v.label}</button>`).join('')}</div><p style="margin:16px 0 6px">Anything else? Allergies, or things you just don't like.</p><div class="row"><input class="big grow" id="intro-avoid-text" data-enter="intro-avoid-add" maxlength="40" placeholder="e.g. mushrooms" autocapitalize="none" autocorrect="off" spellcheck="false" enterkeyhint="done" style="font-size:18px;text-align:left;margin:0"><button class="go" style="width:auto;margin:0;padding:14px 18px;font-size:16px" data-action="intro-avoid-add">Add</button></div>${avoidTextChips('intro-avoid-rm')}<p style="margin:16px 0 6px">Which milk?</p><div class="chips">${[['milk', 'Dairy'], ['oat_milk', 'Oat'], ['almond_milk', 'Almond'], ['soya_milk', 'Soya']].map(([k, l]) => `<button class="opt ${(S.settings.milk || 'milk') === k ? 'on' : ''}" data-action="intro-milk" data-id="${k}">${l}</button>`).join('')}</div><button class="go" data-action="intro-next">Next</button><button class="back" data-action="intro-back">Back</button>`,
    5: `<h1>You're set.</h1><p class="lit"><b>${S.settings.proteinTarget}g</b> of protein and <b>${(S.settings.kcalTarget || 0).toLocaleString()}</b> kcal a day, on <b>£${S.settings.budget}</b> a week. Plan, shop, cook.</p>${onTrial() ? `<div class="freebox"><b>${trialEnd() ? `Free until ${dayName(trialEnd())}.` : `Your first ${S.trial?.days === 14 ? '14 days are' : 'week is'} free, from the day you plan it.`}</b> Every feature. No card, nothing to cancel.</div>` : ''}<span class="ring"><button class="go" data-action="intro-auto">Plan my week for me</button></span><button class="go ghostgo" data-action="intro-done">I'll pick my own meals</button><button class="back" data-action="intro-back">Back</button>`,
  }[n];
  el.innerHTML = `<div class="wrap ${n ? '' : 'welcome'}">${dots}${step}</div>`; el.hidden = false;
  const wIn = document.getElementById('intro-weight');
  if (wIn) wIn.addEventListener('input', () => { const v = +wIn.value; const ok = v >= 30 && v <= 200; document.getElementById('iw-p').textContent = ok ? P.proteinTargetFor(v, g) + 'g' : '—'; document.getElementById('iw-f').textContent = ok ? P.kcalTargetFor(v, g).toLocaleString() : '—'; });
  el.querySelectorAll('#intro-loan-left, #intro-loan-until').forEach((inp) => inp.addEventListener('input', introLoanPreview));
  // Enter / Go on a keyboard behaves like the Next button.
  el.querySelectorAll('input.big').forEach((inp) => inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); (inp.dataset.enter ? el.querySelector(`[data-action="${inp.dataset.enter}"]`) : el.querySelector('button.go'))?.click(); } }));
  if (wIn) { wIn.focus(); wIn.select(); }
}
// "£480 until 9 Jan": the budget step works out the week (insights.loanBudget) as they type.
function introLoanPreview() { const l = +document.getElementById('intro-loan-left')?.value, u = document.getElementById('intro-loan-until')?.value, out = document.getElementById('intro-loan-out'); if (!out) return null; const r = l && u ? loanBudget(l, u, todayISO()) : null; out.innerHTML = r ? `${r.weeks} week${r.weeks > 1 ? 's' : ''} → <b>£${r.perWeek} a week</b> for food. Next uses it.` : l && u ? 'That date has already passed.' : l || u ? 'Fill in both and FU£L works out the week.' : ''; return r; }
function closeIntro() { const el = document.getElementById('intro'); el.hidden = true; el.innerHTML = ''; }
document.getElementById('intro').addEventListener('click', onAction);
document.getElementById('cookmode').addEventListener('click', onAction);
document.getElementById('gate').addEventListener('click', onAction);
document.getElementById('gate').addEventListener('submit', onSubmit);
let sheetAfter = null; // run once when the sheet closes, however it closes (a settings sheet redraws the page behind it)
function openSheet(html, after) { const s = document.getElementById('sheet'), inner = document.getElementById('sheet-inner'); inner.innerHTML = html; inner.style.transform = ''; inner.style.transition = ''; inner.scrollTop = 0; s.hidden = false; sheetAfter = after || null; if (!after) setSheet = null; }
function closeSheet() { const s = document.getElementById('sheet'); const was = !s.hidden; s.hidden = true; const f = sheetAfter; sheetAfter = null; setSheet = null; if (was && f) f(); }
function dismissSheet() { closeSheet(); if (S.pendingBuy) { S.pendingBuy = false; save(); } }
document.getElementById('sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') dismissSheet(); else onAction(e); });

// ---------- v101: five things a phone app does (swipe back, sheets you can flick away, the right keyboard, a tap you can feel, tap the top to go up) ----------
// A tap you can feel. Android has navigator.vibrate. iPhone has no web vibration, but toggling a hidden switch control plays the system tick (iOS 17.4 and later).
const HAPTIC = { tick: [8], tap: [12], save: [14, 70, 22], warn: [40, 70, 40, 70, 40] };
function haptic(kind = 'tap') {
  try {
    if (navigator.vibrate) { if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return; navigator.vibrate(HAPTIC[kind] || HAPTIC.tap); return; }
    if (!matchMedia('(pointer: coarse)').matches) return;
    const once = () => { const l = document.createElement('label'); l.setAttribute('aria-hidden', 'true'); l.style.display = 'none'; const i = document.createElement('input'); i.type = 'checkbox'; i.setAttribute('switch', ''); l.appendChild(i); document.head.appendChild(l); l.click(); document.head.removeChild(l); };
    once(); if (kind === 'save') setTimeout(once, 120); else if (kind === 'warn') { setTimeout(once, 120); setTimeout(once, 240); }
  } catch {}
}
// Flick a sheet down to close it (only from the top of its own scroll, and never from inside a field or a slider).
(() => {
  const inner = document.getElementById('sheet-inner'); let y0 = null, dy = 0, ok = false;
  inner.addEventListener('touchstart', (e) => { ok = e.touches.length === 1 && inner.scrollTop <= 0 && !e.target.closest('input, textarea, select'); y0 = e.touches[0].clientY; dy = 0; }, { passive: true });
  inner.addEventListener('touchmove', (e) => { if (!ok || y0 === null) return; dy = e.touches[0].clientY - y0; if (dy > 8) { inner.style.transition = 'none'; inner.style.transform = `translateY(${dy - 8}px)`; } else inner.style.transform = ''; }, { passive: true });
  const end = () => { if (y0 === null) return; y0 = null; if (!ok) return; inner.style.transition = 'transform .2s ease'; if (dy > 110) { inner.style.transform = 'translateY(105%)'; setTimeout(() => { dismissSheet(); inner.style.transition = ''; inner.style.transform = ''; }, 190); } else inner.style.transform = ''; dy = 0; };
  inner.addEventListener('touchend', end); inner.addEventListener('touchcancel', end);
})();
// What "back" means on the screen you are looking at, or null when there is nowhere to go back to.
function backTarget() {
  if (['sheet', 'intro', 'gate'].some((id) => !document.getElementById(id).hidden)) return null;
  if (CM.id) return { el: document.getElementById('cookmode'), go: () => { if (CM.step > 0) { CM.step -= 1; cmRender(); } else cmClose(); } };
  if (S.tab === 'cook' && cookView) return { go: () => { cookView = null; render({ top: true, anim: 'pop' }); } };
  if (SUB_SCREENS.includes(S.tab)) return { go: screenBack };
  return null;
}
function screenBack() { S.tab = S.prevTab && !SUB_SCREENS.includes(S.prevTab) ? S.prevTab : 'more'; pantryBase = null; save(); render({ top: true, anim: 'pop' }); }
// Swipe right from anywhere on the screen to go back, not just from the edge. The page follows the finger; let go past a third of the way, or flick, and it goes.
(() => {
  let g = null;
  const skip = 'input, textarea, select, .hmenu, .day-pick, .wl-arc, [data-noswipe]';
  document.addEventListener('touchstart', (e) => { g = null; if (e.touches.length !== 1 || e.target.closest(skip)) return; const b = backTarget(); if (!b) return; const t = e.touches[0]; g = { x: t.clientX, y: t.clientY, b, el: b.el || document.getElementById('view'), on: false, at: Date.now(), dx: 0 }; }, { passive: true });
  document.addEventListener('touchmove', (e) => {
    if (!g) return; const t = e.touches[0], dx = t.clientX - g.x, dy = t.clientY - g.y;
    if (!g.on) { if (Math.abs(dy) > 10 && Math.abs(dy) >= Math.abs(dx)) { g = null; return; } if (dx > 14 && dx > Math.abs(dy) * 1.7) { g.on = true; g.el.style.transition = 'none'; } else return; }
    g.dx = Math.max(0, dx - 14); g.el.style.transform = `translateX(${g.dx}px)`; g.el.style.opacity = String(1 - Math.min(0.4, g.dx / 800)); if (e.cancelable) e.preventDefault();
  }, { passive: false });
  const end = () => {
    if (!g) return; const { el, b, dx, on, at } = g; g = null; if (!on) return;
    const go = dx > Math.min(120, innerWidth * 0.3) || (dx > 36 && Date.now() - at < 280);
    el.style.transition = 'transform .17s ease-out, opacity .17s ease-out';
    if (go) { el.style.transform = 'translateX(100%)'; el.style.opacity = '0.4'; haptic('tick'); setTimeout(() => { el.style.transition = 'none'; el.style.transform = ''; el.style.opacity = ''; b.go(); }, 160); }
    else { el.style.transform = ''; el.style.opacity = ''; }
  };
  document.addEventListener('touchend', end); document.addEventListener('touchcancel', end);
})();
// The keyboard: a sheet is lifted to sit on top of it, so the field you are typing in and its button are never underneath.
if (window.visualViewport) { const kb = () => { const vv = window.visualViewport, h = Math.round(window.innerHeight - vv.height - vv.offsetTop); document.documentElement.style.setProperty('--kb', h > 80 ? `${h}px` : '0px'); }; window.visualViewport.addEventListener('resize', kb); window.visualViewport.addEventListener('scroll', kb); }
// Tap the very top of the screen (or the tab you are already on) and the page runs back to the top. A web app cannot hear a tap on the status bar itself, so a thin strip under it listens instead.
function scrollTopNow() { const v = document.getElementById('view'); if (v.scrollTop > 0) { v.scrollTo({ top: 0, behavior: 'smooth' }); haptic('tick'); } }
(() => { const s = document.createElement('div'); s.id = 'topstrip'; s.setAttribute('aria-hidden', 'true'); document.body.appendChild(s); s.addEventListener('click', scrollTopNow); document.getElementById('statusband').addEventListener('click', scrollTopNow); })();
document.getElementById('sheet').addEventListener('submit', onSubmit);
document.getElementById('sheet').addEventListener('input', onInput);
document.getElementById('sheet').addEventListener('change', (e) => { if (onTweakChange(e)) return; const d = e.target.dataset; if (d.setting || d.settingStr || d.settingBool) { onChange(e); return; } const chip = e.target.closest('.chip'); if (chip && e.target.type === 'checkbox') chip.classList.toggle('on', e.target.checked); });

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
// A bar above the tab bar for a few seconds after a tick on the Shop list: one tap puts a mis-tapped line back.
function showUndo(text, fn, ms = 5000) { let u = document.getElementById('undo'); if (!u) { u = document.createElement('div'); u.id = 'undo'; u.setAttribute('role', 'status'); u.innerHTML = '<span></span><button type="button">Undo</button>'; document.body.appendChild(u); } u.firstChild.textContent = text; u.lastChild.onclick = () => { hideUndo(); fn(); }; u.classList.add('on'); clearTimeout(showUndo.t); showUndo.t = setTimeout(hideUndo, ms); }
function hideUndo() { clearTimeout(showUndo.t); document.getElementById('undo')?.classList.remove('on'); }
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
  haptic(['inc', 'dec', 'week', 'cm-next', 'cm-back', 'avoid', 'look', 'cook-view', 'cook-back', 'set-sheet'].includes(a) ? 'tick' : 'tap');
  if (a === 'inc' || a === 'dec') {
    if (a === 'inc' && P.roomFor(recById(id), P.freeSlots(w.grid, w.days)) <= 0) return;
    w.portions[id] = Math.max(0, (w.portions[id] || 0) + (a === 'inc' ? 1 : -1));
    if (!w.portions[id]) delete w.portions[id];
    relayout(); refreshPlan(rowSel(id));
  } else if (a === 'week') { S.activeWeek = el.dataset.week; planAdd = null; save(); render(); }
  else if (a === 'cookday') { closeSheet(); w.cookDay = +el.dataset.day; haptic('save'); relayout(); if (S.tab === 'plan') refreshPlan(); else render(); }
  else if (a === 'quick-pick') { const r = recById(id); const room = P.roomFor(r, P.freeSlots(w.grid, w.days)); if (r && w.portions[r.id]) { toast('Already in the week. Change the count in the list below.'); return; } if (r && room > 0) { if (S.library && !S.library.includes(r.id)) S.library.push(r.id); w.portions[r.id] = Math.min(defaultPortions(r), room); relayout(); holdPlace(el.closest('#useup-card') ? '#useup-card' : '#pick-head', () => render()); } else toast('No room left in the week for that'); }
  else if (a === 'relayout') { relayout(); refreshPlan(); }
  else if (a === 'dayx') { closeSheet(); const i = +el.dataset.day; w.days[i] = !w.days[i]; relayout(w); refreshPlan(); }
  else if (a === 'day-sheet') { const i = +el.dataset.day; const d = new Date(S.activeWeek + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i); openSheet(`<h3>${DAY_FULL[i]} ${fmtDate(d.toISOString().slice(0, 10))}</h3><p class="small muted">${w.days[i] ? 'Skipping a day takes its meals out of the week, the shop and the cook.' : 'This day is skipped.'}</p><button class="btn block ${w.days[i] ? 'ghost' : ''}" data-action="dayx" data-day="${i}" style="margin-top:8px">${w.days[i] ? 'Skip this day' : 'Put this day back'}</button><button class="btn ghost block" data-action="close-sheet" style="margin-top:8px">Cancel</button>`); }
  else if (a === 'cookday-sheet') { openSheet(`<h3>Which day do you cook?</h3><p class="small muted" style="margin:0 0 12px">One batch cook, then it is boxed up for the week. A Sunday cook is the Sunday before the week.</p>${cookDayChips(w)}<button class="btn ghost block" data-action="close-sheet" style="margin-top:14px">Done</button>`); }
  
  else if (a === 'need') { delete w.pantry[id]; delete (w.useUp || {})[id]; dropUseBy(id); save(); render(); }
  else if (a === 'extra-add') { openSheet(extrasSheet('')); document.querySelector('[data-extra-search]')?.focus(); }
  else if (a === 'extra-custom') { const name = el.dataset.name; closeSheet(); (async () => {
    const price = await askNumber(`${name}: what does one cost?`, '1.50', '£'); if (price === null) return; const pr = parseFloat(String(price).replace(/[^0-9.]/g, '')); if (!(pr >= 0)) { toast('Type a price'); return; }
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
  else if (a === 'look') { if (LOOKS[el.dataset.look]) { S.look = el.dataset.look; applyTheme(); save(); if (!refreshSet()) render(); } }
  else if (a === 'loan-clear') { e.preventDefault(); delete S.loan; save(); render(); }
  else if (a === 'whatsnew-seen') { S.seenVersion = APP_VERSION; save(); render(); }
  else if (a === 'adjust-yes') { const d = +el.dataset.kcal; setTargets(S.settings.kcalTarget + d, S.settings.proteinTarget); S.adjSnooze = addDays(todayISO(), 21); save(); render(); toast(`${S.settings.kcalTarget.toLocaleString()} kcal a day. Portions and the shop list resized.`, 3500); }
  else if (a === 'adjust-later') { S.adjSnooze = addDays(todayISO(), 7); save(); render(); }
  else if (a === 'weigh-add') { askNumber('Weight today', '85.4', 'kg').then((v) => { const kg = parseFloat(String(v ?? '').replace(',', '.')); if (v === null) return; if (!(kg >= 30 && kg <= 200)) { toast('Between 30 and 200 kg'); return; } const t = todayISO(); S.weights = (S.weights || []).filter((x) => x.date !== t); S.weights.push({ date: t, kg: Math.round(kg * 10) / 10 }); S.weights.sort((x, y) => x.date.localeCompare(y.date)); S.weights = S.weights.slice(-60); save(); haptic('save'); render(); toast(`${kg} kg logged`); }); }
  else if (a === 'checkin-start') { const k = el.dataset.week || checkinWeeks()[0] || S.thisMon; checkinStart(k); }
  else if (a === 'checkin-eaten' && CI) { const p = CI.planned[id] || 0; CI.eaten[id] = Math.max(0, Math.min(p, (CI.eaten[id] || 0) + +el.dataset.d)); checkinStep(1); }
  else if (a === 'checkin-out' && CI) { CI.out = +el.dataset.n; checkinStep(1); }
  else if (a === 'checkin-shop' && CI) { checkinReadInputs(); CI.shop = el.dataset.shop; checkinStep(2); }
  else if (a === 'checkin-portions' && CI) { checkinReadInputs(); CI.portions = el.dataset.p; checkinStep(3); }
  else if (a === 'checkin-next' && CI) { checkinReadInputs(); if (CI.step === 2 && CI.till != null && !(CI.till >= 0 && CI.till < 1000)) { toast('Type the till total in pounds, or leave it'); return; } checkinStep(CI.step + 1); }
  else if (a === 'checkin-skip-till' && CI) { CI.till = null; checkinStep(3); }
  else if (a === 'checkin-back' && CI) { checkinReadInputs(); checkinStep(Math.max(1, CI.step - 1)); }
  else if (a === 'checkin-plan' && CI) {
    checkinReadInputs(); const kg = +CI.weight; if (CI.weight !== '' && !(kg >= 30 && kg <= 200)) { toast('Weight between 30 and 200 kg, or leave it blank'); return; }
    const changed = checkinPreview(); const target = checkinTarget(); checkinFinish(); closeSheet(); CI = null;
    const nextPlanned = Object.values(S.weeks[target]?.portions || {}).some((k) => k > 0);
    if (nextPlanned) { S.tab = 'home'; S.activeWeek = target; save(); render({ top: true }); toast('Checked in. Next week is already planned.'); }
    else { S.activeWeek = target; S.tab = 'plan'; planAdd = null; save(); render({ top: true }); autoPlan(1, { changed }); }
  }
  else if (a === 'save-switch') applySave(el.dataset.key);
  else if (a === 'save-all') applySave(null);
  else if (a === 'save-undo') undoSave();
  else if (a === 'open-save') { e.preventDefault(); saveOpen = true; priceOpen = true; render(); document.getElementById('savefold')?.scrollIntoView({ block: 'start' }); }
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
  else if (a === 'avoid') { const i = S.settings.avoid.indexOf(id); if (i >= 0) S.settings.avoid.splice(i, 1); else S.settings.avoid.push(id); save(); if (!refreshSet()) render(); }
  else if (a === 'settings') { if (S.tab !== 'settings') S.prevTab = S.tab; S.tab = 'settings'; save(); render({ top: true, anim: 'push' }); }
  else if (a === 'settings-back') { screenBack(); }
  else if (a === 'screen-back') { screenBack(); } // v91: Recipes and Pantry go back to where they were opened from (More, or the Shop fold)
  else if (a === 'install') { if (installEvt) { installEvt.prompt(); installEvt.userChoice.then(() => { installEvt = null; }); } else toast('Use your browser menu: Install app / Add to Home Screen'); }
  else if (a === 'tips-again') { S.tips = {}; save(); haptic('save'); render(); toast('Tips are back on every tab'); }
  else if (a === 'tip-done') { S.tips ||= {}; S.tips[el.dataset.tip] = true; save(); holdPlace(S.tab === 'plan' ? '#pick-head' : '', () => render()); }
  else if (a === 'plan-add') { planAdd = true; render({ top: true }); }
  else if (a === 'plan-week') { planAdd = false; render({ top: true }); }
  // Next-step buttons inside a page. They must not carry data-tab (that lives on the tab bar only), so they name the tab in data-to; data-week also switches week.
  else if (a === 'go-tab') { if (el.dataset.week && S.weeks[el.dataset.week]) S.activeWeek = el.dataset.week; if (el.dataset.to !== S.tab) pantryBase = null; const deeper = SUB_SCREENS.includes(el.dataset.to) && !SUB_SCREENS.includes(S.tab); if (deeper) S.prevTab = S.tab; if (el.dataset.to === 'cook') cookView = null; S.tab = el.dataset.to; planAdd = null; save(); render({ top: true, anim: deeper ? 'push' : '' }); }
  else if (a === 'scroll-pick') { const v = document.getElementById('view'), h = document.getElementById('pick-head'); if (h) v.scrollTo({ top: v.scrollTop + h.getBoundingClientRect().top - v.getBoundingClientRect().top - 6 }); }
  else if (a === 'intro') openIntro();
  else if (a === 'intro-goal') { INTRO.goal = el.dataset.goal; S.settings.goal = INTRO.goal; bustCaches(); save(); introStep(2); }
  else if (a === 'intro-weight') { const v = +document.getElementById('intro-weight').value; if (!(v >= 30 && v <= 200)) { toast('Enter a weight between 30 and 200 kg'); return; } S.settings.weight = v; S.settings.proteinTarget = P.proteinTargetFor(v, INTRO.goal || S.settings.goal); S.settings.kcalTarget = P.kcalTargetFor(v, INTRO.goal || S.settings.goal); bustCaches(); save(); introStep(3); }
  else if (a === 'intro-budget') { S.settings.budget = +el.dataset.budget; save(); introStep(4); }
  else if (a === 'intro-budget-custom') {
    const l = +document.getElementById('intro-loan-left')?.value, u = document.getElementById('intro-loan-until')?.value;
    if (l || u) { const loan = l && u ? loanBudget(l, u, todayISO()) : null; if (!loan) { toast(l && u ? 'That date has already passed' : 'Fill in both: money left and the date'); return; } S.settings.budget = loan.perWeek; S.loan = { left: l, until: u, perWeek: loan.perWeek, set: todayISO() }; save(); introStep(4); return; }
    const raw = document.getElementById('intro-budget').value.trim(); const v = raw ? +raw : S.settings.budget; if (!(v >= 10 && v <= 300)) { toast('Type a budget between £10 and £300, or tap one above'); return; } S.settings.budget = v; delete S.loan; save(); introStep(4); } // Next with nothing typed keeps the highlighted amount
  else if (a === 'intro-milk') { S.settings.milk = id; bustCaches(); save(); el.parentElement.querySelectorAll('.opt').forEach((b) => b.classList.toggle('on', b === el)); }
  else if (a === 'intro-avoid') { const i = S.settings.avoid.indexOf(id); if (i >= 0) S.settings.avoid.splice(i, 1); else S.settings.avoid.push(id); save(); el.classList.toggle('on'); }
  else if (a === 'intro-avoid-add') { if (addAvoidText('intro-avoid-text')) introStep(4); else toast('Type something first'); }
  else if (a === 'intro-avoid-rm') { removeAvoidText(el.dataset.term); introStep(4); }
  else if (a === 'settings-avoid-add') { if (addAvoidText('settings-avoid-text')) { if (!refreshSet()) render(); } else toast('Type something first'); }
  else if (a === 'settings-avoid-rm') { removeAvoidText(el.dataset.term); if (!refreshSet()) render(); }
  else if (a === 'intro-next') { introStep(INTRO.step + 1); }
  else if (a === 'intro-back') { introStep(Math.max(1, INTRO.step - 1)); }
  else if (a === 'intro-start') { introStep(1); }
  else if (a === 'cook-view') { cookView = id; render({ top: true, anim: 'push' }); }
  else if (a === 'cook-back') { cookView = null; render({ top: true, anim: 'pop' }); }
  else if (a === 'cook-done') { (w.cooked ||= {})[id] = el.dataset.on === '1'; save(); haptic('save'); if (el.dataset.on === '1') { const left = cookData(w).rs.list.filter((x) => !w.cooked[x.recipe.id]).length; cookView = null; render({ top: true, anim: 'pop' }); toast(left ? `Cooked. ${left} to go` : 'All cooked. Nice work', 2600); } else render(); }
  else if (a === 'cm-done') { const rid = CM.id; const batch = weekCounts(w, { fresh: freshMap(w), skipFresh: true })[rid] > 0; cmClose(); if (batch) { (w.cooked ||= {})[rid] = true; save(); haptic('save'); cookView = null; if (S.tab === 'cook') render({ top: true }); const left = cookData(w).rs.list.filter((x) => !w.cooked[x.recipe.id]).length; toast(left ? `Cooked. ${left} to go` : 'All cooked. Nice work', 2600); } }
  else if (a === 'cook-open') { cookView = id; S.tab = 'cook'; planAdd = null; save(); render({ top: true, anim: 'push' }); }
  else if (a === 'set-sheet') { openSet(el.dataset.sheet); }
  else if (a === 'set-pick') { const k = el.dataset.key, oldGoal = S.settings.goal; S.settings[k] = el.dataset.val; bustCaches(); save(); haptic('save'); closeSheet(); if (k === 'goal' && oldGoal !== S.settings.goal) retarget(S.settings.weight, oldGoal).then(() => { if (S.tab === 'settings') render(); }); }
  else if (a === 'cm-open') { cmOpen(el.dataset.id); }
  else if (a === 'cm-close') { cmClose(); }
  else if (a === 'cm-next') { CM.step += 1; cmRender(); document.querySelector('#cookmode .cm-body')?.scrollTo(0, 0); }
  else if (a === 'cm-back') { CM.step = Math.max(0, CM.step - 1); cmRender(); }
  else if (a === 'cm-timer') { cmTimerStart(+el.dataset.mins); }
  else if (a === 'cm-timer-stop') { cmTimerStop(); cmRender(); }
  else if (a === 'intro-done' || a === 'intro-auto') { S.settings.onboarded = true; S.seenVersion = APP_VERSION; S.tips ||= {}; S.tips.plan = true; /* the last set-up screen just showed the same three steps */ save(); closeIntro(); S.tab = 'plan'; planAdd = null; for (const wk of Object.values(S.weeks)) relayout(wk); render({ top: true }); if (a === 'intro-auto') autoPlan(1); }
  else if (a === 'suggest-targets') { const resized = setTargets(P.kcalTargetFor(S.settings.weight, S.settings.goal), P.proteinTargetFor(S.settings.weight, S.settings.goal)); refreshSet(); haptic('save'); toast(`${S.settings.kcalTarget.toLocaleString()} kcal and ${S.settings.proteinTarget}g protein a day.${resized ? ' Portions resized to match.' : ''}`, 3500); }
  else if (a === 'sinc' || a === 'sdec') { w.snacks[id] = Math.max(0, (w.snacks[id] || 0) + (a === 'sinc' ? 1 : -1)); if (!w.snacks[id]) delete w.snacks[id]; save(); refreshPlan(rowSel(id)); }
  else if (a === 'fresh-default') { if (el.dataset.on === '1') S.freshDefault[id] = true; else delete S.freshDefault[id]; save(); render(); toast(el.dataset.on === '1' ? 'Made fresh each time, not batched' : 'Back on the batch list'); }
  else if (a === 'signout') {
    askChoice('Sign out of this phone?', [{ value: 'keep', label: 'Sign out', sub: 'Your plan stays on this phone' }, { value: 'clear', label: 'Sign out and clear this phone', sub: 'For a shared or borrowed phone. Your plan stays in your account.', ghost: true }]).then(async (v) => {
      if (!v) return; try { await pushState(syncable()); } catch {} await signOut();
      if (v === 'clear') { try { localStorage.removeItem(KEY); } catch {} location.reload(); return; }
      gateScreen(); render();
    });
  }
  else if (a === 'delete-account') {
    ask('Delete your account? Your saved plan and your access are removed for good. This cannot be undone.', 'Delete my account', true).then(async (ok) => {
      if (!ok) return; toast('Deleting…', 8000);
      try { await deleteAccount(); try { localStorage.removeItem(KEY); localStorage.removeItem('fuel:mate'); } catch {} location.reload(); }
      catch (err) { toast('Could not delete the account just now. Check your signal and try again.', 4500); }
    });
  }
  else if (a === 'gate-refresh') { recheckAccess(true); }
  else if (a === 'buy') { S.buyStarted = Date.now(); save(); el.style.pointerEvents = 'none'; el.style.opacity = '.6'; setTimeout(() => { el.style.pointerEvents = ''; el.style.opacity = ''; }, 4000); } // one checkout page per tap, however fast you tap
  else if (a === 'auth-mode') { e.preventDefault(); S.authMode = el.dataset.mode; if (el.closest('#sheet')) accountSheet(el.dataset.mode); else gateScreen(); }
  else if (a === 'auth-forgot') {
    e.preventDefault(); const f = document.getElementById('signin-form'); const email = f?.email?.value?.trim(); const msg = f?.querySelector('#signin-msg');
    const show = (cls, text) => { if (msg) { msg.hidden = false; msg.className = `signin-msg ${cls}`; msg.textContent = text; } else toast(text); };
    if (!email) { show('bad', 'Type your email above first, then tap Forgot password.'); return; }
    resetPassword(email).then(() => show('ok', `Reset link sent to ${email}. It can take a few minutes; check spam.`)).catch((err) => show('bad', `Couldn't send a reset link: ${err.message}`));
  }
  else if (a === 'gate-retry') { location.reload(); }
  else if (a === 'trial') { trialSheet(); refreshMates(); }
  else if (a === 'buy-open') { closeSheet(); buySheet(); }
  else if (a === 'account') { accountSheet(el.dataset.mode || 'signup'); }
  else if (a === 'mates-share') { shareMates(); }
  else if (a === 'autoplan') { autoPlan(+(el.dataset.seed || 1)); }
  else if (a === 'autoplan-keep') { closeSheet(); }
  else if (a === 'share-week') { shareWeek(); }
  else if (a === 'code-sheet') { openSheet(`<h3>Have a code?</h3><p class="small muted" style="margin:0 0 10px">From a friend, a club, a creator or the founder.</p><form id="code-form"><input class="field" id="gate-code" name="code" required maxlength="40" placeholder="ENTER CODE" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="go" style="width:100%;font-size:18px;letter-spacing:.06em"><button class="btn block" type="submit" style="margin-top:10px">Use it</button><div id="code-msg" class="signin-msg" hidden></div></form><button class="btn ghost block" data-action="close-sheet" style="margin-top:8px">Close</button>`); }
  else if (a === 'copy-link') { navigator.clipboard?.writeText(el.dataset.url).then(() => toast('Link copied'), () => showText('Your link', el.dataset.url)); }
  else if (a === 'plan-more') { planMore = !planMore; justAdded.clear(); render(); if (planMore) document.getElementById('more-meals')?.scrollIntoView({ block: 'start' }); }
  else if (a === 'plan-filter') { S.planFilter = el.dataset.filter; S.ideaTag = ''; planMore = false; justAdded.clear(); save(); const t = document.getElementById('pick-tabs'); const was = t && t.getBoundingClientRect().top <= 1; render(); if (was) document.getElementById('pick-tabs')?.scrollIntoView({ block: 'start' }); }
  else if (a === 'add-snacks') { S.planFilter = 'snack'; planAdd = true; save(); render({ top: true }); }
  else if (a === 'pick-add') { const r = recById(id); const room = r ? P.roomFor(r, P.freeSlots(w.grid, w.days)) : 0; if (!r || room <= 0) { toast('Your week is full'); return; } if (!inLibrary(r.id)) { S.library.push(r.id); justAdded.add(r.id); } w.portions[r.id] = Math.min(defaultPortions(r), room); relayout(); refreshPlan(rowSel(r.id)); toast(`${shortName(r)} × ${w.portions[r.id]} in your week`); }
  else if (a === 'snack-add') { const r = recById(id); if (!r) return; w.snacks[r.id] = 7; save(); refreshPlan(rowSel(r.id)); }
  else if (a === 'cup-tick') { const id = el.dataset.id; if (cup.ids.has(id) && w.pantry[id] !== undefined) { delete w.pantry[id]; delete (w.useUp || {})[id]; cup.ids.delete(id); } else { w.pantry[id] = true; cup.ids.add(id); } save(); holdPlace('.cupcheck', () => render()); const t = tillNow(w); if (t) toast(`Shop is now ${P.gbp(t.total)}`); } // the price card has scrolled away by now, so say the new price where the thumb is
  else if (a === 'cup-done') { const off = cup.base === null ? 0 : P.round2(cup.base - (tillNow(w)?.total ?? cup.base)); w.cupChecked = true; save(); render(); toast(off > 0 ? `Cupboard checked. ${P.gbp(off)} off your shop.` : 'Cupboard checked'); }
  else if (a === 'cup-open') { cupOpen = true; holdPlace('.cupcheck', () => render()); }
  else if (a === 'go-pantry') { e.preventDefault(); pantryBase = null; S.prevTab = S.tab; S.tab = 'pantry'; save(); render({ top: true }); }
  else if (a === 'go-ideas') { if (!SUB_SCREENS.includes(S.tab)) S.prevTab = S.tab; S.tab = 'recipes'; S.ideasOpen = true; save(); render({ top: true }); }
  else if (a === 'ideas-toggle') { S.ideasOpen = !S.ideasOpen; save(); render(); }
  else if (a === 'idea-tag') { S.ideaTag = el.dataset.tag; save(); holdPlace('#more-meals, #ideas', () => render()); }
  else if (a === 'lib-add') { if (!S.library.includes(id)) S.library.push(id); save(); closeSheet(); render(); toast('Added to your recipes'); }
  else if (a === 'lib-remove') { S.library = S.library.filter((x) => x !== id); for (const wk of Object.values(S.weeks)) { delete wk.portions[id]; delete wk.snacks?.[id]; relayout(wk); } save(); closeSheet(); render(); toast('Removed from your recipes'); }
  else if (a === 'clear-pantry') { ask(`Untick everything for ${weekLabel(S.activeWeek).toLowerCase()}? Everything your meals need goes back on the shop list.`, 'Untick all').then((ok) => { if (ok) { const had = Object.keys(w.pantry); w.pantry = {}; w.useUp = {}; had.forEach(dropUseBy); useByOpen.clear(); save(); render(); toast('Pantry cleared'); } }); }
  else if (a === 'clear-week') { ask(`Clear every meal from ${weekLabel(S.activeWeek).toLowerCase()}?`, 'Clear week', true).then((ok) => { if (ok) { w.portions = {}; w.ticks = {}; relayout(); planAdd = null; render({ top: true }); } }); }
  else if (a === 'close-sheet') { closeSheet(); if (S.pendingBuy) { S.pendingBuy = false; save(); } }
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
    askText('Paste your backup', 'Paste the backup text here').then((txt) => { if (!txt) return; try { const raw = JSON.parse(txt); if (!raw || typeof raw !== 'object' || !raw.weeks || !raw.settings) throw new Error('not a backup'); const pick = {}; for (const k of ['weeks', 'activeWeek', 'customRecipes', 'customIngredients', 'settings', 'inbox']) if (k in raw) pick[k] = raw[k]; Object.assign(S, cleanState(pick)); if (typeof S.activeWeek !== 'string') S.activeWeek = null; bustCaches(); setupWeeks(); planAdd = null; save(); render(); toast('Backup restored'); } catch { toast('That did not look like a backup.'); } });
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
  else if (t.dataset.tick) { const k = t.dataset.tick, on = t.checked, what = t.dataset.what || 'Item', was = !!w.done; w.ticks[k] = on; shopDone(w); save(); haptic(!was && w.done ? 'save' : 'tap'); render(); if (on) showUndo(`In the trolley: ${what}`, () => { w.ticks[k] = false; shopDone(w); save(); render(); }); else hideUndo(); } // redraw only when the shop becomes done or stops being done (green box, tick on the Shop tab); the old test compared after the change, so it never fired
  else if (t.dataset.cookgot) { if (t.checked) cookGot.add(t.dataset.cookgot); else cookGot.delete(t.dataset.cookgot); t.closest('label')?.classList.toggle('done', t.checked); haptic('tick'); }
  else if (t.dataset.settingBool) { S.settings[t.dataset.settingBool] = t.checked; bustCaches(); save(); haptic('tick'); }
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
  if (f.id === 'set-num') {
    const k = f.dataset.key, v = parseFloat(String(fd.get('v')).replace(',', '.')), oldWeight = S.settings.weight;
    if (k === 'weight' && !(v >= 30 && v <= 200)) { toast('Enter a weight between 30 and 200 kg'); haptic('warn'); return; }
    if (k === 'budget' && !(v >= 1 && v <= 1000)) { toast('Enter a budget in pounds'); haptic('warn'); return; }
    S.settings[k] = k === 'weight' ? Math.round(v * 10) / 10 : Math.round(v); bustCaches(); if (W() && W().done) shopDone(W()); save(); haptic('save'); closeSheet();
    if (k === 'weight' && oldWeight !== S.settings[k]) retarget(oldWeight, S.settings.goal).then(() => { if (S.tab === 'settings') render(); });
    return;
  }
  if (f.id === 'signin-form') {
    const email = String(fd.get('email') || '').trim().toLowerCase().slice(0, 254); const password = String(fd.get('password') || '');
    const mode = f.dataset.mode || 'signin';
    const msg = f.querySelector('#signin-msg'); const b = f.querySelector('button[type=submit]'); const label = b.textContent;
    const show = (cls, text) => { if (msg) { msg.hidden = false; msg.className = `signin-msg ${cls}`; msg.textContent = text; } else toast(text); };
    if (b.disabled) return; // a second tap while the first is still going
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { show('bad', 'That email address does not look right.'); return; }
    if (mode === 'signup' && badPassword(password)) { show('bad', badPassword(password)); return; }
    if (!password || password.length > 72) { show('bad', password ? 'That password is too long (72 characters at most).' : 'Type your password.'); return; }
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
  if (f.id === 'newpass-form') {
    const password = String(fd.get('password') || ''); const msg = f.querySelector('#newpass-msg'); const b = f.querySelector('button[type=submit]');
    const show = (cls, text) => { msg.hidden = false; msg.className = `signin-msg ${cls}`; msg.textContent = text; };
    if (b.disabled) return; if (badPassword(password) || password.length > 72) { show('bad', badPassword(password) || 'That password is too long.'); return; }
    b.disabled = true;
    updatePassword(password).then(() => { show('ok', 'Password saved.'); haptic('save'); setTimeout(closeSheet, 900); }).catch((err) => { b.disabled = false; show('bad', /same|different/i.test(err.message || '') ? 'Pick a password you have not used here before.' : 'Could not save that. Open the link in the email again and retry.'); });
    return;
  }
  if (f.id === 'code-form') {
    const code = String(fd.get('code') || '').trim().slice(0, 40); const msg = f.querySelector('#code-msg'); const b = f.querySelector('button[type=submit]');
    const show = (cls, text) => { msg.hidden = false; msg.className = `signin-msg ${cls}`; msg.textContent = text; };
    if (b.disabled) return; if (!code) { show('bad', 'Type your code.'); return; }
    b.disabled = true;
    redeemCode(code).then((d) => { show('ok', `Code accepted. You have ${d.plan === 'founder' ? 'founder access' : 'full access'}${d.expires_at ? ` until ${fmtDate(String(d.expires_at).slice(0, 10))}` : ''}.`); setTimeout(() => { closeSheet(); gateScreen(); render(); }, 900); })
      .catch((err) => { b.disabled = false; show('bad', err.message || 'Code not accepted'); });
    return;
  }
  if (f.id === 'link-form') {
    const url = String(fd.get('url') || '').trim().slice(0, 600); if (!/^https?:\/\/\S+$/i.test(url)) { toast('Paste a link that starts with https://'); return; }
    S.inbox = (S.inbox || []).slice(-199).concat([{ url, note: String(fd.get('note') || '').trim().slice(0, 300), added: new Date().toISOString().slice(0, 10) }]);
    save(); closeSheet(); render(); return;
  }
  if (f.id === 'ing-form') {
    const name = String(fd.get('name') || '').trim().slice(0, 80); if (!name) { toast('Give it a name.'); return; } const id = ('c_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_')).slice(0, 80);
    S.customIngredients = S.customIngredients.filter((i) => i.id !== id).concat([{ id, name, unit: fd.get('unit'), protein: +fd.get('protein') || 0, category: fd.get('category'), store: fd.get('store'), packs: [] }]);
    bustCaches(); save(); openSheet(recipeForm()); addIngRow(); return;
  }
  if (f.id === 'recipe-form') {
    const name = String(fd.get('name') || '').trim().slice(0, 80); if (!name) { toast('Give it a name.'); return; } const id = ('c_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_')).slice(0, 80);
    const slots = fd.getAll('slot'); if (!slots.length) { toast('Pick at least one slot.'); return; }
    const ings = [...f.querySelectorAll('.ing-row')].map((r) => ({ id: r.querySelector('[name=ing]').value, qty: +r.querySelector('[name=qty]').value })).filter((x) => x.qty > 0);
    if (!ings.length) { toast('Add at least one ingredient.'); return; }
    const method = String(fd.get('method') || '').slice(0, 8000).split('\n').map((s) => s.trim().slice(0, 1500)).filter(Boolean).slice(0, 60);
    const r = { id, name, slots, cold: !!fd.get('cold'), reheat: fd.get('reheat'), fridgeDays: +fd.get('fridgeDays') || 0, freezer: !!fd.get('freezer'), cookMinutes: +fd.get('cookMinutes') || 0, equipment: [], source: String(fd.get('source') || '').trim().slice(0, 80) || 'yours', ingredients: ings, method, notes: '' };
    S.customRecipes = S.customRecipes.filter((x) => x.id !== id).concat([r]); if (S.library && !S.library.includes(id)) S.library.push(id); bustCaches(); save(); closeSheet(); render(); toast('Saved to your recipes');
  }
}

boot();
