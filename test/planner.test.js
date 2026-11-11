import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as P from "../public/planner.js";

const pack = JSON.parse(readFileSync(new URL("../public/packs/reels.json", import.meta.url)));
const lib = JSON.parse(readFileSync(new URL("../public/ironwood/library.json", import.meta.url)));
// Ironwood's built-ins as Extract would see them (macros as nutrition, category kept).
const iwPool = Object.entries(lib.recipes).filter(([, r]) => r.macros && r.macros.kcal && ["breakfast", "main", "snack"].includes(r.cat) && (r.ing || []).length)
  .map(([id, r]) => ({ id: "iwc:" + id, title: r.name, ingredients: r.ing, steps: r.steps || ["Cook."], servings: r.serves, ironwoodCat: r.cat, tags: [],
    nutrition: { calories: `${r.macros.kcal} kcal`, protein: `${r.macros.p || 0} g` } }));

test("targets match Ironwood's formula", () => {
  const t = P.targetsFor({ sex: "m", age: 30, h: 180, w: 80, act: 2, goal: "keep" });
  // BMR 10*80 + 6.25*180 - 5*30 + 5 = 1780; × 1.55 = 2759 → 2760; protein 80 × 1.6 = 128 → 130
  assert.equal(t.kcal, 2760); assert.equal(t.p, 130);
  assert.equal(P.targetsFor({ sex: "f", age: 30, h: 160, w: 45, act: 1, goal: "lose" }).goal, "keep"); // underweight: no cut
  assert.equal(P.targetsFor({ sex: "m", age: 30, h: 0, w: 80 }), null);
  assert.equal(Math.round(P.inToCm(70)), 178); assert.equal(Math.round(P.lbToKg(176)), 80);
});

test("reel recipes sort into breakfasts, meals and snacks; drinks, sauces and desserts stay out", () => {
  const kinds = {}; for (const r of pack.recipes) { const k = P.kindOf(r) || "-"; kinds[k] = (kinds[k] || 0) + 1; }
  assert.ok(kinds.b >= 12, JSON.stringify(kinds)); assert.ok(kinds.m >= 120, JSON.stringify(kinds)); assert.ok(kinds["-"] >= 60, JSON.stringify(kinds));
  const by = t => P.kindOf(pack.recipes.find(r => r.title === t));
  assert.equal(by("Thai Crack Sauce"), "");
  assert.equal(by("Air Fryer Hard-Boiled Eggs"), "b");
  for (const r of pack.recipes.filter(r => r.group === "Drinks")) assert.notEqual(P.kindOf(r), "m", r.title);
  assert.equal(P.kindOf({ title: "Chicken stock", tags: ["Ironwood", "Building blocks"], ingredients: ["x"], steps: ["y"] }), "");
});

test("a batch-cook week uses one breakfast and two mains, lunch and dinner differ", () => {
  const w = P.buildWeek(pack.recipes, { meals: ["Breakfast", "Lunch", "Dinner"], cook: "once", days: 7, seed: 7 });
  assert.equal(w.days.length, 7);
  assert.equal(new Set(w.days.map(d => d.find(e => e.meal === "Breakfast").recipeId)).size, 1);
  assert.equal(new Set(w.days.flatMap(d => d.filter(e => e.meal !== "Breakfast").map(e => e.recipeId))).size, 2);
  for (const d of w.days) assert.notEqual(d.find(e => e.meal === "Lunch").recipeId, d.find(e => e.meal === "Dinner").recipeId);
  assert.ok(w.days.flat().every(e => e.sv === 1)); // no target: one serving each
  const daily = P.buildWeek(pack.recipes, { meals: ["Dinner"], cook: "daily", days: 5, seed: 3 });
  assert.equal(new Set(daily.days.flat().map(e => e.recipeId)).size, 4);
});

test("with a target and calories on the recipes, portions get days close to it", () => {
  const t = { kcal: 2600, p: 150 };
  const w = P.buildWeek(iwPool, { meals: ["Breakfast", "Lunch", "Dinner", "Snack"], cook: "few", days: 7, target: t, seed: 11 });
  const get = id => iwPool.find(r => r.id === id);
  for (const d of w.days) {
    const tot = P.dayTotals(d, get);
    assert.equal(tot.unknown, 0);
    assert.ok(Math.abs(tot.kcal - t.kcal) <= t.kcal * 0.15, `day ${tot.kcal} vs ${t.kcal}`);
    assert.ok(d.every(e => e.sv >= 0.5 && e.sv <= 2 && (e.sv * 2) % 1 === 0));
  }
});

test("cooking list: servings for everyone, in whole or half batches", () => {
  const r = { id: "a", title: "Chili", servings: 4 }, s = { id: "b", title: "Oats" };
  const get = id => ({ a: r, b: s })[id];
  const entries = [...Array(7)].map(() => ({ recipeId: "a", sv: 1, meal: "Dinner" })).concat([{ recipeId: "b", sv: 1.5, meal: "Breakfast" }]);
  const [chili, oats] = P.cookList(entries, 2, get);
  assert.equal(chili.need, 14); assert.equal(chili.batches, 3.5); assert.equal(chili.makes, 4);
  assert.equal(oats.need, 3); assert.equal(oats.batches, 1); assert.ok(oats.guessed);
  assert.match(P.batchText(chili, String), /14 servings · 3.5 batches \(it makes 4\)/);
});

test("the reels pack is clean", () => {
  const ids = new Set();
  for (const r of pack.recipes) {
    assert.ok(!ids.has(r.id), r.id); ids.add(r.id);
    assert.match(r.id, /^reel-/); assert.match(r.source, /^https:\/\/www\.instagram\.com\/reel\//);
    assert.ok(r.title && r.ingredients.length && r.steps.length, r.title);
    assert.ok(pack.groups.includes(r.group));
    assert.doesNotMatch(r.notes, /Swap or skip/);
  }
  assert.equal(pack.recipes.length, 327);
});
