import { test } from "node:test";
import assert from "node:assert/strict";
import { parseRecipeText } from "../public/textparse.js";
import { platformOf, youtubeId, instagramCode, instagramCaptionFromEmbed, recipeLinksIn } from "../lib/social.js";

test("reads a recipe from a caption with headings and emoji", () => {
  const r = parseRecipeText(`Creamy Tuscan Salmon 🍋🧄 ready in 20 minutes!

Ingredients:
• 2 salmon fillets
• 1 tbsp olive oil
• 3 cloves garlic, minced
• 1 cup heavy cream

Method:
1️⃣ Season salmon and sear 4 minutes per side.
2️⃣ Add garlic, then cream.
3️⃣ Serve!

Serves 2
#salmon #dinner`);
  assert.equal(r.title, "Creamy Tuscan Salmon");
  assert.deepEqual(r.ingredients, ["2 salmon fillets", "1 tbsp olive oil", "3 cloves garlic, minced", "1 cup heavy cream"]);
  assert.deepEqual(r.steps, ["Season salmon and sear 4 minutes per side.", "Add garlic, then cream.", "Serve!"]);
  assert.equal(r.servings, 2);
});

test("reads a run-on caption", () => {
  const r = parseRecipeText("One pan lemon chicken orzo! Ingredients: 1 lb chicken thighs, 1 cup orzo, 2 cups chicken broth, 1 lemon. Instructions: 1. Brown the chicken. 2. Add orzo and broth and simmer 12 minutes. 3. Stir in lemon. Full recipe on my blog! #orzo");
  assert.equal(r.title, "One pan lemon chicken orzo");
  assert.deepEqual(r.ingredients, ["1 lb chicken thighs", "1 cup orzo", "2 cups chicken broth", "1 lemon"]);
  assert.equal(r.steps.length, 3);
  assert.equal(r.steps[2], "Stir in lemon.");
});

test("reads lines with no headings, and says no when there's no recipe", () => {
  const r = parseRecipeText("Best brownies ever\n1 cup butter\n2 cups sugar\n4 eggs\n1. Melt butter.\n2. Bake 25 minutes.");
  assert.deepEqual(r.ingredients, ["1 cup butter", "2 cups sugar", "4 eggs"]);
  assert.deepEqual(r.steps, ["Melt butter.", "Bake 25 minutes."]);
  assert.equal(parseRecipeText("Weekend in Paris! Follow me for more. #travel"), null);
});

test("recognizes social links", () => {
  assert.equal(platformOf("https://www.instagram.com/reel/C8abc123/"), "instagram");
  assert.equal(platformOf("https://vm.tiktok.com/ZMabc/"), "tiktok");
  assert.equal(platformOf("https://youtu.be/dQw4w9WgXcQ"), "youtube");
  assert.equal(platformOf("https://www.budgetbytes.com/x/"), null);
  assert.equal(youtubeId("https://www.youtube.com/shorts/abcDEF12345"), "abcDEF12345");
  assert.equal(youtubeId("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=3"), "dQw4w9WgXcQ");
  assert.equal(instagramCode("https://www.instagram.com/p/C8abc123/?igsh=x"), "C8abc123");
});

test("pulls the caption out of Instagram's embed page", () => {
  const html = `<div class="Caption"><a class="CaptionUsername" href="x">chef</a><br /><br />Garlic noodles<br />Ingredients:<br />8 oz noodles<br />4 tbsp butter<br />6 cloves garlic &amp; more<br />1. Boil noodles.<br />2. Toss.<div class="CaptionComments">x</div></div>`;
  const c = instagramCaptionFromEmbed(html);
  assert.match(c, /^Garlic noodles\nIngredients:\n8 oz noodles/);
  assert.match(c, /garlic & more/);
  const r = parseRecipeText(c);
  assert.equal(r.title, "Garlic noodles"); assert.equal(r.ingredients.length, 3); assert.equal(r.steps.length, 2);
});

test("finds recipe links in a caption, skipping shops and socials", () => {
  assert.deepEqual(recipeLinksIn("Full recipe: https://www.halfbakedharvest.com/garlic-noodles/. Shop my pans https://amzn.to/abc and https://www.instagram.com/x"), ["https://www.halfbakedharvest.com/garlic-noodles/"]);
});

import { parseFeed, feedLinksIn, looksLikeFeed } from "../lib/feed.js";
test("reads RSS and Atom feeds and finds a blog's feed link", () => {
  const rss = `<?xml version="1.0"?><rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel><title>Budget Bytes</title><link>https://www.budgetbytes.com</link>
    <item><title><![CDATA[One Pot Chili Mac &amp; Cheese]]></title><link>https://www.budgetbytes.com/chili-mac/</link><pubDate>Thu, 29 Oct 2026 12:00:00 +0000</pubDate>
      <content:encoded><![CDATA[<p><img src="https://www.budgetbytes.com/wp-content/chili.jpg" /></p>]]></content:encoded></item>
    <item><title>Lemon Rice</title><link>https://www.budgetbytes.com/lemon-rice/</link><media:content url="https://cdn.example.com/rice.jpg"/></item></channel></rss>`;
  assert.ok(looksLikeFeed(rss));
  const f = parseFeed(rss, "https://www.budgetbytes.com/feed/");
  assert.equal(f.title, "Budget Bytes"); assert.equal(f.items.length, 2);
  assert.equal(f.items[0].title, "One Pot Chili Mac & Cheese");
  assert.equal(f.items[0].image, "https://www.budgetbytes.com/wp-content/chili.jpg");
  assert.ok(f.items[0].date > 0);
  assert.equal(f.items[1].image, "https://cdn.example.com/rice.jpg");
  const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Smitten</title><link rel="self" href="https://x.com/feed.xml"/><link href="https://x.com/"/><entry><title>Apple cake</title><link rel="alternate" href="https://x.com/apple-cake/"/><updated>2026-10-20T10:00:00Z</updated></entry></feed>`;
  const a = parseFeed(atom, "https://x.com/feed.xml");
  assert.equal(a.site, "https://x.com/"); assert.equal(a.items[0].link, "https://x.com/apple-cake/");
  assert.deepEqual(feedLinksIn(`<link rel="alternate" type="application/rss+xml" title="Feed" href="/feed/"><link rel="alternate" type="application/rss+xml" title="Comments" href="/comments/feed/">`, "https://b.com/x"), ["https://b.com/feed/"]);
});
