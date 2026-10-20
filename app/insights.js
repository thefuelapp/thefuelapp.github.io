// Pure helpers behind Home, the free week and the Sunday check-in (v86, 20 Oct 2026). No DOM, no app state: everything is
// passed in and handed back, so app/tests/insights.test.mjs can check each rule on its own.
const DAY = 86400000;

// 23:59:59.999 local time on the first Sunday on or after the given moment (a Sunday stays that Sunday).
export function endOfSundayAfter(ms) { const d = new Date(ms); d.setHours(23, 59, 59, 999); d.setDate(d.getDate() + ((7 - d.getDay()) % 7)); return d; }

// When the free week ends: the Sunday night on or after max(planAt + days, the end of the planned week's Sunday).
// So a Tuesday starter gets the rest of this week and all of next, and nobody is cut off with a list half ticked. No plan yet: no clock.
export function trialEndFor({ planAt, planWeek, days = 7 }) {
  if (!planAt) return null;
  const a = Date.parse(planAt) + days * DAY;
  const wk = planWeek ? new Date(planWeek + 'T00:00:00').getTime() + 6 * DAY : 0;
  return endOfSundayAfter(Math.max(a, wk));
}

// "I've got £480 until 9 January": how many weeks that is and what it gives a week (whole pounds, rounded down).
export function loanBudget(left, untilISO, todayISO) {
  const days = Math.round((Date.parse(untilISO + 'T00:00:00Z') - Date.parse(todayISO + 'T00:00:00Z')) / DAY);
  if (!(left > 0) || !(days > 0)) return null;
  const weeks = Math.max(1, Math.round(days / 7));
  return { weeks, perWeek: Math.max(1, Math.floor(left / weeks)) };
}

// The best protein for the money on a shop list: pence for 30g of protein, cheapest line wins.
// lines: [{ id, cost, n, pack: { size } }] as shopTotals builds them; ingById(id) → { id, name, protein (per 100g, or per item when unit is 'each'), unit }.
export function cheapestProtein(lines, ingById) {
  let best = null;
  for (const l of lines || []) {
    const it = ingById(l.id); if (!it || !(it.protein > 0) || !l.pack?.size || !(l.cost > 0)) continue;
    const amount = l.pack.size * (l.n || 1);
    const prot = it.unit === 'each' ? it.protein * amount : (it.protein * amount) / 100;
    if (!(prot > 0)) continue;
    const p = Math.round((l.cost / prot) * 30 * 100);
    if (!best || p < best.pencePer30g) best = { id: it.id, name: it.name, pencePer30g: p };
  }
  return best;
}

export const mealCost = (food, meals) => (meals > 0 && food >= 0 ? Math.round((food / meals) * 100) / 100 : null);

// Weigh-ins: [{ date: 'YYYY-MM-DD', kg }] → the latest, the first, the change and the span in days.
export function weightTrend(weights) {
  const w = [...(weights || [])].filter((x) => x && x.date && x.kg > 0).sort((a, b) => a.date.localeCompare(b.date));
  if (!w.length) return null;
  const first = w[0], last = w[w.length - 1];
  return { latest: last.kg, first: first.kg, change: Math.round((last.kg - first.kg) * 10) / 10, days: Math.round((Date.parse(last.date) - Date.parse(first.date)) / DAY), points: w };
}

// A rule of thumb, never applied by itself: with 3+ weigh-ins over 21+ days, a weight that is flat for the last 21 days on "build muscle"
// earns the offer of +200 kcal a day; one that is not falling on "lose fat" earns the offer of −200. Nothing for the other goals.
export function adjustSuggestion(goal, weights, todayISO, snoozedUntil) {
  if (snoozedUntil && snoozedUntil > todayISO) return null;
  const t = weightTrend(weights); if (!t || t.points.length < 3 || t.days < 21) return null;
  const last = t.points[t.points.length - 1];
  const cut = new Date(Date.parse(last.date) - 21 * DAY).toISOString().slice(0, 10);
  const recent = t.points.filter((p) => p.date >= cut); const from = recent[0].kg, change = last.kg - from;
  if (goal === 'build' && change < 0.2) return { kcal: 200, reason: `Your weight has been flat for 3 weeks (${from} → ${last.kg} kg).` };
  if (goal === 'lose' && change > -0.2) return { kcal: -200, reason: `Your weight hasn't moved in 3 weeks (${from} → ${last.kg} kg).` };
  return null;
}

// What the check-ins have taught us: meals = { recipeId: { eaten, skipped, weeks } } (portions eaten, portions skipped, check-ins it was eaten in).
// Two skipped portions (and more skipped than eaten) → "Plan my week for me" stops picking it. Eaten in two check-ins and never skipped → a nudge.
export function learnFromMeals(meals) {
  const dropped = new Set(), liked = new Set();
  for (const [id, m] of Object.entries(meals || {})) { const e = m.eaten || 0, s = m.skipped || 0, w = m.weeks || 0; if (s >= 2 && s > e) dropped.add(id); else if (w >= 2 && s === 0) liked.add(id); }
  return { dropped, liked };
}

// The Sunday check-in is due for a planned week from its Sunday on, and for last week until it is done. Never twice.
export function checkinDue({ weekKey, thisMon, todayIdx, planned, hasCheckin }) {
  if (!planned || hasCheckin) return false;
  if (weekKey < thisMon) return true;
  return weekKey === thisMon && todayIdx >= 6;
}
