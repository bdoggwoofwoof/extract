import { test } from "node:test";
import assert from "node:assert/strict";
import { extractJsonLd, isoDuration, htmlToText, normalize } from "../lib/recipe.js";
import { parsePublicUrl, fetchPage } from "../lib/net.js";

// Shaped like a typical food blog page: WordPress recipe plugin, @graph, sections, entities.
const BLOG_PAGE = `<!doctype html><html><head><title>Best Banana Bread Ever - My Life Story Blog</title>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
 {"@type":"WebSite","name":"Blog"},
 {"@type":"Article","headline":"My grandmother's kitchen..."},
 {"@type":["Recipe"],"name":"Best Banana Bread &amp; Walnuts","recipeYield":["10","1 loaf"],
  "prepTime":"PT15M","cookTime":"PT1H5M","totalTime":"PT1H20M",
  "recipeCategory":["Breakfast","Baking"],"recipeCuisine":["American"],
  "recipeIngredient":["3 ripe bananas, mashed","&frac12; cup melted butter","1 &frac12; cups flour","<strong>1 tsp</strong> baking soda"],
  "recipeInstructions":[
    {"@type":"HowToSection","name":"Batter","itemListElement":[
      {"@type":"HowToStep","text":"Heat the oven to 350&deg;F."},
      {"@type":"HowToStep","text":"Mix the bananas and butter."}]},
    {"@type":"HowToSection","name":"Bake","itemListElement":[
      {"@type":"HowToStep","text":"Bake 60 to 65 minutes."}]}],
  "mainEntityOfPage":{"@id":"https://example.com/banana-bread/"}}
]}</script></head><body><p>Long story...</p></body></html>`;

test("reads recipe data from a typical blog page", () => {
  const r = extractJsonLd(BLOG_PAGE);
  assert.equal(r.title, "Best Banana Bread & Walnuts");
  assert.equal(r.servings, 10);
  assert.equal(r.yield, "1 loaf");
  assert.equal(r.prepTime, "15 min");
  assert.equal(r.cookTime, "1 hr 5 min");
  assert.equal(r.totalTime, "1 hr 20 min");
  assert.deepEqual(r.ingredients, ["3 ripe bananas, mashed", "½ cup melted butter", "1 ½ cups flour", "1 tsp baking soda"]);
  assert.deepEqual(r.steps, ["## Batter", "Heat the oven to 350°F.", "Mix the bananas and butter.", "## Bake", "Bake 60 to 65 minutes."]);
  assert.deepEqual(r.tags, ["Breakfast", "Baking", "American"]);
  assert.equal(r.source, "https://example.com/banana-bread/");
});

test("handles plain string instructions and a single Recipe object", () => {
  const html = `<script type='application/ld+json'>{"@type":"Recipe","name":"Toast","recipeYield":"2 servings","recipeIngredient":["2 slices bread"],"recipeInstructions":"Toast the bread.\\nButter it."}</script>`;
  const r = extractJsonLd(html);
  assert.equal(r.servings, 2);
  assert.equal(r.yield, "");
  assert.deepEqual(r.steps, ["Toast the bread.", "Butter it."]);
});

test("skips broken JSON blocks and pages without recipes", () => {
  assert.equal(extractJsonLd(`<script type="application/ld+json">{bad json</script>`), null);
  assert.equal(extractJsonLd(`<script type="application/ld+json">{"@type":"Article"}</script>`), null);
});

test("durations", () => {
  assert.equal(isoDuration("PT90M"), "1 hr 30 min");
  assert.equal(isoDuration("P0DT0H20M"), "20 min");
  assert.equal(isoDuration("PT0S"), "");
});

test("page text drops scripts and keeps structure", () => {
  const t = htmlToText("<style>x{}</style><h1>Soup</h1><ul><li>1 onion</li><li>Salt</li></ul><script>alert(1)</script>");
  assert.match(t, /Soup/); assert.match(t, /• 1 onion/); assert.doesNotMatch(t, /alert/);
});

test("normalize strips step numbers and bad values", () => {
  const r = normalize({ title: "", servings: "abc", steps: ["1. Boil water", "Step 2: Add pasta"], ingredients: ["x"] }, "https://a.com");
  assert.equal(r.title, "Untitled recipe"); assert.equal(r.servings, null);
  assert.deepEqual(r.steps, ["Boil water", "Add pasta"]); assert.equal(r.source, "https://a.com");
});

test("refuses private and malformed addresses", async () => {
  for (const bad of ["ftp://a.com/x", "http://localhost/", "notaurl", "http://user:pw@a.com/", "http://a.com:8080/"]) {
    assert.throws(() => parsePublicUrl(bad));
  }
  for (const bad of ["http://127.0.0.1/", "http://10.0.0.5/", "http://169.254.169.254/latest", "http://[::1]/"]) {
    await assert.rejects(fetchPage(bad), e => ["blocked_host", "bad_url"].includes(e.code));
  }
});
