import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const lib = JSON.parse(readFileSync(new URL("../public/ironwood/library.json", import.meta.url)));
globalThis.fetch = async () => ({ ok: true, json: async () => lib });
const iw = await import("../public/ironwood.js");
const { parseIng } = await import("../public/ironwood/ing.js");

test("minutes from Extract's time text", () => {
  assert.equal(iw.minutesOf("4 hr 15 min"), 255); assert.equal(iw.minutesOf("40 min"), 40); assert.equal(iw.minutesOf("PT1H10M"), 70); assert.equal(iw.minutesOf(""), 0);
  assert.equal(iw.minText(70), "1 hr 10 min");
});
test("reads an Ironwood backup: built-in, combo and own recipes", async () => {
  const own = { "u-1": { name: "My Chili", cat: "main", serves: 4, mins: 50, macros: { kcal: 500, p: 40 }, ing: ["2 lb ground turkey", "1 can black beans"].map(parseIng), steps: ["Brown the turkey.", "Simmer."], note: "" },
    "u-2": { name: "Spare Oats", cat: "breakfast", serves: 2, ing: ["1 cup oats"].map(parseIng), steps: [] } };
  const b = JSON.stringify({ app: "liftbook", version: 1, schema: 2, meta: { meals: { recipes: own, plan: { people: 2, weeks: 1, items: [{ id: "a", r: "m-egg-muffins", n: 5 }, { id: "b", r: "b-chicken~teriyaki", n: 3 }, { id: "c", r: "u-1", n: 2 }, { id: "d", r: "gone", n: 1 }] } } }, sessions: {} });
  const d = await iw.readBackup(b);
  assert.deepEqual(d.prep.map(x => x.id), ["m-egg-muffins", "b-chicken~teriyaki", "u-1"]);
  assert.equal(d.missing, 1); assert.deepEqual(d.mine.map(x => x.id), ["u-2"]); assert.equal(d.people, 2);
  const chili = iw.toExtract(d.prep[2].r, "u-1");
  assert.deepEqual(chili.ingredients, ["2 lb ground turkey", "1 can black beans"]);
  assert.equal(chili.totalTime, "50 min"); assert.equal(chili.nutrition.calories, "500 kcal"); assert.equal(chili.nutrition.protein, "40 g");
  assert.ok(chili.tags.includes("Ironwood"));
  assert.equal(iw.prepScale(d.prep[0], 2, 1), 10 / 6);
  await assert.rejects(iw.readBackup("{\"app\":\"extract\"}"));
});
test("Extract recipe → Ironwood recipe and Restore file", () => {
  const r = { id: "r1", title: "Lemony Orzo Soup", servings: 4, totalTime: "40 min", tags: ["Soup", "Breakfast"], source: "https://www.example.com/soup",
    ingredients: ["## For the soup", "2 tablespoons olive oil", "Juice of 2 lemons"], steps: ["## Cook", "Heat the oil.", "Serve."], nutrition: { calories: "420 kcal", protein: "18 g" } };
  const x = iw.toIronwood(r);
  assert.equal(x.cat, "breakfast"); assert.equal(x.mins, 40); assert.deepEqual(x.macros, { kcal: 420, p: 18 });
  assert.equal(x.ing.length, 2); assert.equal(x.ing[0].u, "tbsp"); assert.deepEqual(x.steps, ["Heat the oil.", "Serve."]);
  assert.equal(x.src.by, "example.com");
  const f = JSON.parse(iw.ironwoodFile([r], [{ id: "r1", n: 3 }]));
  assert.equal(f.app, "liftbook"); assert.ok(f.meta.meals.recipes["x-r1"]); assert.deepEqual(f.meta.meals.plan.items[0].r, "x-r1");
});
test("post text that Ironwood's paste box understands", () => {
  const t = iw.postText({ title: "3-Ingredient Pancakes", servings: 2, totalTime: "15 min", ingredients: ["1 banana", "2 eggs"], steps: ["Mash.", "Cook."], source: "https://x.example/p", nutrition: { calories: "300 kcal", protein: "14 g" } });
  const lines = t.split("\n");
  assert.equal(lines[0], "“3-Ingredient Pancakes”"); assert.ok(lines.includes("Serves: 2")); assert.ok(lines.includes("Time: 15 min"));
  assert.ok(lines.includes("1. Mash.")); assert.equal(lines.at(-1), "https://x.example/p");
});
test("Ironwood shopping list text", () => {
  const items = iw.parseShoppingList("Ironwood shopping list · 2 people · 1 week\n\nPRODUCE\n- 2 bell peppers\n- 5 oz baby spinach\n\nMEAT & FISH\n- 2 lb chicken breast");
  assert.deepEqual(items.map(i => i.text), ["2 bell peppers", "5 oz baby spinach", "2 lb chicken breast"]);
  assert.equal(items[2].aisle, "Meat & fish");
});
