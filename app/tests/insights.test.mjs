import { test } from 'node:test';
import assert from 'node:assert/strict';
import { endOfSundayAfter, trialEndFor, loanBudget, cheapestProtein, mealCost, weightTrend, adjustSuggestion, learnFromMeals, checkinDue } from '../insights.js';

const d = (s) => new Date(s).getTime();
const day = (x) => x.toDateString();

test("end of Sunday on or after a Tuesday is that week's Sunday night", () => {
  const e = endOfSundayAfter(d('2026-10-20T10:00:00'));
  assert.equal(e.getDay(), 0); assert.equal(day(e), day(new Date('2026-10-25T12:00:00'))); assert.equal(e.getHours(), 23);
});
test('a Sunday stays that Sunday', () => { assert.equal(day(endOfSundayAfter(d('2026-10-25T09:00:00'))), day(new Date('2026-10-25T12:00:00'))); });

test('trial: a Tuesday planner gets the rest of this week and all of next', () => {
  assert.equal(day(trialEndFor({ planAt: '2026-10-20T10:00:00', planWeek: '2026-10-19', days: 7 })), day(new Date('2026-11-01T12:00:00')));
});
test('trial: a Sunday-night planner of next week gets exactly that week', () => {
  assert.equal(day(trialEndFor({ planAt: '2026-10-25T20:00:00', planWeek: '2026-10-26', days: 7 })), day(new Date('2026-11-01T12:00:00')));
});
test('trial: a 14-day creator code', () => {
  assert.equal(day(trialEndFor({ planAt: '2026-10-20T10:00:00', planWeek: '2026-10-19', days: 14 })), day(new Date('2026-11-08T12:00:00')));
});
test('trial: no plan, no clock', () => { assert.equal(trialEndFor({ planAt: null, planWeek: null }), null); });

test('loan budget: £480 till 9 Jan from 20 Oct is £41 a week', () => { const r = loanBudget(480, '2027-01-09', '2026-10-20'); assert.equal(r.weeks, 12); assert.equal(r.perWeek, 40); });
test('loan budget: a past date is null', () => { assert.equal(loanBudget(100, '2026-10-01', '2026-10-20'), null); });

test('cheapest protein picks the best pence per 30g', () => {
  const ing = { chicken: { id: 'chicken', name: 'Chicken breast', protein: 31, unit: 'g' }, eggs: { id: 'eggs', name: 'Eggs', protein: 6.3, unit: 'each' } };
  const lines = [{ id: 'chicken', cost: 8.5, n: 2, pack: { size: 1000 } }, { id: 'eggs', cost: 1.98, n: 2, pack: { size: 6 } }];
  const r = cheapestProtein(lines, (id) => ing[id]);
  assert.equal(r.id, 'chicken'); assert.equal(r.pencePer30g, 41);
});
test('meal cost', () => { assert.equal(mealCost(35.43, 18), 1.97); assert.equal(mealCost(10, 0), null); });

test('weight trend over 4 weigh-ins', () => {
  const t = weightTrend([{ date: '2026-09-28', kg: 84.8 }, { date: '2026-10-05', kg: 85 }, { date: '2026-10-12', kg: 84.9 }, { date: '2026-10-19', kg: 85.4 }]);
  assert.equal(t.latest, 85.4); assert.equal(t.change, 0.6); assert.equal(t.days, 21);
});
test('build: flat for 3 weeks suggests +200', () => {
  const w = [{ date: '2026-09-28', kg: 85 }, { date: '2026-10-05', kg: 85.1 }, { date: '2026-10-12', kg: 85 }, { date: '2026-10-19', kg: 85.1 }];
  assert.equal(adjustSuggestion('build', w, '2026-10-20', null).kcal, 200);
});
test('build: gaining fine suggests nothing', () => {
  const w = [{ date: '2026-09-28', kg: 84.8 }, { date: '2026-10-19', kg: 85.4 }, { date: '2026-10-12', kg: 85.2 }];
  assert.equal(adjustSuggestion('build', w, '2026-10-20', null), null);
});
test('lose: not losing suggests −200; snoozed suggests nothing', () => {
  const w = [{ date: '2026-09-28', kg: 85 }, { date: '2026-10-05', kg: 85 }, { date: '2026-10-19', kg: 85.1 }];
  assert.equal(adjustSuggestion('lose', w, '2026-10-20', null).kcal, -200);
  assert.equal(adjustSuggestion('lose', w, '2026-10-20', '2026-10-27'), null);
});
test('too few weigh-ins, too short a span, or a goal with no rule: nothing', () => {
  assert.equal(adjustSuggestion('build', [{ date: '2026-10-12', kg: 85 }, { date: '2026-10-19', kg: 85 }], '2026-10-20', null), null);
  assert.equal(adjustSuggestion('eatwell', [{ date: '2026-09-28', kg: 85 }, { date: '2026-10-05', kg: 85 }, { date: '2026-10-19', kg: 85 }], '2026-10-20', null), null);
});
test('learning: two strikes drops, two clean eats likes', () => {
  const r = learnFromMeals({ tuna: { eaten: 1, skipped: 2, weeks: 1 }, chilli: { eaten: 6, skipped: 0, weeks: 2 }, rice: { eaten: 3, skipped: 3, weeks: 2 }, once: { eaten: 4, skipped: 0, weeks: 1 } });
  assert.ok(r.dropped.has('tuna')); assert.ok(r.liked.has('chilli')); assert.ok(!r.dropped.has('rice')); assert.ok(!r.liked.has('rice')); assert.ok(!r.liked.has('once'));
});
test('check-in due on the Sunday of a planned week, for last week on Monday, never before, never twice', () => {
  assert.equal(checkinDue({ weekKey: '2026-10-19', thisMon: '2026-10-19', todayIdx: 6, planned: true, hasCheckin: false }), true);
  assert.equal(checkinDue({ weekKey: '2026-10-19', thisMon: '2026-10-19', todayIdx: 3, planned: true, hasCheckin: false }), false);
  assert.equal(checkinDue({ weekKey: '2026-10-12', thisMon: '2026-10-19', todayIdx: 1, planned: true, hasCheckin: false }), true);
  assert.equal(checkinDue({ weekKey: '2026-10-19', thisMon: '2026-10-19', todayIdx: 6, planned: true, hasCheckin: true }), false);
  assert.equal(checkinDue({ weekKey: '2026-10-19', thisMon: '2026-10-19', todayIdx: 6, planned: false, hasCheckin: false }), false);
});
