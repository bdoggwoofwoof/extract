import { test } from "node:test";
import assert from "node:assert/strict";
import { itemOf, aisleOf, mergeItems, byAisle, inPantry, canMake } from "../public/grocery.js";

test("reads amount, unit and what to buy", () => {
  const cases = [
    ["2 tbsp olive oil", 2, "tbsp", "olive oil"],
    ["1 1/2 cups red lentils, rinsed", 1.5, "cup", "red lentil"],
    ["3 cloves garlic, minced", 3, "clove", "garlic"],
    ["1 lb. boneless, skinless chicken breast", 1, "lb", "chicken breast"],
    ["1 can (14 oz) diced tomatoes", 1, "can", "tomato"],
    ["2 large onions, chopped", 2, "", "onion"],
    ["Juice of 1 lemon", null, "", "lemon"],
    ["Salt and pepper to taste", null, "", "salt and pepper"],
    ["½ tsp smoked paprika", 0.5, "tsp", "smoked paprika"],
    ["1 lb ground beef", 1, "lb", "ground beef"]
  ];
  for (const [line, amount, unit, name] of cases) {
    const i = itemOf(line);
    assert.equal(i.amount, amount, line); assert.equal(i.unit, unit, line); assert.equal(i.name, name, line);
  }
});

test("guesses the aisle", () => {
  const cases = [
    ["onion", "1 onion"], "Produce", ["olive oil", "2 tbsp olive oil"], "Oils, sauces & condiments",
    ["egg", "3 eggs"], "Dairy & eggs", ["eggplant", "1 eggplant"], "Produce",
    ["tomato", "1 can (14 oz) diced tomatoes"], "Canned & jarred", ["ginger", "1 tsp ground ginger"], "Spices & seasonings",
    ["ginger", "1 tbsp fresh ginger"], "Produce", ["peanut butter", "2 tbsp peanut butter"], "Canned & jarred",
    ["chicken broth", "2 cups chicken broth"], "Canned & jarred", ["frozen pea", "1 cup frozen peas"], "Frozen",
    ["lemon juice", "2 tbsp lemon juice"], "Produce", ["paper towel", "paper towels"], "Household",
    ["all-purpose flour", "2 cups all-purpose flour"], "Baking", ["salt", "salt"], "Spices & seasonings"
  ];
  for (let i = 0; i < cases.length; i += 2) assert.equal(aisleOf(...cases[i]), cases[i + 1], cases[i][1]);
});

test("merges repeats and adds up amounts", () => {
  const items = [["1 onion, diced", "Soup"], ["2 large onions, chopped", "Stew"], ["3 cloves garlic", "Soup"], ["2 cloves garlic, minced", "Stew"],
    ["1 cup red lentils", "A"], ["1/2 cup red lentils", "B"], ["1 tbsp butter", "A"], ["1 cup butter", "B"], ["Salt to taste", "A"], ["1 tsp salt", "B"]]
    .map(([text, recipeTitle], i) => ({ id: "g" + i, text, recipeTitle }));
  const rows = mergeItems(items), by = Object.fromEntries(rows.map(r => [r.name, r]));
  assert.equal(by.onion.text, "3 onions"); assert.deepEqual(by.onion.ids, ["g0", "g1"]); assert.deepEqual(by.onion.recipes, ["Soup", "Stew"]);
  assert.equal(by.garlic.text, "5 cloves garlic");
  assert.equal(by["red lentil"].text, "1½ cups red lentils");
  assert.equal(by.butter.text, "1 tbsp + 1 cup butter");
  assert.equal(by.salt.text, "1 tsp salt (plus more)");
  const aisles = byAisle(rows).map(([a]) => a);
  assert.deepEqual(aisles, ["Produce", "Dairy & eggs", "Pasta, rice & grains", "Spices & seasonings"]);
});

test("pantry matching and what can I make", () => {
  const pantry = [{ name: "olive oil" }, { name: "onion" }, { name: "lentil" }, { name: "cumin" }];
  assert.ok(inPantry("red lentil", pantry));
  assert.ok(inPantry("salt and pepper", pantry));
  assert.ok(!inPantry("garlic", pantry));
  const m = canMake({ ingredients: ["2 tbsp olive oil", "1 onion", "## To serve", "1 cup red lentils", "3 cloves garlic", "Salt to taste"] }, pantry);
  assert.equal(m.total, 5); assert.equal(m.have, 4); assert.deepEqual(m.missing.map(x => x.name), ["garlic"]);
});

import { linkedRecipeFor } from "../public/grocery.js";
test("byAisle follows your store's order, and ingredient lines find linked recipes", () => {
  const rows = [{ name: "milk", aisle: "Dairy & eggs" }, { name: "onion", aisle: "Produce" }, { name: "bread", aisle: "Bakery" }];
  assert.deepEqual(byAisle(rows, r => r.aisle, ["Bakery", "Dairy & eggs", "Produce"]).map(([a]) => a), ["Bakery", "Dairy & eggs", "Produce"]);
  const rs = [{ id: "a", title: "Homemade Pizza Sauce" }, { id: "b", title: "Pizza Dough (Easy)" }, { id: "c", title: "Rice" }];
  assert.equal(linkedRecipeFor("1 cup pizza sauce", rs, "x").id, "a");
  assert.equal(linkedRecipeFor("1 batch pizza dough, rested", rs, "x").id, "b");
  assert.equal(linkedRecipeFor("2 cups cooked rice", rs, "x"), null);
  assert.equal(linkedRecipeFor("1 cup pizza sauce", rs, "a"), null);
});
