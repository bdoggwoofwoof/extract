// Plan My Week: the same way Ironwood plans meals, on Extract's recipes.
//  1. Optional daily targets (calories and protein per person), typed in or worked out from height, weight, age and activity.
//  2. A small rotation: a few breakfasts and mains repeat across the week, fewer when you cook once (batch) and more when
//     you cook most days. Lunch and dinner use different mains each day.
//  3. With targets and calories on the recipes, portions move in half servings toward the calorie target, and snacks
//     fill a gap. Without them, everyone gets one serving.
//  4. What to cook: each recipe's servings for the week (portions × people), as batches of the recipe.
// Pure functions only; app.js does the screens and saving.

export const ACT_LEVELS = [[1, "Light", "Desk job, 1–3 workouts a week", 1.375], [2, "Moderate", "3–5 workouts a week", 1.55], [3, "Active", "6+ workouts, or on your feet all day", 1.725], [4, "Very active", "Physical job plus training", 1.9]];
const GOAL_ADJ = { lose: -500, keep: 0, gain: 250 };
const KCAL_FLOOR = { m: 1500, f: 1200, x: 1350 };
export const COOK_STYLES = { once: { name: "Once a week", sub: "Batch cook, fewest recipes", b: 1, m: 2 }, few: { name: "A few times", sub: "2 or 3 cooking days", b: 2, m: 3 }, daily: { name: "Most days", sub: "More variety", b: 3, m: 5 } };

/* ---------- targets ---------- */
// Mifflin-St Jeor, the same as Ironwood. me: { sex: "m"|"f"|"x", age, h (cm), w (kg), act (1-4), goal: "lose"|"keep"|"gain" }
export function targetsFor(me) {
  const age = +me.age, h = +me.h, w = +me.w;
  if (!(age >= 14 && age <= 100 && h >= 120 && h <= 230 && w >= 35 && w <= 300)) return null;
  const s = me.sex === "m" ? 5 : me.sex === "f" ? -161 : -78;
  const bmr = 10 * w + 6.25 * h - 5 * age + s;
  const tdee = bmr * (ACT_LEVELS.find(a => a[0] === +me.act) || ACT_LEVELS[1])[3];
  const bmi = w / Math.pow(h / 100, 2);
  let goal = me.goal || "keep", note = "";
  if (goal === "lose" && bmi < 18.5) { goal = "keep"; note = "Your weight is already on the low side for your height, so this is for keeping it steady."; }
  let kcal = tdee + (GOAL_ADJ[goal] || 0);
  const floor = Math.max(KCAL_FLOOR[me.sex] || KCAL_FLOOR.x, Math.round(bmr));
  if (goal === "lose" && kcal < floor) { kcal = floor; note = note || `Extract doesn't plan below ${Math.round(floor / 10) * 10} calories a day, so the loss will be slower.`; }
  kcal = Math.round(kcal / 10) * 10;
  const basis = bmi > 30 ? 27 * Math.pow(h / 100, 2) : w; // protein from a lean-ish weight when BMI is high
  const p = Math.min(220, Math.round(basis * (goal === "keep" ? 1.6 : 1.8) / 5) * 5);
  return { kcal, p, goal, note };
}
export const lbToKg = lb => +lb * 0.45359237;
export const inToCm = inch => +inch * 2.54;

/* ---------- recipes ---------- */
const numIn = v => { const m = String(v ?? "").replace(/,/g, "").match(/\d+(?:\.\d+)?/); return m ? +m[0] : null; };
export const kcalOf = r => { const n = r && r.nutrition; const k = n ? numIn(n.calories) : null; return k && k > 20 && k < 3000 ? k : null; };
export const proteinOf = r => { const n = r && r.nutrition; return n ? numIn(n.protein) : null; };
export function minutesOf(t) {
  const s = String(t || "").toLowerCase(); if (!s) return 0;
  const h = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/), m = s.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
  if (h || m) return Math.round((h ? +h[1] * 60 : 0) + (m ? +m[1] : 0));
  const n = s.match(/^(\d+)$/); return n ? +n[1] : 0;
}
export const recipeMinutes = r => minutesOf(r.totalTime) || (minutesOf(r.prepTime) + minutesOf(r.cookTime)) || 0;

const NOT_A_MEAL = /\b(drinks?|beverages?|cocktails?|mocktails?|liqueurs?|wine|tea|coffee|sauces?|condiments?|marinades?|dressings?|spice blends?|seasonings?|pickles?|preserv\w*|canning|jell(y|ies)|jams?|garnish|dips?|spreads?|frosting|icing|skincare|diy|herbal remedy)\b/;
const SWEET = /\b(desserts?|cakes?|cookies?|candy|sweets?|brownies?|pies?|puddings?|ice cream|cupcakes?|fudge|baklava|mousse|tarts?|cheesecakes?|caramels?|gummies)\b/;
const SIDE = /\b(side dish(es)?|sides?|appetizers?|starters?|bread|breads|baking|salads?|condiment)\b/;
const MEAL_WORDS = /\b(dinner|lunch|mains?|main course|main dish|entr[ée]es?|meal prep|supper|bowls?|soups?|stews?|curry|curries|pasta|noodles|rice)\b/;
const BREAKFAST = /\b(breakfast|brunch|oats|oatmeal|porridge|pancakes?|waffles?|granola|omelett?es?|frittata|shakshuka|french toast|overnight oats|chia pudding|egg muffins?)\b/;
// "b" breakfast, "m" lunch or dinner, "s" snack, or "" (drinks, sauces, desserts, sides: not planned on their own)
export function kindOf(r) {
  if (!r || !(r.ingredients || []).filter(l => !String(l).startsWith("## ")).length || !(r.steps || []).length) return "";
  if (r.ironwoodCat) return { breakfast: "b", main: "m", snack: "s" }[r.ironwoodCat] || "";
  const tags = (r.tags || []).map(t => String(t).toLowerCase()), t = tags.join(" | "), title = String(r.title || "").toLowerCase();
  if (tags.includes("building blocks")) return "";
  if (tags.includes("breakfast") || tags.includes("brunch")) return "b";
  if (tags.some(x => /^snacks?$/.test(x))) return "s";
  if (MEAL_WORDS.test(t)) return "m";
  if (NOT_A_MEAL.test(t) || SWEET.test(t) || SIDE.test(t)) return "";
  if (BREAKFAST.test(title)) return "b";
  if (NOT_A_MEAL.test(title) || SWEET.test(title)) return "";
  return "m";
}

/* ---------- the week ---------- */
export function seeded(seed) { let x = (seed >>> 0) || 1; return () => { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; return ((x >>> 0) % 1e6) / 1e6; }; }
// Shuffle, with favorites, good ratings and (when there's a target) known calories more likely to come first.
function ranked(list, rnd, wantKcal) {
  return list.map(r => ({ r, k: rnd() * (1 + (r.fav ? 0.6 : 0) + (r.rating || 0) * 0.15 + (wantKcal && kcalOf(r) ? 1.2 : 0)) })).sort((a, b) => b.k - a.k).map(x => x.r);
}
function shape(list, n, o, rnd) {
  let L = ranked(list, rnd, !!o.target);
  if (o.quick) { const q = L.filter(r => { const m = recipeMinutes(r); return m > 0 && m <= 30; }); if (q.length >= Math.min(n, 1)) L = [...q, ...L.filter(r => !q.includes(r))]; }
  return L.slice(0, Math.min(n, L.length));
}
// o: { meals: ["Breakfast","Lunch","Dinner","Snack"], cook: "once"|"few"|"daily", days: n, target: {kcal, p}|null, quick, seed }
// pool: recipes (Extract shape). Returns { days: [[{ meal, recipeId, sv }]], picked: { b, m, s }, short: [...] }
export function buildWeek(pool, o) {
  const rnd = seeded(o.seed || Date.now()), style = COOK_STYLES[o.cook] || COOK_STYLES.few;
  const by = { b: [], m: [], s: [] }; for (const r of pool) { const k = kindOf(r); if (k) by[k].push(r); }
  const want = new Set(o.meals || ["Breakfast", "Lunch", "Dinner"]);
  const nM = want.has("Lunch") && want.has("Dinner") ? style.m : Math.max(1, style.m - 1);
  const bs = want.has("Breakfast") ? shape(by.b, style.b, o, rnd) : [];
  const ms = want.has("Lunch") || want.has("Dinner") ? shape(by.m, nM, o, rnd) : [];
  const ss = ranked(by.s, rnd, !!o.target).sort((a, b) => ((proteinOf(b) || 0) / (kcalOf(b) || 999)) - ((proteinOf(a) || 0) / (kcalOf(a) || 999))).slice(0, 2);
  const short = [];
  if (want.has("Breakfast") && !bs.length) short.push("Breakfast");
  if ((want.has("Lunch") || want.has("Dinner")) && !ms.length) short.push("Lunch and dinner");
  if (want.has("Snack") && !ss.length) short.push("Snack");
  const days = [];
  for (let i = 0; i < o.days; i++) {
    const day = [];
    if (bs.length) day.push({ meal: "Breakfast", recipeId: bs[i % bs.length].id, sv: 1 });
    if (ms.length && want.has("Lunch")) day.push({ meal: "Lunch", recipeId: ms[i % ms.length].id, sv: 1 });
    if (ms.length && want.has("Dinner")) day.push({ meal: "Dinner", recipeId: ms[(i + (want.has("Lunch") && ms.length > 1 ? 1 : 0)) % ms.length].id, sv: 1 });
    if (ss.length && want.has("Snack")) day.push({ meal: "Snack", recipeId: ss[i % ss.length].id, sv: 1 });
    if (o.target) fitDay(day, o.target, pool, ss);
    days.push(day);
  }
  return { days, picked: { b: bs, m: ms, s: ss }, short };
}
// Portions in half steps toward the calorie target (Ironwood's rule), only when every meal in the day has calories.
function fitDay(day, t, pool, snacks) {
  const get = id => pool.find(r => r.id === id);
  if (!day.length || day.some(x => !kcalOf(get(x.recipeId)))) return;
  const tot = () => day.reduce((a, x) => { const r = get(x.recipeId); a.kcal += kcalOf(r) * x.sv; a.p += (proteinOf(r) || 0) * x.sv; return a; }, { kcal: 0, p: 0 });
  const mains = () => day.filter(x => x.meal !== "Snack");
  for (let k = 0; k < 16; k++) {
    const T = tot(), gap = t.kcal - T.kcal; if (Math.abs(gap) < 90) break;
    if (gap > 0) {
      const x = mains().filter(y => y.sv < 2).sort((a, b) => (proteinOf(get(b.recipeId)) || 0) / kcalOf(get(b.recipeId)) - (proteinOf(get(a.recipeId)) || 0) / kcalOf(get(a.recipeId)))[0];
      if (!x || kcalOf(get(x.recipeId)) * 0.5 > gap + 120) {
        // portions are at their cap: top up with a snack (up to 3 snack servings a day)
        const snackSv = day.filter(y => y.meal === "Snack").reduce((n, y) => n + y.sv, 0);
        const s = snacks.filter(r => kcalOf(r) && kcalOf(r) * 0.6 < gap).map(r => ({ r, have: day.find(y => y.meal === "Snack" && y.recipeId === r.id) })).find(x => !x.have || x.have.sv < 2);
        if (s && snackSv < 3) { if (s.have) s.have.sv += 1; else day.push({ meal: "Snack", recipeId: s.r.id, sv: 1 }); continue; }
        break;
      }
      x.sv += 0.5;
    } else {
      const s = day.filter(y => y.meal === "Snack").pop(); if (s) { day.splice(day.indexOf(s), 1); continue; }
      const x = mains().filter(y => y.sv > 0.5).sort((a, b) => kcalOf(get(b.recipeId)) - kcalOf(get(a.recipeId)))[0];
      if (!x || kcalOf(get(x.recipeId)) * 0.5 > -gap + 120) break;
      x.sv -= 0.5;
    }
  }
}
// A day's calories and protein per person, and how many meals had no numbers.
export function dayTotals(entries, get) {
  let kcal = 0, p = 0, unknown = 0, n = 0;
  for (const e of entries) { if (!e.recipeId) continue; const r = get(e.recipeId); if (!r) continue; n++; const k = kcalOf(r); if (!k) { unknown++; continue; } kcal += k * (e.sv || 1); p += (proteinOf(r) || 0) * (e.sv || 1); }
  return { kcal: Math.round(kcal), p: Math.round(p), unknown, n };
}
// What to cook this week: per recipe, the servings needed (portions × people) and how many batches that is.
export function cookList(entries, people, get) {
  const m = new Map();
  for (const e of entries) { if (!e.recipeId) continue; const r = get(e.recipeId); if (!r) continue; const x = m.get(r.id) || { r, times: 0, need: 0, meals: new Set() }; x.times++; x.need += (e.sv || 1) * Math.max(1, people || 1); if (e.meal) x.meals.add(e.meal); m.set(r.id, x); }
  // Whole or half batches, at least one: a recipe is cooked as written or scaled, not to the exact spoonful.
  return [...m.values()].map(x => { const makes = +x.r.servings > 0 ? +x.r.servings : 0; const raw = x.need / (makes || 4); return { ...x, makes, batches: Math.max(1, Math.ceil(raw * 2 - 1e-9) / 2), guessed: !makes }; })
    .sort((a, b) => b.need - a.need || a.r.title.localeCompare(b.r.title));
}
export function batchText(x, fmt) {
  return `${fmt(x.need)} serving${x.need === 1 ? "" : "s"} · ${x.batches === 1 ? "1 batch" : `${fmt(x.batches)} batches`}${x.makes ? ` (it makes ${x.makes})` : " (if it serves 4)"}`;
}
