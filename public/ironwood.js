// Extract ⇄ Ironwood. The two apps keep their data on the phone in separate places, so they trade files and text:
//  - Ironwood backup (.json, or its Copy backup text) → Extract: the meal prep's recipes, their groceries, a week plan.
//  - Extract → Ironwood: a file Ironwood's Restore merges in (it only adds recipes it doesn't have), or one recipe as
//    text for Ironwood's "Fill in from a post".
//  - Ironwood's shared shopping list text → Extract's grocery list.
// Ironwood's own ingredient parser is copied into ironwood/ing.js (tools/build-ironwood.mjs), so what Extract sends
// is stored exactly the way Ironwood stores its own recipes.
import { parseIng, ingToText } from "./ironwood/ing.js";

export const IW_CATS = { breakfast: "Breakfast", main: "Lunch & dinner", snack: "Snacks", base: "Building blocks" };
let libPromise = null;
// Ironwood's built-in recipes and mix-and-match combos (a backup names these by id only).
export const library = () => (libPromise ||= fetch("/ironwood/library.json").then(r => { if (!r.ok) throw new Error("library"); return r.json(); }).catch(e => { libPromise = null; throw e; }));

/* ---------- times and numbers ---------- */
export function minutesOf(t) {
  const s = String(t || "").toLowerCase(); if (!s) return 0;
  const iso = s.match(/^pt(?:(\d+)h)?(?:(\d+)m)?/); if (iso) return (+iso[1] || 0) * 60 + (+iso[2] || 0);
  const h = s.match(/(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\b/), m = s.match(/(\d+)\s*(?:m|min|mins|minute|minutes)\b/);
  if (h || m) return Math.round((h ? +h[1] * 60 : 0) + (m ? +m[1] : 0));
  const n = s.match(/^(\d+)$/); return n ? +n[1] : 0;
}
export const minText = m => !m ? "" : m >= 60 ? `${Math.floor(m / 60)} hr${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`;
const num = v => { const m = String(v ?? "").match(/[\d.]+/); return m ? Math.round(+m[0]) : null; };

/* ---------- Ironwood → Extract ---------- */
// One Ironwood recipe (from the library as text, or from a backup with Ironwood's parsed ingredients) as an Extract recipe.
export function toExtract(r, iwId) {
  const ing = (r.ing || []).map(g => typeof g === "string" ? g : ingToText(g)).filter(Boolean);
  const m = r.macros || {};
  const has = k => m[k] != null && m[k] !== "" && isFinite(+m[k]);
  const nutrition = has("kcal") || has("p") ? {
    ...(has("kcal") ? { calories: `${Math.round(+m.kcal)} kcal` } : {}), ...(has("p") ? { protein: `${Math.round(+m.p)} g` } : {}),
    ...(has("c") ? { carbs: `${Math.round(+m.c)} g` } : {}), ...(has("f") ? { fat: `${Math.round(+m.f)} g` } : {}) } : null;
  const notes = [r.note, r.size ? `Serving: ${r.size}.` : "", r.keeps ? `Keeps ${r.keeps} days in the fridge${r.freezes ? "; freezes well" : ""}.` : ""].filter(Boolean).join("\n");
  const src = typeof r.src === "string" ? r.src : r.src && r.src.url || "";
  return {
    kind: "recipe", title: r.name || "Ironwood recipe", ingredients: ing, steps: (r.steps || []).filter(Boolean),
    servings: r.serves || null, yield: "", prepTime: "", cookTime: "", totalTime: minText(r.mins),
    tags: ["Ironwood", IW_CATS[r.cat] || "Lunch & dinner"].filter((v, i, a) => a.indexOf(v) === i),
    source: /^https?:\/\//.test(src) ? src : "", notes, image: "", nutrition, ironwood: iwId
  };
}

// Read an Ironwood backup (the .json file or the Copy backup text). Returns the meal prep and your own recipes.
export async function readBackup(text) {
  let d; try { d = JSON.parse(String(text || "").trim()); } catch { throw new Error("That isn't an Ironwood backup. Choose the .json file from Profile → Save backup file, or paste the text from Copy backup."); }
  if (!d || d.app !== "liftbook" || !d.meta) throw new Error("That file isn't an Ironwood backup.");
  const meals = d.meta.meals || {}, own = meals.recipes && typeof meals.recipes === "object" ? meals.recipes : {};
  const plan = meals.plan || {}, people = Math.max(1, +plan.people || 1), weeks = Math.max(1, +plan.weeks || 1);
  let lib = { recipes: {} }; try { lib = await library(); } catch {}
  const get = id => own[id] && Array.isArray(own[id].ing) ? own[id] : lib.recipes[id];
  const prep = (Array.isArray(plan.items) ? plan.items : []).filter(i => i && typeof i.r === "string").map(i => ({ id: i.r, n: Math.max(1, +i.n || 1), r: get(i.r) })).filter(x => x.r);
  const inPrep = new Set(prep.map(x => x.id));
  const mine = Object.entries(own).filter(([id, r]) => r && Array.isArray(r.ing) && !inPrep.has(id) && !lib.recipes[id]).map(([id, r]) => ({ id, r }));
  const missing = (plan.items || []).filter(i => i && !get(i.r)).length;
  return { people, weeks, prep, mine, missing, from: d.exportedAt || "" };
}
// How many servings of a prep recipe the week needs, as Ironwood counts them (times a week × people × weeks).
export const prepScale = (x, people, weeks) => (x.n * people * weeks) / (x.r.serves || 1);

// Ironwood's shared shopping list ("Ironwood shopping list · …", AISLE headings, "- item" lines).
export function parseShoppingList(text) {
  const out = []; let aisle = "";
  for (const raw of String(text || "").split(/\r?\n/)) {
    const l = raw.trim(); if (!l || /^ironwood shopping list/i.test(l)) continue;
    const it = l.match(/^[-•*☐]\s*(.+)$/);
    if (it) out.push({ text: it[1].trim(), aisle }); else if (l === l.toUpperCase() && /[A-Z]/.test(l)) aisle = l.charAt(0) + l.slice(1).toLowerCase();
    else out.push({ text: l, aisle });
  }
  return out;
}

/* ---------- Extract → Ironwood ---------- */
const catOf = r => { const t = (r.tags || []).map(x => x.toLowerCase()); return t.includes("breakfast") ? "breakfast" : t.some(x => /snack/.test(x)) ? "snack" : "main"; };
// An Extract recipe as Ironwood stores its own (see Ironwood's normMeals and recipe editor).
export function toIronwood(r) {
  const n = r.nutrition || {}, macros = {};
  if (num(n.calories) != null) macros.kcal = num(n.calories); if (num(n.protein) != null) macros.p = num(n.protein);
  if (num(n.carbs) != null) macros.c = num(n.carbs); if (num(n.fat) != null) macros.f = num(n.fat);
  let host = ""; try { host = new URL(r.source).hostname.replace(/^www\./, ""); } catch {}
  return {
    name: String(r.title || "Recipe").slice(0, 80), cat: catOf(r), serves: Math.max(1, Math.round(+r.servings || 4)), keeps: 4, freezes: false, size: "",
    mins: minutesOf(r.totalTime) || minutesOf(r.prepTime) + minutesOf(r.cookTime) || "",
    macros, ing: (r.ingredients || []).filter(l => !l.startsWith("## ")).map(parseIng).filter(Boolean),
    steps: (r.steps || []).filter(s => !s.startsWith("## ")), note: [r.notes, "From Extract."].filter(Boolean).join("\n"),
    ...(r.source ? { src: { url: r.source, by: host, what: "" } } : {})
  };
}
// A file for Ironwood's Profile → Restore. A used Ironwood only adds what it lacks: these recipes, and the plan
// only if its own meal prep is empty. Ids start with "x-" plus the Extract id, so sending a recipe twice doesn't copy it.
export function ironwoodFile(recipes, plan) {
  const out = {}; for (const r of recipes) out["x-" + r.id] = toIronwood(r);
  const meals = { recipes: out };
  if (plan && plan.length) meals.plan = { people: 1, weeks: 1, items: plan.map(p => ({ id: "mp-x" + p.id, r: "x-" + p.id, n: Math.min(21, Math.max(1, p.n)) })) };
  return JSON.stringify({ app: "liftbook", version: 1, schema: 2, exportedAt: new Date().toISOString(), from: "Extract", meta: { meals }, sessions: {} }, null, 1);
}
// One recipe as text for Ironwood's "Fill in from a post": a short name line, Serves, Time, Ingredients, Steps, the link.
export function postText(r) {
  let name = String(r.title || "Recipe").replace(/\s+/g, " ").trim();
  if (name.length > 60) name = name.slice(0, 58).replace(/\s+\S*$/, "").replace(/[,:;\-–]+$/, "");
  if (/^(\d|[½⅓⅔¼¾⅛]|a |one |two |three |half )/i.test(name)) name = `“${name}”`; // a name starting with a number would read as an ingredient
  const mins = minutesOf(r.totalTime) || minutesOf(r.prepTime) + minutesOf(r.cookTime);
  const n = r.nutrition || {}, mac = [num(n.calories) != null ? `${num(n.calories)} kcal` : "", num(n.protein) != null ? `${num(n.protein)}g protein` : "", num(n.carbs) != null ? `${num(n.carbs)}g carbs` : "", num(n.fat) != null ? `${num(n.fat)}g fat` : ""].filter(Boolean);
  let i = 0;
  return [name, r.servings ? `Serves: ${r.servings}` : "", mins ? `Time: ${mins} min` : "", mac.length >= 2 ? `Macros per serving: ${mac.join(", ")}` : "",
    "Ingredients", ...(r.ingredients || []).filter(l => !l.startsWith("## ")),
    "Steps", ...(r.steps || []).filter(s => !s.startsWith("## ")).map(s => `${++i}. ${s}`),
    r.source || ""].filter(Boolean).join("\n");
}
