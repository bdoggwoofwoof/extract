// Turns recipe web pages into clean recipe objects.
// Most recipe sites embed schema.org "Recipe" data (JSON-LD) for search engines;
// reading it is free, fast and exact, so it is always tried first.

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", deg: "°", frac12: "½", frac14: "¼", frac34: "¾", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", eacute: "é", egrave: "è", ntilde: "ñ", times: "×", reg: "®", copy: "©", trade: "™" };

export function decodeEntities(s) {
  return String(s).replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);/gi, (m, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      try { return String.fromCodePoint(code); } catch { return m; }
    }
    return ENTITIES[e.toLowerCase()] ?? m;
  });
}

export function clean(s) {
  if (s == null) return "";
  return decodeEntities(String(s).replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

export function findRecipeNode(n) {
  if (!n || typeof n !== "object") return null;
  if (Array.isArray(n)) {
    for (const x of n) { const f = findRecipeNode(x); if (f) return f; }
    return null;
  }
  const t = n["@type"];
  if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return n;
  if (n["@graph"]) return findRecipeNode(n["@graph"]);
  if (n.mainEntity) return findRecipeNode(n.mainEntity);
  return null;
}

export function isoDuration(s) {
  if (!s || typeof s !== "string") return "";
  // Handles PT1H5M, P0DT0H20M and the long form P0Y0M0DT0H20M0.000S.
  const m = s.trim().match(/^P(?:\d+Y)?(?:\d+M)?(?:(\d+)D)?(?:T(?:(\d+(?:\.\d+)?)H)?(?:(\d+(?:\.\d+)?)M)?(?:\d+(?:\.\d+)?S)?)?$/i);
  if (!m) return clean(s);
  const mins = Math.round((+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0));
  if (!mins) return "";
  const h = Math.floor(mins / 60), mm = mins % 60;
  return [h && `${h} hr`, mm && `${mm} min`].filter(Boolean).join(" ");
}

function flatSteps(x) {
  if (!x) return [];
  if (typeof x === "string") return x.split(/\n+|<br\s*\/?>|<\/p>/i).map(clean).filter(Boolean);
  if (Array.isArray(x)) return x.flatMap(flatSteps);
  if (x["@type"] === "HowToSection" || Array.isArray(x.itemListElement)) {
    return [...(x.name ? ["## " + clean(x.name)] : []), ...flatSteps(x.itemListElement)];
  }
  return flatSteps(x.text || x.name || "");
}

function urlOf(n) {
  if (typeof n.url === "string") return n.url;
  const m = n.mainEntityOfPage;
  if (typeof m === "string") return m;
  if (m && typeof m["@id"] === "string") return m["@id"];
  return "";
}

// Width of an image, from its listed width or a size in its address (e.g. -1200x800.jpg).
function widthOf(i) {
  if (+i.width) return +i.width;
  const m = String(i.url || i.contentUrl || i).match(/(\d{2,4})x(\d{2,4})/);
  return m ? +m[1] : 0;
}

export function imageOf(img) {
  if (!img) return "";
  if (typeof img === "string") return img;
  if (Array.isArray(img)) {
    // Prefer the largest listed image object, else the first usable one.
    const all = img.filter(i => i && (typeof i === "string" || i.url || i.contentUrl));
    if (!all.length) return "";
    // Unknown sizes rank as mid-size so they still beat a known small thumbnail.
    const ranked = all.map(i => ({ i, w: widthOf(i) || 800 })).sort((a, b) => b.w - a.w);
    return imageOf(ranked[0].i);
  }
  if (typeof img === "object") return String(img.url || img.contentUrl || "");
  return "";
}

// Many sites hand out a thumbnail by adding size settings to the photo's address
// (?fit=225,225, ?resize=440,400, ?w=300). Dropping small ones returns the full photo.
const SIZE_PARAMS = ["fit", "resize", "w", "h", "width", "height"];
export function safeImage(u) {
  let x;
  try { x = new URL(String(u || "").trim()); } catch { return ""; }
  if (x.protocol !== "https:") return "";
  for (const k of SIZE_PARAMS) {
    const v = x.searchParams.get(k);
    if (v && Math.max(...v.split(/[,x]/).map(Number).filter(n => !isNaN(n)), 0) < 600) x.searchParams.delete(k);
  }
  return x.toString();
}

// Nutrition facts some sites publish with the recipe (per serving).
const NUTRIENTS = [["calories", "calories"], ["proteinContent", "protein"], ["carbohydrateContent", "carbs"], ["fatContent", "fat"], ["saturatedFatContent", "saturatedFat"], ["fiberContent", "fiber"], ["sugarContent", "sugar"], ["sodiumContent", "sodium"]];
export function nutritionOf(n) {
  if (!n || typeof n !== "object") return null;
  const out = {};
  for (const [from, to] of NUTRIENTS) { const v = clean(n[from]); if (v && /\d/.test(v) && v.length < 30) out[to] = v; }
  if (n.servingSize) { const v = clean(n.servingSize); if (v.length < 40) out.servingSize = v; }
  return Object.keys(out).length ? out : null;
}

export function fromJsonLd(n) {
  const yields = (Array.isArray(n.recipeYield) ? n.recipeYield : n.recipeYield != null ? [n.recipeYield] : []).map(String);
  const servings = yields.map(s => parseInt(s, 10)).find(v => v > 0 && v < 1000) || null;
  const wordy = yields.map(clean).find(s => /[a-z]/i.test(s) && !/^\d+\s*(servings?|people|portions?)$/i.test(s)) || "";
  const keywords = typeof n.keywords === "string" ? n.keywords.split(",") : Array.isArray(n.keywords) ? n.keywords : [];
  const cats = [].concat(n.recipeCategory || [], n.recipeCuisine || []).flatMap(c => String(c).split(/[,;]+/));
  let tags = [...new Set(cats.map(clean).filter(t => t && t.length < 30))].slice(0, 4);
  if (!tags.length) tags = keywords.map(clean).filter(t => t && t.length < 30).slice(0, 3);
  const ingredients = [].concat(n.recipeIngredient || n.ingredients || []).map(clean).filter(Boolean);
  return {
    title: clean(n.name) || "Untitled recipe",
    source: urlOf(n),
    servings,
    yield: wordy,
    prepTime: isoDuration(n.prepTime),
    cookTime: isoDuration(n.cookTime),
    totalTime: isoDuration(n.totalTime),
    ingredients,
    steps: flatSteps(n.recipeInstructions),
    notes: "",
    tags,
    image: safeImage(imageOf(n.image) || imageOf(n.thumbnailUrl)),
    nutrition: nutritionOf(n.nutrition)
  };
}

export function extractJsonLd(html) {
  const re = /<script[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    let raw = m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, "");
    let data;
    try { data = JSON.parse(raw); }
    catch {
      // Some sites leave raw newlines or control characters inside strings.
      try { data = JSON.parse(raw.replace(/[\u0000-\u001f]+/g, " ")); } catch { continue; }
    }
    const node = findRecipeNode(data);
    if (node) {
      const r = fromJsonLd(node);
      if (r.ingredients.length) return r;
    }
  }
  return null;
}

export function pageTitle(html) {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? clean(m[1]) : "";
}

// Readable text of a page, for the Claude fallback when there is no recipe data.
export function htmlToText(html) {
  return decodeEntities(
    html
      .replace(/<(script|style|noscript|svg|iframe|template|form|button|select)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(br|\/p|\/div|\/li|\/h[1-6]|\/tr|\/section|\/article)[^>]*>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\n\s*\n+/g, "\n")
    .trim();
}

// Sites often publish quantities as raw decimals ("0.25 teaspoon", "2.3333332538605 cups").
const FRACS = [[1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"], [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"]];
export function tidyQuantity(line) {
  return String(line).replace(/^(\d*\.\d+)(?=\s|$)/, m => {
    const n = parseFloat(m); const whole = Math.floor(n); const frac = n - whole;
    if (frac < 0.02) return String(whole);
    if (frac > 0.98) return String(whole + 1);
    for (const [v, g] of FRACS) if (Math.abs(frac - v) < 0.02) return (whole ? whole : "") + g;
    return String(Math.round(n * 100) / 100);
  });
}

export function normalize(r, url) {
  const arr = a => Array.isArray(a) ? a.map(x => String(x).trim()).filter(Boolean) : [];
  return {
    title: String(r.title || "").trim().slice(0, 200) || "Untitled recipe",
    source: String(url || r.source || "").trim(),
    servings: Number(r.servings) > 0 ? Math.round(Number(r.servings)) : null,
    yield: String(r.yield || "").trim(),
    prepTime: String(r.prepTime || "").trim(),
    cookTime: String(r.cookTime || "").trim(),
    totalTime: String(r.totalTime || "").trim(),
    ingredients: arr(r.ingredients).map(tidyQuantity).slice(0, 200),
    steps: arr(r.steps).map(s => s.replace(/^\s*(?:step\s*)?\d+[.):]\s+/i, "")).slice(0, 200),
    notes: String(r.notes || "").trim().slice(0, 4000),
    tags: arr(r.tags).slice(0, 6),
    image: safeImage(r.image),
    nutrition: r.nutrition && typeof r.nutrition === "object" ? nutritionOf(Object.fromEntries(Object.entries(r.nutrition).map(([k, v]) => [({ calories: "calories", protein: "proteinContent", carbs: "carbohydrateContent", fat: "fatContent", saturatedFat: "saturatedFatContent", fiber: "fiberContent", sugar: "sugarContent", sodium: "sodiumContent", servingSize: "servingSize" })[k] || k, v]))) : null
  };
}
