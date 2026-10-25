import { test } from "node:test";
import assert from "node:assert/strict";
import { findTimes, ingredientsForStep, fmtClock } from "../public/cook.js";

test("finds times in steps", () => {
  const t = findTimes("Bake the cookies for 13–14 minutes. Cool on the sheet for 10 minutes, then about ten minutes more.");
  assert.deepEqual(t.map(x => [x.text, x.secs, x.maxSecs]), [["13–14 minutes", 780, 840], ["10 minutes", 600, null], ["ten minutes", 600, null]]);
  assert.equal(findTimes("Simmer 1 hour, then rest 30 secs.").map(x => x.secs).join(), "3600,30");
  assert.equal(findTimes("Cut into 2-inch pieces at 350 degrees").length, 0);
  assert.equal(findTimes("cook 2 to 3 1/2 hours")[0].secs, 7200);
});

test("finds the ingredients a step uses", () => {
  const ings = ["2 tbsp olive oil", "1 onion, diced", "1 cup red lentils, rinsed", "Salt and pepper to taste", "Juice of 1 lemon", "## To serve", "1 (28-ounce) can crushed tomatoes", "3 large eggs"];
  const pick = s => ingredientsForStep(s, ings).map(x => x.line);
  assert.deepEqual(pick("Warm the olive oil and add the onion."), ["2 tbsp olive oil", "1 onion, diced"]);
  assert.deepEqual(pick("Add the lentils and tomatoes."), ["1 cup red lentils, rinsed", "1 (28-ounce) can crushed tomatoes"]);
  assert.deepEqual(pick("Stir in the lemon juice; season with salt."), ["Salt and pepper to taste", "Juice of 1 lemon"]);
  assert.deepEqual(pick("Beat the egg."), ["3 large eggs"]);
});

test("clock", () => { assert.equal(fmtClock(65), "1:05"); assert.equal(fmtClock(3725), "1:02:05"); });
