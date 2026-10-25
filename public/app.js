/* Recipe Keep — app logic. Recipes and books are stored on this device (IndexedDB). */

/* ===== Helpers ===== */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clean = s => { if (s == null) return ""; const d = new DOMParser().parseFromString(String(s), "text/html"); return (d.body.textContent || "").replace(/\s+/g, " ").trim(); };
const domain = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
let toastTimer;
function toast(msg) { const t = $("#toast"); t.textContent = msg; t.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => t.hidden = true, 3400); }
const settings = {
  get(k) { try { return localStorage.getItem("rk-" + k) || ""; } catch { return ""; } },
  set(k, v) { try { v ? localStorage.setItem("rk-" + k, v) : localStorage.removeItem("rk-" + k); } catch {} }
};

/* ===== Quantity scaling ===== */
const UF = { "½": .5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": .25, "¾": .75, "⅛": .125, "⅜": .375, "⅝": .625, "⅞": .875, "⅕": .2, "⅖": .4, "⅗": .6, "⅘": .8, "⅙": 1 / 6, "⅚": 5 / 6 };
const UFC = "½⅓⅔¼¾⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚";
const NUM = `(?:\\d+\\s*[${UFC}]|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[${UFC}])`;
const QTY_RE = new RegExp(`^\\s*(${NUM})(?:\\s*(?:-|–|to)\\s*(${NUM}))?`);
function parseNum(s) {
  s = s.trim(); let m;
  if ((m = s.match(new RegExp(`^(\\d+)\\s*([${UFC}])$`)))) return +m[1] + UF[m[2]];
  if (UF[s] != null) return UF[s];
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
  return parseFloat(s);
}
function fmtNum(n) {
  if (n >= 10) return String(Math.round(n));
  const whole = Math.floor(n), frac = n - whole;
  const c = [[0, ""], [1 / 8, "⅛"], [1 / 4, "¼"], [1 / 3, "⅓"], [3 / 8, "⅜"], [1 / 2, "½"], [5 / 8, "⅝"], [2 / 3, "⅔"], [3 / 4, "¾"], [7 / 8, "⅞"], [1, ""]];
  let best = c[0], d = 1; for (const x of c) { const dd = Math.abs(frac - x[0]); if (dd < d) { d = dd; best = x; } }
  if (d > 0.05) return String(Math.round(n * 100) / 100);
  let w = whole; if (best[0] === 1) w += 1;
  return ((w ? String(w) : "") + best[1]) || "0";
}
function splitQty(line, k) {
  const m = line.match(QTY_RE);
  if (!m) return { q: "", rest: line };
  const a = parseNum(m[1]), b = m[2] ? parseNum(m[2]) : null;
  if (!isFinite(a)) return { q: "", rest: line };
  const q = k === 1 ? m[0].trim() : fmtNum(a * k) + (b != null ? "–" + fmtNum(b * k) : "");
  return { q, rest: line.slice(m[0].length).trim() };
}

/* ===== State ===== */
const state = {
  items: new Map(), view: { name: "loading" }, q: "", tag: "", sort: "recent",
  cook: { id: null, scale: 1, ings: new Set(), steps: new Set() },
  confirm: null, bookMenu: false, addTab: "link", wake: null, wantWake: false,
  draft: null, ai: false, locked: false, online: true, persisted: false, pendingUrl: ""
};
const recipes = () => [...state.items.values()].filter(i => i.kind === "recipe");
const books = () => [...state.items.values()].filter(i => i.kind === "book").sort((a, b) => a.name.localeCompare(b.name));

/* ===== Storage on this device ===== */
const DB_NAME = "recipe-keep", STORE = "items", LS_KEY = "recipe-keep-v1";
let dbPromise = null, useLocal = false;
function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(STORE, { keyPath: "id" });
    r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
  });
}
async function idb(mode, fn) {
  const db = await (dbPromise ||= openDb());
  return new Promise((res, rej) => {
    const t = db.transaction(STORE, mode); const req = fn(t.objectStore(STORE));
    t.oncomplete = () => res(req && req.result); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
async function loadAll() {
  try { const all = await idb("readonly", s => s.getAll()); state.items = new Map(all.map(i => [i.id, i])); }
  catch {
    useLocal = true;
    try { const arr = JSON.parse(localStorage.getItem(LS_KEY) || "[]"); state.items = new Map(arr.map(i => [i.id, i])); } catch { state.items = new Map(); }
  }
}
function saveLocalAll() { try { localStorage.setItem(LS_KEY, JSON.stringify([...state.items.values()])); } catch { toast("This phone is out of space for recipes. Delete a few, or save a backup."); } }
function save(item) {
  item.updatedAt = Date.now(); if (!item.createdAt) item.createdAt = item.updatedAt;
  state.items.set(item.id, item);
  if (useLocal) { saveLocalAll(); return Promise.resolve(); }
  return idb("readwrite", s => s.put(JSON.parse(JSON.stringify(item)))).catch(() => toast("Couldn't save that change. Your phone may be out of space."));
}
function removeItem(id) {
  state.items.delete(id);
  if (useLocal) { saveLocalAll(); return Promise.resolve(); }
  return idb("readwrite", s => s.delete(id)).catch(() => {});
}

/* ===== Server calls ===== */
async function api(path, opts = {}) {
  const headers = { ...(opts.headers || {}) };
  const code = settings.get("access");
  if (code) headers["x-access-code"] = code;
  let r;
  try { r = await fetch(path, { ...opts, headers }); }
  catch { throw { error: "offline", message: "You're offline. Fetching a recipe needs an internet connection." }; }
  let j = {}; try { j = await r.json(); } catch {}
  if (!r.ok) throw { status: r.status, error: j.error || "server", message: j.message || "Something went wrong on the server. Try again." };
  return j;
}
async function loadStatus() {
  try { const s = await api("/api/status"); state.ai = !!s.ai; state.locked = !!s.locked; state.online = true; }
  catch { state.online = navigator.onLine; }
}

/* ===== Sharing: the link carries the recipe itself ===== */
const b64url = bytes => { let s = ""; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); };
const unb64url = s => { const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/")); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; };
async function pack(obj) {
  const bytes = new TextEncoder().encode(JSON.stringify(obj));
  if ("CompressionStream" in window) {
    const z = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream("deflate-raw"))).arrayBuffer());
    return "z" + b64url(z);
  }
  return "j" + b64url(bytes);
}
async function unpack(s) {
  const kind = s[0], bytes = unb64url(s.slice(1));
  let raw = bytes;
  if (kind === "z") raw = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).arrayBuffer());
  return JSON.parse(new TextDecoder().decode(raw));
}
const strip = r => { const o = JSON.parse(JSON.stringify(r)); delete o.id; delete o.createdAt; delete o.updatedAt; delete o.recipeIds; return o; };
async function shareLinkFor(item) {
  const payload = item.kind === "book"
    ? { v: 1, kind: "book", book: { name: item.name, description: item.description || "" }, recipes: (item.recipeIds || []).map(i => state.items.get(i)).filter(Boolean).map(strip) }
    : { v: 1, kind: "recipe", recipe: strip(item) };
  return location.origin + "/#r=" + await pack(payload);
}

/* ===== Text export ===== */
function recipeText(r) {
  const out = [r.title || "Untitled recipe"];
  const facts = [r.yield || (r.servings ? `Serves ${r.servings}` : ""), r.prepTime && `Prep ${r.prepTime}`, r.cookTime && `Cook ${r.cookTime}`, r.totalTime && `Total ${r.totalTime}`].filter(Boolean);
  if (facts.length) out.push(facts.join(" · "));
  if (r.source) out.push(r.source);
  out.push("", "INGREDIENTS");
  (r.ingredients || []).forEach(l => out.push(l.startsWith("## ") ? "\n" + l.slice(3).toUpperCase() : "• " + l));
  out.push("", "METHOD"); let n = 0;
  (r.steps || []).forEach(s => out.push(s.startsWith("## ") ? "\n" + s.slice(3).toUpperCase() : `${++n}. ${s}`));
  if (r.notes) out.push("", "NOTES", r.notes);
  return out.join("\n");
}
const bookText = (b, rs) => [b.name.toUpperCase(), b.description || "", "", ...rs.map(r => recipeText(r) + "\n\n———\n")].join("\n");

/* ===== Reading recipes ===== */
// Pasted page source with built-in recipe data can be read right here, even offline.
function findRecipeNode(n) {
  if (!n || typeof n !== "object") return null;
  if (Array.isArray(n)) { for (const x of n) { const f = findRecipeNode(x); if (f) return f; } return null; }
  const t = n["@type"]; if (t === "Recipe" || (Array.isArray(t) && t.includes("Recipe"))) return n;
  if (n["@graph"]) return findRecipeNode(n["@graph"]);
  return null;
}
function isoDur(s) {
  if (!s || typeof s !== "string") return "";
  const m = s.match(/^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?/); if (!m) return clean(s);
  const mins = (+m[1] || 0) * 1440 + (+m[2] || 0) * 60 + (+m[3] || 0); if (!mins) return "";
  const h = Math.floor(mins / 60), mm = mins % 60; return [h && `${h} hr`, mm && `${mm} min`].filter(Boolean).join(" ");
}
function flatSteps(x) {
  if (!x) return [];
  if (typeof x === "string") return x.split(/\n+/).map(clean).filter(Boolean);
  if (Array.isArray(x)) return x.flatMap(flatSteps);
  if (x["@type"] === "HowToSection" || x.itemListElement) return [...(x.name ? ["## " + clean(x.name)] : []), ...flatSteps(x.itemListElement)];
  return flatSteps(x.text || x.name);
}
function tryStructured(text) {
  const t = text.trim(); let node = null;
  if (/^[\[{]/.test(t)) { try { node = findRecipeNode(JSON.parse(t)); } catch {} }
  if (!node && /<script[^>]+ld\+json/i.test(t)) {
    const d = new DOMParser().parseFromString(t, "text/html");
    for (const s of d.querySelectorAll('script[type="application/ld+json"]')) { try { node = findRecipeNode(JSON.parse(s.textContent)); if (node) break; } catch {} }
  }
  if (!node) return null;
  const y = [].concat(node.recipeYield || []).map(String);
  return {
    title: clean(node.name), source: typeof node.url === "string" ? node.url : "",
    servings: y.map(s => parseInt(s, 10)).find(v => v > 0) || null, yield: "",
    prepTime: isoDur(node.prepTime), cookTime: isoDur(node.cookTime), totalTime: isoDur(node.totalTime),
    ingredients: [].concat(node.recipeIngredient || []).map(clean).filter(Boolean),
    steps: flatSteps(node.recipeInstructions), notes: "",
    tags: [].concat(node.recipeCategory || []).map(clean).filter(Boolean).slice(0, 4)
  };
}
function normalize(r, url) {
  const arr = a => Array.isArray(a) ? a.map(x => String(x).trim()).filter(Boolean) : [];
  return {
    title: String(r.title || "").trim() || "Untitled recipe", source: String(url || r.source || "").trim(),
    servings: Number(r.servings) > 0 ? Math.round(Number(r.servings)) : null, yield: String(r.yield || "").trim(),
    prepTime: String(r.prepTime || "").trim(), cookTime: String(r.cookTime || "").trim(), totalTime: String(r.totalTime || "").trim(),
    ingredients: arr(r.ingredients), steps: arr(r.steps), notes: String(r.notes || "").trim(), tags: arr(r.tags).slice(0, 6)
  };
}
function setStatus(html, err) { const s = $("#x-status"); if (!s) return; s.className = "status" + (err ? " err" : ""); s.innerHTML = html; }
function setBusy(b) { document.querySelectorAll("[data-busy]").forEach(el => el.disabled = b); }
function findUrl(text) { const m = String(text || "").match(/https?:\/\/[^\s<>"']+/i); return m ? m[0].replace(/[),.;!?]+$/, "") : ""; }

async function fetchFromLink(raw) {
  const url = findUrl(raw) || (/^[\w-]+(\.[\w-]+)+\//.test(raw.trim()) ? "https://" + raw.trim() : "");
  if (!url) return setStatus("Paste a full recipe link, starting with https://", true);
  setStatus('<span class="spin"></span> Fetching the recipe…'); setBusy(true);
  try {
    const j = await api("/api/fetch?url=" + encodeURIComponent(url));
    openDraft(normalize(j.recipe, j.recipe.source || url));
  } catch (e) {
    setStatus(esc(e.message), true);
    if (e.error === "site_blocked" || e.error === "no_data" || e.error === "no_recipe") {
      const s = $("#x-status"); if (s) s.insertAdjacentHTML("beforeend", ` <button class="btn sm" data-act="add-tab" data-t="paste">Paste text instead</button>`);
    }
  } finally { setBusy(false); }
}
async function extractFromText(text, url) {
  const s = tryStructured(text);
  if (s && s.ingredients.length) { openDraft(normalize(s, url || s.source)); return; }
  if (!state.ai) return setStatus("Reading pasted text needs Claude, which isn't set up yet (see Settings). Use the Link tab, or Type it in.", true);
  setStatus('<span class="spin"></span> Reading the recipe…'); setBusy(true);
  try {
    const j = await api("/api/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 60000), url }) });
    openDraft(normalize(j.recipe, url));
  } catch (e) { setStatus(esc(e.message), true); }
  finally { setBusy(false); }
}
async function shrinkImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const sc = Math.min(1, 1600 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
    const dataUrl = c.toDataURL("image/jpeg", 0.85);
    return { data: dataUrl.split(",")[1], media_type: "image/jpeg" };
  } finally { URL.revokeObjectURL(url); }
}
async function extractFromPhoto(file) {
  setStatus('<span class="spin"></span> Reading the photo… this can take up to a minute.'); setBusy(true);
  try {
    let image; try { image = await shrinkImage(file); } catch { return setStatus("That file couldn't be opened as a photo. Try a JPEG or PNG.", true); }
    const j = await api("/api/extract", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ image }) });
    openDraft(normalize(j.recipe, ""));
  } catch (e) { setStatus(esc(e.message), true); }
  finally { setBusy(false); }
}

/* ===== Example ===== */
const EXAMPLE = {
  title: "Red Lentil Soup with Lemon", source: "", servings: 4, yield: "", prepTime: "10 min", cookTime: "30 min", totalTime: "40 min",
  ingredients: ["2 tbsp olive oil", "1 onion, diced", "2 carrots, diced", "3 cloves garlic, minced", "1½ tsp ground cumin", "½ tsp smoked paprika", "1 cup red lentils, rinsed", "4 cups vegetable broth", "1 can (14 oz) diced tomatoes", "Juice of 1 lemon", "Salt and pepper to taste", "## To serve", "Plain yogurt", "Chopped parsley"],
  steps: ["Warm the olive oil in a large pot over medium heat. Add the onion and carrots and cook until soft, about 8 minutes.", "Stir in the garlic, cumin and paprika and cook for 1 minute until fragrant.", "Add the lentils, broth and tomatoes. Bring to a boil, then simmer partly covered for 20 minutes, until the lentils fall apart.", "Blend about half the soup for a creamier texture. Stir in the lemon juice and season with salt and pepper.", "Serve topped with a spoonful of yogurt and parsley."],
  notes: "Example recipe. Edit it or delete it once you've added your own.", tags: ["Example", "Soup", "Vegetarian"]
};

/* ===== Navigation ===== */
function go(view) { state.view = view; state.confirm = null; state.bookMenu = false; render(); window.scrollTo(0, 0); }
function openDraft(r, id) { state.draft = { ...r, id: id || null }; go({ name: "edit" }); }

/* ===== Render ===== */
function render() {
  const v = state.view.name;
  ["library", "books", "add", "settings"].forEach(n => { const b = $("#nav-" + n); if (b) b.removeAttribute("aria-current"); });
  const cur = { library: "library", recipe: "library", edit: "add", add: "add", books: "books", book: "books", settings: "settings" }[v];
  if (cur) $("#nav-" + cur).setAttribute("aria-current", "page");
  const fn = { library: vLibrary, recipe: vRecipe, edit: vEdit, add: vAdd, books: vBooks, book: vBook, shared: vShared, settings: vSettings, message: vMessage }[v];
  $("#main").innerHTML = fn ? fn() : "";
  if (v === "add") wireAdd();
  if (v === "library" && state.focusQ) { const s = $("#q"); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }
}
const tagsOf = r => (r.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join("");
const timeOf = r => r.totalTime || [r.prepTime, r.cookTime].filter(Boolean).join(" + ");
function rcard(r, act = "open-recipe") {
  const meta = [timeOf(r), r.servings ? `Serves ${r.servings}` : r.yield, domain(r.source)].filter(Boolean).map(esc);
  return `<button class="rcard" data-act="${act}" data-id="${esc(r.id)}"><h2>${esc(r.title)}</h2>
    ${meta.length ? `<div class="meta">${meta.map(x => `<span>${x}</span>`).join("")}</div>` : ""}
    <div class="tags">${tagsOf(r)}</div></button>`;
}

function vLibrary() {
  const all = recipes();
  if (!all.length) return `<h1>Your recipes</h1>
    <div class="empty"><strong>No recipes yet</strong><span>Paste a link to any recipe page and get just the ingredients and steps. No ads, no life story.</span>
    <div class="row" style="justify-content:center"><button class="btn primary big" data-act="nav" data-v="add">Add a recipe</button><button class="btn big" data-act="example">Try an example</button></div></div>`;
  const counts = {}; all.forEach(r => (r.tags || []).forEach(t => counts[t] = (counts[t] || 0) + 1));
  const tags = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  const q = state.q.toLowerCase();
  const list = all.filter(r => (!state.tag || (r.tags || []).includes(state.tag)) &&
    (!q || (r.title + " " + (r.ingredients || []).join(" ") + " " + (r.tags || []).join(" ")).toLowerCase().includes(q)))
    .sort(state.sort === "az" ? (a, b) => a.title.localeCompare(b.title) : (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return `<div class="row"><h1>Your recipes</h1><span class="spacer"></span><span class="meta">${all.length} saved</span></div>
    <div class="tools">
      <input type="search" id="q" placeholder="Search titles, ingredients, categories" value="${esc(state.q)}" aria-label="Search recipes">
      <select id="sort" aria-label="Sort"><option value="recent"${state.sort === "recent" ? " selected" : ""}>Recent</option><option value="az"${state.sort === "az" ? " selected" : ""}>A to Z</option></select>
    </div>
    ${tags.length ? `<div class="chips" role="group" aria-label="Filter by category">
      <button class="chip" data-act="tag" data-tag="" aria-pressed="${!state.tag}">All</button>
      ${tags.map(t => `<button class="chip" data-act="tag" data-tag="${esc(t)}" aria-pressed="${state.tag === t}">${esc(t)}<span class="n">${counts[t]}</span></button>`).join("")}</div>` : ""}
    ${list.length ? `<div class="cards">${list.map(r => rcard(r)).join("")}</div>` : `<div class="empty"><strong>Nothing matches</strong><span>Try another word or clear the category filter.</span></div>`}`;
}

function resetCook(id) { if (state.cook.id !== id) state.cook = { id, scale: 1, ings: new Set(), steps: new Set() }; }
function cookBody(r) {
  const c = state.cook, base = r.servings || null, k = c.scale;
  let i = 0;
  const ings = (r.ingredients || []).map(line => {
    if (line.startsWith("## ")) return `<li class="sec">${esc(line.slice(3))}</li>`;
    const idx = i++; const { q, rest } = splitQty(line, k); const done = c.ings.has(idx);
    return `<li class="${done ? "done" : ""}"><label><input type="checkbox" data-act="ing" data-i="${idx}" ${done ? "checked" : ""}><span>${q ? `<span class="q">${esc(q)}</span> ` : ""}${esc(rest)}</span></label></li>`;
  }).join("");
  let n = 0;
  const steps = (r.steps || []).map((s, si) => {
    if (s.startsWith("## ")) return `<li class="sec">${esc(s.slice(3))}</li>`;
    n++; const done = c.steps.has(si);
    return `<li class="step ${done ? "done" : ""}" data-act="step" data-i="${si}" role="button" tabindex="0" aria-pressed="${done}"><span class="num">${String(n).padStart(2, "0")}</span><span>${esc(s)}</span></li>`;
  }).join("");
  const facts = [];
  if (base) facts.push(`<div class="fact"><div class="k">Servings</div><div class="v"><span class="scaler"><button data-act="scale" data-d="-1" aria-label="Fewer servings">−</button><span>${fmtNum(base * k)}</span><button data-act="scale" data-d="1" aria-label="More servings">+</button></span></div></div>`);
  else {
    if (r.yield) facts.push(`<div class="fact"><div class="k">Makes</div><div class="v">${esc(r.yield)}</div></div>`);
    facts.push(`<div class="fact"><div class="k">Scale</div><div class="v"><span class="scaler"><button data-act="mult" data-d="-1" aria-label="Smaller batch">−</button><span>×${fmtNum(k)}</span><button data-act="mult" data-d="1" aria-label="Bigger batch">+</button></span></div></div>`);
  }
  [["Prep", r.prepTime], ["Cook", r.cookTime], ["Total", r.totalTime]].forEach(([a, b]) => b && facts.push(`<div class="fact"><div class="k">${a}</div><div class="v">${esc(b)}</div></div>`));
  return `<div class="rhead">
      ${(r.tags || []).length ? `<div class="row">${tagsOf(r)}</div>` : ""}
      <h1>${esc(r.title)}</h1>
      ${r.source ? `<a class="src" href="${esc(r.source)}" target="_blank" rel="noopener">${esc(domain(r.source) || r.source)} ↗</a>` : ""}
      <div class="facts">${facts.join("")}</div>
    </div>
    <div class="cook">
      <section><div class="row"><h3>Ingredients</h3><span class="spacer"></span>${c.ings.size ? `<button class="btn sm ghost" data-act="clear-checks">Uncheck all</button>` : ""}</div><ul class="ings">${ings || `<li class="hint">No ingredients listed.</li>`}</ul></section>
      <section><div class="row"><h3>Method</h3><span class="spacer"></span>${"wakeLock" in navigator ? `<button class="btn sm" data-act="wake" aria-pressed="${!!state.wake}">${state.wake ? "Screen stays on" : "Keep screen on"}</button>` : ""}</div><ol class="steps">${steps || `<li class="hint">No steps listed.</li>`}</ol>
      ${r.notes ? `<h3 style="margin-top:24px">Notes</h3><div class="notes" style="margin-top:10px">${esc(r.notes)}</div>` : ""}</section>
    </div>`;
}

function vRecipe() {
  const r = state.items.get(state.view.id);
  if (!r) return `<button class="back" data-act="nav" data-v="library">← All recipes</button><p>This recipe was deleted.</p>`;
  resetCook(r.id);
  const bs = books(), inBooks = bs.filter(b => (b.recipeIds || []).includes(r.id));
  const confirm = state.confirm === r.id ? `<div class="confirm"><span>Delete “${esc(r.title)}” for good?</span><button class="btn sm danger" data-act="delete-yes" data-id="${esc(r.id)}">Delete</button><button class="btn sm" data-act="confirm-no">Keep it</button></div>` : "";
  const menu = state.bookMenu ? `<div class="popover">${bs.length ? bs.map(b => `<label class="check"><input type="checkbox" data-act="book-toggle" data-book="${esc(b.id)}" data-recipe="${esc(r.id)}" ${(b.recipeIds || []).includes(r.id) ? "checked" : ""}> ${esc(b.name)}</label>`).join("") : `<p class="hint" style="padding:8px 14px">No books yet.</p>`}
      <div style="padding:8px 14px;border-top:1px solid var(--line)"><form class="row" data-form="quick-book" data-recipe="${esc(r.id)}"><input type="text" id="qb-name" placeholder="New book name" aria-label="New book name" style="flex:1;width:auto"><button class="btn sm primary">Create</button></form></div></div>` : "";
  const fromBook = state.view.from === "book";
  return `<button class="back" data-act="${fromBook ? "back-book" : "nav"}" data-v="library">← ${fromBook ? "Back to book" : "All recipes"}</button>
    <div class="stack">
      <div class="actions">
        <button class="btn" data-act="edit" data-id="${esc(r.id)}">Edit</button>
        <button class="btn" data-act="book-menu" aria-expanded="${state.bookMenu}">Books${inBooks.length ? ` · ${inBooks.length}` : ""}</button>
        <button class="btn" data-act="share" data-id="${esc(r.id)}">Share</button>
        <button class="btn danger ghost" data-act="delete-ask" data-id="${esc(r.id)}">Delete</button>
      </div>
      ${menu}${confirm}
      ${inBooks.length ? `<div class="row meta">In ${inBooks.map(b => `<a href="#" data-act="open-book" data-id="${esc(b.id)}">${esc(b.name)}</a>`).join(", ")}</div>` : ""}
    </div>
    <div style="margin-top:18px">${cookBody(r)}</div>`;
}

function vEdit() {
  const d = state.draft || {};
  const bs = books(), mine = d.id ? bs.filter(b => (b.recipeIds || []).includes(d.id)).map(b => b.id) : [];
  return `<button class="back" data-act="cancel-edit">← Cancel</button>
    <h1>${d.id ? "Edit recipe" : "Check it, then save"}</h1>
    ${d.id ? "" : `<p class="lede">Fix anything that came through wrong. Nothing is saved until you tap Save recipe.</p>`}
    <form class="stack" data-form="recipe" style="margin-top:20px">
      <div class="field"><label for="f-title">Title</label><input type="text" id="f-title" value="${esc(d.title)}" required></div>
      <div class="grid4">
        <div class="field"><label for="f-serv">Servings</label><input type="number" id="f-serv" min="1" inputmode="numeric" value="${d.servings || ""}"></div>
        <div class="field"><label for="f-yield">Or makes</label><input type="text" id="f-yield" placeholder="1 loaf" value="${esc(d.yield)}"></div>
        <div class="field"><label for="f-prep">Prep</label><input type="text" id="f-prep" placeholder="15 min" value="${esc(d.prepTime)}"></div>
        <div class="field"><label for="f-cook">Cook</label><input type="text" id="f-cook" placeholder="30 min" value="${esc(d.cookTime)}"></div>
        <div class="field"><label for="f-total">Total</label><input type="text" id="f-total" placeholder="45 min" value="${esc(d.totalTime)}"></div>
      </div>
      <div class="grid2">
        <div class="field"><label for="f-ings">Ingredients, one per line. Start a line with ## for a heading.</label><textarea id="f-ings" rows="12">${esc((d.ingredients || []).join("\n"))}</textarea></div>
        <div class="field"><label for="f-steps">Steps, with a blank line between each</label><textarea id="f-steps" rows="12">${esc((d.steps || []).join("\n\n"))}</textarea></div>
      </div>
      <div class="field"><label for="f-notes">Notes</label><textarea id="f-notes" rows="3">${esc(d.notes)}</textarea></div>
      <div class="grid2">
        <div class="field"><label for="f-tags">Categories, separated by commas</label><input type="text" id="f-tags" placeholder="Dinner, Vegetarian" value="${esc((d.tags || []).join(", "))}">
          <div class="chips" style="margin-top:4px">${["Breakfast", "Lunch", "Dinner", "Dessert", "Soup", "Baking", "Vegetarian", "Quick"].map(t => `<button type="button" class="chip" data-act="add-tag" data-tag="${t}">+ ${t}</button>`).join("")}</div></div>
        <div class="field"><label for="f-src">Source link</label><input type="url" id="f-src" placeholder="https://" value="${esc(d.source)}"></div>
      </div>
      ${bs.length ? `<div class="field"><label>Recipe books</label><div class="chips">${bs.map(b => `<label class="chip"><input type="checkbox" class="f-book" value="${esc(b.id)}" ${mine.includes(b.id) ? "checked" : ""}> ${esc(b.name)}</label>`).join("")}</div></div>` : ""}
      <div class="row"><button class="btn primary big" type="submit">Save recipe</button><button class="btn big" type="button" data-act="cancel-edit">Cancel</button></div>
    </form>`;
}

function vAdd() {
  const t = state.addTab;
  const tab = (id, label) => `<button role="tab" aria-selected="${t === id}" data-act="add-tab" data-t="${id}">${label}</button>`;
  let body = "";
  if (t === "link") body = `<div class="stack">
      <div class="field"><label for="x-url">Recipe link</label><input type="url" id="x-url" placeholder="https://" inputmode="url" autocomplete="off" value="${esc(state.pendingUrl)}"></div>
      <div class="row">
        <button class="btn primary big" data-act="fetch-link" data-busy>Get recipe</button>
        ${navigator.clipboard && navigator.clipboard.readText ? `<button class="btn big" data-act="paste-link" data-busy>Paste link</button>` : ""}
      </div>
      <span id="x-status" class="status"></span>
      <p class="hint">Copy a link from any recipe site, then tap Paste link. Most big recipe sites work instantly.${state.ai ? "" : " Sites without standard recipe data need Claude reading, which you can turn on in Settings."}</p>
    </div>`;
  if (t === "paste") body = `<div class="stack">
      <p class="hint">For sites that block the link reader: open the recipe page, select all, copy, and paste it here.${state.ai ? "" : " Reading pasted text needs Claude reading (see Settings)."}</p>
      <div class="field"><label for="x-text">Page text</label><textarea id="x-text" rows="9" placeholder="Paste the whole page here, life story and all"></textarea></div>
      <div class="field"><label for="x-src">Link to the page (optional)</label><input type="url" id="x-src" placeholder="https://"></div>
      <div class="row"><button class="btn primary big" data-act="extract-text" data-busy>Get recipe</button></div>
      <span id="x-status" class="status"></span></div>`;
  if (t === "photo") body = state.ai ? `<div class="stack">
      <p class="hint">A recipe card, a cookbook page, or a screenshot. Handwriting works if it's legible.</p>
      <label class="drop" id="drop" for="x-photo"><strong>Take or choose a photo</strong></label>
      <input type="file" id="x-photo" accept="image/*" hidden>
      <span id="x-status" class="status"></span></div>`
    : `<p class="hint">Reading photos needs Claude reading, which isn't turned on for this app yet. Settings shows how to add it.</p><div style="margin-top:12px"><button class="btn" data-act="nav" data-v="settings">Open Settings</button></div>`;
  if (t === "type") body = `<div class="stack"><p class="hint">Start from a blank recipe card.</p><div><button class="btn primary big" data-act="manual">Start typing</button></div></div>`;
  return `<h1>Add a recipe</h1>
    <div class="tabs" role="tablist">${tab("link", "Link")}${tab("paste", "Paste text")}${tab("photo", "Photo")}${tab("type", "Type it in")}</div>
    <div class="panel">${body}</div>`;
}
function wireAdd() {
  const inp = $("#x-photo");
  if (inp) {
    inp.addEventListener("change", () => inp.files[0] && extractFromPhoto(inp.files[0]));
    const drop = $("#drop");
    ["dragover", "dragenter"].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add("on"); }));
    ["dragleave", "drop"].forEach(ev => drop.addEventListener(ev, () => drop.classList.remove("on")));
    drop.addEventListener("drop", e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) extractFromPhoto(f); });
  }
  const u = $("#x-url");
  if (u) u.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); fetchFromLink(u.value); } });
  if (state.pendingUrl && u) { const url = state.pendingUrl; state.pendingUrl = ""; fetchFromLink(url); }
}

function vBooks() {
  const bs = books();
  return `<h1>Recipe books</h1><p class="lede">Group recipes for a holiday, a person, a diet, or a week of dinners. A recipe can live in as many books as you like.</p>
    <form class="row" data-form="new-book" style="margin:20px 0">
      <input type="text" id="nb-name" placeholder="New book name, e.g. Thanksgiving" aria-label="New book name" style="flex:1 1 220px;width:auto" required>
      <button class="btn primary">Create book</button></form>
    ${bs.length ? `<div class="cards">${bs.map(b => { const n = (b.recipeIds || []).filter(i => state.items.has(i)).length;
      return `<button class="bcard" data-act="open-book" data-id="${esc(b.id)}"><h2>${esc(b.name)}</h2>${b.description ? `<p>${esc(b.description)}</p>` : ""}<span class="meta" style="margin-top:auto"><span>${n} recipe${n === 1 ? "" : "s"}</span></span></button>`; }).join("")}</div>`
      : `<div class="empty"><strong>No books yet</strong><span>Name one above, then add recipes to it.</span></div>`}`;
}
function vBook() {
  const b = state.items.get(state.view.id);
  if (!b) return `<button class="back" data-act="nav" data-v="books">← All books</button><p>This book was deleted.</p>`;
  const rs = (b.recipeIds || []).map(i => state.items.get(i)).filter(Boolean);
  const others = recipes().filter(r => !(b.recipeIds || []).includes(r.id)).sort((x, y) => x.title.localeCompare(y.title));
  const confirm = state.confirm === b.id ? `<div class="confirm"><span>Delete the book “${esc(b.name)}”? Its recipes stay in your library.</span><button class="btn sm danger" data-act="delete-book-yes" data-id="${esc(b.id)}">Delete book</button><button class="btn sm" data-act="confirm-no">Keep it</button></div>` : "";
  return `<button class="back" data-act="nav" data-v="books">← All books</button>
    ${state.view.editing ? `<form class="stack" data-form="edit-book" data-id="${esc(b.id)}">
        <div class="field"><label for="eb-name">Book name</label><input type="text" id="eb-name" value="${esc(b.name)}" required></div>
        <div class="field"><label for="eb-desc">Description</label><textarea id="eb-desc" rows="2">${esc(b.description)}</textarea></div>
        <div class="row"><button class="btn primary">Save</button><button type="button" class="btn" data-act="book-edit-cancel">Cancel</button></div></form>`
      : `<div class="stack"><h1>${esc(b.name)}</h1>${b.description ? `<p class="lede">${esc(b.description)}</p>` : ""}
        <div class="actions"><button class="btn primary" data-act="book-pick">Add recipes</button><button class="btn" data-act="book-edit">Rename</button><button class="btn" data-act="share" data-id="${esc(b.id)}">Share book</button><button class="btn danger ghost" data-act="delete-book-ask" data-id="${esc(b.id)}">Delete book</button></div>${confirm}</div>`}
    ${state.view.picking ? `<div class="panel stack" style="margin-top:18px"><h3>Pick recipes to add</h3>
        ${others.length ? `<div class="list">${others.map(r => `<label class="check"><input type="checkbox" class="pick" value="${esc(r.id)}"> ${esc(r.title)}</label>`).join("")}</div>
        <div class="row"><button class="btn primary" data-act="book-pick-add" data-id="${esc(b.id)}">Add selected</button><button class="btn" data-act="book-pick-cancel">Done</button></div>`
        : `<p class="hint">Every recipe you have is already in this book.</p><div><button class="btn" data-act="book-pick-cancel">Done</button></div>`}</div>` : ""}
    <h3 style="margin-top:28px">${rs.length} recipe${rs.length === 1 ? "" : "s"}</h3>
    ${rs.length ? `<div class="list" style="margin-top:10px">${rs.map(r => `<div class="li"><button class="t" data-act="open-recipe" data-id="${esc(r.id)}" data-from="book">${esc(r.title)}</button><span class="meta">${esc(timeOf(r))}</span><button class="btn sm ghost" data-act="book-remove" data-book="${esc(b.id)}" data-recipe="${esc(r.id)}" aria-label="Remove ${esc(r.title)} from this book">Remove</button></div>`).join("")}</div>`
      : `<div class="empty"><strong>This book is empty</strong><span>Add recipes from your library.</span></div>`}`;
}

function vShared() {
  const s = state.view, p = s.payload;
  if (s.recipeIdx != null) { resetCook("shared-" + s.recipeIdx); return `<button class="back" data-act="shared-back">← Back to ${esc(p.book.name)}</button>${cookBody(p.recipes[s.recipeIdx])}`; }
  const banner = `<div class="panel row" style="margin-bottom:20px"><span>Someone shared ${p.kind === "book" ? "a recipe book" : "a recipe"} with you.</span><span class="spacer"></span>
    <button class="btn primary" data-act="save-shared">${p.kind === "book" ? "Save book" : "Save to my recipes"}</button>
    <button class="btn" data-act="copy-shared">Copy as text</button></div>`;
  if (p.kind === "recipe") { resetCook("shared"); return banner + cookBody(p.recipe); }
  return banner + `<h1>${esc(p.book.name)}</h1>${p.book.description ? `<p class="lede">${esc(p.book.description)}</p>` : ""}
    <div class="cards">${p.recipes.map((r, i) => rcard({ ...r, id: String(i) }, "shared-open")).join("")}</div>`;
}
function vMessage() { return `<div class="empty"><strong>${esc(state.view.title)}</strong><span>${esc(state.view.body)}</span><button class="btn" data-act="nav" data-v="library">Go to my recipes</button></div>`; }

function vSettings() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const n = recipes().length, nb = books().length;
  return `<h1>Settings</h1>
    <div class="stack" style="margin-top:20px">
      <section class="panel stack"><h2>Put it on your home screen</h2>
        ${standalone ? `<p class="hint">Installed. You're using Recipe Keep as an app.</p>` : `
        <ol class="steps-howto"><li><strong>iPhone:</strong> open this page in Safari, tap the Share button, then <em>Add to Home Screen</em>.</li>
        <li><strong>Android:</strong> open this page in Chrome, tap the ⋮ menu, then <em>Install app</em> (or <em>Add to Home screen</em>).</li></ol>`}
      </section>
      <section class="panel stack"><h2>Save recipes from other apps</h2>
        <ol class="steps-howto">
          <li><strong>Android:</strong> once installed, tap Share on any recipe page and pick <em>Recipe Keep</em>. It opens and fetches the recipe.</li>
          <li><strong>iPhone:</strong> tap Share on the recipe page, then <em>Copy</em>. Open Recipe Keep, tap Add, then <em>Paste link</em>.</li>
        </ol>
        ${ios ? `<p class="hint">iPhone keeps home-screen apps' storage separate from Safari, so recipes you save in Safari won't appear in the installed app. Use the installed app.</p>` : ""}
      </section>
      <section class="panel stack"><h2>Claude reading</h2>
        <p class="hint">${state.ai ? "On. Photos, pasted text, and sites without standard recipe data are read by Claude." : "Off. Links from most recipe sites still work. To read photos, pasted text, and other sites, add a Claude API key to this app in Vercel (the setup guide in your GitHub repo shows how)."}</p>
        ${state.locked || settings.get("access") ? `<div class="field"><label for="s-access">Access code</label><div class="row"><input type="password" id="s-access" value="${esc(settings.get("access"))}" autocomplete="off" style="flex:1;width:auto"><button class="btn" data-act="save-access">Save</button></div>
          <p class="hint">This app is locked so strangers can't use it. Enter the access code you set in Vercel.</p></div>` : ""}
      </section>
      <section class="panel stack"><h2>Backup</h2>
        <p class="hint">${n} recipe${n === 1 ? "" : "s"} and ${nb} book${nb === 1 ? "" : "s"} are saved on this device${state.persisted ? ", protected from automatic cleanup" : ""}. Save a backup now and then, or to move to a new phone.</p>
        <div class="row"><button class="btn primary" data-act="export">Save a backup</button>
          <label class="btn" for="s-import">Restore from backup</label><input type="file" id="s-import" accept="application/json,.json" hidden></div>
      </section>
      <p class="hint">Recipe Keep is free and has no ads. Recipes stay on your device unless you share them.</p>
    </div>`;
}

/* ===== Share sheet ===== */
async function openShare(item) {
  const isBook = item.kind === "book";
  const rs = isBook ? (item.recipeIds || []).map(i => state.items.get(i)).filter(Boolean) : null;
  const title = isBook ? item.name : item.title;
  const text = isBook ? bookText(item, rs) : recipeText(item);
  let link = "";
  try { link = await shareLinkFor(item); } catch {}
  const long = link.length > 8000;
  modal(`<h2>Share “${esc(title)}”</h2>
    ${link ? `<div class="row">${navigator.share ? `<button class="btn primary" data-act="native-share">Share link…</button>` : ""}<button class="btn${navigator.share ? "" : " primary"}" data-act="copy-link">Copy link</button></div>
      <p class="hint">The link holds the ${isBook ? "whole book" : "recipe"} itself, so it opens for anyone, no account needed. It's a copy: later edits don't change it.${long ? " This one is long, so some messaging apps may cut it off. If that happens, send it as text." : ""}</p>
      <input type="text" id="sh-link" readonly value="${esc(link)}" aria-label="Share link">` : ""}
    <div class="field"><label for="sh-text">As text, for a message or email</label><textarea id="sh-text" rows="6" readonly>${esc(text)}</textarea></div>
    <div class="row"><button class="btn" data-act="copy-text">Copy text</button><span class="spacer"></span><button class="btn" data-act="close-modal">Done</button></div>`);
  state.shareCtx = { title, link };
}
function modal(html) { $("#modal-root").innerHTML = `<div class="scrim" data-act="scrim"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`; }
function closeModal() { $("#modal-root").innerHTML = ""; }
function copyFrom(el) {
  navigator.clipboard.writeText(el.value).then(() => toast("Copied"), () => { el.focus(); el.select(); toast("Text selected. Use Copy from the menu."); });
}

/* ===== Backup ===== */
async function exportBackup() {
  const data = { app: "recipe-keep", version: 1, exportedAt: new Date().toISOString(), items: [...state.items.values()] };
  const name = `recipe-keep-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(data, null, 1)], name, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Recipe Keep backup" }); return; } catch (e) { if (e && e.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
async function importBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { return toast("That file isn't a Recipe Keep backup."); }
  const items = Array.isArray(data) ? data : data && Array.isArray(data.items) ? data.items : null;
  if (!items) return toast("That file isn't a Recipe Keep backup.");
  let added = 0, updated = 0;
  for (const it of items) {
    if (!it || !it.id || !["recipe", "book"].includes(it.kind)) continue;
    const cur = state.items.get(it.id);
    if (!cur) added++; else if ((it.updatedAt || 0) > (cur.updatedAt || 0)) updated++; else continue;
    state.items.set(it.id, it);
    if (useLocal) saveLocalAll(); else await idb("readwrite", s => s.put(it)).catch(() => {});
  }
  toast(`Restored: ${added} new, ${updated} updated.`); render();
}

/* ===== Wake lock ===== */
async function toggleWake() {
  if (state.wake) { state.wantWake = false; try { await state.wake.release(); } catch {} state.wake = null; render(); return; }
  state.wantWake = true;
  try { state.wake = await navigator.wakeLock.request("screen"); state.wake.addEventListener("release", () => { state.wake = null; }); }
  catch { toast("Your phone won't keep the screen on here."); }
  render();
}
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && state.wantWake && !state.wake) {
    try { state.wake = await navigator.wakeLock.request("screen"); } catch {}
  }
});

/* ===== Actions ===== */
function saveRecipeForm() {
  const d = state.draft || {}, val = id => $(id).value.trim(), steps = $("#f-steps").value.trim();
  const r = {
    ...(d.id ? state.items.get(d.id) : {}), kind: "recipe", id: d.id || newId("r"),
    title: val("#f-title") || "Untitled recipe", servings: parseInt(val("#f-serv"), 10) || null, yield: val("#f-yield"),
    prepTime: val("#f-prep"), cookTime: val("#f-cook"), totalTime: val("#f-total"),
    ingredients: $("#f-ings").value.split("\n").map(s => s.trim()).filter(Boolean),
    steps: (/\n\s*\n/.test(steps) ? steps.split(/\n\s*\n/) : steps.split("\n")).map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean),
    notes: $("#f-notes").value.trim(), source: val("#f-src"),
    tags: [...new Set(val("#f-tags").split(",").map(s => s.trim()).filter(Boolean))]
  };
  save(r);
  const chosen = new Set([...document.querySelectorAll(".f-book:checked")].map(i => i.value));
  books().forEach(b => {
    const has = (b.recipeIds || []).includes(r.id);
    if (chosen.has(b.id) && !has) save({ ...b, recipeIds: [...(b.recipeIds || []), r.id] });
    if (!chosen.has(b.id) && has) save({ ...b, recipeIds: b.recipeIds.filter(x => x !== r.id) });
  });
  state.draft = null; state.cook.id = null; toast("Recipe saved");
  go({ name: "recipe", id: r.id });
}
function deleteRecipe(id) {
  books().forEach(b => { if ((b.recipeIds || []).includes(id)) save({ ...b, recipeIds: b.recipeIds.filter(x => x !== id) }); });
  removeItem(id); toast("Recipe deleted"); go({ name: "library" });
}
function createBook(name, recipeId) { const b = { kind: "book", id: newId("b"), name: name.trim(), description: "", recipeIds: recipeId ? [recipeId] : [] }; save(b); return b; }
function saveShared() {
  const p = state.view.payload;
  const add = r => { const n = { ...JSON.parse(JSON.stringify(r)), id: newId("r"), kind: "recipe" }; save(n); return n.id; };
  clearHash();
  if (p.kind === "recipe") { const id = add(p.recipe); toast("Saved to your recipes"); return go({ name: "recipe", id }); }
  const b = createBook(p.book.name || "Shared book"); b.description = p.book.description || ""; b.recipeIds = p.recipes.map(add); save(b);
  toast("Book saved"); go({ name: "book", id: b.id });
}
function clearHash() { try { history.replaceState(null, "", location.pathname); } catch {} }
function currentRecipe() { const v = state.view; if (v.name === "recipe") return state.items.get(v.id); if (v.name === "shared") return v.recipeIdx != null ? v.payload.recipes[v.recipeIdx] : v.payload.recipe; return null; }

document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  if (a === "scrim") { if (e.target === el) closeModal(); return; }
  if (el.tagName === "A") e.preventDefault();
  switch (a) {
    case "nav": if (state.view.name === "shared") clearHash(); return go({ name: el.dataset.v });
    case "back-book": { const b = books().find(b => (b.recipeIds || []).includes(state.view.id)); return go(b ? { name: "book", id: b.id } : { name: "library" }); }
    case "open-recipe": return go({ name: "recipe", id, from: el.dataset.from });
    case "open-book": return go({ name: "book", id });
    case "tag": state.tag = el.dataset.tag; state.focusQ = false; return render();
    case "example": { const r = { ...JSON.parse(JSON.stringify(EXAMPLE)), kind: "recipe", id: newId("r") }; save(r); return go({ name: "recipe", id: r.id }); }
    case "ing": { const i = +el.dataset.i; state.cook.ings.has(i) ? state.cook.ings.delete(i) : state.cook.ings.add(i); el.closest("li").classList.toggle("done", el.checked); return; }
    case "step": { const i = +el.dataset.i; state.cook.steps.has(i) ? state.cook.steps.delete(i) : state.cook.steps.add(i); el.classList.toggle("done"); el.setAttribute("aria-pressed", state.cook.steps.has(i)); return; }
    case "clear-checks": state.cook.ings.clear(); return render();
    case "scale": { const r = currentRecipe(); if (!r || !r.servings) return; const s = Math.max(1, Math.round(r.servings * state.cook.scale) + (+el.dataset.d)); state.cook.scale = s / r.servings; return render(); }
    case "mult": { const st = [0.25, 0.5, 1, 1.5, 2, 3, 4]; let i = st.indexOf(state.cook.scale); if (i < 0) i = 2; state.cook.scale = st[Math.min(st.length - 1, Math.max(0, i + (+el.dataset.d)))]; return render(); }
    case "wake": return toggleWake();
    case "edit": state.draft = JSON.parse(JSON.stringify(state.items.get(id))); return go({ name: "edit" });
    case "cancel-edit": { const d = state.draft; state.draft = null; return go(d && d.id ? { name: "recipe", id: d.id } : { name: "add" }); }
    case "add-tag": { const f = $("#f-tags"); const cur = f.value.split(",").map(s => s.trim()).filter(Boolean); if (!cur.includes(el.dataset.tag)) cur.push(el.dataset.tag); f.value = cur.join(", "); return; }
    case "delete-ask": case "delete-book-ask": state.confirm = id; return render();
    case "confirm-no": state.confirm = null; return render();
    case "delete-yes": return deleteRecipe(id);
    case "delete-book-yes": removeItem(id); toast("Book deleted"); return go({ name: "books" });
    case "book-menu": state.bookMenu = !state.bookMenu; return render();
    case "book-toggle": { const b = state.items.get(el.dataset.book), rid = el.dataset.recipe, has = (b.recipeIds || []).includes(rid);
      save({ ...b, recipeIds: has ? b.recipeIds.filter(x => x !== rid) : [...(b.recipeIds || []), rid] }); toast(has ? `Removed from ${b.name}` : `Added to ${b.name}`); return render(); }
    case "book-remove": { const b = state.items.get(el.dataset.book); save({ ...b, recipeIds: b.recipeIds.filter(x => x !== el.dataset.recipe) }); return render(); }
    case "book-edit": state.view.editing = true; return render();
    case "book-edit-cancel": state.view.editing = false; return render();
    case "book-pick": state.view.picking = true; return render();
    case "book-pick-cancel": state.view.picking = false; return render();
    case "book-pick-add": { const b = state.items.get(id), ids = [...document.querySelectorAll(".pick:checked")].map(i => i.value);
      if (!ids.length) return toast("Tick at least one recipe first."); save({ ...b, recipeIds: [...(b.recipeIds || []), ...ids] }); state.view.picking = false; toast(`Added ${ids.length} recipe${ids.length === 1 ? "" : "s"}`); return render(); }
    case "share": return openShare(state.items.get(id));
    case "native-share": { const c = state.shareCtx; try { await navigator.share({ title: c.title, text: c.title, url: c.link }); } catch {} return; }
    case "copy-link": return copyFrom($("#sh-link"));
    case "copy-text": return copyFrom($("#sh-text"));
    case "close-modal": return closeModal();
    case "add-tab": state.addTab = el.dataset.t; return render();
    case "fetch-link": return fetchFromLink($("#x-url").value);
    case "paste-link": { try { const t = await navigator.clipboard.readText(); const u = findUrl(t) || t.trim(); $("#x-url").value = u; if (u) fetchFromLink(u); else setStatus("Your clipboard is empty. Copy a recipe link first.", true); } catch { setStatus("Couldn't read the clipboard. Long-press the box above and choose Paste.", true); } return; }
    case "extract-text": { const t = $("#x-text").value; if (t.trim().length < 40) return setStatus("Paste the recipe page's text first.", true); return extractFromText(t, $("#x-src").value.trim()); }
    case "manual": return openDraft({ title: "", ingredients: [], steps: [], tags: [] });
    case "save-shared": return saveShared();
    case "copy-shared": { const p = state.view.payload, txt = p.kind === "book" ? bookText(p.book, p.recipes) : recipeText(p.recipe);
      navigator.clipboard.writeText(txt).then(() => toast("Copied"), () => { modal(`<h2>Copy this text</h2><textarea id="sh-text" rows="10" readonly>${esc(txt)}</textarea><div class="row"><button class="btn" data-act="close-modal">Done</button></div>`); $("#sh-text").select(); }); return; }
    case "shared-open": state.view.recipeIdx = +id; render(); return window.scrollTo(0, 0);
    case "shared-back": state.view.recipeIdx = null; return render();
    case "save-access": settings.set("access", $("#s-access").value.trim()); toast("Access code saved"); await loadStatus(); return render();
    case "export": return exportBackup();
  }
});
document.addEventListener("keydown", e => {
  if ((e.key === "Enter" || e.key === " ") && e.target.matches(".steps li.step")) { e.preventDefault(); e.target.click(); }
  if (e.key === "Escape" && $("#modal-root").innerHTML) closeModal();
});
document.addEventListener("input", e => { if (e.target.id === "q") { state.q = e.target.value; state.focusQ = true; render(); } });
document.addEventListener("change", e => {
  if (e.target.id === "sort") { state.sort = e.target.value; render(); }
  if (e.target.id === "s-import" && e.target.files[0]) importBackup(e.target.files[0]);
});
document.addEventListener("submit", e => {
  e.preventDefault(); const f = e.target.dataset.form;
  if (f === "recipe") return saveRecipeForm();
  if (f === "new-book") { const n = $("#nb-name").value.trim(); if (!n) return; const b = createBook(n); toast("Book created"); return go({ name: "book", id: b.id, picking: recipes().length > 0 }); }
  if (f === "quick-book") { const n = $("#qb-name").value.trim(); if (!n) return; createBook(n, e.target.dataset.recipe); toast(`Added to ${n}`); return render(); }
  if (f === "edit-book") { const b = state.items.get(e.target.dataset.id); save({ ...b, name: $("#eb-name").value.trim() || b.name, description: $("#eb-desc").value.trim() }); state.view.editing = false; return render(); }
});

/* ===== Boot ===== */
async function openIncoming() {
  // A shared recipe link: #r=...
  const m = location.hash.match(/^#r=([A-Za-z0-9_-]+)$/);
  if (m) {
    try {
      const payload = await unpack(m[1]);
      if ((payload.kind === "recipe" && payload.recipe) || (payload.kind === "book" && Array.isArray(payload.recipes))) return go({ name: "shared", payload, recipeIdx: null });
    } catch {}
    return go({ name: "message", title: "This link couldn't be opened", body: "It may have been cut off when it was sent. Ask for the recipe again, or have it sent as text." });
  }
  // Android Share → Recipe Keep, or a link like /?url=...
  const q = new URLSearchParams(location.search);
  const incoming = q.get("url") || findUrl(q.get("text")) || findUrl(q.get("title"));
  if (incoming) {
    clearHash(); state.addTab = "link"; state.pendingUrl = incoming;
    return go({ name: "add" });
  }
  go({ name: "library" });
}
(async function boot() {
  await loadAll();
  await Promise.race([loadStatus(), new Promise(r => setTimeout(r, 2500))]);
  try { if (navigator.storage && navigator.storage.persist) state.persisted = await navigator.storage.persisted() || await navigator.storage.persist(); } catch {}
  await openIncoming();
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
window.addEventListener("hashchange", () => { if (/^#r=/.test(location.hash)) openIncoming(); });
