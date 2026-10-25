import { test } from "node:test";
import assert from "node:assert/strict";
import { convertLine, convertTemps, systemOf } from "../public/units.js";

const show = (l, k, t) => { const r = convertLine(l, k, t); return r ? `${r.q} ${r.rest}` : null; };
test("US to metric", () => {
  assert.equal(show("2 cups chicken broth", 1, "metric"), "480 ml chicken broth");
  assert.equal(show("1 lb. boneless chicken breast", 1, "metric"), "450 g boneless chicken breast");
  assert.equal(show("12 ounces sharp cheddar, shredded", 1, "metric"), "340 g sharp cheddar, shredded");
  assert.equal(show("1/2 cup butter", 2, "metric"), "240 ml butter");
  assert.equal(show("5 pounds short ribs", 1, "metric"), "2.3 kg short ribs");
  assert.equal(show("1 tsp salt", 1, "metric"), null);
  assert.equal(show("3 cups (360g) flour", 1, "metric"), null);
  assert.equal(show("1 (28-ounce) can tomatoes", 1, "metric"), null);
  assert.equal(show("2 eggs", 1, "metric"), null);
});
test("metric to US", () => {
  assert.equal(show("200g golden caster sugar", 1, "us"), "7 oz golden caster sugar");
  assert.equal(show("500 ml milk", 1, "us"), "2 cups milk");
  assert.equal(show("1 kg potatoes", 1, "us"), "2¼ lb potatoes");
  assert.equal(show("30 ml oil", 1, "us"), "2 tbsp oil");
});
test("temperatures", () => {
  assert.equal(convertTemps("Preheat the oven to 350°F.", "metric"), "Preheat the oven to 175°C.");
  assert.equal(convertTemps("Heat oven to 400 degrees F", "metric"), "Heat oven to 205°C");
  assert.equal(convertTemps("Heat oven to 190C/170C fan", "us"), "Heat oven to 375°F/340°F fan");
  assert.equal(convertTemps("Preheat to 325°F (163°C).", "metric"), "Preheat to 325°F (163°C).");
  assert.equal(convertTemps("Bake 20 minutes", "metric"), "Bake 20 minutes");
});
test("which system a recipe uses", () => {
  assert.equal(systemOf(["200g sugar", "4 eggs", "100 ml milk"]), "metric");
  assert.equal(systemOf(["2 cups flour", "1 lb beef"]), "us");
});
