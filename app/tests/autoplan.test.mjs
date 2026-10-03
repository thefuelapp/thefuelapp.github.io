// "Plan my week for me" (autoplan.js): the week it picks must be full, on target, within budget and priced, for typical students.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as P from '../planner.js';
import { planWeek } from '../autoplan.js';
const ING = JSON.parse(fs.readFileSync(new URL('../data/ingredients.json', import.meta.url))).items;
const RAW = JSON.parse(fs.readFileSync(new URL('../data/recipes.json', import.meta.url))).items;
const core = new Set(RAW.filter((r) => r.core).map((r) => r.id));
const choiceOf = (id) => { const it = ING.find((i) => i.id === id); return it?.choices?.length ? [it.choices[0]] : null; };
const ALL = [true, true, true, true, true, true, true];
const run = (o) => planWeek({ P, ING, pool: RAW.filter((r) => !r.slots.includes('snack') && (o.all || r.core)), core, days: o.days || ALL, cookDay: 6, kcal: P.kcalTargetFor(o.weight, o.goal), protein: P.proteinTargetFor(o.weight, o.goal), budget: o.budget, pantry: {}, choiceOf, seed: o.seed || 1 });

for (const c of [{ goal: 'build', weight: 85, budget: 40 }, { goal: 'lose', weight: 70, budget: 30 }, { goal: 'build', weight: 95, budget: 50 }, { goal: 'eatwell', weight: 65, budget: 30, all: true }]) {
  test(`a full week for ${c.weight} kg, ${c.goal}, £${c.budget}`, () => {
    const r = run(c);
    assert.ok(r && r.ok, `no week passed: ${JSON.stringify(r?.problems)}`);
    const counts = Object.values(r.portions).reduce((t, n) => t + n, 0);
    assert.equal(counts, 21, '21 meals');
    assert.ok(r.weekly <= c.budget + 1e-9, `food £${r.weekly} over £${c.budget}`);
    assert.ok(r.protein >= P.proteinTargetFor(c.weight, c.goal), 'protein on target');
    for (const n of Object.values(r.portions)) assert.ok(n >= 2, 'nothing cooked for one portion (breakfasts can be 3 or 4)');
    assert.ok(r.ms < 4000, `took ${r.ms} ms`);
  });
}
test('a part week (Thursday on) fills only the days left', () => {
  const days = [false, false, false, true, true, true, true];
  const r = run({ goal: 'build', weight: 85, budget: 40, days });
  assert.ok(r && r.ok);
  assert.equal(Object.values(r.portions).reduce((t, n) => t + n, 0), 12);
});
test('another seed gives another week', () => {
  const a = run({ goal: 'build', weight: 85, budget: 45, all: true, seed: 1 }), b = run({ goal: 'build', weight: 85, budget: 45, all: true, seed: 2 });
  assert.ok(a.ok && b.ok);
  assert.notDeepEqual(a.portions, b.portions);
});
test('respects what someone does not eat (the pool it is given)', () => {
  const noFish = RAW.filter((r) => !r.slots.includes('snack') && !r.ingredients.some((x) => ['tuna', 'salmon', 'prawns'].includes(x.id)));
  const r = planWeek({ P, ING, pool: noFish, core, days: ALL, cookDay: 6, kcal: 3000, protein: 170, budget: 45, pantry: {}, choiceOf, seed: 3 });
  assert.ok(r);
  for (const id of Object.keys(r.portions)) assert.ok(noFish.some((x) => x.id === id), id);
});
test('"Try another week" gives a different week from the one shown', () => {
  const a = run({ goal: 'lose', weight: 72, budget: 30 });
  const b = planWeek({ P, ING, pool: RAW.filter((r) => !r.slots.includes('snack') && r.core), core, days: ALL, cookDay: 6, kcal: P.kcalTargetFor(72, 'lose'), protein: P.proteinTargetFor(72, 'lose'), budget: 30, pantry: {}, choiceOf, seed: 2, differentFrom: a.portions });
  assert.ok(a.ok && b.ok);
  assert.notDeepEqual(a.portions, b.portions);
});
