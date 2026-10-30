/* Grocery smarts shared by the list, the pantry and "what can I make":
   - itemOf(line): reads "1 1/2 cups red lentils, rinsed" into amount, unit and a plain name ("red lentil")
   - aisleOf(name): a best guess at the store aisle
   - mergeItems(items): one row per ingredient, amounts added up when the units agree
   - inPantry(name, pantry) and canMake(recipe, pantry) for the pantry
   Pure functions, so the tests can run them without a browser. */

const UF = { "½": .5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": .25, "¾": .75, "⅛": .125, "⅜": .375, "⅝": .625, "⅞": .875, "⅕": .2, "⅖": .4, "⅗": .6, "⅘": .8, "⅙": 1 / 6, "⅚": 5 / 6 };
const UFC = Object.keys(UF).join("");
const NUM = `(?:\\d+\\s*[${UFC}]|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[${UFC}])`;
const QTY = new RegExp(`^\\s*(${NUM})(?:\\s*(?:-|–|to)\\s*(${NUM}))?\\s*`);

function num(s) {
  s = s.trim(); let m;
  if ((m = s.match(new RegExp(`^(\\d+)\\s*([${UFC}])$`)))) return +m[1] + UF[m[2]];
  if (UF[s] != null) return UF[s];
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
  return parseFloat(s);
}
export function fmtAmount(n) {
  if (n >= 10) return String(Math.round(n * 10) / 10).replace(/\.0$/, "");
  const whole = Math.floor(n), frac = n - whole;
  const c = [[0, ""], [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"], [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"], [1, ""]];
  let best = c[0], d = 1; for (const x of c) { const dd = Math.abs(frac - x[0]); if (dd < d) { d = dd; best = x; } }
  if (d > 0.05) return String(Math.round(n * 100) / 100);
  let w = whole; if (best[0] === 1) w += 1;
  return ((w ? String(w) : "") + best[1]) || "0";
}

// Unit words → one spelling. Anything else stays part of the name.
const UNITS = {
  cup: "cup", cups: "cup", c: "cup",
  tablespoon: "tbsp", tablespoons: "tbsp", tbsp: "tbsp", tbs: "tbsp", tbl: "tbsp", T: "tbsp",
  teaspoon: "tsp", teaspoons: "tsp", tsp: "tsp", t: "tsp",
  ounce: "oz", ounces: "oz", oz: "oz", pound: "lb", pounds: "lb", lb: "lb", lbs: "lb",
  gram: "g", grams: "g", g: "g", kilogram: "kg", kilograms: "kg", kg: "kg",
  milliliter: "ml", milliliters: "ml", millilitre: "ml", millilitres: "ml", ml: "ml", liter: "l", liters: "l", litre: "l", litres: "l", l: "l",
  quart: "quart", quarts: "quart", qt: "quart", pint: "pint", pints: "pint", pt: "pint", gallon: "gallon", gallons: "gallon",
  clove: "clove", cloves: "clove", can: "can", cans: "can", jar: "jar", jars: "jar", package: "package", packages: "package", pkg: "package", packet: "package", packets: "package",
  bunch: "bunch", bunches: "bunch", head: "head", heads: "head", sprig: "sprig", sprigs: "sprig", stalk: "stalk", stalks: "stalk",
  slice: "slice", slices: "slice", stick: "stick", sticks: "stick", piece: "piece", pieces: "piece", pinch: "pinch", pinches: "pinch", dash: "dash", dashes: "dash",
  bag: "bag", bags: "bag", box: "box", boxes: "box", bottle: "bottle", bottles: "bottle", handful: "handful", handfuls: "handful"
};
const UNIT_PLURAL = { cup: "cups", clove: "cloves", can: "cans", jar: "jars", package: "packages", bunch: "bunches", head: "heads", sprig: "sprigs", stalk: "stalks", slice: "slices", stick: "sticks", piece: "pieces", pinch: "pinches", dash: "dashes", quart: "quarts", pint: "pints", gallon: "gallons", bag: "bags", box: "boxes", bottle: "bottles", handful: "handfuls" };

// Words that describe how it's cut or what size, not what to buy.
const FILLER = new Set(("large small medium big extra fresh freshly finely roughly thinly coarsely chopped minced diced sliced grated shredded " +
  "crushed peeled seeded cored halved quartered cubed julienned softened melted room temperature cold warm hot packed loosely lightly heaping level " +
  "about approximately plus more for to taste serving garnish optional divided whole boneless skinless raw cooked uncooked ripe firm good quality " +
  "of the a an or and into inch pieces piece rinsed drained trimmed beaten sifted toasted dry dried ground").split(" "));
// Words kept even though they look like filler, because they change what you buy.
const KEEP = new Set(["ground beef", "ground turkey", "ground pork", "ground chicken", "ground lamb", "dried apricots", "dried cranberries", "whole milk", "whole wheat", "cold brew"]);

const NO_SINGULAR = new Set(["asparagus", "hummus", "couscous", "molasses", "swiss", "brussels", "grits", "oats", "greens", "series", "species"]);
function singular(w) {
  if (w.length < 4 || NO_SINGULAR.has(w) || /(ss|us|is)$/.test(w)) return w;
  if (/ies$/.test(w)) return w.slice(0, -3) + "y";
  if (/(tomato|potato|mango)es$/.test(w)) return w.slice(0, -2);
  if (/(ch|sh|x)es$/.test(w)) return w.slice(0, -2);
  if (/(leaves|loaves|halves)$/.test(w)) return w.slice(0, -3) + "f";
  if (/s$/.test(w)) return w.slice(0, -1);
  return w;
}

// The part of an ingredient line that says what to buy, lower case and singular: "2 large onions, diced" → "onion".
export function nameOf(rest) {
  let s = String(rest || "").toLowerCase()
    .replace(/\([^)]*\)/g, " ")          // (14 oz), (about 2 cups)
    .replace(/\bjuice of\b/, "")          // "juice of 1 lemon" → lemon
    .replace(/\bzest of\b/, "");
  // Use the first comma-separated part that names something ("boneless, skinless chicken breast" → the chicken).
  const segs = s.split(/,|;| - | – |\bfor\b|\bto taste\b|\bplus\b|\bdivided\b|\bat room\b/);
  s = segs.find(x => x.replace(/[^a-z\s]/g, " ").split(/\s+/).some(w => w && !FILLER.has(w) && !UNITS[w])) || segs[0];
  s = s.replace(/^\s*(?:of\s+)/, "").replace(/[^a-z0-9'&\s-]/g, " ").replace(/\s+/g, " ").trim();
  s = s.replace(/^(?:\d+[\d\s./-]*)/, "").trim();                   // a second amount, "1 can (14 oz) 14 oz tomatoes"
  if (s.startsWith("or ")) s = s.slice(3);
  if (KEEP.has(s)) return s;
  for (const k of KEEP) if (s.includes(k)) return k;
  let words = s.split(" ").filter(w => w && !FILLER.has(w) && !UNITS[w] && !/^\d/.test(w));
  if (!words.length) words = s.split(" ").filter(Boolean);
  const out = words.slice(-3).map(singular).join(" ");
  return out.replace(/^(?:salt and pepper|salt & pepper|salt pepper)$/, "salt and pepper");
}

// One ingredient or list line → { amount, amount2, unit, name, rest }
export function itemOf(line) {
  let text = String(line || "").trim().replace(/^[•\-*–▢☐□]\s*/, "");
  let amount = null, amount2 = null, unit = "";
  const m = text.match(QTY);
  if (m) {
    const a = num(m[1]);
    if (isFinite(a)) { amount = a; amount2 = m[2] ? num(m[2]) : null; text = text.slice(m[0].length); }
  }
  const u = text.match(/^([A-Za-z]+)\.?(?:\s+|$)/);
  if (u && amount != null && (UNITS[u[1]] || UNITS[u[1].toLowerCase()])) {
    unit = UNITS[u[1]] || UNITS[u[1].toLowerCase()];
    text = text.slice(u[0].length);
  }
  text = text.replace(/^of\s+/i, "");
  // "1 can (14 oz) diced tomatoes": the can is the unit to buy.
  return { amount, amount2, unit, name: nameOf(text) || nameOf(line), rest: text.trim() };
}

/* ===== Aisles ===== */
export const AISLES = ["Produce", "Meat & seafood", "Dairy & eggs", "Bakery", "Pasta, rice & grains", "Canned & jarred", "Baking", "Spices & seasonings", "Oils, sauces & condiments", "Snacks & sweets", "Frozen", "Drinks", "Household", "Other"];
const AISLE_WORDS = [
  ["Frozen", "frozen|ice cream|popsicle"],
  ["Spices & seasonings", "salt|pepper flake|peppercorn|black pepper|white pepper|cumin|paprika|cinnamon|nutmeg|oregano|thyme dried|dried thyme|dried basil|dried oregano|chili powder|chile powder|curry powder|turmeric|coriander|cardamom|clove ground|ground clove|allspice|garam masala|bay lea|cayenne|seasoning|spice|za'atar|sumac|fennel seed|mustard seed|onion powder|garlic powder|red pepper flake|italian seasoning|herbes|five spice|saffron|vanilla bean|smoked paprika"],
  ["Baking", "flour|sugar|baking soda|baking powder|yeast|cornstarch|corn starch|cocoa|chocolate chip|vanilla|extract|powdered sugar|confectioner|brown sugar|molasses|sprinkles|gelatin|shortening|cornmeal|almond flour|food coloring|condensed milk|evaporated milk|marshmallow|pie crust|graham cracker"],
  ["Canned & jarred", "canned|tomato paste|tomato sauce|crushed tomato|diced tomato|whole tomato|broth|stock|bouillon|coconut milk|chickpea|black bean|kidney bean|pinto bean|cannellini|white bean|refried|baked bean|tuna|olive|artichoke|roasted red pepper|pickle|caper|salsa|pumpkin puree|jam|jelly|peanut butter|nut butter|almond butter|tahini|applesauce|cream of"],
  ["Meat & seafood", "chicken|beef|pork|turkey|lamb|bacon|sausage|ham|steak|veal|salmon|tuna steak|shrimp|prawn|cod|tilapia|halibut|fish|scallop|crab|lobster|mussel|clam|anchov|prosciutto|pancetta|chorizo|salami|pepperoni|ground meat|meatball|duck|venison|brisket|rib"],
  ["Dairy & eggs", "milk|butter|cream|cheese|yogurt|yoghurt|egg(?!plant)|sour cream|half and half|half-and-half|buttermilk|ghee|parmesan|mozzarella|cheddar|ricotta|feta|mascarpone|cream cheese|cottage|kefir|creme fraiche|crème fraîche|tofu|tempeh"],
  ["Bakery", "pizza dough|dough|bread|bun|roll|bagel|tortilla|pita|naan|baguette|croissant|english muffin|brioche|sourdough|ciabatta|flatbread|wrap"],
  ["Pasta, rice & grains", "pasta|spaghetti|penne|macaroni|noodle|linguine|fettuccine|lasagna|orzo|rigatoni|rice|quinoa|couscous|oat|barley|farro|bulgur|polenta|grits|ramen|udon|soba|lentil|split pea|dried bean|breadcrumb|panko|cracker|cereal|granola"],
  ["Oils, sauces & condiments", "oil|vinegar|soy sauce|tamari|fish sauce|worcestershire|ketchup|mustard|mayo|mayonnaise|hot sauce|sriracha|honey|maple syrup|syrup|hoisin|oyster sauce|teriyaki|bbq sauce|barbecue sauce|dressing|pesto|miso|gochujang|harissa|chili crisp|chili oil|cooking spray|marinara|enchilada sauce|curry paste|sesame oil|sauce"],
  ["Snacks & sweets", "chocolate|chip|pretzel|popcorn|cookie|candy|nut|almond|walnut|pecan|cashew|peanut|pistachio|hazelnut|raisin|dried fruit|dried cranberr|dried apricot|date|seed|chia|flax|sesame seed|pine nut"],
  ["Drinks", "wine|beer|juice|soda|sparkling|coffee|tea|kombucha|liquor|rum|vodka|bourbon|whiskey|tequila|club soda|tonic|sake|mirin|sherry|water bottle"],
  ["Household", "paper towel|toilet paper|foil|plastic wrap|parchment|zip|ziploc|trash bag|garbage bag|dish soap|detergent|sponge|napkin|soap|shampoo|toothpaste|battery|batteries|cling film|wax paper"],
  ["Produce", "onion|garlic|shallot|scallion|green onion|leek|tomato|potato|sweet potato|carrot|celery|pepper|jalapeño|jalapeno|chile|chili|cucumber|zucchini|squash|pumpkin|eggplant|aubergine|mushroom|spinach|kale|lettuce|arugula|cabbage|broccoli|cauliflower|brussels|asparagus|green bean|pea|corn|avocado|lemon|lime|orange|apple|banana|berr|grape|pear|peach|plum|mango|pineapple|melon|cherr|kiwi|pomegranate|herb|parsley|cilantro|coriander lea|basil|mint|dill|rosemary|thyme|sage|chive|ginger|beet|radish|turnip|parsnip|fennel|bok choy|chard|collard|sprout|bean sprout|lemongrass|fig|grapefruit|apricot|rhubarb|okra|artichoke heart fresh|salad|greens|microgreen|watercress|tomatillo|plantain|yam|jicama"]
].map(([a, w]) => [a, new RegExp(`(?:^|\\b)(?:${w})`, "i")]);
// Words that mean "canned/frozen/dried" beat the produce guess.
export function aisleOf(name, line = "") {
  const s = (String(line || "") + " " + String(name || "")).toLowerCase();
  if (/\bfrozen\b/.test(s)) return "Frozen";
  if (/\b(canned|can|cans|jar|jarred|tinned)\b/.test(s) || /\(\s*\d+(\.\d+)?\s*(oz|ounce|g)\b/.test(s)) {
    if (!/\b(milk|cream|cheese)\b/.test(s)) return "Canned & jarred";
  }
  const n = String(name || "").toLowerCase();
  if (/^(salt|pepper|salt and pepper)$/.test(n)) return "Spices & seasonings";
  if (/\b(lemon|lime|orange) (juice|zest)\b/.test(s) || /^(juice|zest) of\b/.test(String(line).toLowerCase().trim())) return "Produce";
  if (/\b(ground|dried)\b/.test(s) && /\b(ginger|thyme|oregano|basil|rosemary|sage|parsley|dill|mint|coriander|mustard|clove|chile|chili|garlic|onion|cinnamon|cumin|nutmeg|cardamom)\b/.test(n)) return "Spices & seasonings";
  // Specific before general: "garlic powder" is a spice, not produce; "olive oil" isn't an olive.
  for (const [a, re] of AISLE_WORDS) if (["Spices & seasonings", "Oils, sauces & condiments", "Baking"].includes(a) && re.test(n)) return a;
  for (const [a, re] of AISLE_WORDS) if (re.test(n)) return a;
  return "Other";
}

/* ===== Merging ===== */
const unitWord = (u, n) => !u ? "" : (n > 1 && UNIT_PLURAL[u] ? UNIT_PLURAL[u] : u);
function pluralName(name, n) {
  if (!(n > 1) || /s$/.test(name) || /\b(salt|pepper|garlic|flour|sugar|rice|milk|butter|oil|water|cheese|cream|broth|stock|spinach|kale|parsley|cilantro|basil|thyme|dill|mint|lettuce|yogurt|honey|vinegar|meat|beef|pork|chicken|fish|tofu|corn|asparagus|celery)$/.test(name)) return name;
  if (/(ch|sh|x|o)$/.test(name) && !/(avocado)$/.test(name)) return name + "es";
  if (/[^aeiou]y$/.test(name)) return name.slice(0, -1) + "ies";
  return name + "s";
}
// items: [{ id, text, done, recipeId, recipeTitle }] → rows [{ key, name, text, aisle, ids, recipes, count }]
export function mergeItems(items) {
  const rows = new Map();
  for (const it of items) {
    const p = itemOf(it.text);
    const key = p.name || String(it.text).toLowerCase().trim();
    if (!rows.has(key)) rows.set(key, { key, name: p.name, aisle: aisleOf(p.name, it.text), ids: [], recipes: [], parts: [], texts: [] });
    const r = rows.get(key);
    r.ids.push(it.id); r.texts.push(it.text);
    if (it.recipeTitle && !r.recipes.includes(it.recipeTitle)) r.recipes.push(it.recipeTitle);
    r.parts.push(p);
  }
  for (const r of rows.values()) {
    r.count = r.ids.length;
    if (r.count === 1) { r.text = r.texts[0]; continue; }
    // Add up amounts per unit; lines with no amount ("salt to taste") just count once.
    const byUnit = new Map(); let loose = false;
    for (const p of r.parts) {
      if (p.amount == null) { loose = true; continue; }
      const k = p.unit || "";
      byUnit.set(k, (byUnit.get(k) || 0) + (p.amount2 != null ? p.amount2 : p.amount));
    }
    if (!byUnit.size) { r.text = r.texts[0]; continue; }
    if (byUnit.size === 1 && byUnit.has("")) { const n = byUnit.get(""); r.text = `${fmtAmount(n)} ${pluralName(r.name, n)}`; }
    else r.text = `${[...byUnit].map(([u, n]) => `${fmtAmount(n)}${u ? " " + unitWord(u, n) : ""}`).join(" + ")} ${pluralName(r.name, 2)}`;
    if (loose) r.text += " (plus more)";
  }
  return [...rows.values()];
}
// Grouped and ordered for the store: [[aisle, rows], ...]
// order: the aisles in the order you walk your store (AISLES by default).
export function byAisle(rows, aisleFor = r => r.aisle, order = AISLES) {
  const g = new Map();
  for (const r of rows) { const a = aisleFor(r); if (!g.has(a)) g.set(a, []); g.get(a).push(r); }
  const pos = a => { const i = order.indexOf(a); return i < 0 ? 999 : i; };
  return [...g].sort((a, b) => pos(a[0]) - pos(b[0])).map(([a, rs]) => [a, rs.sort((x, y) => x.name.localeCompare(y.name))]);
}
// A saved recipe whose title appears in an ingredient line ("1 cup Pizza Sauce" → your "Pizza Sauce").
const titleKey = t => String(t || "").toLowerCase().replace(/\([^)]*\)/g, " ").replace(/\b(homemade|easy|best|simple|quick|my|the|perfect|classic|ultimate|basic)\b/g, " ").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
export function linkedRecipeFor(line, recipes, selfId) {
  const l = " " + titleKey(line) + " ";
  let best = null;
  for (const r of recipes) {
    if (r.id === selfId) continue;
    const k = titleKey(r.title);
    if (k.length < 5 || !k.includes(" ") && k.length < 7) continue;
    if (l.includes(" " + k + " ") && (!best || k.length > titleKey(best.title).length)) best = r;
  }
  return best;
}

/* ===== Pantry ===== */
// Always counted as on hand, so they don't hold back "what can I make".
export const STAPLES = ["salt", "pepper", "black pepper", "salt and pepper", "water", "ice", "kosher salt", "sea salt", "ice water", "boiling water", "warm water", "cold water"];
const words = s => String(s).toLowerCase().split(/\s+/).map(singular).filter(Boolean);
export function inPantry(name, pantry) {
  if (!name) return false;
  if (STAPLES.includes(name)) return true;
  const have = words(name);
  return pantry.some(p => { const w = words(p.name || p); return w.length && w.every(x => have.includes(x)); });
}
// How much of a recipe you could make from the pantry.
export function canMake(recipe, pantry) {
  const lines = (recipe.ingredients || []).filter(l => !String(l).startsWith("## "));
  const items = lines.map(l => ({ line: l, name: itemOf(l).name })).filter(x => x.name);
  const missing = items.filter(x => !inPantry(x.name, pantry));
  return { total: items.length, have: items.length - missing.length, missing };
}
