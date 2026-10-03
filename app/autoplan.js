// "Plan my week for me": finds a sensible, cheap week for one person in a second or two, on the phone.
// A lighter port of marketing/content2/v5-budget/lib/search.mjs (the budget-video tool), sized and priced the way app.js does it
// (mealsKcalAt1x/weekFactor, scaleBy, shopNeeds, shopTotals), so the week it picks costs what the app then shows.
//
// Rules (the same as the budget videos): one breakfast per day (one or two breakfast recipes); two lunch/dinner portions per day from
// 3–6 different mains, 2–4 portions each (nothing cooked for one portion); at most 3 mains of one cuisine and of one main protein; never
// the same main for lunch and dinner on one day; nothing the app would call "too old by then"; portions not stuck at the 0.6× / 2.5× limits;
// every ingredient priced somewhere; protein a day at or over the target; the week's food (stock-ups aside) at or under the budget.
// Among the weeks that pass, the cheapest full shop wins, with a nudge towards the app's core recipes and a little extra protein.

const CUISINES = ['asian', 'italian', 'mexican', 'curry', 'british'];
const FAMILY = { chicken_breast: 'chicken', chicken_thigh: 'chicken', chicken_mince: 'chicken' };

function rng(seed) { let a = seed >>> 0; return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

const isBreakfast = (r) => r.slots.length === 1 && r.slots[0] === 'breakfast';
const isMain = (r) => !r.slots.includes('snack') && !r.slots.includes('breakfast') && (r.slots.includes('lunch') || r.slots.includes('dinner'));

// All ways to split n portions into k mains of 2–4 portions each (largest first).
function splitsFor(n) {
  const out = [];
  const go = (left, k, max, acc) => { if (!left) { if (acc.length >= 2) out.push(acc); return; } for (let p = Math.min(4, max, left); p >= 2; p--) if (left - p === 0 || left - p >= 2) go(left - p, k, p, [...acc, p]); };
  go(n, 0, 4, []);
  return out.filter((s) => s.length >= Math.min(3, Math.ceil(n / 4)) && s.length <= 5);
}

/**
 * @param o.P          planner.js
 * @param o.ING        every ingredient (with the user's own)
 * @param o.pool       recipes the person can be given (already filtered for what they don't eat), unscaled
 * @param o.core       Set of recipe ids that are the app's core recipes (nudged towards)
 * @param o.days       which days to fill (7 booleans)
 * @param o.cookDay    the week's batch-cook day
 * @param o.kcal, o.protein, o.budget  the person's targets and weekly budget
 * @param o.pantry     the week's pantry ticks
 * @param o.resolve    id → id actually bought (thighs for breast, oat milk for milk)
 * @param o.choiceOf   generic id → the picked option(s) (frozen fruit), as shopNeeds splits them
 * @param o.seed       a different seed gives a different week
 * @param o.differentFrom  portions of the week just shown: "Try another week" is steered away from it (£1.50 per shared portion)
 * @param o.budgetMs   time budget for the search
 */
export function planWeek(o) {
  const { P, ING, pool, core = new Set(), days, cookDay = 6, kcal, protein, budget = Infinity, pantry = {}, resolve = (id) => id, choiceOf = () => null, seed = 1, budgetMs = 1600, differentFrom = null } = o;
  const t0 = Date.now();
  const ingById = Object.fromEntries(ING.map((i) => [i.id, i]));
  const recById = Object.fromEntries(pool.map((r) => [r.id, r]));
  const D = days.filter(Boolean).length;
  const B = pool.filter(isBreakfast).map((r) => r.id), M = pool.filter(isMain).map((r) => r.id);
  if (!D || !B.length || M.length < 2) return null;
  const kcal1x = Object.fromEntries(pool.map((r) => [r.id, P.kcalPerPortion(r, ING)]));
  const mainProtein = Object.fromEntries(pool.map((r) => { let best = null; for (const { id, qty } of r.ingredients) { const it = ingById[id]; if (!it) continue; const p = it.unit === 'each' ? it.protein * qty : (it.protein * qty) / 100; if (!best || p > best.p) best = { id, p }; } return [r.id, FAMILY[best?.id] || best?.id]; }));
  const lunchOnly = (id) => { const s = recById[id].slots; return s.length === 1 && s[0] === 'lunch'; };
  const scaledCache = new Map();
  const scaled = (f) => { let s = scaledCache.get(f); if (!s) { const list = pool.map((r) => ({ ...r, ingredients: r.ingredients.map((x) => ({ id: x.id, qty: Math.round(x.qty * f * 100) / 100 })) })); s = { list, byId: Object.fromEntries(list.map((r) => [r.id, r])) }; scaledCache.set(f, s); } return s; };
  const isStock = (id) => !!ingById[id]?.staple;

  function price(portions) {
    const { grid } = P.autoLayout(portions, pool, cookDay, days, {});
    let meals = 0; grid.forEach((d, i) => { if (!days[i]) return; for (const sl of P.SLOTS) { const v = d[sl]; if (v && kcal1x[v] !== undefined) meals += kcal1x[v]; } });
    meals /= D;
    const f = !meals || !kcal ? 1 : Math.round(Math.min(2.5, Math.max(0.6, kcal / meals)) * 20) / 20;
    const S2 = scaled(f);
    const st = P.gridStats(grid, S2.list, ING, { protein: 0, kcal: 0 }, days);
    let late = 0; for (const id of Object.keys(P.gridCounts(grid))) late += P.tubPlan(S2.byId[id], grid, cookDay, {}).late.length;
    const needsAll = P.aggregateNeeds(P.gridCounts(grid), S2.list, resolve);
    const genericOf = {};
    for (const id of Object.keys(needsAll)) { const picks = choiceOf(id); if (!picks) continue; const q = needsAll[id]; delete needsAll[id]; for (const c of picks) { needsAll[c] = (needsAll[c] || 0) + q / picks.length; genericOf[c] = id; } }
    const pf = {}; for (const id of Object.keys(needsAll)) { const g = genericOf[id]; pf[id] = pantry[id] !== undefined ? pantry[id] : (g && pantry[g] !== undefined ? pantry[g] : undefined); }
    const needs = P.netPantry(needsAll, pf);
    // as app.js shopTotals: what a shop doesn't sell is priced at the cheapest other shop; shops are ranked by anything unpriced, then by that total
    const ranked = P.compareShops(needs, ING).map((b) => { const notSold = b.missing.filter((m) => (ingById[m.id]?.unavailable || []).includes(b.shop)); return { ...b, notSold, unpriced: b.missing.length - notSold.length }; });
    const byShop = Object.fromEntries(ranked.map((b) => [b.shop, b]));
    const elsewhere = (id, not) => { let m = null; for (const s of P.SHOPS) { if (s === not) continue; const l = byShop[s]?.lines.find((x) => x.id === id); if (l && (m === null || l.cost < m)) m = l.cost; } return m || 0; };
    for (const b of ranked) {
      b.comparable = P.round2(b.total + b.notSold.reduce((t, m) => t + elsewhere(m.id, b.shop), 0));
      b.stock = P.round2(b.lines.filter((l) => isStock(l.id)).reduce((t, l) => t + l.cost, 0) + b.notSold.filter((m) => isStock(m.id)).reduce((t, m) => t + elsewhere(m.id, b.shop), 0));
    }
    ranked.sort((a, b) => (a.unpriced - b.unpriced) || (a.comparable - b.comparable));
    const ch = ranked[0];
    return { grid, f, st, late, shop: ch.shop, total: ch.comparable, weekly: P.round2(ch.comparable - ch.stock), stock: ch.stock, priced: !ch.unpriced };
  }

  const portionsOf = (c) => { const o2 = {}; const sort = (xs) => [...xs].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)); for (const [id, n] of sort(c.b)) o2[id] = n; for (const [id, n] of sort(c.m)) o2[id] = n; return o2; };
  const keyOf = (c) => JSON.stringify(portionsOf(c));
  const cap = Math.round(protein * 1.25);
  function evaluate(c) {
    const r = price(portionsOf(c)); const problems = [];
    if (r.st.filled !== r.st.slots) problems.push('not full');
    if (r.late) problems.push('too old by then');
    if (r.f <= 0.6 || r.f >= 2.5) problems.push('portion size at the limit');
    if (!r.priced) problems.push('something has no price');
    if (c.m.filter(([id]) => lunchOnly(id)).reduce((t, [, n]) => t + n, 0) > D) problems.push('too many lunch-only portions');
    for (const tag of CUISINES) if (c.m.filter(([id]) => (recById[id].tags || []).includes(tag)).length > 3) problems.push('cuisine');
    if (r.grid.some((d, i) => days[i] && d.lunch && d.lunch === d.dinner)) problems.push('same lunch and dinner');
    const fam = {}; for (const [id] of c.m) fam[mainProtein[id]] = (fam[mainProtein[id]] || 0) + 1; if (Object.values(fam).some((n) => n > 3)) problems.push('protein family');
    const short = Math.max(0, protein - r.st.avg), over = Math.max(0, P.round2(r.weekly - budget));
    const classics = [...c.b, ...c.m].reduce((t, [id, n]) => t + (core.has(id) ? n : 0), 0);
    const shared = differentFrom ? [...c.b, ...c.m].reduce((t, [id, n]) => t + Math.min(n, differentFrom[id] || 0), 0) : 0;
    const merit = r.total - 0.6 * classics - 0.3 * Math.max(0, Math.min(r.st.avg, cap) - protein) + 1.5 * shared;
    const score = merit + problems.length * 1000 + (over > 0 ? 200 + over * 50 : 0) + short * 20;
    return { ...r, problems, short, over, merit, score, ok: !problems.length && !short && !over, portions: portionsOf(c) };
  }

  const rand = rng(seed); const pick = (xs) => xs[Math.floor(rand() * xs.length)];
  const SPLITS = splitsFor(2 * D).filter((s) => s.length <= M.length);
  if (!SPLITS.length) return null;
  const seen = new Map();
  const ev = (c) => { const k = keyOf(c); let e = seen.get(k); if (!e) { e = evaluate(c); seen.set(k, e); } return e; };
  const clone = (c) => ({ b: c.b.map((x) => [...x]), m: c.m.map((x) => [...x]) });
  const bSplit = (b1, b2) => (b2 ? [[b1, Math.ceil(D / 2)], [b2, Math.floor(D / 2)]] : [[b1, D]]);
  const randomStart = () => {
    const split = pick(SPLITS); const ms = []; let g = 0; while (ms.length < split.length && g++ < 200) { const id = pick(M); if (!ms.includes(id)) ms.push(id); }
    const b1 = pick(B); let b2 = null; if (B.length > 1 && D > 1 && rand() < 0.4) { b2 = pick(B); while (b2 === b1) b2 = pick(B); }
    return { b: bSplit(b1, b2), m: ms.map((id, i) => [id, split[i]]) };
  };
  const neighbour = (c0) => {
    const c = clone(c0); const k = Math.floor(rand() * 5); const inM = new Set(c.m.map(([id]) => id)), inB = new Set(c.b.map(([id]) => id));
    if (k <= 1 && M.length > c.m.length) { const i = Math.floor(rand() * c.m.length); let id = pick(M); let g = 0; while (inM.has(id) && g++ < 20) id = pick(M); if (!inM.has(id)) c.m[i][0] = id; }
    else if (k === 2) { const i = Math.floor(rand() * c.m.length), j = Math.floor(rand() * c.m.length); if (i !== j && c.m[i][1] > 2 && c.m[j][1] < 4) { c.m[i][1]--; c.m[j][1]++; } }
    else if (k === 3 && B.length > 1) { const i = Math.floor(rand() * c.b.length); let id = pick(B); let g = 0; while (inB.has(id) && g++ < 20) id = pick(B); if (!inB.has(id)) c.b[i][0] = id; }
    else if (B.length > 1 && D > 1) { if (c.b.length === 1) { let id = pick(B); let g = 0; while (inB.has(id) && g++ < 20) id = pick(B); if (!inB.has(id)) c.b = bSplit(c.b[0][0], id); } else c.b = bSplit(c.b[Math.floor(rand() * 2)][0]); }
    return c;
  };
  const better = (a, b) => a.score < b.score - 1e-9 || (Math.abs(a.score - b.score) < 1e-9 && a.total < b.total);
  let best = null; const restarts = 6, iters = 2000;
  for (let r = 0; r < restarts && Date.now() - t0 < budgetMs; r++) {
    let cur = randomStart(); let e = ev(cur);
    for (let i = 0; i < iters; i++) {
      if ((i & 63) === 0 && Date.now() - t0 > budgetMs) break;
      const temp = 3 * Math.pow(0.004, i / iters); const nxt = neighbour(cur); const e2 = ev(nxt);
      if (e2.score <= e.score || rand() < Math.exp((e.score - e2.score) / temp)) { cur = nxt; e = e2; }
      if (!best || better(e, best)) best = e;
    }
  }
  // Polish the best one: try every single swap and keep anything better, while time allows.
  if (best) {
    const asCand = (x) => { const b = [], m = []; for (const [id, n] of Object.entries(x.portions)) (isBreakfast(recById[id]) ? b : m).push([id, n]); return { b, m }; };
    let cur = asCand(best), e = best, improved = true;
    while (improved && Date.now() - t0 < budgetMs * 1.5) {
      improved = false; const inM = new Set(cur.m.map(([id]) => id));
      const moves = [];
      cur.m.forEach((_, i) => { for (const id of M) if (!inM.has(id)) { const d = clone(cur); d.m[i][0] = id; moves.push(d); } });
      cur.m.forEach((_, i) => cur.m.forEach((__, j) => { if (i !== j && cur.m[i][1] > 2 && cur.m[j][1] < 4) { const d = clone(cur); d.m[i][1]--; d.m[j][1]++; moves.push(d); } }));
      for (const d of moves) { const e2 = ev(d); if (e2.score < e.score - 1e-9) { cur = d; e = e2; improved = true; } }
    }
    best = e;
  }
  return best && { portions: best.portions, ok: best.ok, total: best.total, weekly: best.weekly, stock: best.stock, shop: best.shop, protein: best.st.avg, kcal: best.st.avgKcal, overBudget: best.over, shortProtein: best.short, problems: best.problems, tried: seen.size, ms: Date.now() - t0 };
}
