import test from 'node:test';
import assert from 'node:assert/strict';
import { kcalTargetFor, kcalPerPortion, scaleRecipes, portionFactor, proteinTargetFor, freshCells, freeSlots, roomFor, gridCounts, costPerPortion, aggregateNeeds, netPantry, packsFor, basketAt, compareShops, cheapestSplit, autoLayout, gridStats, tubPlan, proteinPerPortion, runSheet, unitPrice } from '../planner.js';

const ingredients = [
  { id: 'chicken', name: 'Chicken breast', unit: 'g', protein: 22.5, packs: [
    { shop: 'tesco', size: 1000, price: 6.69, checked: '2026-09-06' },
    { shop: 'asda', size: 1000, price: 6.86, checked: '2026-09-01' },
  ] },
  { id: 'rice', name: 'Basmati', unit: 'g', protein: 8, packs: [
    { shop: 'tesco', size: 2000, price: 3.6, checked: '2026-09-06' },
    { shop: 'asda', size: 2000, price: 3.6, checked: '2026-09-06' },
    { shop: 'aldi', size: 1000, price: 1.5, checked: '2026-09-06' },
  ] },
  { id: 'egg', name: 'Egg', unit: 'each', protein: 6.3, packs: [
    { shop: 'tesco', size: 15, price: 2.49, checked: '2026-09-06' },
    { shop: 'any', size: 6, price: 1.5, checked: '2026-09-06' },
  ] },
  { id: 'soy', name: 'Soy', unit: 'ml', protein: 8, packs: [] },
];
const recipes = [
  { id: 'curry', name: 'Curry', slots: ['dinner'], fridgeDays: 3, freezer: true, cookMinutes: 40, ingredients: [{ id: 'chicken', qty: 175 }, { id: 'rice', qty: 75 }] },
  { id: 'salad', name: 'Salad', slots: ['lunch'], fridgeDays: 3, freezer: false, cookMinutes: 25, ingredients: [{ id: 'chicken', qty: 150 }, { id: 'rice', qty: 60 }, { id: 'soy', qty: 10 }] },
  { id: 'eggs', name: 'Eggs', slots: ['breakfast'], fridgeDays: 1, freezer: false, cookMinutes: 0, ingredients: [{ id: 'egg', qty: 3 }] },
  { id: 'wrap', name: 'Wrap', slots: ['lunch', 'dinner'], fridgeDays: 2, freezer: false, cookMinutes: 10, ingredients: [{ id: 'chicken', qty: 120 }] },
];

test('protein per portion', () => {
  assert.equal(proteinPerPortion(recipes[0], ingredients), Math.round(175 * 0.225 + 75 * 0.08));
  assert.equal(proteinPerPortion(recipes[2], ingredients), 19);
});

test('aggregate and net pantry', () => {
  const needs = aggregateNeeds({ curry: 4, salad: 3 }, recipes);
  assert.deepEqual(needs, { chicken: 4 * 175 + 3 * 150, rice: 4 * 75 + 3 * 60, soy: 30 });
  assert.deepEqual(netPantry(needs, { rice: true }), { chicken: 1150, soy: 30 });
  // a number in the pantry is netted off; enough on hand removes the line entirely
  assert.deepEqual(netPantry(needs, { rice: 200, chicken: 2000 }), { rice: 280, soy: 30 });
});

test('packs round up, never zero', () => {
  assert.equal(packsFor(1150, 1000), 2);
  assert.equal(packsFor(1000, 1000), 1);
  assert.equal(packsFor(1, 1000), 1);
});

test('basket picks cheapest pack including branded any-shop packs', () => {
  const b = basketAt('tesco', { egg: 15, chicken: 1150, soy: 10 }, ingredients);
  const egg = b.lines.find((l) => l.id === 'egg');
  assert.equal(egg.n, 1); assert.equal(egg.cost, 2.49); // 15-pack beats 3×6-pack at 4.50
  const chicken = b.lines.find((l) => l.id === 'chicken');
  assert.equal(chicken.n, 2); assert.equal(chicken.cost, 13.38);
  assert.deepEqual(b.missing.map((m) => m.id), ['soy']);
  assert.equal(b.total, 15.87);
  assert.equal(b.oldest, '2026-09-06');
});

test('compareShops ranks full coverage first then price', () => {
  const ranked = compareShops({ rice: 1000, egg: 6 }, ingredients, ['tesco', 'asda', 'aldi']);
  // aldi: rice 1.5 + eggs any 1.5 = 3.0; tesco: 3.6 + 1.5 = 5.1; asda: 3.6+1.5
  assert.equal(ranked[0].shop, 'aldi');
  assert.equal(ranked[0].total, 3.0);
});

test('cheapestSplit only reported when it saves the threshold', () => {
  // chicken cheaper at tesco (6.69), rice cheaper at aldi (1.5 vs 3.6 for 1000g)
  const split = cheapestSplit({ chicken: 1000, rice: 1000 }, ingredients, ['tesco', 'aldi'], 1);
  assert.ok(split, 'split should exist');
  assert.equal(split.total, 8.19);
  assert.equal(split.saving, 2.1);
  const none = cheapestSplit({ chicken: 1000 }, ingredients, ['tesco', 'asda'], 1);
  assert.equal(none, null);
});

test('autoLayout respects slot types and places short-life recipes first', () => {
  const { grid, overflow } = autoLayout({ curry: 4, wrap: 3, salad: 3, eggs: 7 }, recipes);
  assert.deepEqual(overflow, []);
  const dinners = grid.map((d) => d.dinner);
  const all = grid.flatMap((d) => [d.lunch, d.dinner]);
  assert.equal(dinners.filter((x) => x === 'curry').length, 4);
  assert.equal(all.filter((x) => x === 'wrap').length, 3); // wrap may sit at lunch or dinner
  // wraps keep 2 days and can't be frozen: every wrap lands on the cook day or the day after
  grid.forEach((d, i) => { if (d.lunch === 'wrap' || d.dinner === 'wrap') assert.ok(i <= 1, `wrap on day ${i}`); });
  assert.equal(grid.every((d) => d.breakfast === 'eggs'), true);
  assert.equal(grid.filter((d) => d.lunch === 'salad').length, 3);
});

test('autoLayout reports overflow when a slot type is full', () => {
  const { overflow } = autoLayout({ curry: 9 }, recipes);
  assert.deepEqual(overflow, [{ id: 'curry', unplaced: 2 }]);
});

test('autoLayout front-loads fridge-only recipes and keeps freezer ones for later', () => {
  const recs = [
    { id: 'bang', slots: ['lunch'], fridgeDays: 3, freezer: false, cookMinutes: 45, ingredients: [] },
    { id: 'box', slots: ['lunch'], fridgeDays: 3, freezer: true, cookMinutes: 35, ingredients: [] },
  ];
  const { grid } = autoLayout({ bang: 3, box: 3 }, recs, 0);
  assert.deepEqual(grid.map((d) => d.lunch), ['bang', 'bang', 'bang', 'box', 'box', 'box', null]);
  const four = autoLayout({ bang: 4, box: 3 }, recs, 0).grid.map((d) => d.lunch);
  assert.equal(four.slice(0, 3).every((x) => x === 'bang'), true);
  assert.equal(four.filter((x) => x === 'bang').length, 4); // one is unavoidably late, but only one
  // cook day shifts the sequence
  const shifted = autoLayout({ bang: 2 }, recs, 3).grid.map((d) => d.lunch);
  assert.deepEqual(shifted, [null, null, null, 'bang', 'bang', null, null]);
});

test('gridStats sums protein per day', () => {
  const { grid } = autoLayout({ curry: 7, eggs: 7 }, recipes);
  const s = gridStats(grid, recipes, ingredients, 24);
  assert.equal(s.filled, 14);
  assert.equal(s.distinct, 2);
  assert.equal(s.perDay[0], 24 + 45 + 19);
});

test('tubPlan splits fridge/freezer around cook day and flags unfreezable late portions', () => {
  const grid = Array.from({ length: 7 }, () => ({ breakfast: null, lunch: null, dinner: null }));
  [0, 1, 3, 5].forEach((d) => (grid[d].dinner = 'curry'));
  const t = tubPlan(recipes[0], grid, 0);
  assert.deepEqual(t.fridge, [0, 1]);
  assert.deepEqual(t.freezer, [3, 5]);
  assert.equal(t.eatBy, 'Wed'); // cooked Monday, keeps 3 days
  [0, 2, 4].forEach((d) => (grid[d].lunch = 'salad'));
  const s = tubPlan(recipes[1], grid, 0);
  assert.deepEqual(s.fridge, [0, 2]);
  assert.deepEqual(s.late, [4]);
});

test('tubPlan with a Sunday cook (index 6) feeds the Mon–Sun week that follows', () => {
  const grid = Array.from({ length: 7 }, () => ({ breakfast: null, lunch: null, dinner: null }));
  [0, 1, 3, 6].forEach((d) => (grid[d].dinner = 'curry')); // Mon, Tue, Thu, Sun
  const t = tubPlan(recipes[0], grid, 6);
  assert.deepEqual(t.fridge, [0, 1, 6]); // Mon and Tue are 1–2 days after the Sunday cook; Sunday itself is cooked that day
  assert.deepEqual(t.freezer, [3]);
  assert.equal(t.eatBy, 'Tue');
});

test('runSheet orders longest cook first and skips no-cook recipes', () => {
  const r = runSheet({ eggs: 7, salad: 3, curry: 4 }, recipes);
  assert.deepEqual(r.list.map((x) => x.recipe.id), ['curry', 'salad']);
  assert.equal(r.minutes, 65);
});

test('costPerPortion uses cheapest unit price and lists unpriced', () => {
  const c = costPerPortion(recipes[1], ingredients); // 150g chicken @ 6.69/kg, 60g rice @ 1.5/kg (aldi), soy unpriced
  assert.equal(c.cost, Math.round((150 * 0.00669 + 60 * 0.0015) * 100) / 100);
  assert.deepEqual(c.unpriced, ['Soy']);
});

test('autoLayout skips disabled days and gridCounts reflects what is placed', () => {
  const days = [false, true, true, true, true, true, true]; // Sunday off
  const { grid, overflow } = autoLayout({ curry: 7, eggs: 7 }, recipes, 0, days);
  assert.equal(grid[0].dinner, null); assert.equal(grid[0].breakfast, null);
  assert.equal(grid.filter((d) => d.dinner === 'curry').length, 6);
  assert.deepEqual(overflow.sort((a, b) => a.id.localeCompare(b.id)), [{ id: 'curry', unplaced: 1 }, { id: 'eggs', unplaced: 1 }]);
  assert.deepEqual(gridCounts(grid), { eggs: 6, curry: 6 });
  const s = gridStats(grid, recipes, ingredients, 0, days);
  assert.equal(s.slots, 18); assert.equal(s.activeDays, 6); assert.equal(s.perDay[0], 0);
});

test('aggregateNeeds resolves choices and freeSlots/roomFor gate adding', () => {
  const needs = aggregateNeeds({ curry: 2 }, recipes, (id) => (id === 'chicken' ? 'thigh' : id));
  assert.deepEqual(needs, { thigh: 350, rice: 150 });
  const { grid } = autoLayout({ curry: 7, eggs: 7 }, recipes, 0);
  const free = freeSlots(grid);
  assert.deepEqual(free, { breakfast: 0, lunch: 7, dinner: 0 });
  assert.equal(roomFor(recipes[0], free), 0); // dinner-only curry: no room
  assert.equal(roomFor(recipes[3], free), 7); // wrap can go at lunch
});

test('markers: out and tub cells are kept through relayout, excluded from counts, counted for protein', () => {
  const locked = { '0-dinner': 'out', '1-dinner': 'tub:curry' };
  const { grid } = autoLayout({ curry: 3 }, recipes, 0, undefined, locked);
  assert.equal(grid[0].dinner, 'out'); assert.equal(grid[1].dinner, 'tub:curry');
  assert.equal(grid.filter((d) => d.dinner === 'curry').length, 3);
  assert.deepEqual(gridCounts(grid), { curry: 3 });
  const fresh = { '2-dinner': true };
  assert.deepEqual(gridCounts(grid, { fresh, skipFresh: true }), { curry: 2 });
  assert.deepEqual(freshCells(grid, fresh).map((c) => c.day), [2]);
  const s = gridStats(grid, recipes, ingredients, 0);
  assert.equal(s.perDay[1], 45); // the tub still feeds you
  assert.equal(s.perDay[0], 0);
  assert.equal(tubPlan(recipes[0], grid, 0, fresh).total, 2);
});

test('kcal, scaling and targets', () => {
  const ing2 = ingredients.map((i) => ({ ...i, kcal: i.id === 'chicken' ? 106 : i.id === 'rice' ? 350 : i.id === 'egg' ? 70 : 0 }));
  assert.equal(kcalPerPortion(recipes[0], ing2), Math.round(175 * 1.06 + 75 * 3.5));
  const big = scaleRecipes(recipes, 1.2);
  assert.equal(big[0].ingredients[0].qty, 210);
  assert.equal(recipes[0].ingredients[0].qty, 175); // untouched
  assert.equal(portionFactor(85, 'build'), 1.15);
  assert.equal(portionFactor(60, 'lose'), 0.75);
  assert.equal(proteinTargetFor(85, 'build'), 170);
  assert.equal(proteinTargetFor(85, 'lose'), 185);
  const s = gridStats([{ breakfast: 'eggs', lunch: null, dinner: 'curry' }, ...Array.from({ length: 6 }, () => ({ breakfast: null, lunch: null, dinner: null }))], recipes, ing2, { protein: 10, kcal: 100 });
  assert.equal(s.perDay[0], 10 + 19 + 45);
  assert.equal(s.kcalPerDay[0], 100 + 210 + Math.round(175 * 1.06 + 75 * 3.5));
});

test('kcal target from weight and goal', () => { assert.equal(kcalTargetFor(85, 'build'), 3000); assert.equal(kcalTargetFor(68, 'lose'), 1800); });

test('unitPrice ignores packs from shops that are not compared (Lidl receipt prices on file)', () => {
  const it = { id: 'x', unit: 'g', packs: [{ shop: 'lidl', size: 500, price: 0.1 }, { shop: 'aldi', size: 500, price: 0.5 }, { shop: 'any', size: 500, price: 0.4 }] };
  assert.equal(unitPrice(it), 0.4 / 500);
});
