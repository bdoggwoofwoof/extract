/* Extract — app logic. Recipes and books are stored on this device (IndexedDB). */
import { FULL_TOUR, QUICK_TOUR, openTour, maybeShowTour, whatsNewHtml } from "/tour.js";
import * as sync from "/sync.js";
import { convertLine, convertTemps, systemOf } from "/units.js";
import { findTimes, ingredientsForStep, startTimer, stopTimer, pauseTimer, addTime, watchTimers, timersHtml, timerLeft, fmtClock } from "/cook.js";
import { itemOf, aisleOf, mergeItems, byAisle, inPantry, canMake, AISLES, linkedRecipeFor } from "/grocery.js";
import { parseRecipeText } from "/textparse.js";
import * as iw from "/ironwood.js";
import * as planner from "/planner.js";

/* ===== Helpers ===== */
const $ = (s, el = document) => el.querySelector(s);
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const newId = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const clean = s => { if (s == null) return ""; const d = new DOMParser().parseFromString(String(s), "text/html"); return (d.body.textContent || "").replace(/\s+/g, " ").trim(); };
const domain = u => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };
let toastTimer, toastUndo = null;
// A short message at the bottom. With undo, it shows an Undo button for a few seconds.
function toast(msg, undo) {
  const t = $("#toast"); toastUndo = typeof undo === "function" ? undo : null;
  t.innerHTML = `<span>${esc(msg)}</span>${toastUndo ? `<button class="toast-undo" data-act="toast-undo">Undo</button>` : ""}`;
  t.hidden = false; t.classList.remove("pop"); void t.offsetWidth; t.classList.add("pop");
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; toastUndo = null; }, toastUndo ? 6000 : 3400);
}
// Screen readers: one short message per change (the page itself is not a live region, so a re-render isn't read out whole).
let announceTimer;
function announce(msg) { const a = $("#announce"); if (!a) return; a.textContent = ""; clearTimeout(announceTimer); announceTimer = setTimeout(() => { a.textContent = msg; }, 60); }
// A light tap of feedback for meaningful moments (Android; iPhone browsers don't allow it).
const haptic = (ms = 10) => { try { if (settings.get("haptics") !== "off" && navigator.vibrate) navigator.vibrate(ms); } catch {} };
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

// Amount shown for an ingredient line: scaled, then converted when the toggle is on.
function showQty(line, k) {
  const t = state.units;
  if (t === "metric" || t === "us") { const c = convertLine(line, k, t); if (c) return c; }
  return splitQty(line, k);
}
const showStep = text => (state.units === "metric" || state.units === "us") ? convertTemps(text, state.units) : text;

/* ===== State ===== */
const state = {
  items: new Map(), view: { name: "loading" }, q: "", tag: "", sort: "recent",
  cook: { id: null, scale: 1, ings: new Set(), steps: new Set() },
  confirm: null, bookMenu: false, addTab: "link", wake: null, wantWake: false,
  units: settings.get("units") || "", readAloud: settings.get("readAloud") === "1", draft: null, ai: false, locked: false, online: true, persisted: false, pendingUrl: ""
};
const recipes = () => [...state.items.values()].filter(i => i.kind === "recipe");
const books = () => [...state.items.values()].filter(i => i.kind === "book").sort((a, b) => a.name.localeCompare(b.name));
const sameSource = (a, b) => { const n = u => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "")).toLowerCase(); } catch { return ""; } }; const na = n(a); return !!na && na === n(b); };
const findBySource = (src, exceptId) => src ? recipes().find(r => r.id !== exceptId && sameSource(r.source, src)) : null;
const cookedText = r => { const c = r.cooked || []; if (!c.length) return ""; const last = new Date(c[c.length - 1]).toLocaleDateString(undefined, { month: "short", day: "numeric" }); return `Cooked ${c.length === 1 ? "once" : c.length + " times"} · last ${last}`; };
// Meal plan: one stored item per day ("plan-2026-10-26"), so two phones planning different days never collide.
const dayKey = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const planDay = key => state.items.get("plan-" + key) || { id: "plan-" + key, kind: "planday", date: key, entries: [] };
const savePlanDay = (key, entries) => { const cur = planDay(key); if (!entries.length && !state.items.has(cur.id)) return; if (!entries.length) return removeItem(cur.id); return save({ ...cur, entries }); };
const MEALS = ["Breakfast", "Lunch", "Dinner", "Snack"];
function weekStartOf(d, offsetWeeks = 0) {
  const startDay = settings.get("weekStart") === "mon" ? 1 : 0;
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - ((x.getDay() - startDay + 7) % 7) + offsetWeeks * 7);
  return x;
}
const grocery = () => state.items.get("grocery") || { id: "grocery", kind: "grocery", items: [] };
const saveGrocery = items => save({ ...grocery(), items });
const listCount = () => grocery().items.filter(i => !i.done).length;
// Pantry: what's at home. One stored item, like the grocery list.
const pantry = () => state.items.get("pantry") || { id: "pantry", kind: "pantry", items: [] };
const savePantry = items => save({ ...pantry(), items });
function addToPantry(texts) {
  const cur = pantry().items, add = [];
  for (const t of texts) {
    const name = itemOf(t).name || String(t).toLowerCase().trim();
    if (!name || cur.some(p => p.name === name) || add.some(p => p.name === name)) continue;
    add.push({ id: newId("pa"), name, added: Date.now() });
  }
  if (add.length) savePantry([...cur, ...add]);
  return add.length;
}
// Your aisles: items you moved, and the order you walk your store.
const aisleStore = () => state.items.get("aislemap") || { id: "aislemap", kind: "aislemap", map: {}, order: [] };
const aisleOrder = () => { const o = (aisleStore().order || []).filter(a => AISLES.includes(a)); return [...o, ...AISLES.filter(a => !o.includes(a))]; };
const aisleFor = (name, line = "") => (aisleStore().map || {})[name] || aisleOf(name, line);
// Blogs you follow.
const feedStore = () => state.items.get("feeds") || { id: "feeds", kind: "feeds", sites: [], seenAt: 0 };
const stars = (n, cls = "") => n ? `<span class="stars-sm${cls}" aria-label="${n} out of 5 stars">${"★".repeat(n)}<span class="off">${"★".repeat(5 - n)}</span></span>` : "";

/* ===== Storage on this device ===== */
const DB_NAME = "extract", STORE = "items", LS_KEY = "extract-v1";
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
  if (sync.info().signedIn) sync.markDirty(item.id);
  if (useLocal) { saveLocalAll(); return Promise.resolve(); }
  return idb("readwrite", s => s.put(JSON.parse(JSON.stringify(item)))).catch(() => toast("Couldn't save that change. Your phone may be out of space."));
}
function removeItem(id) {
  state.items.delete(id);
  if (sync.info().signedIn) sync.markDeleted(id);
  if (useLocal) { saveLocalAll(); return Promise.resolve(); }
  return idb("readwrite", s => s.delete(id)).catch(() => {});
}

// What sync needs from the app: read items, and store what arrives without re-queuing it.
const syncHooks = {
  allItems: () => [...state.items.values()],
  get: id => state.items.get(id),
  applyRemote: async item => { state.items.set(item.id, item); if (useLocal) saveLocalAll(); else await idb("readwrite", s => s.put(JSON.parse(JSON.stringify(item)))).catch(() => {}); },
  applyRemoteDelete: async id => { state.items.delete(id); if (useLocal) saveLocalAll(); else await idb("readwrite", s => s.delete(id)).catch(() => {}); },
  afterPull: () => { if (["library", "books", "book", "recipe", "plan", "list", "pantry", "feeds"].includes(state.view.name) && !document.querySelector(".scrim")) render(); }
};

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
  try { const s = await api("/api/status"); state.ai = !!s.ai; state.locked = !!s.locked; state.syncCfg = s.sync || null; state.online = true; }
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
const strip = r => { const o = JSON.parse(JSON.stringify(r)); delete o.id; delete o.createdAt; delete o.updatedAt; delete o.recipeIds; if (/^data:/.test(o.image || "")) delete o.image; delete o.fav; delete o.cooked; delete o.rating; delete o.log; delete o.links; return o; };
async function shareLinkFor(item) {
  const payload = sharePayloadFor(item);
  if (sync.info().signedIn) { try { const id = await sync.createShare(payload); if (id) return location.origin + "/#s=" + id; } catch {} }
  return location.origin + "/#r=" + await pack(payload);
}
function sharePayloadFor(item) {
  return item.kind === "book"
    ? { v: 1, kind: "book", book: { name: item.name, description: item.description || "" }, recipes: (item.recipeIds || []).map(i => state.items.get(i)).filter(Boolean).map(strip) }
    : { v: 1, kind: "recipe", recipe: strip(item) };
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
    tags: [].concat(node.recipeCategory || []).map(clean).filter(Boolean).slice(0, 4),
    image: [].concat(node.image || []).map(i => typeof i === "string" ? i : (i && i.url) || "").find(Boolean) || ""
  };
}
function normalize(r, url) {
  const arr = a => Array.isArray(a) ? a.map(x => String(x).trim()).filter(Boolean) : [];
  return {
    title: String(r.title || "").trim() || "Untitled recipe", source: String(url || r.source || "").trim(),
    servings: Number(r.servings) > 0 ? Math.round(Number(r.servings)) : null, yield: String(r.yield || "").trim(),
    prepTime: String(r.prepTime || "").trim(), cookTime: String(r.cookTime || "").trim(), totalTime: String(r.totalTime || "").trim(),
    ingredients: arr(r.ingredients), steps: arr(r.steps), notes: String(r.notes || "").trim(), tags: arr(r.tags).slice(0, 6),
    image: safeImg(r.image),
    nutrition: r.nutrition && typeof r.nutrition === "object" ? Object.fromEntries(Object.entries(r.nutrition).filter(([k, v]) => typeof v === "string" && v.length < 40).slice(0, 10)) : null
  };
}
// Photos are either an https address from the recipe site or a photo you added (a data: image).
function safeImg(u) { u = String(u || ""); if (/^data:image\/(jpeg|png|webp);base64,/.test(u)) return u; try { return new URL(u).protocol === "https:" ? u : ""; } catch { return ""; } }
const imgTag = (src, cls, alt = "") => src ? `<img class="${cls}" src="${esc(src)}" alt="${esc(alt)}" loading="lazy" decoding="async" referrerpolicy="no-referrer" onerror="this.remove()">` : "";
function setStatus(html, err) { const s = $("#x-status"); if (!s) return; s.className = "status" + (err ? " err" : ""); s.innerHTML = html; }
function setBusy(b) { document.querySelectorAll("[data-busy]").forEach(el => el.disabled = b); }
function findUrl(text) { const m = String(text || "").match(/https?:\/\/[^\s<>"']+/i); return m ? m[0].replace(/[),.;!?]+$/, "") : ""; }

async function fetchFromLink(raw) {
  const url = findUrl(raw) || (/^[\w-]+(\.[\w-]+)+\//.test(raw.trim()) ? "https://" + raw.trim() : "");
  if (!url) return setStatus("Paste a full recipe link, starting with https://", true);
  setStatus('<span class="spin"></span> Fetching the recipe…'); setBusy(true);
  try {
    const j = await api("/api/fetch?url=" + encodeURIComponent(url));
    const pn = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" }[j.platform] || "";
    const note = j.method === "social" ? `Read from the ${pn} ${j.platform === "youtube" ? "description" : "caption"}. Captions are often shorthand, so check the amounts and steps.`
      : j.method === "social-ai" ? `Claude read this from the ${pn} ${j.platform === "youtube" ? "description" : "caption"}. Check it over.`
      : j.method === "linked" ? `The ${pn} post linked to this recipe page, so it came from there.` : "";
    openDraft(normalize(j.recipe, j.recipe.source || url), null, j.method === "archive" ? j.archivedAt : "", note);
  } catch (e) {
    // Keep the link in the box, say plainly what went wrong, and offer every way forward.
    const kind = e.error === "offline" ? "You're offline, so the page can't be fetched right now."
      : e.error === "site_blocked" ? "That site turns readers away."
      : e.error === "no_recipe_in_post" || e.error === "no_recipe" || e.error === "no_data" ? "No recipe could be found there."
      : e.error === "bad_url" || e.error === "blocked_host" ? "That link can't be opened."
      : "The import didn't work this time.";
    state.failedUrl = url;
    setStatus(`<strong>${esc(kind)}</strong> ${esc(e.error === "offline" ? "Save the link and import it when you're back online." : e.message)}
      <span class="row fail-acts"><button class="btn sm" data-act="fetch-link">Try Again</button><button class="btn sm" data-act="pend-save">Save for Later</button>${e.error === "offline" ? "" : `<button class="btn sm" data-act="add-tab" data-t="paste">Paste the Text</button>`}<button class="btn sm ghost" data-act="manual-from-link">Type It In</button></span>`, true);
  } finally { setBusy(false); }
}
async function extractFromText(text, url) {
  const s = tryStructured(text);
  if (s && s.ingredients.length) { openDraft(normalize(s, url || s.source)); return; }
  if (!state.ai) {
    const p = parseRecipeText(text);
    if (p) { openDraft(normalize(p, url), null, "", "Read from the text you pasted. Check the amounts and steps came through right."); return; }
    return setStatus("Couldn't find a recipe in that text. It works best when the text has an Ingredients list and numbered steps. You can also Type it in.", true);
  }
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

const archiveDate = ts => { const m = String(ts).match(/^(\d{4})(\d{2})(\d{2})/); return m ? new Date(+m[1], +m[2] - 1, +m[3]).toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }) : "recently"; };

async function importMany(text, tag) {
  const urls = [...new Set((String(text).match(/https?:\/\/[^\s<>"']+/gi) || []).map(u => u.replace(/[),.;!?]+$/, "")))].slice(0, 100);
  const log = $("#import-log");
  if (!urls.length) { log.innerHTML = `<li class="status err">No links found. Paste links that start with https://</li>`; return; }
  setBusy(true); let ok = 0;
  log.innerHTML = urls.map((u, i) => `<li id="imp-${i}"><span class="spin"></span> <span class="u">${esc(domain(u) || u)}</span></li>`).join("");
  for (let i = 0; i < urls.length; i++) {
    const li = $("#imp-" + i); if (!li) break;
    const dup = findBySource(urls[i]);
    if (dup) { li.innerHTML = `✓ Already saved: <a href="#" data-act="open-recipe" data-id="${esc(dup.id)}">${esc(dup.title)}</a>`; continue; }
    try {
      const j = await api("/api/fetch?url=" + encodeURIComponent(urls[i]));
      const r = { ...normalize(j.recipe, j.recipe.source || urls[i]), kind: "recipe", id: newId("r") };
      const same = findBySource(r.source); // a different link to a recipe you already have
      if (same) { li.innerHTML = `✓ Already saved: <a href="#" data-act="open-recipe" data-id="${esc(same.id)}">${esc(same.title)}</a>`; continue; }
      if (tag) r.tags = [...new Set([...(r.tags || []), tag])];
      await save(r); ok++;
      li.innerHTML = `✓ <a href="#" data-act="open-recipe" data-id="${esc(r.id)}">${esc(r.title)}</a>`;
    } catch (e) { li.className = "status err"; li.innerHTML = `✕ ${esc(domain(urls[i]))}: ${esc(e.message)}`; }
  }
  setBusy(false); toast(`Imported ${ok} of ${urls.length} recipe${urls.length === 1 ? "" : "s"}`);
}

/* ===== Example ===== */
const EXAMPLE = {
  title: "Red Lentil Soup with Lemon", source: "", servings: 4, yield: "", prepTime: "10 min", cookTime: "30 min", totalTime: "40 min",
  ingredients: ["2 tbsp olive oil", "1 onion, diced", "2 carrots, diced", "3 cloves garlic, minced", "1½ tsp ground cumin", "½ tsp smoked paprika", "1 cup red lentils, rinsed", "4 cups vegetable broth", "1 can (14 oz) diced tomatoes", "Juice of 1 lemon", "Salt and pepper to taste", "## To serve", "Plain yogurt", "Chopped parsley"],
  steps: ["Warm the olive oil in a large pot over medium heat. Add the onion and carrots and cook until soft, about 8 minutes.", "Stir in the garlic, cumin and paprika and cook for 1 minute until fragrant.", "Add the lentils, broth and tomatoes. Bring to a boil, then simmer partly covered for 20 minutes, until the lentils fall apart.", "Blend about half the soup for a creamier texture. Stir in the lemon juice and season with salt and pepper.", "Serve topped with a spoonful of yogurt and parsley."],
  notes: "Example recipe. Edit it or delete it once you've added your own.", tags: ["Example", "Soup", "Vegetarian"]
};

/* ===== Navigation ===== */
function go(view) { state.view = view; state.confirm = null; state.focusQ = false; state.bookMenu = false; state.moreMenu = false; render(); window.scrollTo(0, 0); }
function openDraft(r, id, archivedAt, note) { state.draft = { ...r, id: id || null }; state.draftArchived = archivedAt || ""; state.draftNote = note || ""; go({ name: "edit" }); }

/* ===== Render ===== */
let lastView = "";
function render() {
  const v = state.view.name;
  const lc = listCount(), badge = $("#list-badge"); if (badge) { badge.textContent = lc; badge.hidden = !lc; badge.setAttribute("aria-label", `${lc} to get`); }
  ["library", "plan", "list", "pantry", "more"].forEach(n => { const b = $("#nav-" + n); if (b) b.removeAttribute("aria-current"); });
  const cur = { plan: "plan", list: "list", pantry: "pantry", cook: "library", library: "library", recipe: "library", edit: state.draft?.id ? "library" : "", shared: "library",
    more: "more", help: "more", feeds: "more", books: "more", book: "more", settings: "more", ironwood: "more", reels: "more" }[v];
  if (cur) $("#nav-" + cur).setAttribute("aria-current", "page");
  $("#nav-add").setAttribute("aria-current", v === "add" || v === "edit" ? "page" : "false");
  document.body.classList.toggle("cooking", v === "cook");
  document.body.dataset.view = v;
  const fn = { plan: vPlan, list: vList, pantry: vPantry, help: vHelp, feeds: vFeeds, cook: vCook, library: vLibrary, recipe: vRecipe, edit: vEdit, add: vAdd, books: vBooks, book: vBook, shared: vShared, settings: vSettings, more: vMore, message: vMessage, ironwood: vIronwood, reels: vReels }[v];
  $("#main").innerHTML = fn ? fn() : "";
  if (v !== lastView) { lastView = v; const h = v === "cook" ? $("#cm-step") : $("#main h1"); if (h) announce(v === "cook" ? `Cooking. ${$(".cm-count")?.textContent || ""}` : h.textContent.trim()); }
  if (v === "add") wireAdd();
  if (v === "feeds" || v === "more") refreshFeeds();
  if (v === "library" && state.focusQ) { const s = $("#q"); if (s) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); } }
}
const tagsOf = r => (r.tags || []).map(t => `<span class="tag">${esc(t)}</span>`).join("");
const timeOf = r => r.totalTime || [r.prepTime, r.cookTime].filter(Boolean).join(" + ");
// A recipe card: the photo carries the color; without one, the title's first letter stands in, like a cookbook plate.
function rcard(r, act = "open-recipe") {
  const meta = [timeOf(r), r.servings ? `Serves ${r.servings}` : r.yield].filter(Boolean).map(esc);
  return `<button class="rcard" data-act="${act}" data-id="${esc(r.id)}" data-press="recipe">
    ${r.image ? imgTag(r.image, "rimg") : `<span class="rimg plate" aria-hidden="true">${esc((r.title || "?").trim().charAt(0).toUpperCase())}</span>`}
    <span class="rc-b"><span class="rc-t">${esc(r.title)}</span>
    <span class="rc-m">${r.fav ? `<span class="heart" aria-label="Favorite">♥</span>` : ""}${r.rating ? stars(r.rating) : ""}${meta.map(x => `<span>${x}</span>`).join("")}</span></span></button>`;
}

const newPostCount = () => { const fs = feedStore(), c = feedCache(); return fs.sites.length && c ? c.items.filter(i => i.date > (fs.seenAt || 0)).length : 0; };
// What's next on the plan: today and the coming days, soonest first.
function upNext(n = 3) {
  const out = [], now = new Date(), order = m => MEALS.indexOf(m) < 0 ? 9 : MEALS.indexOf(m);
  for (let i = 0; i < 7 && out.length < n; i++) {
    const d = new Date(now); d.setDate(now.getDate() + i);
    [...planDay(dayKey(d)).entries].sort((a, b) => order(a.meal) - order(b.meal)).forEach(e => out.push({ e, d, i }));
  }
  return out.slice(0, n);
}
const dayWord = (d, i) => i === 0 ? "Today" : i === 1 ? "Tomorrow" : d.toLocaleDateString(undefined, { weekday: "long" });
function homeHtml(all) {
  const next = upNext(), lc = listCount(), pi = pantry().items;
  const makeable = pi.length ? all.map(r => canMake(r, pi)).filter(m => m.total && m.missing.length === 0).length : 0;
  const recent = [...all].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 8);
  const np = newPostCount(), pend = pendingLinks().length;
  // Searching is a field; importing is a button. They used to be two look-alike boxes.
  return `<section class="home">
    <div class="import-row" id="home-import">
      <button class="btn primary" data-act="paste-import" data-busy>${ICON.clip}Paste Recipe Link</button>
      <button class="btn" data-act="nav" data-v="add">Other Ways</button>
    </div>
    ${pend ? `<button class="nudge" data-act="nav" data-v="add"><span><strong>${pend} link${pend === 1 ? "" : "s"} waiting to import</strong><span>Tap to try again</span></span><span class="chev" aria-hidden="true">›</span></button>` : ""}
    <div class="glance">
      <div class="next" id="up-next">
        <h2 class="h-small">Up next</h2>
        ${next.length ? `<ul>${next.map(({ e, d, i }) => { const r = e.recipeId ? state.items.get(e.recipeId) : null;
          return `<li><button data-act="${r ? "open-recipe" : "nav"}" ${r ? `data-id="${esc(r.id)}"` : `data-v="plan"`}><span class="when">${esc(dayWord(d, i))}${e.meal ? `, ${esc(e.meal.toLowerCase())}` : ""}</span><span class="what">${esc(r ? r.title : e.recipeId ? (e.title || "Deleted recipe") : e.note || e.title || "Meal")}</span></button></li>`; }).join("")}</ul>`
          : `<p class="hint">Nothing planned yet. <a href="#" data-act="nav" data-v="plan">Plan a few meals</a></p>`}
      </div>
      <div class="quick">
        <button data-act="nav" data-v="list" id="home-groceries"><strong>${lc ? `${lc} to get` : "Grocery list"}</strong><span>${lc ? "On your grocery list" : "Nothing on it yet"}</span></button>
        <button data-act="nav" data-v="pantry" id="home-pantry"><strong>${pi.length ? (makeable ? `You can make ${makeable}` : "What can I make?") : "Pantry"}</strong><span>${pi.length ? "With what you have" : "Add what's at home"}</span></button>
        ${np ? `<button data-act="nav" data-v="feeds"><strong>${np} new</strong><span>From blogs you follow</span></button>` : ""}
      </div>
    </div>
    ${recent.length >= 4 ? `<h2 class="h-small">Recently saved</h2><div class="shelf">${recent.map(r => `<button class="spine" data-act="open-recipe" data-id="${esc(r.id)}" data-press="recipe">${r.image ? imgTag(r.image, "sp-img") : `<span class="sp-img plate" aria-hidden="true">${esc(r.title.trim().charAt(0).toUpperCase())}</span>`}<span>${esc(r.title)}</span></button>`).join("")}</div>` : ""}
    ${collectionsShelf()}
  </section>`;
}
// Collections, one tap from Recipes (they also stay under More).
function collectionsShelf() {
  const bs = books();
  const head = `<div class="row shelf-h"><h2 class="h-small">Collections</h2><span class="spacer"></span><button class="btn sm" data-act="nav" data-v="books" id="home-collections">${bs.length ? "See All" : "New Collection"}</button></div>`;
  if (!bs.length) return `<div class="home-books">${head}<p class="hint">Group recipes for a holiday, a person or a week of dinners.</p></div>`;
  return `<div class="home-books">${head}<div class="shelf">${bs.map(b => { const rs = (b.recipeIds || []).map(i => state.items.get(i)).filter(Boolean); const pic = rs.find(r => r.image);
    return `<button class="spine" data-act="open-book" data-id="${esc(b.id)}">${pic ? imgTag(pic.image, "sp-img") : `<span class="sp-img plate" aria-hidden="true">${esc(b.name.trim().charAt(0).toUpperCase())}</span>`}<span>${esc(b.name)}</span><small class="spine-n">${rs.length} recipe${rs.length === 1 ? "" : "s"}</small></button>`; }).join("")}</div></div>`;
}
function vLibrary() {
  const all = recipes();
  if (!all.length) return `<section class="home">
    <h1 class="display">Your recipes,<br>without the clutter.</h1>
    <p class="lede">Paste a link from a recipe site, Instagram, TikTok or YouTube. Extract keeps the ingredients and instructions and leaves the ads and life story behind.</p>
    <form class="import" data-form="quick-import" id="home-import" aria-label="Import a recipe">
      <input type="url" id="home-url" placeholder="Paste a recipe link" inputmode="url" autocomplete="off" aria-label="Recipe link">
      <button class="btn primary" data-busy>Import Link</button>
    </form>
    <span class="status" id="home-status"></span>
    <div class="row empty-more"><button class="btn" data-act="nav" data-v="add">Other ways to add</button><button class="btn ghost" data-act="example">Try an example recipe</button></div>
    <p class="hint empty-reels">Or start with <a href="#" data-act="nav" data-v="reels">327 recipes from Instagram reels</a>, added in one tap.</p>
  </section>`;
  const counts = {}; all.forEach(r => (r.tags || []).forEach(t => counts[t] = (counts[t] || 0) + 1));
  const tags = Object.keys(counts).sort((a, b) => counts[b] - counts[a] || a.localeCompare(b));
  const q = state.q.toLowerCase();
  const favs = all.filter(r => r.fav).length;
  const filtering = !!(q || state.tag || state.fav);
  const list = all.filter(r => (!state.fav || r.fav) && (!state.tag || (r.tags || []).includes(state.tag)) &&
    (!q || (r.title + " " + (r.ingredients || []).join(" ") + " " + (r.tags || []).join(" ")).toLowerCase().includes(q)))
    .sort(state.sort === "az" ? (a, b) => a.title.localeCompare(b.title)
      : state.sort === "rated" ? (a, b) => (b.rating || 0) - (a.rating || 0) || a.title.localeCompare(b.title)
      : state.sort === "cooked" ? (a, b) => ((b.cooked || []).length - (a.cooked || []).length) || ((b.cooked || []).slice(-1)[0] || 0) - ((a.cooked || []).slice(-1)[0] || 0)
      : (a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
  return `<div class="search" role="search"><input type="search" id="q" placeholder="Search recipes and ingredients" value="${esc(state.q)}" aria-label="Search recipes"></div>
    ${filtering ? "" : homeHtml(all)}
    <section class="collection" id="all-recipes">
      <div class="row head"><h2>${filtering ? `${list.length} recipe${list.length === 1 ? "" : "s"}` : "All recipes"}</h2><span class="spacer"></span>
        ${list.length ? `<button class="btn sm" data-act="surprise" id="surprise">Surprise Me</button>` : ""}
        <label class="sort"><span class="sr">Sort</span><select id="sort" aria-label="Sort recipes"><option value="recent"${state.sort === "recent" ? " selected" : ""}>Recent</option><option value="az"${state.sort === "az" ? " selected" : ""}>A to Z</option><option value="cooked"${state.sort === "cooked" ? " selected" : ""}>Most cooked</option><option value="rated"${state.sort === "rated" ? " selected" : ""}>Top rated</option></select></label></div>
      ${tags.length || favs ? `<div class="chips scroll" role="group" aria-label="Filter recipes">
        <button class="chip" data-act="tag" data-tag="" aria-pressed="${!state.tag && !state.fav}">All</button>
        ${favs ? `<button class="chip" data-act="fav-filter" aria-pressed="${!!state.fav}">Favorites <span class="n">${favs}</span></button>` : ""}
        ${tags.map(t => `<button class="chip" data-act="tag" data-tag="${esc(t)}" aria-pressed="${state.tag === t}">${esc(t)} <span class="n">${counts[t]}</span></button>`).join("")}</div>` : ""}
      ${list.length ? `<div class="cards">${list.map(r => rcard(r)).join("")}</div>` : `<div class="empty"><strong>Nothing matches “${esc(state.q || state.tag)}”</strong><span>Try another word, or clear the filter.</span><button class="btn" data-act="clear-filter">Show All Recipes</button></div>`}
    </section>`;
}

/* ===== More ===== */
function vMore() {
  const nb = books().length, fs = feedStore(), np = newPostCount();
  const row = (v, title, sub, id = "") => `<button class="mrow" data-act="nav" data-v="${v}"${id ? ` id="${id}"` : ""}><span><strong>${title}</strong><span>${sub}</span></span><span class="chev" aria-hidden="true">›</span></button>`;
  return `<h1>More</h1>
    <div class="mlist">
      ${row("books", "Collections", nb ? `${nb} collection${nb === 1 ? "" : "s"}` : "Group recipes for a holiday, a person or a week", "more-collections")}
      ${row("feeds", "From Blogs", fs.sites.length ? (np ? `${np} new post${np === 1 ? "" : "s"}` : `Following ${fs.sites.length}`) : "Follow recipe blogs you like", "more-feeds")}
      ${row("reels", "Recipes from Reels", recipes().some(r => r.pack === "reels") ? "Added. Find them in the From Reels collection" : "327 recipes from Instagram reels, added in one tap", "more-reels")}
      ${row("ironwood", "Ironwood", "Bring in its meal prep and shopping list, or send it recipes", "more-ironwood")}
      ${row("help", "Help and Tour", "How-tos, what Extract can't do yet, and the tour", "more-help")}
      ${row("settings", "Settings", "Appearance, text size, timers, sync and backups", "more-settings")}
    </div>
    <p class="hint foot">Extract is free and has no ads. Your recipes stay on your devices unless you share them.</p>`;
}

// Step text with each time ("25 minutes") turned into a timer button.
// plain: cook mode, where the big Start Timer button below the step does this job.
function stepHtml(text, label, plain) {
  let out = "", at = 0;
  for (const t of findTimes(text)) {
    out += esc(text.slice(at, t.start));
    if (plain) { out += `<strong class="time-txt">${esc(t.text)}</strong>`; at = t.end; continue; }
    out += `<button class="time" data-act="timer-start" data-secs="${t.secs}" data-label="${esc(label)}" aria-label="Start a ${esc(t.text)} timer">${esc(t.text)}</button>`;
    at = t.end;
  }
  return out + esc(text.slice(at));
}
const NUT_LABELS = [["calories", "Calories"], ["protein", "Protein"], ["carbs", "Carbs"], ["fat", "Fat"], ["saturatedFat", "Saturated fat"], ["fiber", "Fiber"], ["sugar", "Sugar"], ["sodium", "Sodium"]];
function nutritionHtml(r) {
  const n = r.nutrition; if (!n) return "";
  const rows = NUT_LABELS.filter(([k]) => n[k]);
  if (!rows.length) return "";
  return `<details class="nutrition"><summary><h3>Nutrition per serving</h3></summary>
    <dl>${rows.map(([k, l]) => `<div><dt>${l}</dt><dd>${esc(n[k])}</dd></div>`).join("")}</dl>
    <p class="hint">${n.servingSize ? `Serving: ${esc(n.servingSize)}. ` : ""}As listed by the recipe's site, for the original servings.</p></details>`;
}
function resetCook(id) { if (state.cook.id !== id) state.cook = { id, scale: 1, ings: new Set(), steps: new Set() }; }
function cookBody(r, actions = "", after = "", head = "") {
  const c = state.cook, base = r.servings || null, k = c.scale;
  const own = state.items.get(r.id) === r, others = own ? recipes() : [];
  let i = 0;
  // Amounts hang in their own column, like a printed cookbook, so they're easy to find mid-cook.
  const ings = (r.ingredients || []).map(line => {
    if (line.startsWith("## ")) return `<li class="sec">${esc(line.slice(3))}</li>`;
    const idx = i++; const { q, rest } = showQty(line, k); const done = c.ings.has(idx);
    const lk = own ? linkedRecipeFor(line, others, r.id) : null;
    return `<li class="ing${done ? " done" : ""}"><label><input type="checkbox" data-act="ing" data-i="${idx}" ${done ? "checked" : ""} aria-label="${esc(line)}"><span class="q">${esc(q)}</span><span class="it">${esc(rest)}</span></label>${lk ? `<button class="linkrec" data-act="open-recipe" data-id="${esc(lk.id)}" aria-label="Open your recipe for ${esc(lk.title)}">Recipe</button>` : ""}</li>`;
  }).join("");
  let n = 0;
  const steps = (r.steps || []).map((s, si) => {
    if (s.startsWith("## ")) return `<li class="sec">${esc(s.slice(3))}</li>`;
    n++; const done = c.steps.has(si);
    return `<li class="step${done ? " done" : ""}" data-act="step" data-i="${si}" role="button" tabindex="0" aria-pressed="${done}" aria-label="Step ${n}${done ? ", done" : ""}"><span class="num" aria-hidden="true">${n}</span><span class="st">${stepHtml(showStep(s), `${r.title}, step ${n}`)}</span></li>`;
  }).join("");
  const facts = [];
  if (base) facts.push(`<span class="fact"><span class="k">Serves</span><span class="scaler"><button data-act="scale" data-d="-1" aria-label="Fewer servings">−</button><span class="v" aria-live="polite">${fmtNum(base * k)}</span><button data-act="scale" data-d="1" aria-label="More servings">+</button></span></span>`);
  else {
    if (r.yield) facts.push(`<span class="fact"><span class="k">Makes</span><span class="v">${esc(r.yield)}</span></span>`);
    facts.push(`<span class="fact"><span class="k">Batch</span><span class="scaler"><button data-act="mult" data-d="-1" aria-label="Smaller batch">−</button><span class="v" aria-live="polite">×${fmtNum(k)}</span><button data-act="mult" data-d="1" aria-label="Bigger batch">+</button></span></span>`);
  }
  [["Prep", r.prepTime], ["Cook", r.cookTime], ["Total", r.totalTime]].forEach(([a, b]) => b && facts.push(`<span class="fact"><span class="k">${a}</span><span class="v">${esc(b)}</span></span>`));
  const other = systemOf(r.ingredients || []) === "metric" ? "us" : "metric";
  const conv = state.units === other;
  return `${r.image ? `<div class="hero-wrap">${imgTag(r.image, "hero", r.title)}</div>` : ""}<header class="rhead">
      ${(r.tags || []).length ? `<p class="kicker">${(r.tags || []).map(esc).join(", ")}</p>` : ""}
      <h1 class="rtitle">${esc(r.title)}</h1>
      ${r.source ? `<a class="src" href="${esc(r.source)}" target="_blank" rel="noopener">From ${esc(domain(r.source) || r.source)}</a>` : ""}
      ${head}
      <div class="facts">${facts.join("")}</div>
      ${actions}
    </header>
    <div class="cook">
      <section class="ings-col" aria-labelledby="h-ings"><div class="row sect-h"><h2 id="h-ings">Ingredients</h2><span class="spacer"></span>
        <button class="btn sm" data-act="units" data-v="${conv ? "" : other}" aria-pressed="${conv}">${conv ? "As written" : other === "metric" ? "Metric" : "US cups"}</button>
        ${c.ings.size ? `<button class="btn sm ghost" data-act="clear-checks">Uncheck</button>` : ""}</div>
        <ul class="ings">${ings || `<li class="hint">No ingredients listed. Edit the recipe to add them.</li>`}</ul></section>
      <section class="steps-col" aria-labelledby="h-steps"><div class="row sect-h"><h2 id="h-steps">Instructions</h2><span class="spacer"></span>${"wakeLock" in navigator ? `<button class="btn sm" data-act="wake" aria-pressed="${!!state.wake}">${state.wake ? "Screen stays on" : "Keep Screen On"}</button>` : ""}</div>
        <ol class="steps">${steps || `<li class="hint">No instructions listed. Edit the recipe to add them.</li>`}</ol>
      ${r.notes ? `<h2 class="sect-h2">Notes</h2><div class="notes">${esc(r.notes)}</div>` : ""}
      ${nutritionHtml(r)}${after}</section>
    </div>`;
}

// "Uses": recipes this one links to (picked by you, or named in its ingredients). "Used in": the other way round.
function usesOf(r) {
  const ids = new Set((r.links || []).filter(id => state.items.has(id)));
  (r.ingredients || []).forEach(l => { const x = !l.startsWith("## ") && linkedRecipeFor(l, recipes(), r.id); if (x) ids.add(x.id); });
  return [...ids].map(id => state.items.get(id));
}
const usedIn = r => recipes().filter(x => x.id !== r.id && usesOf(x).some(u => u.id === r.id));
function linksHtml(r) {
  const uses = usesOf(r), used = usedIn(r);
  const a = x => `<a href="#" data-act="open-recipe" data-id="${esc(x.id)}">${esc(x.title)}</a>`;
  // Only shown when there are links; Link Other Recipes lives in More Actions.
  if (!uses.length && !used.length) return "";
  return `<div class="links-row" id="links">${uses.length ? `<span><strong>Uses</strong> ${uses.map(a).join(", ")}</span>` : ""}${used.length ? `<span><strong>Used in</strong> ${used.map(a).join(", ")}</span>` : ""}
    ${uses.length ? `<button class="btn sm" data-act="link-pick" data-id="${esc(r.id)}">Edit Links</button>` : ""}</div>`;
}
function openLinkPicker(id, q = "") {
  const r = state.items.get(id); if (!r) return;
  const mine = new Set(r.links || []);
  const list = recipes().filter(x => x.id !== id && (!q || x.title.toLowerCase().includes(q.toLowerCase()))).sort((a, b) => a.title.localeCompare(b.title));
  state.linkFor = id;
  modal(`<h2>Link recipes to “${esc(r.title)}”</h2><p class="hint">For a sauce, dough, or side that's its own recipe. Linked recipes show on this page, and their ingredients can go on your list with it. Recipes named in the ingredients link by themselves.</p>
    <input type="search" id="lk-q" placeholder="Search your recipes" value="${esc(q)}" aria-label="Search your recipes" autocomplete="off">
    <div class="list pick-list">${list.length ? list.map(x => `<label class="check"><input type="checkbox" class="lk" value="${esc(x.id)}" ${mine.has(x.id) ? "checked" : ""}> ${esc(x.title)}</label>`).join("") : `<p class="hint" style="padding:12px 14px">No other recipes${q ? " match" : " yet"}.</p>`}</div>
    <div class="row"><button class="btn primary" data-act="link-save">Save Links</button><button class="btn" data-act="close-modal">Cancel</button></div>`);
  const qi = $("#lk-q"); if (qi && q) { qi.focus(); qi.setSelectionRange(q.length, q.length); }
}

const ICON = {
  cart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5.5 8h13l-1.2 11a1.5 1.5 0 0 1-1.5 1.3H8.2a1.5 1.5 0 0 1-1.5-1.3z"/><path d="M9 8V6.5a3 3 0 0 1 6 0V8"/></svg>`,
  plan: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4"/></svg>`,
  more: `<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="5.5" cy="12" r="1.3"/><circle cx="12" cy="12" r="1.3"/><circle cx="18.5" cy="12" r="1.3"/></svg>`,
  share: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5"/><path d="M5 12v6.5A1.5 1.5 0 0 0 6.5 20h11a1.5 1.5 0 0 0 1.5-1.5V12"/></svg>`,
  heart: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20z"/></svg>`,
  pot: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 10h16v6.5A3.5 3.5 0 0 1 16.5 20h-9A3.5 3.5 0 0 1 4 16.5z"/><path d="M2.5 10h19M9 6.5V5M12 6.5V4M15 6.5V5"/></svg>`,
  clip: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6" y="4.5" width="12" height="16" rx="2"/><path d="M9.5 4.5V3.8A1.3 1.3 0 0 1 10.8 2.5h2.4a1.3 1.3 0 0 1 1.3 1.3v.7"/><path d="M9.5 11h5M9.5 14.5h5"/></svg>`,
  list: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 6.5h11M9 12h11M9 17.5h11"/><circle cx="4.8" cy="6.5" r="1.1"/><circle cx="4.8" cy="12" r="1.1"/><circle cx="4.8" cy="17.5" r="1.1"/></svg>`,
  speak: `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>`
};
function vRecipe() {
  const r = state.items.get(state.view.id);
  if (!r) return `<button class="back" data-act="nav" data-v="library">‹ Recipes</button><div class="empty"><strong>This recipe was deleted</strong><button class="btn" data-act="nav" data-v="library">Back to Recipes</button></div>`;
  resetCook(r.id);
  const inBooks = books().filter(b => (b.recipeIds || []).includes(r.id));
  const fromBook = state.view.from === "book";
  const canCook = (r.steps || []).some(x => !x.startsWith("## "));
  const head = `<div class="rtools">
      <button class="icon-btn fav-btn" data-act="fav" data-id="${esc(r.id)}" aria-pressed="${!!r.fav}" aria-label="${r.fav ? "Remove from favorites" : "Add to favorites"}">${ICON.heart}</button>
      <button class="icon-btn" data-act="share" data-id="${esc(r.id)}" aria-label="Share recipe">${ICON.share}</button>
      <div class="stars" role="group" aria-label="Your rating">${[1, 2, 3, 4, 5].map(n => `<button data-act="rate" data-id="${esc(r.id)}" data-v="${n}" aria-pressed="${(r.rating || 0) >= n}" aria-label="Rate ${n} star${n === 1 ? "" : "s"}${r.rating === n ? " (tap again to clear)" : ""}">★</button>`).join("")}</div>
    </div>`;
  // Recipe actions sit with the recipe, named for what they do; the tabs at the bottom stay for getting around.
  const actions = `<div class="ractions" role="group" aria-label="Recipe actions">
      <button class="btn sm" data-act="list-pick" data-id="${esc(r.id)}">${ICON.cart}Add to List</button>
      <button class="btn sm" data-act="plan-recipe" data-id="${esc(r.id)}">${ICON.plan}Add to Plan</button>
      <button class="btn sm icon-only" data-act="more" data-id="${esc(r.id)}" id="recipe-more" aria-label="More actions: edit, collection, links, share, print, delete" title="More actions">${ICON.more}</button>
    </div>
    ${linksHtml(r)}
      ${inBooks.length || cookedText(r) ? `<p class="hint">${inBooks.length ? `In ${inBooks.map(b => `<a href="#" data-act="open-book" data-id="${esc(b.id)}">${esc(b.name)}</a>`).join(", ")}` : ""}${inBooks.length && cookedText(r) ? ". " : ""}${esc(cookedText(r))}</p>` : ""}`;
  const log = [...(r.log || [])].sort((a, b) => b.at - a.at);
  const logHtml = `<section class="cook-log" id="cook-log"><div class="row sect-h"><h2>Cooking log</h2><span class="spacer"></span><button class="btn sm" data-act="cooked" data-id="${esc(r.id)}">Log a Cook</button></div>
    ${log.length ? `<ul class="log">${log.map(e => `<li><div class="row"><strong>${esc(new Date(e.at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }))}</strong>${stars(e.rating)}<span class="spacer"></span><button class="btn sm ghost" data-act="log-del" data-id="${esc(r.id)}" data-e="${esc(e.id)}" aria-label="Delete this entry">Delete</button></div>${e.note ? `<p>${esc(e.note)}</p>` : ""}</li>`).join("")}</ul>`
      : `<p class="hint">Each time you make it, note what you changed or want to try next time.</p>`}</section>`;
  const surprise = state.view.surprise ? `<div class="notice row"><span>A surprise pick. How about this one?</span><span class="spacer"></span><button class="btn sm" data-act="surprise">Another</button><button class="btn sm" data-act="plan-recipe" data-id="${esc(r.id)}">Add to Plan</button></div>` : "";
  // Start Cooking stays in thumb reach, docked on the tab bar as one bottom panel.
  const bar = `<div class="rbar">
      ${canCook ? `<button class="btn primary" data-act="cook-start" data-id="${esc(r.id)}">${ICON.pot}Start Cooking</button>` : `<button class="btn primary" data-act="edit" data-id="${esc(r.id)}">Edit Recipe</button>`}
    </div>`;
  return `<button class="back" data-act="${fromBook ? "back-book" : "nav"}" data-v="library">‹ ${fromBook ? "Collection" : "Recipes"}</button>
    ${surprise}<article class="page">${cookBody(r, actions, logHtml, head)}</article>${bar}`;
}
// More actions for a recipe, as a sheet from the bottom.
function openRecipeSheet(id) {
  const r = state.items.get(id); if (!r) return;
  const inBooks = books().filter(b => (b.recipeIds || []).includes(r.id)).length;
  modal(`<h2 class="sheet-t">${esc(r.title)}</h2><div class="sheet-list">
    <button class="mitem" data-act="edit" data-id="${esc(id)}">Edit Recipe</button>
    <button class="mitem" data-act="book-menu" data-id="${esc(id)}">Add to Collection${inBooks ? ` <span class="hint">In ${inBooks}</span>` : ""}</button>
    <button class="mitem" data-act="link-pick" data-id="${esc(id)}">Link Other Recipes</button>
    <button class="mitem" data-act="cooked" data-id="${esc(id)}">Log a Cook</button>
    <button class="mitem" data-act="share" data-id="${esc(id)}">Share</button>
    <button class="mitem" data-act="iw-send" data-id="${esc(id)}">Send to Ironwood <span class="hint">Copies it for From a post</span></button>
    <button class="mitem" data-act="print">Print</button>
    <button class="mitem danger" data-act="delete-recipe" data-id="${esc(id)}">Delete Recipe</button></div>
    <button class="btn" data-act="close-modal">Cancel</button>`, true);
}
// Long-press a recipe card: the same actions, plus cooking and planning.
function openCardSheet(id) {
  const r = state.items.get(id); if (!r) return;
  haptic(8);
  modal(`<h2 class="sheet-t">${esc(r.title)}</h2><div class="sheet-list">
    <button class="mitem" data-act="open-recipe" data-id="${esc(id)}">Open</button>
    ${(r.steps || []).length ? `<button class="mitem" data-act="cook-start" data-id="${esc(id)}">Start Cooking</button>` : ""}
    <button class="mitem" data-act="plan-recipe" data-id="${esc(id)}">Add to Plan</button>
    <button class="mitem" data-act="list-pick" data-id="${esc(id)}">Add to Grocery List</button>
    <button class="mitem" data-act="fav" data-id="${esc(id)}">${r.fav ? "Remove from Favorites" : "Add to Favorites"}</button>
    <button class="mitem" data-act="book-menu" data-id="${esc(id)}">Add to Collection</button>
    ${state.view.name === "book" ? `<button class="mitem" data-act="book-remove" data-book="${esc(state.view.id)}" data-recipe="${esc(id)}">Remove from This Collection</button>` : ""}
    <button class="mitem danger" data-act="delete-recipe" data-id="${esc(id)}">Delete Recipe</button></div>
    <button class="btn" data-act="close-modal">Cancel</button>`, true);
}
function openCollectionPick(id) {
  const bs = books();
  modal(`<h2>Add to Collection</h2>
    ${bs.length ? `<div class="list">${bs.map(b => `<label class="check"><input type="checkbox" data-act="book-toggle" data-book="${esc(b.id)}" data-recipe="${esc(id)}" ${(b.recipeIds || []).includes(id) ? "checked" : ""}> ${esc(b.name)}</label>`).join("")}</div>` : `<p class="hint">No collections yet. Name one below, like Weeknight Dinners or Grandma's Baking.</p>`}
    <form class="row" data-form="quick-book" data-recipe="${esc(id)}"><input type="text" id="qb-name" placeholder="New collection name" aria-label="New collection name" style="flex:1;width:auto"><button class="btn primary">Create</button></form>
    <button class="btn" data-act="close-modal">Done</button>`, true);
}
// Delete with Undo instead of a confirm step.
function deleteRecipeUndoable(id) {
  const r = state.items.get(id); if (!r) return;
  const memberOf = books().filter(b => (b.recipeIds || []).includes(id)).map(b => b.id);
  books().forEach(b => { if (memberOf.includes(b.id)) save({ ...b, recipeIds: b.recipeIds.filter(x => x !== id) }); });
  removeItem(id); closeModal();
  if (state.view.name === "recipe" && state.view.id === id) go({ name: "library" }); else render();
  toast(`Deleted “${r.title}”`, () => {
    save(r); memberOf.forEach(bid => { const b = state.items.get(bid); if (b && !(b.recipeIds || []).includes(id)) save({ ...b, recipeIds: [...(b.recipeIds || []), id] }); });
    render(); toast("Recipe restored");
  });
}

function cookSteps(r) {
  const out = []; let section = "";
  (r.steps || []).forEach(s => { if (s.startsWith("## ")) section = s.slice(3); else out.push({ text: s, section }); });
  return out;
}
function vCook() {
  const r = state.items.get(state.view.id);
  if (!r) return vRecipe();
  resetCook(r.id);
  const steps = cookSteps(r), i = Math.min(state.view.step || 0, steps.length - 1), st = steps[i], k = state.cook.scale;
  const last = i === steps.length - 1;
  const uses = ingredientsForStep(st.text, r.ingredients || []);
  const ingRow = line => { const { q, rest } = showQty(line, k); return `<li><span class="q">${esc(q)}</span><span class="it">${esc(rest)}</span></li>`; };
  const allList = `<ul class="cm-ings">${(r.ingredients || []).map(l => l.startsWith("## ") ? `<li class="sec">${esc(l.slice(3))}</li>` : ingRow(l)).join("")}</ul>`;
  const times = findTimes(st.text);
  const size = +(settings.get("cookSize") || 1);
  return `<div class="cook-mode size-${size}${state.view.showAll ? " show-all" : ""}" id="cook-mode">
    <div class="cm-top">
      <button class="btn ghost" data-act="cook-exit">Done</button>
      <span class="cm-count" aria-live="polite">Step ${i + 1} of ${steps.length}</span>
      <span class="cm-size" role="group" aria-label="Text size"><button class="btn ghost" data-act="cook-size" data-d="-1" aria-label="Smaller text" ${size <= 0 ? "disabled" : ""}>A−</button><button class="btn ghost" data-act="cook-size" data-d="1" aria-label="Bigger text" ${size >= 3 ? "disabled" : ""}>A+</button></span>
    </div>
    <div class="cm-bar" aria-hidden="true">${steps.map((_, j) => `<span class="${j < i ? "past" : j === i ? "now" : ""}"></span>`).join("")}</div>
    <div class="cm-body">
      <div class="cm-main${state.view.dir > 0 ? " in-next" : state.view.dir < 0 ? " in-prev" : ""}">
        <p class="cm-title">${esc(r.title)}${st.section ? ` <span class="cm-sec">${esc(st.section)}</span>` : ""}</p>
        <p class="cm-step" id="cm-step">${stepHtml(showStep(st.text), `${r.title}, step ${i + 1}`, true)}</p>
        ${times.length ? `<div class="cm-timers">${times.map(t => `<button class="btn timer-start" data-act="timer-start" data-secs="${t.secs}" data-label="${esc(r.title)}, step ${i + 1}">Start Timer <span>${esc(fmtClock(t.secs))}</span></button>`).join("")}</div>` : ""}
        ${uses.length ? `<div class="cm-uses"><h2 class="h-small">For this step</h2><ul class="cm-ings">${uses.map(u => ingRow(u.line)).join("")}</ul></div>` : ""}
      </div>
      <aside class="cm-side" aria-label="All ingredients"><div class="row"><h2 class="h-small">All ingredients${k !== 1 ? ` (×${fmtNum(k)})` : ""}</h2><span class="spacer"></span><button class="btn sm ghost cm-close-all" data-act="cook-ings">Close</button></div>${allList}</aside>
    </div>
    <div class="cm-tools">
      <button class="btn cm-all-btn" data-act="cook-ings" aria-expanded="${!!state.view.showAll}">${ICON.list}All Ingredients</button>
      ${"speechSynthesis" in window ? `<button class="btn" data-act="read-aloud" aria-pressed="${!!state.readAloud}">${ICON.speak}${state.readAloud ? "Reading Aloud" : "Read Aloud"}</button>` : ""}
      ${SpeechRec ? `<button class="btn" data-act="voice" aria-pressed="${!!state.voiceOn}">${ICON.mic}${state.voiceOn ? "Listening: say next, back, repeat" : "Voice Control"}</button>` : ""}
    </div>
    <div class="cm-nav">
      <button class="btn big" data-act="cook-prev" ${i === 0 ? "disabled" : ""} aria-label="Previous step">Back</button>
      <button class="btn primary big" data-act="${last ? "cook-finish" : "cook-next"}">${last ? "Finish Cooking" : "Next Step"}</button>
    </div>
  </div>`;
}
/* Read steps aloud, and (where the browser supports it) move through them by voice. */
const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
function speakStep() {
  if (!state.readAloud || state.view.name !== "cook") return;
  const r = state.items.get(state.view.id); if (!r) return;
  const st = cookSteps(r)[state.view.step || 0]; if (!st) return;
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(`Step ${(state.view.step || 0) + 1}. ${showStep(st.text)}`);
    u.rate = 0.95; speechSynthesis.speak(u);
  } catch {}
}
function stopVoice() {
  state.voiceOn = false;
  if (rec) { try { rec.onend = null; rec.abort(); } catch {} rec = null; }
}
function startVoice() {
  if (!SpeechRec) return;
  try {
    rec = new SpeechRec(); rec.lang = navigator.language || "en-US"; rec.continuous = true; rec.interimResults = false;
    rec.onresult = ev => {
      const said = ev.results[ev.results.length - 1][0].transcript.toLowerCase();
      if (/\b(next|forward|continue)\b/.test(said)) cookGo(1);
      else if (/\b(back|previous|go back)\b/.test(said)) cookGo(-1);
      else if (/\b(repeat|again|read)\b/.test(said)) { const was = state.readAloud; state.readAloud = true; speakStep(); state.readAloud = was; }
    };
    rec.onerror = ev => { if (ev.error === "not-allowed" || ev.error === "service-not-allowed") { stopVoice(); toast("Microphone access was turned down, so voice control is off."); render(); } };
    rec.onend = () => { if (state.voiceOn && state.view.name === "cook") { try { rec.start(); } catch {} } };
    rec.start(); state.voiceOn = true;
  } catch { stopVoice(); toast("Voice control isn't available in this browser."); }
}

function cookGo(d) {
  const r = state.items.get(state.view.id); if (!r) return;
  const n = cookSteps(r).length, next = Math.max(0, Math.min(n - 1, (state.view.step || 0) + d));
  if (next !== state.view.step) { state.view.dir = d; state.view.step = next; if (d > 0) haptic(8); render(); window.scrollTo(0, 0); speakStep(); }
}
async function enterCook(id) {
  go({ name: "cook", id, step: 0 }); speakStep();
  if ("wakeLock" in navigator && !state.wake) { state.cookWake = true; await toggleWake(); }
}
function exitCook() {
  const id = state.view.id;
  try { speechSynthesis.cancel(); } catch {}
  stopVoice();
  if (state.cookWake && state.wake) { state.cookWake = false; toggleWake(); }
  go({ name: "recipe", id });
}

function vEdit() {
  const d = state.draft || {};
  const bs = books(), mine = d.id ? bs.filter(b => (b.recipeIds || []).includes(d.id)).map(b => b.id) : [];
  return `<button class="back" data-act="cancel-edit">‹ Cancel</button>
    <h1>${d.id ? "Edit Recipe" : "Check It Over"}</h1>
    ${d.id ? "" : `<p class="lede">Fix anything that came through wrong. Nothing is saved until you tap Save Recipe.</p>`}
    ${!d.id && findBySource(d.source) ? `<div class="notice row" style="margin-top:12px"><span>You already saved this recipe as “${esc(findBySource(d.source).title)}”.</span><span class="spacer"></span><button type="button" class="btn sm" data-act="open-recipe" data-id="${esc(findBySource(d.source).id)}">Open it</button></div>` : ""}
    ${!d.id && state.draftNote ? `<p class="notice" style="margin-top:12px">${esc(state.draftNote)}</p>` : ""}
    ${!d.id && state.draftArchived ? `<p class="notice" style="margin-top:12px">This site blocks readers, so this came from the Internet Archive's copy saved ${esc(archiveDate(state.draftArchived))}. If the recipe changed since then, check the original.</p>` : ""}
    <form class="stack" data-form="recipe" style="margin-top:20px">
      <div class="field"><label for="f-title">Title</label><input type="text" id="f-title" value="${esc(d.title)}" required></div>
      <div class="field"><label>Photo</label>
        <div class="photo-edit">${d.image ? imgTag(d.image, "thumb", "Recipe photo") : `<div class="thumb empty" aria-hidden="true"></div>`}
          <div class="row"><label class="btn sm" for="f-photo">${d.image ? "Change photo" : "Add photo"}</label>${d.image ? `<button type="button" class="btn sm ghost" data-act="photo-remove">Remove</button>` : ""}</div>
          <input type="file" id="f-photo" accept="image/*" hidden></div></div>
      <div class="grid4">
        <div class="field"><label for="f-serv">Servings</label><input type="number" id="f-serv" min="1" inputmode="numeric" value="${d.servings || ""}"></div>
        <div class="field"><label for="f-yield">Or makes</label><input type="text" id="f-yield" placeholder="1 loaf" value="${esc(d.yield)}"></div>
        <div class="field"><label for="f-prep">Prep</label><input type="text" id="f-prep" placeholder="15 min" value="${esc(d.prepTime)}"></div>
        <div class="field"><label for="f-cook">Cook</label><input type="text" id="f-cook" placeholder="30 min" value="${esc(d.cookTime)}"></div>
        <div class="field"><label for="f-total">Total</label><input type="text" id="f-total" placeholder="45 min" value="${esc(d.totalTime)}"></div>
      </div>
      <p class="hint" id="f-head-hint">Group ingredients or steps under headings like “For the sauce:”. Tap Add Heading, or type a short line that ends with a colon.</p>
      <div class="grid2">
        <div class="field"><label for="f-ings">Ingredients, one per line</label><textarea id="f-ings" rows="12" aria-describedby="f-head-hint">${esc((d.ingredients || []).map(toFormLine).join("\n"))}</textarea>
          <div><button type="button" class="btn sm" data-act="insert-heading" data-for="f-ings">+ Add Heading</button></div></div>
        <div class="field"><label for="f-steps">Steps, with a blank line between each</label><textarea id="f-steps" rows="12" aria-describedby="f-head-hint">${esc((d.steps || []).map(toFormLine).join("\n\n"))}</textarea>
          <div><button type="button" class="btn sm" data-act="insert-heading" data-for="f-steps">+ Add Heading</button></div></div>
      </div>
      <div class="field"><label for="f-notes">Notes</label><textarea id="f-notes" rows="3">${esc(d.notes)}</textarea></div>
      <div class="grid2">
        <div class="field"><label for="f-tags">Categories, separated by commas</label><input type="text" id="f-tags" placeholder="Dinner, Vegetarian" value="${esc((d.tags || []).join(", "))}">
          <div class="chips" style="margin-top:4px">${["Breakfast", "Lunch", "Dinner", "Dessert", "Soup", "Baking", "Vegetarian", "Quick"].map(t => `<button type="button" class="chip" data-act="add-tag" data-tag="${t}">+ ${t}</button>`).join("")}</div></div>
        <div class="field"><label for="f-src">Source link</label><input type="url" id="f-src" placeholder="https://" value="${esc(d.source)}"></div>
      </div>
      ${bs.length ? `<div class="field"><label>Collections</label><div class="chips">${bs.map(b => `<label class="chip"><input type="checkbox" class="f-book" value="${esc(b.id)}" ${mine.includes(b.id) ? "checked" : ""}> ${esc(b.name)}</label>`).join("")}</div></div>` : ""}
      <div class="form-bar"><button class="btn primary" type="submit">Save Recipe</button><button class="btn" type="button" data-act="cancel-edit">Cancel</button></div>
    </form>`;
}
// Section headings are stored as "## For the sauce"; the form shows them as "For the sauce:".
function toFormLine(l) { return String(l).startsWith("## ") ? String(l).slice(3).trim() + ":" : l; }
function fromFormLine(l) {
  if (/^##\s*/.test(l)) return "## " + l.replace(/^##\s*/, "");
  if (l.length <= 48 && /:$/.test(l) && !/^[\d½⅓⅔¼¾⅛]/.test(l) && !/[.!?;]/.test(l)) return "## " + l.slice(0, -1).trim();
  return l;
}

/* ===== Links waiting to import ===== */
const pendStore = () => state.items.get("pending") || { id: "pending", kind: "pending", links: [] };
const pendingLinks = () => pendStore().links || [];
function savePending(url, why) {
  const links = pendingLinks(); if (links.some(l => l.url === url)) return toast("That link is already saved for later");
  save({ ...pendStore(), links: [...links, { id: newId("l"), url, at: Date.now(), why: why || "" }] }); haptic();
  toast("Saved. It'll wait here until you import it."); render();
}
function vAdd() {
  const t = state.addTab;
  const pend = pendingLinks();
  // Short labels so all five fit on a small phone; the full name is what screen readers hear.
  const tab = (id, label, full) => `<button role="tab" id="tab-${id}" aria-selected="${t === id}" aria-controls="add-panel" tabindex="${t === id ? 0 : -1}" aria-label="${full}" data-act="add-tab" data-t="${id}">${label}</button>`;
  let body = "";
  if (t === "link") body = `<div class="stack">
      <div class="field"><label for="x-url">Recipe link</label><input type="url" id="x-url" placeholder="https://" inputmode="url" autocomplete="off" value="${esc(state.pendingUrl || state.failedUrl || "")}"></div>
      <div class="row">
        <button class="btn primary big" data-act="fetch-link" data-busy>Import Link</button>
        ${navigator.clipboard && navigator.clipboard.readText ? `<button class="btn big" data-act="paste-link" data-busy>Paste Link</button>` : ""}
      </div>
      <div id="x-status" class="status" role="status"></div>
      ${!state.online ? `<p class="notice">You're offline. Importing needs internet, but you can save links now and import them later.</p>` : ""}
      <p class="hint">Works with most recipe sites. Copy the link, then tap Paste Link.</p>
      <p class="hint social-hint" id="social-hint">Instagram, TikTok and YouTube posts work when the recipe is written in the caption or description, or the caption links to it. Extract can't read a recipe that's only spoken in a video.</p>
    </div>`;
  if (t === "many") body = `<div class="stack">
      <p class="hint">Moving your recipes over? Paste a batch of links, one per line, or a whole list copied from notes or another app. Each recipe is saved as it's read; you can edit any of them later.</p>
      <div class="field"><label for="x-many">Recipe links</label><textarea id="x-many" rows="7" placeholder="https://…&#10;https://…"></textarea></div>
      <div class="field"><label for="x-many-tag">Category for all of them (optional)</label><input type="text" id="x-many-tag" placeholder="e.g. Imported"></div>
      <div class="row"><button class="btn primary big" data-act="import-many" data-busy>Import Recipes</button></div>
      <ol class="import-log" id="import-log"></ol></div>`;
  if (t === "paste") body = `<div class="stack">
      <p class="hint">For sites that block the link reader, or a caption you copied: paste the text here. It reads best when there's an Ingredients list and numbered steps.${state.ai ? "" : " A whole page with a life story around the recipe needs Claude reading (see Settings)."}</p>
      <div class="field"><label for="x-text">Recipe text</label><textarea id="x-text" rows="9" placeholder="Paste the recipe, a caption, or the whole page"></textarea></div>
      <div class="field"><label for="x-src">Link to the page (optional)</label><input type="url" id="x-src" placeholder="https://"></div>
      <div class="row"><button class="btn primary big" data-act="extract-text" data-busy>Read Recipe</button></div>
      <span id="x-status" class="status"></span></div>`;
  if (t === "photo") body = state.ai ? `<div class="stack">
      <p class="hint">A recipe card, a cookbook page, or a screenshot. Handwriting works if it's legible.</p>
      <label class="drop" id="drop" for="x-photo"><strong>Take or Choose a Photo</strong></label>
      <input type="file" id="x-photo" accept="image/*" hidden>
      <span id="x-status" class="status"></span></div>`
    : `<p class="hint">Reading photos needs Claude reading, which isn't turned on for this app yet. Settings shows how to add it.</p><div style="margin-top:12px"><button class="btn" data-act="nav" data-v="settings">Open Settings</button></div>`;
  if (t === "type") body = `<div class="stack"><p class="hint">For family recipes and cards: start from a blank recipe.</p><div><button class="btn primary big" data-act="manual">Start a Blank Recipe</button></div></div>`;
  return `<h1>Add Recipe</h1>
    <div class="tabs" role="tablist" aria-label="Ways to add a recipe">${tab("link", "Link", "Link")}${tab("paste", "Text", "Paste text")}${tab("photo", "Photo", "Photo")}${tab("type", "Type", "Type it in")}${tab("many", "Bulk", "Bulk: many links at once")}</div>
    <div class="add-body" id="add-panel" role="tabpanel" aria-labelledby="tab-${t}">${body}</div>
    ${pend.length ? `<section class="group pending" id="pending"><div class="row"><h2 class="group-h">Waiting to import <span class="n">${pend.length}</span></h2><span class="spacer"></span>${state.online ? `<button class="btn sm" data-act="pend-all" data-busy>Import All</button>` : ""}</div>
      <div class="rows">${pend.map(l => `<div class="prow"><span class="pu"><strong>${esc(domain(l.url) || l.url)}</strong><small>${esc(l.url)}</small></span><button class="btn sm" data-act="pend-go" data-id="${esc(l.id)}" data-busy>Import</button><button class="icon-btn" data-act="pend-del" data-id="${esc(l.id)}" aria-label="Remove this saved link">✕</button></div>`).join("")}</div></section>` : ""}`;
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

const listMode = () => settings.get("listView") === "recipe" ? "recipe" : "aisle";
// A row you can swipe: right does the main thing, left opens its options. The ⋯ button does the same without gestures.
const srow = (kind, attrs, inner, menuLabel) => `<div class="srow" data-swipe="${kind}" ${attrs}><div class="sbg" aria-hidden="true"><span class="sbg-r">${kind === "g" ? "Got it" : "Add to Grocery List"}</span><span class="sbg-l">Options</span></div>
  <div class="sfront">${inner}<button class="rowmenu" data-act="${kind}-menu" ${attrs} aria-label="${esc(menuLabel)}">${ICON.more}</button></div></div>`;
function vList() {
  const items = grocery().items, mode = listMode();
  const open = items.filter(i => !i.done), got = items.filter(i => i.done);
  const one = i => srow("g", `data-ids="${esc(i.id)}" data-name="${esc(itemOf(i.text).name)}"`, `<label class="check gitem${i.done ? " got" : ""}"><input type="checkbox" data-act="list-check" data-ids="${esc(i.id)}" ${i.done ? "checked" : ""}><span>${esc(i.text)}</span></label>`, `Options for ${i.text}`);
  // By aisle: the same ingredient from several recipes becomes one line with the amounts added up.
  const merged = (m, done) => srow("g", `data-ids="${esc(m.ids.join(","))}" data-name="${esc(m.name)}"`, `<label class="check gitem${done ? " got" : ""}"><input type="checkbox" data-act="list-check" data-ids="${esc(m.ids.join(","))}" ${done ? "checked" : ""}><span>${esc(m.text)}</span></label>`, `Options for ${m.text}`);
  let body = "";
  if (mode === "aisle") {
    body = byAisle(mergeItems(open), m => aisleFor(m.name, m.texts[0]), aisleOrder()).map(([a, rows]) => `<section class="group"><h2 class="group-h">${esc(a)} <span class="n">${rows.length}</span></h2><div class="rows">${rows.map(m => merged(m, false)).join("")}</div></section>`).join("");
  } else {
    const groups = new Map();
    open.forEach(i => { const k = i.recipeId || ""; if (!groups.has(k)) groups.set(k, { title: i.recipeTitle || "Other items", id: i.recipeId, items: [] }); groups.get(k).items.push(i); });
    body = [...groups.values()].map(g => `<section class="group"><div class="row"><h2 class="group-h">${esc(g.title)}</h2><span class="spacer"></span>${g.id && state.items.has(g.id) ? `<button class="btn sm ghost" data-act="open-recipe" data-id="${esc(g.id)}">Open Recipe</button>` : ""}</div>
        <div class="rows">${g.items.map(one).join("")}</div></section>`).join("");
  }
  const cart = mode === "aisle" ? mergeItems(got).map(m => merged(m, true)).join("") : got.map(one).join("");
  return `<div class="row page-h"><h1>Grocery List</h1><span class="spacer"></span>${open.length ? `<span class="count">${open.length} to get</span>` : ""}</div>
    <form class="addline" data-form="list-add">
      <input type="text" id="la-text" placeholder="Add an item, like paper towels" aria-label="Add an item" autocomplete="off" enterkeyhint="done">
      <button class="btn primary">Add</button></form>
    ${items.length ? `<div class="row list-tools"><div class="seg" role="group" aria-label="Group the list" id="list-mode"><button data-act="list-mode" data-v="aisle" aria-pressed="${mode === "aisle"}">By Aisle</button><button data-act="list-mode" data-v="recipe" aria-pressed="${mode === "recipe"}">By Recipe</button></div><span class="spacer"></span>${mode === "aisle" ? `<button class="btn sm" data-act="aisle-order" id="aisle-order">Arrange Aisles</button>` : ""}</div>` : ""}
    ${!items.length ? `<div class="empty"><strong>Nothing on your list</strong><span>Open a recipe and tap Groceries to add its ingredients, or type an item above. Your meal plan can fill it for the whole week.</span><button class="btn" data-act="nav" data-v="plan">Go to Meal Plan</button></div>` : `
      ${body}
      ${!open.length ? `<p class="done-note">Everything's in the cart.</p>` : ""}
      ${got.length ? `<section class="group cart"><div class="row"><h2 class="group-h">In the cart <span class="n">${got.length}</span></h2><span class="spacer"></span><button class="btn sm" data-act="list-to-pantry">Put in Pantry</button><button class="btn sm ghost" data-act="list-clear-got">Clear</button></div>
        <div class="rows">${cart}</div></section>` : ""}
      <p class="hint swipe-hint">Swipe right to check off, left for options.</p>
      <div class="row list-foot">
        ${navigator.share ? `<button class="btn" data-act="list-share">Share List</button>` : ""}<button class="btn" data-act="list-copy">Copy List</button>
        <span class="spacer"></span><button class="btn ghost danger" data-act="list-clear-all">Clear All</button>
      </div>`}`;
}
function openGroceryMenu(ids, name) {
  const items = grocery().items.filter(i => ids.includes(i.id)); if (!items.length) return;
  const label = items.length > 1 ? mergeItems(items)[0].text : items[0].text;
  state.menuCtx = { ids, name };
  const from = [...new Set(items.map(i => i.recipeTitle).filter(Boolean))];
  modal(`<h2 class="sheet-t">${esc(label)}</h2>${from.length ? `<p class="hint sheet-from">For ${esc(from.join(", "))}</p>` : ""}<div class="sheet-list">
    <button class="mitem" data-act="g-pantry">In My Pantry <span class="hint">Takes it off the list</span></button>
    <button class="mitem" data-act="aisle-pick" data-name="${esc(name)}">Move to Another Aisle <span class="hint">Now: ${esc(aisleFor(name, items[0].text))}</span></button>
    <button class="mitem danger" data-act="g-delete">Delete</button></div>
    <button class="btn" data-act="close-modal">Cancel</button>`, true);
}
function removeGrocery(ids, msg) {
  const before = grocery().items;
  saveGrocery(before.filter(i => !ids.includes(i.id))); closeModal(); render();
  toast(msg, () => { saveGrocery(before); render(); });
}
function listText() {
  const items = grocery().items.filter(i => !i.done);
  if (listMode() === "aisle") return byAisle(mergeItems(items), m => aisleFor(m.name, m.texts[0]), aisleOrder()).map(([a, rows]) => `${a}\n${rows.map(m => "☐ " + m.text).join("\n")}`).join("\n\n");
  const by = new Map(); items.forEach(i => { const k = i.recipeTitle || "Other"; by.set(k, [...(by.get(k) || []), i.text]); });
  return [...by].map(([t, xs]) => `${t}\n${xs.map(x => "☐ " + x).join("\n")}`).join("\n\n");
}

/* ===== Blogs you follow ===== */
// Each checked from the live app on Oct 30, 2026 (some big blogs, like Budget Bytes, turn readers away).
const SUGGESTED_BLOGS = [["RecipeTin Eats", "https://www.recipetineats.com"], ["Smitten Kitchen", "https://smittenkitchen.com"], ["Minimalist Baker", "https://minimalistbaker.com"], ["Pinch of Yum", "https://pinchofyum.com"], ["Love and Lemons", "https://www.loveandlemons.com"], ["The Woks of Life", "https://thewoksoflife.com"], ["101 Cookbooks", "https://www.101cookbooks.com"]];
const FEED_KEY = "rk-feedcache";
function feedCache() { if (state.feedCache) return state.feedCache; try { state.feedCache = JSON.parse(localStorage.getItem(FEED_KEY) || "null"); } catch {} return state.feedCache; }
function setFeedCache(c) { state.feedCache = c; try { localStorage.setItem(FEED_KEY, JSON.stringify(c)); } catch {} }
async function refreshFeeds(force) {
  const fs = feedStore(), c = feedCache();
  if (!fs.sites.length || state.feedLoading) return;
  if (!force && c && Date.now() - c.at < 30 * 60e3 && fs.sites.every(s => c.bySite?.[s.id])) return;
  state.feedLoading = true; if (state.view.name === "feeds") render();
  const bySite = { ...(c?.bySite || {}) }, errors = {};
  await Promise.all(fs.sites.map(async s => {
    try { const j = await api("/api/feed?url=" + encodeURIComponent(s.feedUrl || s.url)); bySite[s.id] = j.items.slice(0, 15).map(i => ({ ...i, site: s.id })); }
    catch (e) { errors[s.id] = e.message || "Couldn't load"; }
  }));
  for (const k of Object.keys(bySite)) if (!fs.sites.some(s => s.id === k)) delete bySite[k];
  const items = Object.values(bySite).flat().sort((a, b) => b.date - a.date).slice(0, 80);
  setFeedCache({ at: Date.now(), bySite, items, errors });
  state.feedLoading = false;
  if (["feeds", "library"].includes(state.view.name) && !document.querySelector(".scrim")) render();
}
async function followBlog(raw) {
  const st = $("#feed-status"); const say = (m, err) => { if (st) { st.className = "status" + (err ? " err" : ""); st.innerHTML = m; } };
  const url = raw.trim(); if (!url) return;
  const fs = feedStore();
  say('<span class="spin"></span> Finding the blog\'s feed…');
  try {
    const j = await api("/api/feed?url=" + encodeURIComponent(url));
    if (fs.sites.some(s => s.feedUrl === j.feedUrl)) return say("You already follow that blog.");
    const site = { id: newId("f"), url, feedUrl: j.feedUrl, title: j.title || domain(j.site || url) || url, site: j.site || url };
    await save({ ...fs, sites: [...fs.sites, site] });
    const c = feedCache() || { at: Date.now(), bySite: {}, items: [], errors: {} };
    c.bySite = { ...c.bySite, [site.id]: j.items.slice(0, 15).map(i => ({ ...i, site: site.id })) };
    c.items = Object.values(c.bySite).flat().sort((a, b) => b.date - a.date).slice(0, 80);
    setFeedCache(c); toast(`Following ${site.title}`); render();
  } catch (e) { say(esc(e.message), true); }
}
function vFeeds() {
  const fs = feedStore(), c = feedCache();
  const siteOf = id => fs.sites.find(s => s.id === id);
  const followed = new Set(fs.sites.map(s => domain(s.site || s.url)));
  const sugg = SUGGESTED_BLOGS.filter(([, u]) => !followed.has(domain(u)));
  const items = (c?.items || []).filter(i => siteOf(i.site));
  const seen = fs.seenAt || 0;
  const ago = t => { if (!t) return ""; const d = Math.round((Date.now() - t) / 864e5); return d < 1 ? "Today" : d === 1 ? "Yesterday" : d < 7 ? `${d} days ago` : new Date(t).toLocaleDateString(undefined, { month: "short", day: "numeric" }); };
  setTimeout(() => { if (fs.sites.length && items.some(i => i.date > seen)) save({ ...feedStore(), seenAt: Date.now() }); }, 1500);
  return `<button class="back" data-act="nav" data-v="more">‹ More</button>
    <div class="row page-h"><h1>From Blogs</h1></div><p class="lede">New posts from recipe blogs you follow. Tap Save to import one.</p>
    <form class="addline" data-form="feed-add" id="feed-add">
      <input type="url" id="feed-url" placeholder="A blog's address, like smittenkitchen.com" aria-label="Blog address" autocomplete="off" inputmode="url">
      <button class="btn primary">Follow</button></form>
    <span class="status" id="feed-status"></span>
    ${sugg.length ? `<div class="chips" aria-label="Suggested blogs">${sugg.map(([n, u]) => `<button class="chip" data-act="feed-quick" data-url="${esc(u)}">+ ${esc(n)}</button>`).join("")}</div>` : ""}
    ${!fs.sites.length ? `<div class="empty" style="margin-top:20px"><strong>No blogs yet</strong><span>Follow a blog above and its new recipes show up here, newest first.</span></div>` : `
    <div class="row" style="margin-top:18px"><h2>Latest</h2><span class="spacer"></span>${state.feedLoading ? `<span class="status"><span class="spin"></span> Checking…</span>` : `<button class="btn sm ghost" data-act="feed-refresh">Check Now</button>`}</div>
    ${c && c.errors && Object.keys(c.errors).length ? `<p class="status err">${Object.keys(c.errors).map(id => siteOf(id)?.title).filter(Boolean).map(esc).join(", ")} couldn't be loaded just now.</p>` : ""}
    ${items.length ? `<div class="posts" id="posts">${items.map(i => { const s = siteOf(i.site), have = findBySource(i.link);
      return `<article class="post${i.date > seen ? " new" : ""}">${i.image ? imgTag(i.image, "post-img") : `<div class="post-img blank" aria-hidden="true"></div>`}
        <div class="post-b"><a class="post-t" href="${esc(i.link)}" target="_blank" rel="noopener">${esc(i.title)}</a><span class="meta"><span>${esc(s.title)}</span>${i.date ? `<span>${esc(ago(i.date))}</span>` : ""}${i.date > seen ? `<span class="new-tag">New</span>` : ""}</span>
        ${have ? `<button class="btn sm" data-act="open-recipe" data-id="${esc(have.id)}">Saved ✓</button>` : `<button class="btn sm" data-act="feed-save" data-url="${esc(i.link)}">Save</button>`}</div></article>`; }).join("")}</div>`
      : state.feedLoading ? "" : `<p class="hint">No posts loaded yet. Tap Check now.</p>`}
    <details class="following" style="margin-top:20px"><summary>Following ${fs.sites.length} blog${fs.sites.length === 1 ? "" : "s"}</summary>
      <div class="list" style="margin-top:8px">${fs.sites.map(s => `<div class="li"><span class="t">${esc(s.title)}<small class="from">${esc(domain(s.site || s.url))}</small></span><button class="btn sm ghost" data-act="feed-unfollow" data-id="${esc(s.id)}">Unfollow</button></div>`).join("")}</div></details>`}`;
}

/* ===== Your aisles ===== */
function openAislePick(name) {
  const cur = aisleFor(name), moved = !!(aisleStore().map || {})[name];
  state.aislePickName = name;
  modal(`<h2>Which aisle for “${esc(name)}”?</h2><p class="hint">Extract remembers this for next time, on every list.</p>
    <div class="list pick-list">${aisleOrder().map(a => `<button class="pick-row${a === cur ? " on" : ""}" data-act="aisle-set" data-v="${esc(a)}" aria-pressed="${a === cur}"><span>${esc(a)}</span>${a === cur ? `<span class="spacer"></span><span class="meta">Now</span>` : ""}</button>`).join("")}</div>
    <div class="row">${moved ? `<button class="btn ghost" data-act="aisle-set" data-v="">Back to automatic</button>` : ""}<span class="spacer"></span><button class="btn" data-act="close-modal">Cancel</button></div>`);
}
function openAisleOrder() {
  const o = aisleOrder();
  modal(`<h2>Arrange aisles</h2><p class="hint">Put them in the order you walk your store. Your list follows it.</p>
    <ol class="order-list">${o.map((a, i) => `<li><span>${esc(a)}</span><span class="spacer"></span>
      <button class="btn sm ghost" data-act="aisle-move" data-i="${i}" data-d="-1" ${i ? "" : "disabled"} aria-label="Move ${esc(a)} up">↑</button>
      <button class="btn sm ghost" data-act="aisle-move" data-i="${i}" data-d="1" ${i < o.length - 1 ? "" : "disabled"} aria-label="Move ${esc(a)} down">↓</button></li>`).join("")}</ol>
    <div class="row"><button class="btn ghost" data-act="aisle-reset">Reset order</button><span class="spacer"></span><button class="btn primary" data-act="close-modal">Done</button></div>`);
}

/* ===== Pantry ===== */
const PANTRY_STARTERS = ["Olive oil", "Butter", "Eggs", "Milk", "All-purpose flour", "Sugar", "Rice", "Pasta", "Onions", "Garlic", "Chicken broth", "Canned tomatoes", "Soy sauce", "Cumin", "Paprika", "Honey", "Lemons", "Parmesan"];
function vPantry() {
  const items = pantry().items;
  const groups = byAisle(items.map(p => ({ ...p, aisle: aisleFor(p.name) })), r => r.aisle, aisleOrder());
  const have = new Set(items.map(p => p.name));
  const starters = PANTRY_STARTERS.filter(t => !have.has(itemOf(t).name)).slice(0, 12);
  const ranked = recipes().map(r => ({ r, m: canMake(r, items) })).filter(x => x.m.total > 0 && x.m.have > 0)
    .sort((a, b) => a.m.missing.length - b.m.missing.length || b.m.have / b.m.total - a.m.have / a.m.total).slice(0, 8);
  const onList = new Set(grocery().items.filter(i => !i.done).map(i => itemOf(i.text).name));
  return `<div class="row page-h"><h1>Pantry</h1><span class="spacer"></span>${items.length ? `<span class="count">${items.length} at home</span>` : ""}</div>
    <form class="addline" data-form="pantry-add" id="pantry-add">
      <input type="text" id="pa-text" placeholder="Add what you have: rice, eggs, garlic" aria-label="Add to pantry" autocomplete="off" enterkeyhint="done">
      <button class="btn primary">Add</button></form>
    ${starters.length ? `<div class="chips scroll" aria-label="Quick add">${starters.map(t => `<button class="chip" data-act="pantry-quick" data-t="${esc(t)}">+ ${esc(t)}</button>`).join("")}</div>` : ""}
    <section class="group" id="can-make"><h2 class="group-h">What can I make?</h2>
      ${!recipes().length ? `<p class="hint">Save some recipes first, then this shows which ones your kitchen already covers.</p>` : !items.length ? `<p class="hint">Add what's in your kitchen, and the recipes you can make with it show up here.</p>`
        : ranked.length ? `<div class="rows">${ranked.map(({ r, m }) => `<div class="make"><button class="t" data-act="open-recipe" data-id="${esc(r.id)}"><strong>${esc(r.title)}</strong>
            <span>${m.missing.length ? `Have ${m.have} of ${m.total}. Need ${esc(m.missing.slice(0, 3).map(x => x.name).join(", "))}${m.missing.length > 3 ? ` and ${m.missing.length - 3} more` : ""}` : `You have everything`}</span></button>
            ${m.missing.length ? `<button class="btn sm" data-act="pantry-missing" data-id="${esc(r.id)}">Add ${m.missing.length} to List</button>` : `<span class="ready">Ready to cook</span>`}</div>`).join("")}</div>`
        : `<p class="hint">None of your recipes use what's in your pantry yet.</p>`}
    </section>
    ${items.length ? groups.map(([a, ps]) => `<section class="group"><h2 class="group-h">${esc(a)} <span class="n">${ps.length}</span></h2><div class="rows">${ps.map(p => srow("p", `data-id="${esc(p.id)}"`, `<span class="pname">${esc(p.name)}${onList.has(p.name) ? `<small class="from">Also on your grocery list</small>` : ""}</span>`, `Options for ${p.name}`)).join("")}</div></section>`).join("")
      + `<p class="hint swipe-hint">Swipe right to add to your grocery list, left for options.</p>`
      : `<div class="empty"><strong>Your pantry is empty</strong><span>Type what you have, or tap the quick-add buttons above. After shopping, check items off your list and tap Put in Pantry.</span></div>`}`;
}
function openPantryMenu(id) {
  const p = pantry().items.find(x => x.id === id); if (!p) return;
  modal(`<h2 class="sheet-t">${esc(p.name)}</h2><div class="sheet-list">
    <button class="mitem" data-act="p-to-list" data-id="${esc(id)}">Add to Grocery List</button>
    <button class="mitem" data-act="aisle-pick" data-name="${esc(p.name)}">Move to Another Aisle</button>
    <button class="mitem danger" data-act="p-used" data-id="${esc(id)}">Used Up <span class="hint">Takes it out of the pantry</span></button></div>
    <button class="btn" data-act="close-modal">Cancel</button>`, true);
}
function pantryToList(id, alsoRemove) {
  const p = pantry().items.find(x => x.id === id); if (!p) return;
  const before = grocery().items;
  if (!before.some(i => !i.done && itemOf(i.text).name === p.name)) saveGrocery([...before, { id: newId("g"), text: p.name, recipeId: "", recipeTitle: "", done: false }]);
  closeModal(); haptic(); render();
  toast(`Added ${p.name} to your grocery list`, () => { saveGrocery(before); render(); });
}
function pantryUsed(id) {
  const before = pantry().items, p = before.find(x => x.id === id); if (!p) return;
  savePantry(before.filter(x => x.id !== id)); closeModal(); render();
  toast(`${p.name} is used up`, () => { savePantry(before); render(); });
}

function openListPicker(r) {
  const k = state.cook.id === r.id ? state.cook.scale : 1;
  const lines = (r.ingredients || []).filter(l => !l.startsWith("## ")).map(l => { const { q, rest } = showQty(l, k); return (q ? q + " " : "") + rest; });
  const linked = usesOf(r).map(x => ({ r: x, lines: (x.ingredients || []).filter(l => !l.startsWith("## ")) }));
  const pi = pantry().items, inP = l => inPantry(itemOf(l).name, pi);
  modal(`<h2>Add to Grocery List</h2>
    <p class="hint">Untick anything you already have.${pi.length ? " Things in your pantry start unticked." : ""}${k !== 1 ? ` Amounts are scaled ×${esc(fmtNum(k))}.` : ""}</p>
    <div class="row"><button class="btn sm" data-act="pick-all" data-v="1">Select All</button><button class="btn sm" data-act="pick-all" data-v="0">Select None</button></div>
    <div class="list">${lines.map((l, i) => `<label class="check"><input type="checkbox" class="lp" value="${i}" ${inP(l) ? "" : "checked"}> ${esc(l)}${inP(l) ? ` <small class="from">in pantry</small>` : ""}</label>`).join("")}</div>
    ${linked.map((g, gi) => `<h3 style="margin-top:6px">Also from ${esc(g.r.title)}</h3><p class="hint">A linked recipe. Tick what you need for it too.</p><div class="list">${g.lines.map((l, li) => `<label class="check"><input type="checkbox" class="lp" value="L${gi}:${li}"> ${esc(l)}${inP(l) ? ` <small class="from">in pantry</small>` : ""}</label>`).join("")}</div>`).join("")}
    <div class="row"><button class="btn primary" data-act="list-add-picked" data-id="${esc(r.id)}">Add to Grocery List</button><button class="btn" data-act="close-modal">Cancel</button></div>`);
  state.pickLines = lines; state.pickLinked = linked;
}

function vPlan() {
  const start = weekStartOf(new Date(), state.view.week || 0);
  const days = [...Array(7)].map((_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; });
  const todayKey = dayKey(new Date());
  const end = days[6];
  const fmt = d => d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const planned = days.flatMap(d => planDay(dayKey(d)).entries.filter(e => e.recipeId && state.items.has(e.recipeId)));
  const any = days.some(d => planDay(dayKey(d)).entries.length);
  const order = m => MEALS.indexOf(m) < 0 ? 9 : MEALS.indexOf(m);
  const fresh = state.fresh; state.fresh = null;
  return `<div class="row page-h"><h1>Meal Plan</h1></div>
    <div class="week-nav">
      <button class="icon-btn" data-act="week" data-d="-1" aria-label="Previous week">‹</button>
      <span class="wk">${state.view.week ? "" : "This week, "}${esc(fmt(start))} to ${esc(fmt(end))}</span>
      ${state.view.week ? `<button class="btn sm ghost" data-act="week" data-d="0">This Week</button>` : ""}
      <button class="icon-btn" data-act="week" data-d="1" aria-label="Next week">›</button>
    </div>
    ${state.lastPlan && state.lastPlan.week === (state.view.week || 0) ? `<div class="notice stack pw-done"><span>Planned ${state.lastPlan.added} meal${state.lastPlan.added === 1 ? "" : "s"} from ${state.lastPlan.recipes} recipe${state.lastPlan.recipes === 1 ? "" : "s"}.${state.lastPlan.short.length ? ` No recipes fit ${esc(state.lastPlan.short.join(" or ").toLowerCase())}, so ${state.lastPlan.short.length === 1 ? "it was" : "they were"} left empty.` : ""} Swap any you don't fancy with its ⋯ menu.</span><div class="row"><button class="btn sm primary" data-act="plan-to-list">Add Groceries</button><button class="btn sm" data-act="plan-week-undo">Undo</button></div></div>` : ""}
    ${state.lastFill && state.lastFill.week === (state.view.week || 0) ? `<div class="notice row"><span>Planned ${state.lastFill.entries.length} meal${state.lastFill.entries.length === 1 ? "" : "s"}. Swap any you don't fancy.</span><span class="spacer"></span><button class="btn sm" data-act="plan-fill-undo">Undo</button></div>` : ""}
    <div class="row plan-tools">
      <button class="btn sm primary" data-act="plan-week" id="plan-week">Plan My Week</button>
      ${recipes().length ? `<button class="btn sm" data-act="plan-fill" id="plan-fill">Fill Empty Days</button>` : ""}
      <button class="btn sm" data-act="plan-ics" id="plan-ics" ${any ? "" : "disabled"}>Add to Calendar</button>
    </div>
    ${any ? "" : `<p class="hint">Plan My Week picks a few recipes and repeats them through the week, the way meal prep works. Or tap + Add on a day to plan a recipe, or jot a note like “Leftovers”.</p>`}
    <div class="days">${days.map(d => {
      const key = dayKey(d), entries = [...planDay(key).entries].sort((a, b) => order(a.meal) - order(b.meal));
      const wd = d.toLocaleDateString(undefined, { weekday: "long" });
      const tot = planner.dayTotals(entries, id => state.items.get(id)), tg = pwTarget(pwPrefs());
      const diff = tg && tot.kcal && !tot.unknown ? tot.kcal - tg.kcal : null;
      const totHtml = tot.kcal ? `<span class="day-tot${diff != null && Math.abs(diff) <= tg.kcal * 0.1 ? " ok" : ""}" title="Per person">${tot.kcal.toLocaleString()} cal${tot.p ? ` · ${tot.p} g protein` : ""}${tot.unknown ? ` · ${tot.unknown} without numbers` : diff != null ? (Math.abs(diff) <= tg.kcal * 0.1 ? " · on target" : ` · ${diff > 0 ? "+" : "−"}${Math.abs(diff).toLocaleString()} cal`) : ""}</span>` : "";
      return `<section class="day${key === todayKey ? " today" : ""}${key < todayKey ? " past" : ""}" data-day="${key}" aria-label="${esc(d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" }))}">
        <div class="day-h"><span class="dn">${esc(wd)}</span><span class="dd">${esc(fmt(d))}</span>${key === todayKey ? `<span class="today-tag">Today</span>` : ""}<span class="spacer"></span>
          <button class="btn sm ghost" data-act="plan-add" data-day="${key}" aria-label="Add to ${esc(wd)}">+ Add</button></div>
        ${totHtml}
        ${entries.map(e => {
          const r = e.recipeId ? state.items.get(e.recipeId) : null;
          return `<div class="plan-item${fresh === e.id ? " fresh" : ""}" data-entry="${esc(e.id)}" data-day="${key}">${r && r.image ? imgTag(r.image, "pimg") : `<span class="pimg blank" aria-hidden="true">${esc((r ? r.title : e.note || e.title || "·").trim().charAt(0).toUpperCase())}</span>`}
            <span class="pt-wrap">${e.meal || (e.sv && e.sv !== 1) ? `<span class="meal">${esc([e.meal, e.sv && e.sv !== 1 ? svText(e.sv) + " each" : ""].filter(Boolean).join(" · "))}</span>` : ""}${e.recipeId ? `<button class="pt" data-act="open-recipe" data-id="${esc(e.recipeId)}">${esc(r ? r.title : e.title || "Deleted recipe")}</button>` : `<span class="pt note">${esc(e.note)}</span>`}</span>
            <button class="rowmenu" data-act="plan-menu" data-day="${key}" data-id="${esc(e.id)}" aria-label="Options for ${esc(r ? r.title : e.note || "this meal")}">${ICON.more}</button></div>`;
        }).join("")}
      </section>`;
    }).join("")}</div>
    ${planned.length ? cookSection(state.view.week || 0) : ""}
    ${planned.length ? `<div class="plan-foot"><button class="btn primary" data-act="plan-to-list">${ICON.cart}Add Week to Grocery List</button><p class="hint">Press and hold a meal to drag it to another day, or use its ⋯ menu.</p></div>` : ""}`;
}
// What to cook this week: each recipe's servings for everyone, as batches. Groceries follow these amounts.
function cookSection(week) {
  const list = weekCook(week), p = pwPrefs(), tg = pwTarget(p);
  return `<section class="panel stack cook-week" id="cook-week"><div class="row"><h2>This week's cooking</h2><span class="spacer"></span>
      <div class="stepper sm" role="group" aria-label="People"><button class="icon-btn" data-act="plan-people" data-d="-1" aria-label="Fewer people">−</button><output aria-live="polite">${p.people} ${p.people === 1 ? "person" : "people"}</output><button class="icon-btn" data-act="plan-people" data-d="1" aria-label="More people">+</button></div></div>
    <ul class="cook-list">${list.map(x => `<li><button class="pt" data-act="open-recipe" data-id="${esc(x.r.id)}">${esc(x.r.title)}</button><span class="hint">${esc([...x.meals].sort((a, b) => MEALS.indexOf(a) - MEALS.indexOf(b)).join(", "))} · ${esc(planner.batchText(x, fmtNum))}</span></li>`).join("")}</ul>
    ${tg ? `<p class="hint">Target: ${tg.kcal.toLocaleString()} cal${tg.p ? ` and ${tg.p} g protein` : ""} a day per person. <a href="#" data-act="plan-week">Change</a></p>` : ""}
  </section>`;
}
function openPlanMenu(day, id) {
  const e = planDay(day).entries.find(x => x.id === id); if (!e) return;
  const r = e.recipeId ? state.items.get(e.recipeId) : null;
  const start = weekStartOf(new Date(day + "T12:00:00"));
  const opts = [...Array(14)].map((_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d; }).filter(d => dayKey(d) !== day);
  modal(`<h2 class="sheet-t">${esc(r ? r.title : e.note || "Meal")}</h2>
    ${r ? `<div class="field"><label>Servings each</label><div class="seg" role="group" aria-label="Servings each">${[0.5, 1, 1.5, 2].map(v => `<button data-act="plan-sv" data-day="${day}" data-id="${esc(id)}" data-v="${v}" aria-pressed="${(e.sv || 1) === v}">${fmtNum(v)}</button>`).join("")}</div></div>` : ""}
    <div class="field"><label for="pm-day">Move to</label><div class="row"><select id="pm-day" style="flex:1;width:auto">${opts.map(d => `<option value="${dayKey(d)}">${esc(d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }))}</option>`).join("")}</select><button class="btn" data-act="plan-move-go" data-day="${day}" data-id="${esc(id)}">Move</button></div></div>
    <div class="sheet-list">
      ${r ? `<button class="mitem" data-act="open-recipe" data-id="${esc(r.id)}">Open Recipe</button><button class="mitem" data-act="plan-swap" data-day="${day}" data-id="${esc(id)}">Swap for Another Recipe</button>` : ""}
      <button class="mitem danger" data-act="plan-remove" data-day="${day}" data-id="${esc(id)}">Remove from Plan</button></div>
    <button class="btn" data-act="close-modal">Cancel</button>`, true);
}
// Picker for a day: pick a recipe (searchable) or write a note; choose the meal.
function openPlanPicker(day, recipeId) {
  state.planPick = { day, meal: state.planPick?.meal || "Dinner", recipeId: recipeId || "" };
  drawPlanPicker();
}
function drawPlanPicker(q = "") {
  const p = state.planPick;
  const d = new Date(p.day + "T12:00:00");
  const list = recipes().filter(r => !q || r.title.toLowerCase().includes(q.toLowerCase())).sort((a, b) => (b.fav ? 1 : 0) - (a.fav ? 1 : 0) || a.title.localeCompare(b.title));
  const next14 = [...Array(14)].map((_, i) => { const x = new Date(); x.setDate(x.getDate() + i); return x; });
  modal(`<h2>${p.recipeId ? `Plan “${esc(state.items.get(p.recipeId)?.title || "")}”` : `Add to ${esc(d.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }))}`}</h2>
    ${p.recipeId ? `<div class="field"><label for="pp-day">Day</label><select id="pp-day">${next14.map(x => `<option value="${dayKey(x)}"${dayKey(x) === p.day ? " selected" : ""}>${esc(x.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" }))}</option>`).join("")}</select></div>` : ""}
    <div class="field"><label>Meal</label><div class="seg" role="group" aria-label="Meal">${MEALS.map(m => `<button data-act="pp-meal" data-v="${m}" aria-pressed="${p.meal === m}">${m}</button>`).join("")}</div></div>
    ${p.recipeId ? `<div class="row"><button class="btn primary" data-act="pp-save-recipe">Add to Plan</button><button class="btn" data-act="close-modal">Cancel</button></div>` : `
    <input type="search" id="pp-q" placeholder="Search your recipes" value="${esc(q)}" aria-label="Search your recipes" autocomplete="off">
    <div class="list pick-list">${list.length ? list.map(r => `<button class="pick-row" data-act="pp-pick" data-id="${esc(r.id)}">${r.image ? imgTag(r.image, "thumb") : ""}<span>${r.fav ? "♥ " : ""}${esc(r.title)}</span></button>`).join("") : `<p class="hint" style="padding:12px 14px">${recipes().length ? "No recipe matches." : "Save some recipes first, or add a note below."}</p>`}</div>
    <form class="row" data-form="pp-note"><input type="text" id="pp-note" placeholder="Or a note: Leftovers, Eat out…" aria-label="Note for this day" style="flex:1;width:auto" autocomplete="off"><button class="btn">Add Note</button></form>
    <div class="row"><span class="spacer"></span><button class="btn" data-act="close-modal">Done</button></div>`}`);
  const qi = $("#pp-q"); if (qi && q) { qi.focus(); qi.setSelectionRange(q.length, q.length); }
}
/* ===== Fill the week ===== */
function openPlanFill() {
  const tags = [...new Set(recipes().flatMap(r => r.tags || []))].sort();
  const bs = books();
  const f = state.fillOpts || { meal: "Dinner", from: "all", fresh: true, today: true };
  state.fillOpts = f;
  modal(`<h2>Fill empty days</h2><p class="hint">Extract picks a recipe for each day that doesn't have this meal yet. Swap or remove any of them after.</p>
    <div class="field"><label>Meal</label><div class="seg" role="group" aria-label="Meal">${MEALS.map(m => `<button data-act="fill-meal" data-v="${m}" aria-pressed="${f.meal === m}">${m}</button>`).join("")}</div></div>
    <div class="field"><label for="fill-from">Pick from</label><select id="fill-from">
      <option value="all"${f.from === "all" ? " selected" : ""}>All my recipes</option>
      ${recipes().some(r => r.fav) ? `<option value="fav"${f.from === "fav" ? " selected" : ""}>Favorites</option>` : ""}
      ${recipes().some(r => r.rating >= 4) ? `<option value="top"${f.from === "top" ? " selected" : ""}>Rated 4 stars and up</option>` : ""}
      ${pantry().items.length ? `<option value="pantry"${f.from === "pantry" ? " selected" : ""}>What I can mostly make from my pantry</option>` : ""}
      ${tags.length ? `<optgroup label="Category">${tags.map(t => `<option value="tag:${esc(t)}"${f.from === "tag:" + t ? " selected" : ""}>${esc(t)}</option>`).join("")}</optgroup>` : ""}
      ${bs.length ? `<optgroup label="Collection">${bs.map(b => `<option value="book:${esc(b.id)}"${f.from === "book:" + b.id ? " selected" : ""}>${esc(b.name)}</option>`).join("")}</optgroup>` : ""}
    </select></div>
    <label class="check plain"><input type="checkbox" id="fill-fresh" ${f.fresh ? "checked" : ""}> Skip recipes I made in the last 2 weeks</label>
    ${(state.view.week || 0) === 0 ? `<label class="check plain"><input type="checkbox" id="fill-today" ${f.today ? "checked" : ""}> Only today and later</label>` : ""}
    <div class="row"><button class="btn primary" data-act="plan-fill-go">Fill Empty Days</button><button class="btn" data-act="close-modal">Cancel</button></div>`);
}
function fillWeek() {
  const f = state.fillOpts; f.from = $("#fill-from").value; f.fresh = $("#fill-fresh").checked; f.today = $("#fill-today") ? $("#fill-today").checked : false;
  const week = state.view.week || 0, start = weekStartOf(new Date(), week), todayKey = dayKey(new Date());
  const days = [...Array(7)].map((_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return dayKey(d); }).filter(k => !(week === 0 && f.today && k < todayKey));
  const inWeek = new Set(days.flatMap(k => planDay(k).entries.map(e => e.recipeId).filter(Boolean)));
  const twoWeeks = Date.now() - 14 * 864e5;
  let pool = recipes().filter(r => (r.steps || []).length || (r.ingredients || []).length);
  if (f.from === "fav") pool = pool.filter(r => r.fav);
  else if (f.from === "top") pool = pool.filter(r => r.rating >= 4);
  else if (f.from === "pantry") pool = pool.filter(r => { const m = canMake(r, pantry().items); return m.total && m.missing.length <= Math.max(2, Math.round(m.total * 0.3)); });
  else if (f.from.startsWith("tag:")) pool = pool.filter(r => (r.tags || []).includes(f.from.slice(4)));
  else if (f.from.startsWith("book:")) { const b = state.items.get(f.from.slice(5)); pool = pool.filter(r => (b?.recipeIds || []).includes(r.id)); }
  if (f.fresh) pool = pool.filter(r => !(r.cooked || []).some(t => t > twoWeeks));
  pool = pool.filter(r => !inWeek.has(r.id));
  // Shuffle, with favorites and good ratings a little more likely.
  pool = pool.map(r => ({ r, k: Math.random() * (1 + (r.fav ? .5 : 0) + (r.rating || 0) * .15) })).sort((a, b) => b.k - a.k).map(x => x.r);
  const added = [];
  for (const k of days) {
    if (!pool.length) break;
    if (planDay(k).entries.some(e => e.meal === f.meal)) continue;
    const r = pool.shift(), id = newId("p");
    savePlanDay(k, [...planDay(k).entries, { id, meal: f.meal, recipeId: r.id, title: r.title }]);
    added.push({ day: k, id });
  }
  closeModal();
  state.lastFill = added.length ? { week, entries: added } : null;
  render();
  toast(added.length ? `Planned ${added.length} ${f.meal.toLowerCase()}${added.length === 1 ? "" : "s"}` : pool.length ? `Every day already has ${f.meal.toLowerCase()}` : "No recipes fit those choices. Try picking from All my recipes.");
}

/* ===== Plan My Week (Ironwood's way of planning, on your recipes) ===== */
const PW_DEFAULT = { meals: ["Breakfast", "Lunch", "Dinner"], people: 1, cook: "few", from: "all", iw: false, quick: false, fresh: true, kcal: "", p: "", whole: false, me: { sex: "", age: "", ft: "", inch: "", cm: "", lb: "", kg: "", act: 2, goal: "keep" } };
const pwPrefs = () => { let p = {}; try { p = JSON.parse(settings.get("planPrefs") || "{}"); } catch {} return { ...PW_DEFAULT, ...p, me: { ...PW_DEFAULT.me, ...(p.me || {}) } }; };
const savePw = p => settings.set("planPrefs", JSON.stringify(p));
const pwTarget = p => +p.kcal >= 800 && +p.kcal <= 6000 ? { kcal: +p.kcal, p: +p.p > 0 ? +p.p : 0 } : null;
const svText = sv => sv === 1 ? "1 serving" : `${fmtNum(sv)} servings`;
function weekKeys(week) { const start = weekStartOf(new Date(), week); return [...Array(7)].map((_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return dayKey(d); }); }
function openPlanWeek() {
  const p = pwPrefs(), metric = state.units === "metric", m = p.me, week = state.view.week || 0;
  const tags = [...new Set(recipes().flatMap(r => r.tags || []))].sort(), bs = books();
  const seg = (act, opts, cur, label) => `<div class="seg" role="group" aria-label="${label}">${opts.map(([v, t]) => `<button type="button" data-act="${act}" data-v="${esc(v)}" aria-pressed="${Array.isArray(cur) ? cur.includes(v) : String(cur) === String(v)}">${esc(t)}</button>`).join("")}</div>`;
  modal(`<h2>Plan my week</h2>
    <p class="hint">Extract picks a few recipes and repeats them through the week, the way meal prep works. Swap or move any meal after.</p>
    <div class="field"><label>Meals</label>${seg("pw-meal", MEALS.map(x => [x, x]), p.meals, "Meals to plan")}</div>
    <div class="row pw-row"><div class="field"><label id="pw-people-l">People</label><div class="stepper" role="group" aria-labelledby="pw-people-l"><button type="button" class="icon-btn" data-act="pw-people" data-d="-1" aria-label="Fewer people">−</button><output id="pw-people" aria-live="polite">${p.people}</output><button type="button" class="icon-btn" data-act="pw-people" data-d="1" aria-label="More people">+</button></div></div>
      ${week === 0 ? `<div class="field"><label>Days</label>${seg("pw-whole", [["0", "Rest of this week"], ["1", "Whole week"]], p.whole ? "1" : "0", "Days to plan")}</div>` : ""}</div>
    <div class="field"><label>How often do you cook?</label>${seg("pw-cook", Object.entries(planner.COOK_STYLES).map(([k, v]) => [k, v.name]), p.cook, "How often you cook")}
      <p class="hint" id="pw-cook-sub">${esc(planner.COOK_STYLES[p.cook].sub)}</p></div>
    <div class="field"><label for="pw-from">Recipes from</label><select id="pw-from">
      <option value="all"${p.from === "all" ? " selected" : ""}>All my recipes</option>
      ${recipes().some(r => r.fav) ? `<option value="fav"${p.from === "fav" ? " selected" : ""}>Favorites</option>` : ""}
      ${recipes().some(r => r.rating >= 4) ? `<option value="top"${p.from === "top" ? " selected" : ""}>Rated 4 stars and up</option>` : ""}
      ${tags.length ? `<optgroup label="Category">${tags.map(t => `<option value="tag:${esc(t)}"${p.from === "tag:" + t ? " selected" : ""}>${esc(t)}</option>`).join("")}</optgroup>` : ""}
      ${bs.length ? `<optgroup label="Collection">${bs.map(b => `<option value="book:${esc(b.id)}"${p.from === "book:" + b.id ? " selected" : ""}>${esc(b.name)}</option>`).join("")}</optgroup>` : ""}
    </select></div>
    <label class="check plain"><input type="checkbox" id="pw-iw" ${p.iw ? "checked" : ""}> <span>Also use Ironwood's meal-prep recipes<small class="from">About 150, all with calories and protein, so portions can fit a target. Only the ones planned are added to your recipes.</small></span></label>
    <label class="check plain"><input type="checkbox" id="pw-quick" ${p.quick ? "checked" : ""}> Quick ones first (30 minutes or less)</label>
    <label class="check plain"><input type="checkbox" id="pw-fresh" ${p.fresh ? "checked" : ""}> Skip recipes I made in the last 2 weeks</label>
    <details class="pw-target"${pwTarget(p) ? " open" : ""}><summary>Daily target (optional)</summary>
      <p class="hint">Per person. With a target, portions go up or down in half servings to get close, for recipes that list calories.</p>
      <div class="row pw-row"><div class="field"><label for="pw-kcal">Calories</label><input type="number" id="pw-kcal" inputmode="numeric" min="800" max="6000" step="10" value="${esc(p.kcal)}" placeholder="2200"></div>
        <div class="field"><label for="pw-p">Protein (g)</label><input type="number" id="pw-p" inputmode="numeric" min="0" max="400" value="${esc(p.p)}" placeholder="140"></div></div>
      <details class="pw-calc"><summary>Work it out for me</summary>
        <div class="field"><label>Sex</label>${seg("pw-sex", [["m", "Male"], ["f", "Female"], ["x", "Rather not say"]], m.sex, "Sex")}</div>
        <div class="row pw-row"><div class="field"><label for="pw-age">Age</label><input type="number" id="pw-age" inputmode="numeric" value="${esc(m.age)}"></div>
          ${metric ? `<div class="field"><label for="pw-cm">Height (cm)</label><input type="number" id="pw-cm" inputmode="numeric" value="${esc(m.cm)}"></div><div class="field"><label for="pw-kg">Weight (kg)</label><input type="number" id="pw-kg" inputmode="decimal" value="${esc(m.kg)}"></div>`
            : `<div class="field"><label for="pw-ft">Height</label><div class="row" style="gap:6px;flex-wrap:nowrap"><input type="number" id="pw-ft" inputmode="numeric" value="${esc(m.ft)}" aria-label="Feet" placeholder="ft"><input type="number" id="pw-in" inputmode="numeric" value="${esc(m.inch)}" aria-label="Inches" placeholder="in"></div></div><div class="field"><label for="pw-lb">Weight (lb)</label><input type="number" id="pw-lb" inputmode="decimal" value="${esc(m.lb)}"></div>`}</div>
        <div class="field"><label for="pw-act">Activity</label><select id="pw-act">${planner.ACT_LEVELS.map(a => `<option value="${a[0]}"${+m.act === a[0] ? " selected" : ""}>${esc(a[1])}: ${esc(a[2])}</option>`).join("")}</select></div>
        <div class="field"><label>Goal</label>${seg("pw-goal", [["lose", "Lose fat"], ["keep", "Stay the same"], ["gain", "Build muscle"]], m.goal, "Goal")}</div>
        <div><button type="button" class="btn sm" data-act="pw-calc">Work It Out</button></div>
        <p class="hint" id="pw-calc-out" role="status"></p>
      </details>
    </details>
    <p class="status" id="pw-status" role="status"></p>
    <div class="row sticky-actions"><button class="btn primary" data-act="pw-go">Plan My Week</button><button class="btn" data-act="close-modal">Cancel</button></div>`);
}
// Read the sheet back into prefs (also on every tap, so a re-open keeps what was chosen).
function readPw() {
  const p = pwPrefs(), v = id => $("#" + id)?.value ?? "", on = act => [...document.querySelectorAll(`[data-act=${act}][aria-pressed=true]`)].map(b => b.dataset.v);
  p.meals = on("pw-meal"); p.people = Math.max(1, Math.min(12, +($("#pw-people")?.textContent) || 1)); p.cook = on("pw-cook")[0] || "few";
  if ($("[data-act=pw-whole]")) p.whole = on("pw-whole")[0] === "1";
  p.from = v("pw-from") || "all"; p.iw = !!$("#pw-iw")?.checked; p.quick = !!$("#pw-quick")?.checked; p.fresh = !!$("#pw-fresh")?.checked;
  p.kcal = v("pw-kcal"); p.p = v("pw-p");
  p.me = { ...p.me, sex: on("pw-sex")[0] || p.me.sex, goal: on("pw-goal")[0] || p.me.goal, age: v("pw-age"), act: +v("pw-act") || 2 };
  if ($("#pw-cm")) { p.me.cm = v("pw-cm"); p.me.kg = v("pw-kg"); } else { p.me.ft = v("pw-ft"); p.me.inch = v("pw-in"); p.me.lb = v("pw-lb"); }
  savePw(p); return p;
}
function pwCalc() {
  const p = readPw(), m = p.me, out = $("#pw-calc-out");
  const h = $("#pw-cm") ? +m.cm : planner.inToCm((+m.ft || 0) * 12 + (+m.inch || 0)), w = $("#pw-kg") ? +m.kg : planner.lbToKg(+m.lb || 0);
  const t = planner.targetsFor({ sex: m.sex || "x", age: m.age, h, w, act: m.act, goal: m.goal });
  if (!t) { if (out) out.textContent = "Fill in age, height and weight to work it out."; return; }
  $("#pw-kcal").value = t.kcal; $("#pw-p").value = t.p; readPw();
  if (out) out.textContent = `About ${t.kcal.toLocaleString()} calories and ${t.p} g protein a day.${t.note ? " " + t.note : ""} It's an estimate; adjust it to how you feel.`;
}
async function runPlanWeek() {
  const p = readPw(), week = state.view.week || 0, todayKey = dayKey(new Date()), st = $("#pw-status");
  if (!p.meals.length) { if (st) { st.className = "status err"; st.textContent = "Pick at least one meal."; } return; }
  const keys = weekKeys(week).filter(k => !(week === 0 && !p.whole && k < todayKey));
  const twoWeeks = Date.now() - 14 * 864e5;
  let pool = recipes();
  if (p.from === "fav") pool = pool.filter(r => r.fav);
  else if (p.from === "top") pool = pool.filter(r => r.rating >= 4);
  else if (p.from.startsWith("tag:")) pool = pool.filter(r => (r.tags || []).includes(p.from.slice(4)));
  else if (p.from.startsWith("book:")) { const b = state.items.get(p.from.slice(5)); pool = pool.filter(r => (b?.recipeIds || []).includes(r.id)); }
  if (p.fresh) pool = pool.filter(r => !(r.cooked || []).some(t => t > twoWeeks));
  if (p.iw) {
    if (st) { st.className = "status"; st.innerHTML = '<span class="spin"></span> Getting Ironwood’s recipes…'; }
    try { const lib = await iw.library(); for (const [id, r] of Object.entries(lib.recipes || {})) { if (!r || !r.macros || !r.macros.kcal || !["breakfast", "main", "snack"].includes(r.cat) || !(r.ing || []).length || findIw(id)) continue; pool.push({ ...iw.toExtract(r, id), id: "iwc:" + id, ironwoodCat: r.cat }); } }
    catch { if (st) { st.className = "status err"; st.textContent = "Couldn't load Ironwood's recipes. Check your connection, or untick that box."; } return; }
  }
  const target = pwTarget(p);
  const out = planner.buildWeek(pool, { meals: p.meals, cook: p.cook, days: keys.length, target, quick: p.quick, seed: Date.now() });
  if (!out.days.some(d => d.length)) { if (st) { st.className = "status err"; st.textContent = recipes().length ? "No recipes fit those choices. Try All my recipes, or tick Ironwood's meal-prep recipes." : "Save a few recipes first, or tick Ironwood's meal-prep recipes."; } return; }
  // Ironwood recipes that made the plan become Extract recipes now.
  const ids = new Map(), imported = [];
  for (const d of out.days) for (const e of d) if (e.recipeId.startsWith("iwc:") && !ids.has(e.recipeId)) {
    const c = pool.find(r => r.id === e.recipeId), { ironwoodCat, ...rest } = c, r = { ...rest, id: newId("r") }; save(r); ids.set(e.recipeId, r.id); imported.push(r.id);
  }
  const removed = [], added = [];
  keys.forEach((k, i) => {
    const before = planDay(k).entries, keep = before.filter(e => !e.auto);
    const adds = out.days[i].filter(e => !keep.some(x => x.meal === e.meal)).map(e => ({ id: newId("p"), meal: e.meal, recipeId: ids.get(e.recipeId) || e.recipeId, sv: e.sv, auto: true }));
    adds.forEach(a => { const r = state.items.get(a.recipeId); if (r) a.title = r.title; });
    if (adds.length || keep.length !== before.length) { if (!removed.some(x => x.day === k)) removed.push({ day: k, entries: before }); savePlanDay(k, [...keep, ...adds]); }
    adds.forEach(a => added.push({ day: k, id: a.id }));
  });
  const n = new Set(out.days.flat().map(e => e.recipeId)).size;
  state.lastPlan = { week, added: added.length, recipes: n, removed, imported, short: out.short };
  state.lastFill = null; closeModal(); render(); haptic();
  announce(`Planned ${added.length} meals from ${n} recipes`);
}
function undoPlanWeek() {
  const x = state.lastPlan; if (!x) return;
  x.removed.forEach(({ day, entries }) => savePlanDay(day, entries));
  x.imported.forEach(id => { if (!weekKeys(x.week).some(k => planDay(k).entries.some(e => e.recipeId === id))) removeItem(id); });
  state.lastPlan = null; render(); toast("Undone");
}
// Swap a planned meal for another recipe of the same kind (breakfast, main or snack) that isn't in the week yet.
function swapPlanEntry(day, id) {
  const e = planDay(day).entries.find(x => x.id === id), cur = e && state.items.get(e.recipeId); if (!cur) return;
  const kind = planner.kindOf(cur) || (e.meal === "Breakfast" ? "b" : e.meal === "Snack" ? "s" : "m");
  const week = weekKeys(0).includes(day) ? 0 : Math.round((weekStartOf(new Date(day + "T12:00:00")) - weekStartOf(new Date())) / (7 * 864e5));
  const inWeek = new Set(weekKeys(week).flatMap(k => planDay(k).entries.map(x => x.recipeId)));
  const pool = recipes().filter(r => planner.kindOf(r) === kind && !inWeek.has(r.id));
  if (!pool.length) { closeModal(); return toast("No other recipes of that kind to swap in. Save a few more."); }
  const r = pool[Math.floor(Math.random() * pool.length)], before = planDay(day).entries;
  savePlanDay(day, before.map(x => x.id === id ? { ...x, recipeId: r.id, title: r.title } : x));
  state.fresh = id; closeModal(); render(); toast(`Swapped in ${r.title}`, () => { savePlanDay(day, before); render(); });
}
function setEntrySv(day, id, sv) { savePlanDay(day, planDay(day).entries.map(x => x.id === id ? { ...x, sv } : x)); closeModal(); render(); }
// The week's cooking, groceries scaled to it.
function weekCook(week) {
  const entries = weekKeys(week).flatMap(k => planDay(k).entries.filter(e => e.recipeId && state.items.has(e.recipeId)));
  return planner.cookList(entries, pwPrefs().people, id => state.items.get(id));
}

/* ===== Calendar file ===== */
const DEFAULT_TIMES = { Breakfast: "08:00", Lunch: "12:30", Snack: "15:30", Dinner: "18:00" };
const mealTimes = () => { try { return { ...DEFAULT_TIMES, ...JSON.parse(settings.get("mealTimes") || "{}") }; } catch { return { ...DEFAULT_TIMES }; } };
function openCalendar() {
  const t = mealTimes();
  modal(`<h2>Add this week to your calendar</h2><p class="hint">Makes a calendar file with each planned meal at these times. Open it to add the meals to your phone's calendar. Each one links back to its recipe.</p>
    <div class="grid4">${MEALS.map(m => `<div class="field"><label for="mt-${m}">${m}</label><input type="time" id="mt-${m}" value="${esc(t[m])}"></div>`).join("")}</div>
    <p class="hint">The calendar keeps a copy: if you change the plan later, add it again (meals update instead of doubling up in most calendars).</p>
    <div class="row"><button class="btn primary" data-act="ics-go">Make Calendar File</button><button class="btn" data-act="close-modal">Cancel</button></div>`);
}
const icsEsc = s => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
const icsFold = line => { const out = []; let l = line; while (l.length > 73) { out.push(l.slice(0, 73)); l = " " + l.slice(73); } out.push(l); return out.join("\r\n"); };
function buildIcs(week) {
  const t = {}; MEALS.forEach(m => { const v = $("#mt-" + m)?.value || mealTimes()[m]; t[m] = v; });
  settings.set("mealTimes", JSON.stringify(t));
  const start = weekStartOf(new Date(), week), stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Extract//Meal plan//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:Meal plan"];
  let n = 0;
  for (let i = 0; i < 7; i++) {
    const d = new Date(start); d.setDate(start.getDate() + i);
    for (const e of planDay(dayKey(d)).entries) {
      const [hh, mm] = (t[e.meal] || "18:00").split(":").map(Number);
      const s0 = new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm), s1 = new Date(s0.getTime() + 3600e3);
      const f = x => `${x.getFullYear()}${String(x.getMonth() + 1).padStart(2, "0")}${String(x.getDate()).padStart(2, "0")}T${String(x.getHours()).padStart(2, "0")}${String(x.getMinutes()).padStart(2, "0")}00`;
      const r = e.recipeId ? state.items.get(e.recipeId) : null;
      const title = r ? r.title : e.note || e.title || "Meal";
      const desc = r ? [timeOf(r) && `Time: ${timeOf(r)}`, "", "Ingredients:", ...(r.ingredients || []).filter(l => !l.startsWith("## ")).map(l => "• " + l), "", `Open in Extract: ${location.origin}/#open=${r.id}`].filter(x => x !== false).join("\n") : "";
      lines.push("BEGIN:VEVENT", `UID:${e.id}@extract-meal-plan`, `DTSTAMP:${stamp}`, `DTSTART:${f(s0)}`, `DTEND:${f(s1)}`, icsFold(`SUMMARY:${icsEsc((e.meal ? e.meal + ": " : "") + title)}`));
      if (desc) lines.push(icsFold(`DESCRIPTION:${icsEsc(desc)}`));
      if (r) lines.push(icsFold(`URL:${location.origin}/#open=${r.id}`));
      lines.push("END:VEVENT"); n++;
    }
  }
  lines.push("END:VCALENDAR");
  return { text: lines.join("\r\n") + "\r\n", n, name: `meal-plan-${dayKey(start)}.ics` };
}
async function exportIcs() {
  const { text, n, name } = buildIcs(state.view.week || 0);
  if (!n) { closeModal(); return toast("Plan some meals first."); }
  const file = new File([text], name, { type: "text/calendar" });
  closeModal();
  if (navigator.canShare && navigator.canShare({ files: [file] }) && /android/i.test(navigator.userAgent)) {
    try { await navigator.share({ files: [file], title: "Meal plan" }); return; } catch (e) { if (e && e.name === "AbortError") return; }
  }
  // iPhone and computers open a calendar file straight into the calendar app.
  const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
  toast(`Calendar file with ${n} meal${n === 1 ? "" : "s"} made. Open it to add them.`);
}

function addPlanEntry(day, entry) {
  const cur = planDay(day).entries, id = newId("p");
  savePlanDay(day, [...cur, { id, meal: state.planPick?.meal || "Dinner", ...entry }]);
  state.fresh = id; haptic();
}
function planWeekToList() {
  const start = weekStartOf(new Date(), state.view.week || 0);
  const ids = [];
  for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); planDay(dayKey(d)).entries.forEach(e => e.recipeId && state.items.has(e.recipeId) && ids.push(e.recipeId)); }
  const ck = new Map(weekCook(state.view.week || 0).map(x => [x.r.id, x]));
  const rs = [...new Set(ids)].map(id => state.items.get(id));
  const groups = rs.map(r => { const k = ck.get(r.id)?.batches || 1; return { r, k, lines: (r.ingredients || []).filter(l => !l.startsWith("## ")).map(l => { const { q, rest } = showQty(l, k); return (q ? q + " " : "") + rest; }) }; });
  state.weekPick = groups;
  const pi = pantry().items, inP = l => inPantry(itemOf(l).name, pi);
  modal(`<h2>Groceries for the week</h2><p class="hint">Untick anything you already have.${pi.length ? " Things in your pantry start unticked." : ""}</p>
    <div class="row"><button class="btn sm" data-act="pick-all" data-v="1">Select All</button><button class="btn sm" data-act="pick-all" data-v="0">Select None</button></div>
    <div class="pick-list stack" style="gap:12px">${groups.map((g, gi) => `<section><h3>${esc(g.r.title)}${g.k !== 1 ? ` <small class="from">×${esc(fmtNum(g.k))}</small>` : ""}</h3><div class="list" style="margin-top:6px">${g.lines.map((l, li) => `<label class="check"><input type="checkbox" class="lp" value="${gi}:${li}" ${inP(l) ? "" : "checked"}> ${esc(l)}${inP(l) ? ` <small class="from">in pantry</small>` : ""}</label>`).join("")}</div></section>`).join("")}</div>
    <div class="row"><button class="btn primary" data-act="week-add-picked">Add to Grocery List</button><button class="btn" data-act="close-modal">Cancel</button></div>`);
}

function vBooks() {
  const bs = books();
  return `<button class="back" data-act="nav" data-v="more">‹ More</button>
    <div class="row page-h"><h1>Collections</h1></div>
    <p class="lede">Group recipes for a holiday, a person, or a week of dinners. A recipe can be in as many collections as you like.</p>
    <form class="addline" data-form="new-book">
      <input type="text" id="nb-name" placeholder="New collection, like Sunday Baking" aria-label="New collection name" required>
      <button class="btn primary">Create</button></form>
    ${bs.length ? `<div class="shelves">${bs.map(b => { const rs = (b.recipeIds || []).map(i => state.items.get(i)).filter(Boolean); const pics = rs.filter(r => r.image).slice(0, 3);
      return `<button class="bcard" data-act="open-book" data-id="${esc(b.id)}"><span class="bc-pics">${pics.length ? pics.map(r => imgTag(r.image, "bc-img")).join("") : `<span class="bc-img plate" aria-hidden="true">${esc(b.name.trim().charAt(0).toUpperCase())}</span>`}</span>
        <span class="bc-t">${esc(b.name)}</span><span class="bc-n">${rs.length} recipe${rs.length === 1 ? "" : "s"}</span></button>`; }).join("")}</div>`
      : `<div class="empty"><strong>No collections yet</strong><span>Name one above, then add recipes to it. You can also add a recipe to a collection from its More menu.</span></div>`}`;
}
function vBook() {
  const b = state.items.get(state.view.id);
  if (!b) return `<button class="back" data-act="nav" data-v="books">‹ Collections</button><div class="empty"><strong>This collection was deleted</strong></div>`;
  const rs = (b.recipeIds || []).map(i => state.items.get(i)).filter(Boolean);
  const others = recipes().filter(r => !(b.recipeIds || []).includes(r.id)).sort((x, y) => x.title.localeCompare(y.title));
  return `<button class="back" data-act="nav" data-v="books">‹ Collections</button>
    ${state.view.editing ? `<form class="stack" data-form="edit-book" data-id="${esc(b.id)}">
        <div class="field"><label for="eb-name">Name</label><input type="text" id="eb-name" value="${esc(b.name)}" required></div>
        <div class="field"><label for="eb-desc">Description</label><textarea id="eb-desc" rows="2">${esc(b.description)}</textarea></div>
        <div class="row"><button class="btn primary">Save</button><button type="button" class="btn" data-act="book-edit-cancel">Cancel</button></div></form>`
      : `<div class="stack"><h1 class="rtitle">${esc(b.name)}</h1>${b.description ? `<p class="lede">${esc(b.description)}</p>` : ""}
        <div class="row"><button class="btn primary" data-act="book-pick">Add Recipes</button><button class="btn" data-act="share" data-id="${esc(b.id)}">Share</button><button class="btn icon-only" data-act="book-options" data-id="${esc(b.id)}" aria-label="Collection options: rename, delete" title="Collection options">${ICON.more}</button></div></div>`}
    ${state.view.picking ? `<div class="pickbox stack"><h2 class="h-small">Pick recipes to add</h2>
        ${others.length ? `<div class="list">${others.map(r => `<label class="check"><input type="checkbox" class="pick" value="${esc(r.id)}"> ${esc(r.title)}</label>`).join("")}</div>
        <div class="row"><button class="btn primary" data-act="book-pick-add" data-id="${esc(b.id)}">Add Selected</button><button class="btn" data-act="book-pick-cancel">Done</button></div>`
        : `<p class="hint">Every recipe you have is already here.</p><div><button class="btn" data-act="book-pick-cancel">Done</button></div>`}</div>` : ""}
    ${rs.length ? `<div class="cards">${rs.map(r => rcard(r).replace('data-act="open-recipe"', 'data-act="open-recipe" data-from="book"')).join("")}</div>`
      : `<div class="empty"><strong>Nothing in here yet</strong><span>Tap Add Recipes to fill it.</span></div>`}`;
}

function vShared() {
  const s = state.view, p = s.payload;
  if (s.recipeIdx != null) { resetCook("shared-" + s.recipeIdx); return `<button class="back" data-act="shared-back">‹ ${esc(p.book.name)}</button>${cookBody(p.recipes[s.recipeIdx])}`; }
  const banner = `<div class="panel row" style="margin-bottom:20px"><span>Someone shared ${p.kind === "book" ? "a collection" : "a recipe"} with you.</span><span class="spacer"></span>
    <button class="btn primary" data-act="save-shared">${p.kind === "book" ? "Save Collection" : "Save Recipe"}</button>
    <button class="btn" data-act="copy-shared">Copy as Text</button></div>`;
  if (p.kind === "recipe") { resetCook("shared"); return banner + cookBody(p.recipe); }
  return banner + `<h1>${esc(p.book.name)}</h1>${p.book.description ? `<p class="lede">${esc(p.book.description)}</p>` : ""}
    <div class="cards">${p.recipes.map((r, i) => rcard({ ...r, id: String(i) }, "shared-open")).join("")}</div>`;
}
/* ===== Recipes from Reels ===== */
// A ready-made set of recipes saved from Instagram reels (public/packs/reels.json). Added in one tap, into one collection,
// with ids from each reel so adding again never doubles up. Recipes you haven't touched can be taken out again.
let reelPack = null;
const loadReels = () => (reelPack ||= fetch("/packs/reels.json").then(r => { if (!r.ok) throw new Error("pack"); return r.json(); }).catch(e => { reelPack = null; throw e; }));
const REEL_BOOK = "b-reels";
const untouchedReel = r => r.pack === "reels" && !r.fav && !r.rating && !(r.cooked || []).length && (r.updatedAt || 0) - (r.packAt || 0) < 5000;
function vReels() {
  const head = `<button class="back" data-act="nav" data-v="more">‹ More</button><h1>Recipes from Reels</h1>`;
  const p = state.reels;
  if (!p) {
    if (!state.reelsErr) loadReels().then(x => { state.reels = x; if (state.view.name === "reels") render(); }).catch(() => { state.reelsErr = true; if (state.view.name === "reels") render(); });
    return head + (state.reelsErr ? `<p class="status err">Couldn't load the recipes. Check your connection and try again.</p><button class="btn" data-act="reels-retry">Try Again</button>` : `<p class="status"><span class="spin"></span> Loading the recipes…</p>`);
  }
  const sel = state.reelGroups || (state.reelGroups = new Set(p.groups));
  const skip = !!state.reelSkip;
  const inGroup = g => p.recipes.filter(r => r.group === g && !(skip && r.missing));
  const chosen = p.recipes.filter(r => sel.has(r.group) && !(skip && r.missing));
  const fresh = chosen.filter(r => !state.items.has(r.id)).length;
  const have = p.recipes.filter(r => state.items.has(r.id)).length;
  const missing = p.recipes.filter(r => r.missing).length;
  return head + `<p class="lede">${p.recipes.length} recipes saved from Instagram reels: dinners, Middle Eastern cooking, desserts, drinks and more. Each one credits its creator and links to its reel. They go into a collection called From Reels.</p>
    <div class="stack" style="margin-top:18px">
      <section class="panel stack" id="reels-add">
        <div class="row"><button class="btn primary" data-act="reels-add" id="reels-add-btn" ${fresh ? "" : "disabled"}>${fresh ? `Add ${fresh} Recipe${fresh === 1 ? "" : "s"}` : have ? "All Added" : "Nothing Chosen"}</button>${have ? `<span class="hint">${have} already in your recipes</span>` : ""}</div>
        <p class="hint">${missing} of them are missing some amounts because the reel didn't say. Their notes say so, and none were guessed.</p>
        <details class="reels-pick"><summary>Choose which kinds</summary>
          <div class="list" style="margin-top:8px">${p.groups.map(g => `<label class="check"><input type="checkbox" class="reel-g" value="${esc(g)}" ${sel.has(g) ? "checked" : ""}> <span>${esc(g)}<small class="from">${inGroup(g).length} recipe${inGroup(g).length === 1 ? "" : "s"}</small></span></label>`).join("")}</div>
          <label class="check plain" style="margin-top:8px"><input type="checkbox" id="reel-skip" ${skip ? "checked" : ""}> Leave out recipes with missing amounts</label>
        </details>
      </section>
      ${have ? `<section class="panel stack"><h2>Take them out again</h2><p class="hint">Removes the ones you haven't changed, rated, favorited or cooked. Anything you've made your own stays.</p><div><button class="btn" data-act="reels-remove">Remove Recipes from Reels</button></div></section>` : ""}
    </div>`;
}
function addReels() {
  const p = state.reels; if (!p) return;
  const sel = state.reelGroups || new Set(p.groups), now = Date.now();
  const add = p.recipes.filter(r => sel.has(r.group) && !(state.reelSkip && r.missing) && !state.items.has(r.id)).map(r => ({
    kind: "recipe", id: r.id, title: r.title, ingredients: r.ingredients, steps: r.steps, servings: r.servings || null, yield: r.yield || "",
    prepTime: r.prepTime || "", cookTime: r.cookTime || "", totalTime: r.totalTime || "", tags: [...new Set([...(r.tags || []), "From reels"])],
    notes: r.notes || "", source: r.source || "", image: "", nutrition: null, pack: "reels", packAt: now, createdAt: now }));
  if (!add.length) return;
  const prevBook = state.items.get(REEL_BOOK) ? JSON.parse(JSON.stringify(state.items.get(REEL_BOOK))) : null;
  add.forEach(save);
  const b = prevBook ? { ...prevBook } : { kind: "book", id: REEL_BOOK, name: "From Reels", description: p.description || "", recipeIds: [] };
  b.recipeIds = [...new Set([...(b.recipeIds || []), ...add.map(r => r.id)])]; save(b);
  render(); haptic();
  toast(`Added ${add.length} recipe${add.length === 1 ? "" : "s"} to From Reels`, () => { add.forEach(r => removeItem(r.id)); if (prevBook) save(prevBook); else removeItem(REEL_BOOK); render(); });
}
function removeReels() {
  const gone = recipes().filter(untouchedReel); if (!gone.length) return toast("Every recipe from reels has been changed or used, so they all stay.");
  const ids = new Set(gone.map(r => r.id)), prevBook = state.items.get(REEL_BOOK) ? JSON.parse(JSON.stringify(state.items.get(REEL_BOOK))) : null;
  gone.forEach(r => removeItem(r.id));
  if (prevBook) { const left = (prevBook.recipeIds || []).filter(id => !ids.has(id)); if (left.length) save({ ...prevBook, recipeIds: left }); else removeItem(REEL_BOOK); }
  render();
  toast(`Removed ${gone.length} recipe${gone.length === 1 ? "" : "s"}`, () => { gone.forEach(r => save({ ...r, packAt: Date.now() })); if (prevBook) save(prevBook); render(); });
}

/* ===== Ironwood ===== */
// Extract and Ironwood keep their data apart on the phone, so they trade a backup file, a restore file, and text.
function vIronwood() {
  const x = state.iw, all = recipes().sort((a, b) => a.title.localeCompare(b.title));
  const sel = state.iwOut || (state.iwOut = new Set(weekRecipeIds()));
  const pick = x ? `<div class="iw-pick stack">
      <p class="hint">Ironwood's prep: ${x.prep.length} recipe${x.prep.length === 1 ? "" : "s"} for ${x.people} ${x.people === 1 ? "person" : "people"}, ${x.weeks} week${x.weeks === 1 ? "" : "s"}.${x.missing ? ` ${x.missing} couldn't be read (a newer Ironwood recipe; update Extract's copy of the library).` : ""}${x.from ? ` Backup from ${esc(new Date(x.from).toLocaleDateString(undefined, { month: "short", day: "numeric" }))}.` : ""}</p>
      <div class="list">${x.prep.map(p => `<label class="check"><input type="checkbox" class="iw-r" value="${esc(p.id)}" ${state.iwSel.has(p.id) ? "checked" : ""}> <span>${esc(p.r.name)}<small class="from">${p.n}× a week · ${esc(iw.IW_CATS[p.r.cat] || "")}${findIw(p.id) ? " · already in Extract (updates it)" : ""}</small></span></label>`).join("")}</div>
      ${x.mine.length ? `<h3>Your other Ironwood recipes</h3><div class="list">${x.mine.map(p => `<label class="check"><input type="checkbox" class="iw-r" value="${esc(p.id)}" ${state.iwSel.has(p.id) ? "checked" : ""}> <span>${esc(p.r.name)}${findIw(p.id) ? `<small class="from">already in Extract (updates it)</small>` : ""}</span></label>`).join("")}</div>` : ""}
      <label class="check plain"><input type="checkbox" id="iw-groc" ${x.prep.length ? "checked" : "disabled"}> <span>Add the prep's groceries to my list<small class="from">Scaled to ${x.people} ${x.people === 1 ? "person" : "people"} × ${x.weeks} week${x.weeks === 1 ? "" : "s"}, like Ironwood's list. Things in your pantry are left off.</small></span></label>
      <label class="check plain"><input type="checkbox" id="iw-plan-in" ${x.prep.length ? "" : "disabled"}> <span>Put the prep on this week's plan<small class="from">Each recipe as many times as Ironwood says, from today on. Building blocks are skipped.</small></span></label>
      <div class="row"><button class="btn primary" data-act="iw-import">Import Selected</button><button class="btn" data-act="iw-clear">Cancel</button></div></div>` : "";
  return `<button class="back" data-act="nav" data-v="more">‹ More</button><h1>Ironwood</h1>
    <p class="lede">Extract and Ironwood keep their data apart on your phone, so they trade a file or copied text. Nothing moves until you do it here.</p>
    <div class="stack" style="margin-top:18px">
      <section class="panel stack" id="iw-in"><h2>Bring in Ironwood's meal prep</h2>
        <p class="hint">In Ironwood, go to Profile → Save backup file (or Copy backup). Choose the file here, or paste the copied text. Extract reads only the meal prep and your recipes; workouts stay in Ironwood.</p>
        <div class="row"><label class="btn" for="iw-file">Choose Backup File</label><input type="file" id="iw-file" accept="application/json,.json,text/plain" hidden></div>
        <div class="field"><label for="iw-text">Or paste the backup text</label><textarea id="iw-text" rows="3" placeholder="Paste from Copy backup"></textarea></div>
        <div><button class="btn sm" data-act="iw-read-text">Read Pasted Backup</button></div>
        <p class="status" id="iw-status" role="status"></p>
        ${pick}
      </section>
      <section class="panel stack" id="iw-out"><h2>Send recipes to Ironwood</h2>
        <p class="hint">Makes a file for Ironwood's Profile → Restore. Ironwood only adds recipes it doesn't have yet, so nothing there is replaced, and sending a recipe twice doesn't copy it. For one recipe, open it and tap ⋯ → Send to Ironwood.</p>
        <div class="row"><button class="btn sm" data-act="iw-out-week">This Week's Plan</button><button class="btn sm" data-act="iw-out-fav">Favorites</button><button class="btn sm" data-act="iw-out-none">Clear</button><span class="spacer"></span><span class="count">${sel.size} chosen</span></div>
        <div class="list pick-list">${all.length ? all.map(r => `<label class="check"><input type="checkbox" class="iw-o" value="${esc(r.id)}" ${sel.has(r.id) ? "checked" : ""}> ${esc(r.title)}</label>`).join("") : `<p class="hint" style="padding:12px 14px">No recipes yet.</p>`}</div>
        <label class="check plain"><input type="checkbox" id="iw-plan-out"> <span>Also send this week's plan as Ironwood's meal prep<small class="from">Ironwood uses it only if its own prep is empty.</small></span></label>
        <div><button class="btn primary" data-act="iw-export" ${sel.size ? "" : "disabled"}>Save File for Ironwood</button></div>
        <p class="hint">If Ironwood has no workouts logged yet, its Restore takes a file whole. Send recipes one at a time with ⋯ → Send to Ironwood instead.</p>
      </section>
      <section class="panel stack" id="iw-list"><h2>Ironwood's shopping list</h2>
        <p class="hint">In Ironwood, go to Meals → List → Share or copy, and copy it. Paste it here to put it on your grocery list, sorted into your aisles.</p>
        <div class="field"><label for="iw-shop">Shopping list</label><textarea id="iw-shop" rows="4" placeholder="Ironwood shopping list · …"></textarea></div>
        <div><button class="btn" data-act="iw-shop-add">Add to Grocery List</button></div>
      </section>
    </div>`;
}
const findIw = iwId => recipes().find(r => r.ironwood === iwId);
// Recipes on this week's plan, and how many times each.
function weekCounts() {
  const start = weekStartOf(new Date(), 0), c = new Map();
  for (let i = 0; i < 7; i++) { const d = new Date(start); d.setDate(start.getDate() + i); planDay(dayKey(d)).entries.forEach(e => e.recipeId && state.items.has(e.recipeId) && c.set(e.recipeId, (c.get(e.recipeId) || 0) + 1)); }
  return c;
}
const weekRecipeIds = () => [...weekCounts().keys()];
async function iwRead(text) {
  const st = $("#iw-status"); if (st) { st.className = "status"; st.innerHTML = '<span class="spin"></span> Reading the backup…'; }
  try {
    const x = await iw.readBackup(text);
    if (!x.prep.length && !x.mine.length) { if (st) { st.className = "status err"; st.textContent = "That backup has no meal prep or recipes of your own yet."; } return; }
    state.iw = x; state.iwSel = new Set(x.prep.map(p => p.id)); render();
    const p = $(".iw-pick"); if (p) p.scrollIntoView({ block: "start", behavior: "smooth" });
  } catch (e) { if (st) { st.className = "status err"; st.textContent = e.message === "library" ? "Couldn't load Ironwood's recipe list. Open Extract once while online, then try again." : e.message; } }
}
function iwImport() {
  const x = state.iw; if (!x) return;
  const chosen = [...document.querySelectorAll(".iw-r:checked")].map(i => i.value);
  const all = [...x.prep, ...x.mine], byId = new Map(all.map(p => [p.id, p]));
  const saved = new Map(), now = Date.now();
  for (const id of chosen) {
    const p = byId.get(id); if (!p) continue;
    const prev = findIw(id), r = { ...(prev || {}), ...iw.toExtract(p.r, id), id: prev ? prev.id : newId("r"), createdAt: prev?.createdAt || now, updatedAt: now };
    if (prev) { r.fav = prev.fav; r.rating = prev.rating; r.log = prev.log; r.cooked = prev.cooked; r.image = prev.image || ""; r.links = prev.links; r.tags = [...new Set([...(prev.tags || []), ...r.tags])]; }
    save(r); saved.set(id, r);
  }
  let groc = 0, planned = 0;
  const prepChosen = x.prep.filter(p => saved.has(p.id));
  if ($("#iw-groc")?.checked && prepChosen.length) {
    const pi = pantry().items, before = grocery().items, add = [];
    for (const p of prepChosen) {
      const r = saved.get(p.id), k = iw.prepScale(p, x.people, x.weeks);
      for (const l of r.ingredients) { if (l.startsWith("## ")) continue; const { q, rest } = splitQty(l, k); const text = (q ? q + " " : "") + rest; if (inPantry(itemOf(text).name, pi)) continue; add.push({ id: newId("g"), text, recipeId: r.id, recipeTitle: r.title, done: false }); }
    }
    saveGrocery([...before, ...add]); groc = add.length;
  }
  if ($("#iw-plan-in")?.checked && prepChosen.length) {
    const slots = { breakfast: ["Breakfast"], snack: ["Snack"], main: ["Lunch", "Dinner"] }, used = {};
    for (const p of prepChosen) {
      const meals = slots[p.r.cat]; if (!meals) continue;
      for (let t = 0; t < Math.min(p.n, 7 * meals.length); t++) {
        // fill the soonest free slot of that kind, from today on
        let placed = false;
        for (let i = 0; i < 7 && !placed; i++) for (const meal of meals) {
          const d = new Date(); d.setDate(d.getDate() + i); const key = dayKey(d) + meal;
          if (used[key] || planDay(dayKey(d)).entries.some(e => e.meal === meal)) continue;
          used[key] = 1; const cur = planDay(dayKey(d)).entries; savePlanDay(dayKey(d), [...cur, { id: newId("p"), meal, recipeId: saved.get(p.id).id }]); planned++; placed = true; break;
        }
      }
    }
  }
  state.iw = null; render(); haptic();
  toast(`Imported ${saved.size} recipe${saved.size === 1 ? "" : "s"} from Ironwood${groc ? `, ${groc} grocery item${groc === 1 ? "" : "s"}` : ""}${planned ? `, ${planned} planned meal${planned === 1 ? "" : "s"}` : ""}`);
}
async function iwExport() {
  const ids = [...(state.iwOut || [])].filter(id => state.items.has(id)); if (!ids.length) return;
  const counts = weekCounts();
  const plan = $("#iw-plan-out")?.checked ? ids.filter(id => counts.has(id)).map(id => ({ id, n: counts.get(id) })) : null;
  const name = `extract-for-ironwood-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([iw.ironwoodFile(ids.map(id => state.items.get(id)), plan)], name, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Recipes for Ironwood" }); toast("In Ironwood: Profile → Restore, then choose this file"); return; } catch (e) { if (e && e.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
  toast("Saved. In Ironwood: Profile → Restore, then choose this file");
}
function iwShopAdd() {
  const items = iw.parseShoppingList($("#iw-shop")?.value || ""); if (!items.length) return toast("Paste Ironwood's shopping list first");
  const before = grocery().items;
  saveGrocery([...before, ...items.map(i => ({ id: newId("g"), text: i.text, recipeId: "", recipeTitle: "Ironwood prep", done: false }))]);
  $("#iw-shop").value = ""; render();
  toast(`Added ${items.length} item${items.length === 1 ? "" : "s"} to your grocery list`, () => { saveGrocery(before); render(); });
}

/* ===== Help ===== */
const HELP = [
  ["Save a recipe from a website", "Copy the recipe page's link, then tap Paste Recipe Link on the home screen (or + at the top, then Paste Link). Check it over, then Save Recipe. Sites that turn readers away, like Allrecipes, are read from the Internet Archive's saved copy."],
  ["Save from Instagram, TikTok or YouTube", "Copy the post's link (Share → Copy Link) and paste it. Extract reads the caption or description. If the caption only says “recipe in bio”, open the creator's website and paste that link instead."],
  ["When an import doesn't work", "Extract keeps your link and says why. Try Again, paste the page's text, type it in, or tap Save for Later. Saved links wait on the + page."],
  ["Save from my phone's Share button", "Android: once Extract is installed, tap Share on any recipe page and pick Extract. iPhone: Share → Copy, then open Extract, tap + at the top, then Paste Link."],
  ["Cook with it", "Open a recipe and tap Start Cooking. Each step shows big, with the ingredients it uses. Swipe or tap Next Step. Times like “25 minutes” get a big Start Timer button. A+ and A− change the text size."],
  ["Quick actions", "Press and hold a recipe card for Start Cooking, Add to Plan, Add to Grocery List and more. Swipe a grocery item right to check it off, or left for options. Every gesture also has a visible button."],
  ["Undo", "Deleting a recipe, a grocery item, a planned meal or a pantry item shows an Undo button for a few seconds."],
  ["Rate a recipe and keep notes", "Tap the stars under a recipe's title. Log a Cook (or finishing cooking) adds a dated note to its Cooking log. Sort your recipes by Top rated."],
  ["Group ingredients or steps under headings", "When editing a recipe, tap Add Heading, or type a short line that ends with a colon, like “For the sauce:”. It shows as a heading on the recipe."],
  ["Shop by aisle", "Groceries sorts everything by store aisle and adds up repeats, like 1 onion + 2 onions = 3 onions. Arrange Aisles puts them in your store's order; an item's ⋯ menu moves it to another aisle."],
  ["Use the pantry", "Add what you have at home on the Pantry tab. Those items start unticked when you add a recipe to your list, and What can I make? ranks your recipes by what you already have. After shopping, check items off and tap Put in Pantry."],
  ["Plan the week", "Plan → + Add on a day. Press and hold a meal to drag it to another day. Fill Empty Days picks recipes for you, and Add Week to Grocery List shops for all of it at once."],
  ["Put meals on my calendar", "Plan → Add to Calendar makes a calendar file of the week at the meal times you choose. Open it to add the meals to your phone's calendar."],
  ["Can't decide what to make", "On Recipes, tap Surprise Me for a random pick from what's showing. Tap Another for a different one."],
  ["Link a sauce or dough to a dish", "On the recipe, tap ⋯ → Link Other Recipes. A recipe named in the ingredients (“1 cup pizza sauce”) links by itself."],
  ["Follow recipe blogs", "More → From Blogs. Follow a blog by its address, or tap a suggestion. Tap Save on a post to import it."],
  ["Plan a week like meal prep", "Meal Plan → Plan My Week. Pick the meals, how many people, and how often you cook: once a week uses the fewest recipes (batch cooking), most days gives more variety. Add a daily calorie and protein target if you want, or let Extract work one out from your height, weight and activity. Portions then move in half servings toward it, for recipes that list calories. Tick Ironwood's meal-prep recipes for about 150 more, all with calories. This week's cooking shows how many servings and batches to make, and the grocery list follows those amounts. Swap a meal or change its servings from its ⋯ menu."],
  ["Recipes from Reels", "More → Recipes from Reels adds 327 recipes saved from Instagram reels in one tap, into a collection called From Reels. Choose which kinds first if you like. Adding again never doubles up, and Remove Recipes from Reels takes out the ones you haven't changed, rated, favorited or cooked."],
  ["Use it with Ironwood", "More → Ironwood. To bring in Ironwood's meal prep, save a backup in Ironwood (Profile → Save backup file) and choose it there; you can add its groceries and put it on this week's plan. To send recipes to Ironwood, save the file there and use Ironwood's Profile → Restore (it only adds recipes it doesn't have). For one recipe, ⋯ → Send to Ironwood, then Ironwood's Meals → Recipes → From a post."],
  ["Share a recipe or a collection", "Tap Share. The link holds a copy of the recipe, so anyone can open and save it without an account."],
  ["Make the text bigger", "Extract follows your phone's text size. Settings → Text size makes it bigger still, and cooking mode has its own A+ and A−."],
  ["Use it offline", "Saved recipes, cooking, timers, your plan, groceries and pantry all work without internet. Importing links, blogs and sync need a connection; links you paste offline can be saved for later."],
  ["Keep recipes safe", "Recipes are saved on this phone. Settings → Save a Backup now and then, or turn on sync to keep them on your other devices too."]
];
const LIMITS = [
  ["iPhone Share menu", "iPhone doesn't let web apps appear in Safari's Share menu, so on iPhone you copy the link and tap Paste link. Android is fine."],
  ["Videos", "Extract reads a post's caption or description, never the video. If the creator only says the recipe out loud, there's nothing to read. Instagram sometimes hides captions from readers; paste the caption instead."],
  ["Photos and messy pages", state.ai ? "Photos and pages without recipe data are read by Claude, which takes up to a minute." : "Reading photos, and pages with no built-in recipe data, uses Claude, which isn't set up yet. Settings shows how."],
  ["Aisles start as a guess", "Aisles come from the ingredient's name until you move an item from its ⋯ menu. A moved item stays moved, by its plain name (“onion”), on every list."],
  ["Timers", "Timers ring only while Extract is open. Phones don't let web apps ring in the background."],
  ["Vibration", "Light vibration works on Android. iPhone doesn't allow it for web apps."],
  ["Calendar is a copy", "The calendar file is a snapshot. If you change the plan, add it to the calendar again."],
  ["Blogs need a feed", "Only blogs that publish a feed and let readers in can be followed (most do; a few big ones, like Budget Bytes, don't). New posts are checked when you open From blogs, not in the background, and there are no notifications."],
  ["Amounts that don't match", "Repeats are only added up when the units match (2 tbsp + 1 tbsp). Cups and grams of the same thing stay on one line as “1 cup + 200 g”."],
  ["The pantry is simple", "It knows what you have, not how much, and doesn't change as you cook or by use-by dates."],
  ["Nutrition", "Only shown when the recipe's website lists it. Extract doesn't work it out for recipes you type in."],
  ["Your data", sync.info().signedIn ? "Sync is on, so your recipes are also kept in your Supabase account." : "Without sync, everything lives only on this phone. Removing Extract from the home screen deletes it, so save a backup first."],
  ["Ironwood is a separate app", "Extract and Ironwood keep separate data, so nothing syncs between them by itself. Import or send again after changes. Ironwood's mix-and-match recipes come from Extract's copy of its recipe list, which is updated when Extract is."],
  ["Native-app features", "As a home-screen web app, Extract can't use Apple Watch, Siri, the Reminders app, or kitchen scales."]
];
const TOUR_PARTS = [["recipes", "Home and recipes", ["library"]], ["add", "Adding recipes", ["add"]], ["recipe", "A recipe and cooking", ["recipe", "cook"]], ["plan", "Meal Plan", ["plan"]], ["list", "Groceries and pantry", ["list", "pantry"]], ["more", "More and settings", ["more", "feeds", "settings", "help", "ironwood"]]];
const tourPart = key => { const p = TOUR_PARTS.find(x => x[0] === key); return FULL_TOUR.filter(t => p[2].includes(t.view)); };
function vHelp() {
  return `<button class="back" data-act="nav" data-v="more">‹ More</button><h1>Help and Tour</h1>
    <div class="stack" style="margin-top:18px">
      <section class="panel stack"><h2>Tour</h2><p class="hint">The quick tour points at the ${QUICK_TOUR.length} things you'll use most. For a closer look, pick one part below. Skip any time; nothing you do in a tour is saved.</p>
        <div><button class="btn primary" data-act="tour" id="help-tour">Take the Quick Tour</button></div>
        <div class="chips" id="tour-parts">${TOUR_PARTS.map(([k, label]) => `<button class="chip" data-act="tour-part" data-v="${k}">${esc(label)} <span class="n">${tourPart(k).length}</span></button>`).join("")}</div></section>
      <section class="panel stack"><h2>How do I…</h2><div class="faq">${HELP.map(([q, a]) => `<details><summary>${esc(q)}</summary><p>${esc(a)}</p></details>`).join("")}</div></section>
      <section class="panel stack" id="limits"><h2>What Extract can't do (yet)</h2><ul class="limits">${LIMITS.map(([t, d]) => `<li><strong>${esc(t)}</strong><span>${esc(d)}</span></li>`).join("")}</ul></section>
      <section class="panel stack"><h2>What's new</h2>${whatsNewHtml()}</section>
    </div>`;
}
function vMessage() { return `<div class="empty"><strong>${esc(state.view.title)}</strong><span>${esc(state.view.body)}</span><button class="btn" data-act="nav" data-v="library">Go to my recipes</button></div>`; }

function syncSection() {
  const i = sync.info();
  const ago = t => { if (!t) return "not yet"; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} hr ago` : new Date(t).toLocaleDateString(); };
  if (!i.configured) return `<section class="panel stack" id="sync-panel"><h2>Sync between devices</h2>
    <p class="hint">Off. To keep recipes, collections, your meal plan and grocery list in step across your phone and computer, connect a free Supabase project. The setup guide in your GitHub repo (README, “Sync between devices”) takes about 10 minutes.</p></section>`;
  if (i.signedIn) return `<section class="panel stack" id="sync-panel"><h2>Sync between devices</h2>
    <p class="hint">On for <strong>${esc(i.email)}</strong>. ${i.syncing ? "Syncing…" : `Last synced ${esc(ago(i.lastSync))}.`}${i.error ? ` <span class="status err">${esc(i.error)}</span>` : ""}</p>
    <div class="row"><button class="btn" data-act="sync-now" ${i.syncing ? "disabled" : ""}>Sync now</button><span class="spacer"></span><button class="btn ghost" data-act="sync-out">Sign out</button></div>
    <p class="hint">Sign in with the same email on your other devices. Share links are short while you're signed in.</p></section>`;
  const sent = state.syncEmailSent;
  return `<section class="panel stack" id="sync-panel"><h2>Sync between devices</h2>
    <p class="hint">Sign in with your email to keep everything in step on all your devices. We'll email you a 6-digit code. No password.</p>
    ${sent ? `<form class="stack" data-form="sync-verify" style="gap:10px">
        <p class="hint">Code sent to <strong>${esc(sent)}</strong>. It can take a minute; check spam too.</p>
        <div class="row"><input type="text" id="sync-code" inputmode="numeric" autocomplete="one-time-code" placeholder="6-digit code" aria-label="Code from your email" maxlength="10" style="flex:1;width:auto"><button class="btn primary">Sign in</button></div>
        <div class="row"><button type="button" class="btn sm ghost" data-act="sync-restart">Use a different email</button><button type="button" class="btn sm ghost" data-act="sync-resend">Send a new code</button></div>
      </form>` : `<form class="row" data-form="sync-email">
        <input type="email" id="sync-email" autocomplete="email" placeholder="you@example.com" aria-label="Email" required style="flex:1;width:auto">
        <button class="btn primary">Email me a code</button></form>`}
    <span class="status" id="sync-status"></span></section>`;
}
function redrawSync() { const p = $("#sync-panel"); if (p && state.view.name === "settings" && !p.contains(document.activeElement)) p.outerHTML = syncSection(); }
sync.onChange(redrawSync);
const syncStatus = (msg, err) => { const s = $("#sync-status"); if (s) { s.className = "status" + (err ? " err" : ""); s.textContent = msg; } };
async function sendSyncCode(email) {
  syncStatus("Sending…");
  try { await sync.sendCode(email); state.syncEmailSent = email; render(); const c = $("#sync-code"); if (c) c.focus(); }
  catch (e) { syncStatus(/rate|seconds/i.test(e.message || "") ? "Please wait a minute before asking for another code." : "Couldn't send the code. Check the email address and try again.", true); }
}

function vSettings() {
  const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const n = recipes().length, nb = books().length;
  const seg = (key, opts, id) => `<div class="seg" role="group" ${id ? `id="${id}"` : ""}>${opts.map(([v, l]) => `<button data-act="pref" data-k="${key}" data-v="${v}" aria-pressed="${(settings.get(key) || "") === v}">${l}</button>`).join("")}</div>`;
  return `<button class="back" data-act="nav" data-v="more">‹ More</button><h1>Settings</h1>
    <div class="stack" style="margin-top:20px">
      <section class="panel stack"><h2>Appearance</h2>
        <div class="setrow"><span>Theme</span><div class="seg" role="group" aria-label="Theme" id="theme-seg">${[["", "Match Phone"], ["light", "Light"], ["dark", "Dark"]].map(([v, l]) =>
          `<button data-act="theme" data-v="${v}" aria-pressed="${(settings.get("theme") || "") === v}">${l}</button>`).join("")}</div></div>
        <div class="setrow"><span>Text size</span>${seg("textSize", [["", "Default"], ["lg", "Large"], ["xl", "Larger"]], "text-seg")}</div>
        <p class="hint">Default follows your phone's text size. Cooking mode also has its own A− and A+ buttons.</p>
      </section>
      <section class="panel stack"><h2>Timers and feedback</h2>
        <div class="setrow"><span>Timer sound</span>${seg("timerSound", [["", "On"], ["off", "Off"]])}</div>
        <div class="setrow"><span>Vibration</span>${seg("haptics", [["", "On"], ["off", "Off"]])}</div>
        <p class="hint">Timers ring while Extract is open, even on another screen. Phones don't let web apps ring in the background, so keep Extract open while a timer runs. iPhone doesn't allow vibration from web apps.</p>
      </section>
      <section class="panel stack"><h2>Put it on your home screen</h2>
        ${standalone ? `<p class="hint">Installed. You're using Extract as an app.</p>` : `
        <ol class="steps-howto"><li><strong>iPhone:</strong> open this page in Safari, tap the Share button, then <em>Add to Home Screen</em>.</li>
        <li><strong>Android:</strong> open this page in Chrome, tap the ⋮ menu, then <em>Install app</em> (or <em>Add to Home screen</em>).</li></ol>`}
      </section>
      <section class="panel stack"><h2>Save recipes from other apps</h2>
        <ol class="steps-howto">
          <li><strong>Android:</strong> once installed, tap Share on any recipe page and pick <em>Extract</em>. It opens and fetches the recipe.</li>
          <li><strong>iPhone:</strong> tap Share on the recipe page, then <em>Copy</em>. Open Extract, tap Add, then <em>Paste link</em>.</li>
        </ol>
        ${ios ? `<p class="hint">iPhone keeps home-screen apps' storage separate from Safari, so recipes you save in Safari won't appear in the installed app. Use the installed app.</p>` : ""}
      </section>
      <section class="panel stack"><h2>Claude reading</h2>
        <p class="hint">${state.ai ? "On. Photos, pasted text, and sites without standard recipe data are read by Claude." : "Off. Links from most recipe sites still work. To read photos, pasted text, and other sites, add a Claude API key to this app in Vercel (the setup guide in your GitHub repo shows how)."}</p>
        ${state.locked || settings.get("access") ? `<div class="field"><label for="s-access">Access code</label><div class="row"><input type="password" id="s-access" value="${esc(settings.get("access"))}" autocomplete="off" style="flex:1;width:auto"><button class="btn" data-act="save-access">Save</button></div>
          <p class="hint">This app is locked so strangers can't use it. Enter the access code you set in Vercel.</p></div>` : ""}
      </section>
      ${syncSection()}
      <section class="panel stack"><h2>App icon</h2>
        <div class="icon-pick" role="group" aria-label="Home screen icon">
          ${[["", "Match phone"], ["dark", "Dark"], ["light", "Light"]].map(([v, l]) => `<button class="icon-opt" data-act="icon-style" data-v="${v}" aria-pressed="${(settings.get("iconStyle") || "") === v}">
            ${v ? `<img src="/icons/${v === "light" ? "apple-touch-icon-light" : "apple-touch-icon"}.png" alt="" width="56" height="56">` : `<span class="icon-split"><img src="/icons/apple-touch-icon.png" alt="" width="56" height="56"><img src="/icons/apple-touch-icon-light.png" alt="" width="56" height="56"></span>`}
            <span>${l}</span></button>`).join("")}
        </div>
        <p class="hint">Home-screen web apps keep the icon they were added with. To change it, remove Extract from your home screen and add it again.${sync.info().signedIn ? "" : " That also clears the recipes saved on this phone, so save a backup first (below), or turn on sync."}</p>
      </section>
      <section class="panel stack"><h2>Meal plan</h2>
        <div class="row"><span>Weeks start on</span><div class="seg" role="group" aria-label="Week starts on">
          <button data-act="week-start" data-v="sun" aria-pressed="${settings.get("weekStart") !== "mon"}">Sunday</button><button data-act="week-start" data-v="mon" aria-pressed="${settings.get("weekStart") === "mon"}">Monday</button></div></div>
      </section>
      <section class="panel stack"><h2>Backup</h2>
        <p class="hint">${n} recipe${n === 1 ? "" : "s"} and ${nb} collection${nb === 1 ? "" : "s"} are saved on this device${state.persisted ? ", protected from automatic cleanup" : ""}. Save a backup now and then, or to move to a new phone.</p>
        <div class="row"><button class="btn primary" data-act="export">Save a backup</button>
          <label class="btn" for="s-import">Restore from backup</label><input type="file" id="s-import" accept="application/json,.json" hidden></div>
      </section>
      <p class="hint">Extract is free and has no ads. Recipes stay on your device unless you share them.</p>
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
    ${link ? `<div class="row">${navigator.share ? `<button class="btn primary" data-act="native-share">Share Link</button>` : ""}<button class="btn${navigator.share ? "" : " primary"}" data-act="copy-link">Copy Link</button></div>
      <p class="hint">${/#s=/.test(link) ? `A short link to a copy of this ${isBook ? "collection" : "recipe"}. Anyone with it can open it and save their own, no account needed. Later edits don't change it.` : `The link holds the ${isBook ? "whole collection" : "recipe"} itself, so it opens for anyone, no account needed. It's a copy: later edits don't change it.${long ? " This one is long, so some messaging apps may cut it off. If that happens, send it as text, or turn on sync in Settings for short links." : ""}`}</p>
      <input type="text" id="sh-link" readonly value="${esc(link)}" aria-label="Share link">` : ""}
    <div class="field"><label for="sh-text">As text, for a message or email</label><textarea id="sh-text" rows="6" readonly>${esc(text)}</textarea></div>
    <div class="row"><button class="btn" data-act="copy-text">Copy Text</button><span class="spacer"></span><button class="btn" data-act="close-modal">Done</button></div>`);
  state.shareCtx = { title, link };
}
// Sheets rise from the bottom on phones (one-handed); dialogs sit in the middle on bigger screens.
// Focus goes into the dialog, stays there while it's open (Tab wraps), and returns to what opened it.
let modalReturn = null;
function modal(html, sheet) {
  if (!$("#modal-root").innerHTML) modalReturn = document.activeElement;
  $("#modal-root").innerHTML = `<div class="scrim" data-act="scrim"><div class="modal${sheet ? " sheet" : ""}" role="dialog" aria-modal="true" tabindex="-1">${html}</div></div>`;
  const m = $("#modal-root .modal"); if (m) m.focus({ preventScroll: true });
}
function closeModal() {
  if (!$("#modal-root").innerHTML) return;
  $("#modal-root").innerHTML = "";
  const back = modalReturn; modalReturn = null;
  if (back && document.contains(back) && back !== document.body) back.focus({ preventScroll: true });
}
function copyFrom(el) {
  navigator.clipboard.writeText(el.value).then(() => toast("Copied"), () => { el.focus(); el.select(); toast("Text selected. Use Copy from the menu."); });
}

/* ===== Cooking log ===== */
// fromCook: they just finished cook mode, so Skip still counts it as cooked.
function openCookLog(id, fromCook) {
  const r = state.items.get(id); if (!r) return;
  state.logCtx = { id, count: fromCook, rating: r.rating || 0 };
  const today = dayKey(new Date());
  modal(`<h2>${fromCook ? "Enjoy your meal! How did it go?" : `Log “${esc(r.title)}”`}</h2>
    <div class="field"><label>Your rating</label><div class="stars big" role="group" aria-label="Your rating">${[1, 2, 3, 4, 5].map(n => `<button type="button" data-act="log-stars" data-v="${n}" aria-pressed="${(r.rating || 0) >= n}" aria-label="${n} star${n === 1 ? "" : "s"}">★</button>`).join("")}</div></div>
    <div class="field"><label for="log-date">Made on</label><input type="date" id="log-date" value="${today}" max="${today}"></div>
    <div class="field"><label for="log-note">Notes for next time</label><textarea id="log-note" rows="3" placeholder="Doubled the garlic. Needed 5 more minutes. Kids loved it."></textarea></div>
    <div class="row"><button class="btn primary" data-act="log-save">Save</button><button class="btn" data-act="${fromCook ? "log-skip" : "close-modal"}">${fromCook ? "Skip" : "Cancel"}</button></div>`);
}
function saveCookLog() {
  const c = state.logCtx, r = state.items.get(c.id); if (!r) return closeModal();
  const d = $("#log-date").value, note = $("#log-note").value.trim().slice(0, 1000);
  const at = d ? new Date(d + "T12:00:00").getTime() : Date.now();
  const entry = { id: newId("l"), at: d === dayKey(new Date()) ? Date.now() : at, note, rating: c.rating || 0 };
  save({ ...r, rating: c.rating || r.rating || 0, cooked: [...(r.cooked || []), entry.at].sort((a, b) => a - b).slice(-100), log: [...(r.log || []), entry].slice(-200) });
  closeModal(); render(); toast("Added to your cooking log");
}

/* ===== Your own photos ===== */
// Keep what's typed in the editor when it redraws for a photo change.
function keepDraftFields() {
  const d = state.draft; if (!d || !$("#f-title")) return;
  const v = id => $(id).value;
  Object.assign(d, { title: v("#f-title"), servings: parseInt(v("#f-serv"), 10) || null, yield: v("#f-yield"), prepTime: v("#f-prep"), cookTime: v("#f-cook"), totalTime: v("#f-total"),
    ingredients: v("#f-ings").split("\n"), steps: v("#f-steps").split(/\n\s*\n/), notes: v("#f-notes"), source: v("#f-src"), tags: v("#f-tags").split(",").map(s => s.trim()).filter(Boolean) });
}
async function addOwnPhoto(file) {
  keepDraftFields();
  try {
    const url = URL.createObjectURL(file); const img = new Image(); img.src = url; await img.decode();
    const sc = Math.min(1, 1200 / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas"); c.width = Math.round(img.naturalWidth * sc); c.height = Math.round(img.naturalHeight * sc);
    c.getContext("2d").drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url);
    state.draft.image = c.toDataURL("image/jpeg", 0.78);
  } catch { toast("That file couldn't be opened as a photo."); }
  render();
}

/* ===== Backup ===== */
async function exportBackup() {
  const data = { app: "extract", version: 1, exportedAt: new Date().toISOString(), items: [...state.items.values()] };
  const name = `extract-backup-${new Date().toISOString().slice(0, 10)}.json`;
  const file = new File([JSON.stringify(data, null, 1)], name, { type: "application/json" });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: "Extract backup" }); return; } catch (e) { if (e && e.name === "AbortError") return; }
  }
  const a = document.createElement("a"); a.href = URL.createObjectURL(file); a.download = name;
  document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000);
}
async function importBackup(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch { return toast("That file isn't an Extract backup."); }
  const items = Array.isArray(data) ? data : data && Array.isArray(data.items) ? data.items : null;
  if (!items) return toast("That file isn't an Extract backup.");
  let added = 0, updated = 0;
  for (const it of items) {
    if (!it || !it.id || !["recipe", "book", "grocery", "planday", "pantry", "aislemap", "feeds", "pending"].includes(it.kind)) continue;
    const cur = state.items.get(it.id);
    if (!cur) added++; else if ((it.updatedAt || 0) > (cur.updatedAt || 0)) updated++; else continue;
    state.items.set(it.id, it);
    if (useLocal) saveLocalAll(); else await idb("readwrite", s => s.put(it)).catch(() => {});
    if (sync.info().signedIn) sync.markDirty(it.id);
  }
  toast(`Restored: ${added} new, ${updated} updated.`); render();
}

/* ===== Wake lock ===== */
async function takeWake() {
  const lock = await navigator.wakeLock.request("screen");
  state.wake = lock;
  lock.addEventListener("release", () => { if (state.wake === lock) { state.wake = null; if (["recipe", "cook"].includes(state.view.name) && !document.querySelector(".scrim")) render(); } });
}
async function toggleWake() {
  if (state.wake) { state.wantWake = false; try { await state.wake.release(); } catch {} state.wake = null; render(); return; }
  state.wantWake = true;
  try { await takeWake(); }
  catch { if (!state.wakeWarned) { state.wakeWarned = true; toast("Your phone won't keep the screen on here."); } } // say it once, not every time cooking starts
  render();
}
document.addEventListener("visibilitychange", async () => {
  if (document.visibilityState === "visible" && state.wantWake && !state.wake) {
    try { await takeWake(); render(); } catch {}
  }
});

/* ===== Actions ===== */
function saveRecipeForm() {
  const d = state.draft || {}, val = id => $(id).value.trim(), steps = $("#f-steps").value.trim();
  const r = {
    ...(d.id ? state.items.get(d.id) : {}), kind: "recipe", id: d.id || newId("r"),
    title: val("#f-title") || "Untitled recipe", servings: parseInt(val("#f-serv"), 10) || null, yield: val("#f-yield"),
    prepTime: val("#f-prep"), cookTime: val("#f-cook"), totalTime: val("#f-total"),
    ingredients: $("#f-ings").value.split("\n").map(s => s.trim()).filter(Boolean).map(fromFormLine),
    steps: (/\n\s*\n/.test(steps) ? steps.split(/\n\s*\n/) : steps.split("\n")).map(s => s.replace(/\s+/g, " ").trim()).filter(Boolean).map(fromFormLine),
    notes: $("#f-notes").value.trim(), source: val("#f-src"),
    tags: [...new Set(val("#f-tags").split(",").map(s => s.trim()).filter(Boolean))],
    image: d.image || "", nutrition: d.nutrition || null
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
  toast("Collection saved"); go({ name: "book", id: b.id });
}
function clearHash() { try { history.replaceState(null, "", location.pathname); } catch {} }
function currentRecipe() { const v = state.view; if (v.name === "recipe") return state.items.get(v.id); if (v.name === "shared") return v.recipeIdx != null ? v.payload.recipes[v.recipeIdx] : v.payload.recipe; return null; }

document.addEventListener("click", async e => {
  const el = e.target.closest("[data-act]"); if (!el) return;
  const a = el.dataset.act, id = el.dataset.id;
  if (a === "scrim") { if (e.target === el) closeModal(); return; }
  if (el.tagName === "A") e.preventDefault();
  switch (a) {
    case "reels-add": return addReels();
    case "reels-remove": return removeReels();
    case "reels-retry": state.reelsErr = false; return render();
    case "nav": if (state.view.name === "shared") clearHash(); return go({ name: el.dataset.v });
    case "back-book": { const b = books().find(b => (b.recipeIds || []).includes(state.view.id)); return go(b ? { name: "book", id: b.id } : { name: "library" }); }
    case "open-recipe": if (state.swallowTap && !el.closest(".modal")) return; closeModal(); return go({ name: "recipe", id, from: el.dataset.from });
    case "open-book": return go({ name: "book", id });
    case "tag": state.tag = el.dataset.tag; if (!el.dataset.tag) state.fav = false; state.focusQ = false; return render();
    case "fav-filter": state.fav = !state.fav; state.focusQ = false; return render();
    case "fav": { const r = state.items.get(id); save({ ...r, fav: !r.fav }); closeModal(); haptic(); toast(r.fav ? "Removed from favorites" : "Added to favorites"); return render(); }
    case "cooked": closeModal(); return openCookLog(id, false);
    case "example": { const r = { ...JSON.parse(JSON.stringify(EXAMPLE)), kind: "recipe", id: newId("r") }; save(r); return go({ name: "recipe", id: r.id }); }
    case "ing": { const i = +el.dataset.i; state.cook.ings.has(i) ? state.cook.ings.delete(i) : state.cook.ings.add(i); el.closest("li").classList.toggle("done", el.checked); return; }
    case "step": { const i = +el.dataset.i; state.cook.steps.has(i) ? state.cook.steps.delete(i) : state.cook.steps.add(i); el.classList.toggle("done"); el.setAttribute("aria-pressed", state.cook.steps.has(i)); return; }
    case "clear-checks": state.cook.ings.clear(); return render();
    case "scale": { const r = currentRecipe(); if (!r || !r.servings) return; const s = Math.max(1, Math.round(r.servings * state.cook.scale) + (+el.dataset.d)); state.cook.scale = s / r.servings; return render(); }
    case "mult": { const st = [0.25, 0.5, 1, 1.5, 2, 3, 4]; let i = st.indexOf(state.cook.scale); if (i < 0) i = 2; state.cook.scale = st[Math.min(st.length - 1, Math.max(0, i + (+el.dataset.d)))]; return render(); }
    case "wake": return toggleWake();
    case "edit": closeModal(); state.draft = JSON.parse(JSON.stringify(state.items.get(id))); return go({ name: "edit" });
    case "cancel-edit": { const d = state.draft; state.draft = null; return go(d && d.id ? { name: "recipe", id: d.id } : { name: "add" }); }
    case "add-tag": { const f = $("#f-tags"); const cur = f.value.split(",").map(s => s.trim()).filter(Boolean); if (!cur.includes(el.dataset.tag)) cur.push(el.dataset.tag); f.value = cur.join(", "); return; }
    case "delete-ask": case "delete-book-ask": state.confirm = id; state.moreMenu = false; return render();
    case "confirm-no": state.confirm = null; return render();
    case "delete-yes": return deleteRecipe(id);
    case "delete-book-yes": removeItem(id); toast("Collection deleted"); return go({ name: "books" });
    case "delete-book": { const b = state.items.get(id); closeModal(); removeItem(id); go({ name: "books" }); return toast(`Deleted “${b.name}”. Its recipes are still saved.`, () => { save(b); render(); }); }
    case "book-menu": return openCollectionPick(id || state.view.id);
    case "more": return openRecipeSheet(id || state.view.id);
    case "delete-recipe": return deleteRecipeUndoable(id);
    case "toast-undo": { const u = toastUndo; toastUndo = null; $("#toast").hidden = true; if (u) u(); return; }
    case "clear-filter": state.q = ""; state.tag = ""; state.fav = false; return render();
    case "book-toggle": { const b = state.items.get(el.dataset.book), rid = el.dataset.recipe, has = (b.recipeIds || []).includes(rid);
      save({ ...b, recipeIds: has ? b.recipeIds.filter(x => x !== rid) : [...(b.recipeIds || []), rid] }); if (!has) haptic(); toast(has ? `Removed from ${b.name}` : `Saved to ${b.name}`); return; }
    case "book-remove": { const b = state.items.get(el.dataset.book); save({ ...b, recipeIds: b.recipeIds.filter(x => x !== el.dataset.recipe) }); closeModal(); render(); return toast(`Removed from ${b.name}`, () => { save(b); render(); }); }
    case "book-edit": closeModal(); state.view.editing = true; return render();
    case "book-options": { const b = state.items.get(id); if (!b) return;
      return modal(`<h2 class="sheet-t">${esc(b.name)}</h2><div class="sheet-list">
        <button class="mitem" data-act="book-edit">Rename or Describe</button>
        <button class="mitem danger" data-act="delete-book" data-id="${esc(id)}">Delete Collection <span class="hint">Its recipes stay saved</span></button></div>
        <button class="btn" data-act="close-modal">Cancel</button>`, true); }
    case "book-edit-cancel": state.view.editing = false; return render();
    case "book-pick": state.view.picking = true; return render();
    case "book-pick-cancel": state.view.picking = false; return render();
    case "book-pick-add": { const b = state.items.get(id), ids = [...document.querySelectorAll(".pick:checked")].map(i => i.value);
      if (!ids.length) return toast("Tick at least one recipe first."); save({ ...b, recipeIds: [...(b.recipeIds || []), ...ids] }); state.view.picking = false; haptic(); toast(`Added ${ids.length} recipe${ids.length === 1 ? "" : "s"}`); return render(); }
    case "share": closeModal(); return openShare(state.items.get(id));
    case "native-share": { const c = state.shareCtx; try { await navigator.share({ title: c.title, text: c.title, url: c.link }); } catch {} return; }
    case "copy-link": return copyFrom($("#sh-link"));
    case "copy-text": return copyFrom($("#sh-text"));
    case "close-modal": return closeModal();
    case "add-tab": state.addTab = el.dataset.t; return render();
    case "fetch-link": return fetchFromLink($("#x-url") ? $("#x-url").value : state.failedUrl || "");
    case "pend-save": { const u = ($("#x-url")?.value || state.failedUrl || "").trim(); if (u) savePending(findUrl(u) || u); state.failedUrl = ""; return; }
    case "pend-del": { const ps = pendStore(); save({ ...ps, links: ps.links.filter(l => l.id !== id) }); return render(); }
    case "pend-go": { const l = pendingLinks().find(x => x.id === id); if (!l) return; const ps = pendStore(); save({ ...ps, links: ps.links.filter(x => x.id !== id) }); state.addTab = "link"; state.pendingUrl = l.url; return go({ name: "add" }); }
    case "pend-all": { const ls = pendingLinks(); save({ ...pendStore(), links: [] }); state.addTab = "many"; go({ name: "add" }); const m = $("#x-many"); if (m) { m.value = ls.map(l => l.url).join("\n"); importMany(m.value, ""); } return; }
    case "manual-from-link": return openDraft({ title: "", ingredients: [], steps: [], tags: [], source: state.failedUrl || "" });
    case "import-many": return importMany($("#x-many").value, $("#x-many-tag").value.trim());
    // Home: read a link from the clipboard and import it. Without clipboard access, go to the Link tab.
    case "iw-send": { closeModal(); const r = state.items.get(id); if (!r) return;
      const t = iw.postText(r);
      try { await navigator.clipboard.writeText(t); toast("Copied. In Ironwood: Meals → Recipes → From a post, then paste"); }
      catch { modal(`<h2>Send to Ironwood</h2><p class="hint">Copy this, then in Ironwood go to Meals → Recipes → From a post and paste it.</p><textarea id="sh-text" rows="10" readonly>${esc(t)}</textarea><div class="row"><button class="btn primary" data-act="copy-text">Copy Text</button><button class="btn" data-act="close-modal">Done</button></div>`); }
      return; }
    case "iw-read-text": return iwRead($("#iw-text")?.value || "");
    case "iw-import": return iwImport();
    case "iw-clear": state.iw = null; return render();
    case "iw-export": return iwExport();
    case "iw-shop-add": return iwShopAdd();
    case "iw-out-week": state.iwOut = new Set(weekRecipeIds()); return render();
    case "iw-out-fav": state.iwOut = new Set(recipes().filter(r => r.fav).map(r => r.id)); return render();
    case "iw-out-none": state.iwOut = new Set(); return render();
    case "insert-heading": {
      const ta = $("#" + el.dataset.for); if (!ta) return;
      const word = "New heading:", at = ta.selectionStart ?? ta.value.length, v = ta.value;
      const before = v.slice(0, at), after = v.slice(at);
      const sep = el.dataset.for === "f-steps" ? "\n\n" : "\n";
      const pre = !before || before.endsWith(sep) ? "" : (before.endsWith("\n") && sep === "\n\n" ? "\n" : sep);
      ta.value = before + pre + word + (after.startsWith("\n") ? "" : sep) + after;
      const start = before.length + pre.length; ta.focus(); ta.setSelectionRange(start, start + word.length - 1); return;
    }
    case "paste-import": {
      let t = ""; try { t = await navigator.clipboard.readText(); } catch {}
      const u = findUrl(t);
      state.addTab = "link";
      if (u) { state.pendingUrl = u; return go({ name: "add" }); }
      go({ name: "add" }); setStatus(t ? "That isn't a link. Copy the recipe page's link, then tap Paste Link." : "Paste or type the recipe's link here.", !!t);
      const x = $("#x-url"); if (x && !t) x.focus(); return;
    }
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
    case "pref": { const k = el.dataset.k, v = el.dataset.v; settings.set(k, v);
      if (k === "textSize") { if (v) document.documentElement.setAttribute("data-text", v); else document.documentElement.removeAttribute("data-text"); }
      if (k === "haptics" && !v) haptic(15);
      return render(); }
    case "theme": {
      const t = el.dataset.v; settings.set("theme", t);
      if (t) document.documentElement.setAttribute("data-theme", t); else document.documentElement.removeAttribute("data-theme");
      $("#tc-light").content = t === "dark" ? "#1C1A17" : "#26231F";
      $("#tc-dark").content = t === "light" ? "#26231F" : "#1C1A17";
      return render();
    }
    case "icon-style": {
      settings.set("iconStyle", el.dataset.v);
      const light = el.dataset.v === "light" || (!el.dataset.v && matchMedia("(prefers-color-scheme: light)").matches);
      $("#touch-icon").href = light ? "/icons/apple-touch-icon-light.png" : "/icons/apple-touch-icon.png";
      $("#manifest-link").href = light ? "/manifest-light.webmanifest" : "/manifest.webmanifest";
      toast("Icon set. It applies the next time you add Extract to your home screen.");
      return render();
    }
    case "sync-now": return sync.syncNow();
    case "sync-out": await sync.signOut(); toast("Signed out. Your recipes stay on this device."); return render();
    case "sync-restart": state.syncEmailSent = ""; return render();
    case "sync-resend": return sendSyncCode(state.syncEmailSent);
    case "read-aloud": state.readAloud = !state.readAloud; settings.set("readAloud", state.readAloud ? "1" : ""); if (state.readAloud) speakStep(); else { try { speechSynthesis.cancel(); } catch {} } return render();
    case "voice": if (state.voiceOn) stopVoice(); else startVoice(); return render();
    case "print": closeModal(); return setTimeout(() => window.print(), 50);
    case "week": state.view.week = +el.dataset.d === 0 ? 0 : (state.view.week || 0) + (+el.dataset.d); return render();
    case "plan-add": return openPlanPicker(el.dataset.day);
    case "plan-recipe": closeModal(); return openPlanPicker(dayKey(new Date()), id);
    case "pp-meal": state.planPick.meal = el.dataset.v; document.querySelectorAll("[data-act=pp-meal]").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === el.dataset.v)); return;
    case "pp-pick": { const r = state.items.get(id); addPlanEntry(state.planPick.day, { recipeId: r.id, title: r.title }); toast(`Added ${r.title}`); if (state.view.name === "plan") render(); return drawPlanPicker($("#pp-q") ? $("#pp-q").value : ""); }
    case "pp-save-recipe": { const r = state.items.get(state.planPick.recipeId), day = $("#pp-day").value; addPlanEntry(day, { recipeId: r.id, title: r.title }); closeModal(); return toast(`Planned for ${new Date(day + "T12:00:00").toLocaleDateString(undefined, { weekday: "long" })}`); }
    case "plan-remove": { const day = el.dataset.day, before = planDay(day).entries; savePlanDay(day, before.filter(e => e.id !== id)); closeModal(); render(); return toast("Removed from the plan", () => { savePlanDay(day, before); render(); }); }
    case "plan-menu": return openPlanMenu(el.dataset.day, id);
    case "plan-move-go": return movePlanEntry(el.dataset.day, id, $("#pm-day").value);
    case "plan-to-list": return planWeekToList();
    case "week-add-picked": {
      const have = grocery().items, add = [];
      document.querySelectorAll(".lp:checked").forEach(c => { const [gi, li] = c.value.split(":").map(Number); const g = state.weekPick[gi]; const t = g.lines[li];
        if (!have.some(h => !h.done && h.recipeId === g.r.id && h.text === t) && !add.some(a => a.recipeId === g.r.id && a.text === t)) add.push({ id: newId("g"), text: t, recipeId: g.r.id, recipeTitle: g.r.title, done: false }); });
      saveGrocery([...have, ...add]); closeModal(); render();
      return toast(add.length ? `Added ${add.length} item${add.length === 1 ? "" : "s"} to your list` : "Those are already on your list");
    }
    case "week-start": settings.set("weekStart", el.dataset.v); return render();
    case "units": state.units = el.dataset.v; settings.set("units", state.units); return render();
    case "list-pick": closeModal(); return openListPicker(state.items.get(id));
    case "pick-all": document.querySelectorAll(".lp").forEach(c => c.checked = el.dataset.v === "1"); return;
    case "list-add-picked": {
      const r = state.items.get(id), have = grocery().items;
      const picked = [...document.querySelectorAll(".lp:checked")].map(c => {
        if (c.value[0] === "L") { const [gi, li] = c.value.slice(1).split(":").map(Number); const g = state.pickLinked[gi]; return { t: g.lines[li], r: g.r }; }
        return { t: state.pickLines[+c.value], r };
      });
      const fresh = picked.filter(({ t, r: pr }) => !have.some(h => !h.done && h.recipeId === pr.id && h.text === t)).map(({ t, r: pr }) => ({ id: newId("g"), text: t, recipeId: pr.id, recipeTitle: pr.title, done: false }));
      saveGrocery([...have, ...fresh]); closeModal(); render();
      return toast(fresh.length ? `Added ${fresh.length} item${fresh.length === 1 ? "" : "s"} to your list` : "Those are already on your list");
    }
    case "list-check": {
      // Cross it off where it is; re-sort after a pause so the list doesn't jump under your thumb.
      const ids = new Set(String(el.dataset.ids || id).split(","));
      const items = grocery().items.map(i => ids.has(i.id) ? { ...i, done: el.checked } : i); saveGrocery(items);
      el.closest(".gitem").classList.toggle("got", el.checked); if (el.checked) { haptic(); el.closest(".gitem").classList.add("just"); }
      clearTimeout(state.listTimer); state.listTimer = setTimeout(() => { if (state.view.name === "list") render(); }, 1600);
      return;
    }
    case "list-mode": settings.set("listView", el.dataset.v === "recipe" ? "recipe" : ""); return render();
    case "list-to-pantry": { const got = grocery().items.filter(i => i.done); const n = addToPantry(got.map(i => i.text)); saveGrocery(grocery().items.filter(i => !i.done)); render(); return toast(n ? `Put ${n} item${n === 1 ? "" : "s"} in your pantry` : "Those are already in your pantry"); }
    case "pantry-quick": { addToPantry([el.dataset.t]); return render(); }
    case "pantry-remove": return pantryUsed(id);
    case "pantry-missing": {
      const r = state.items.get(id), m = canMake(r, pantry().items), have = grocery().items;
      const fresh = m.missing.map(x => x.line).filter(t => !have.some(h => !h.done && h.recipeId === r.id && h.text === t)).map(t => ({ id: newId("g"), text: t, recipeId: r.id, recipeTitle: r.title, done: false }));
      saveGrocery([...have, ...fresh]); render();
      return toast(fresh.length ? `Added ${fresh.length} item${fresh.length === 1 ? "" : "s"} to your list` : "Those are already on your list");
    }
    case "rate": { const r = state.items.get(id), v = +el.dataset.v; save({ ...r, rating: r.rating === v ? 0 : v }); return render(); }
    case "log-stars": { const v = +el.dataset.v; state.logCtx.rating = state.logCtx.rating === v ? 0 : v; document.querySelectorAll("[data-act=log-stars]").forEach(b => b.setAttribute("aria-pressed", +b.dataset.v <= state.logCtx.rating)); return; }
    case "log-skip": { const c = state.logCtx; closeModal(); if (c && c.count) { const r = state.items.get(c.id); save({ ...r, cooked: [...(r.cooked || []), Date.now()].slice(-100) }); render(); toast("Marked as cooked"); } return; }
    case "log-save": return saveCookLog();
    case "log-del": { const r = state.items.get(id); save({ ...r, log: (r.log || []).filter(e => e.id !== el.dataset.e) }); return render(); }
    case "aisle-pick": return openAislePick(el.dataset.name);
    case "aisle-set": { const st = aisleStore(), map = { ...(st.map || {}) }; if (el.dataset.v) map[state.aislePickName] = el.dataset.v; else delete map[state.aislePickName]; save({ ...st, map }); closeModal(); render(); return toast(el.dataset.v ? `Moved to ${el.dataset.v}` : "Back to its usual aisle"); }
    case "aisle-order": return openAisleOrder();
    case "aisle-move": { const o = aisleOrder(), i = +el.dataset.i, j = i + (+el.dataset.d); [o[i], o[j]] = [o[j], o[i]]; save({ ...aisleStore(), order: o }); render(); return openAisleOrder(); }
    case "aisle-reset": save({ ...aisleStore(), order: [] }); render(); return openAisleOrder();
    case "link-pick": closeModal(); return openLinkPicker(id);
    case "link-save": { const r = state.items.get(state.linkFor), ids = [...document.querySelectorAll(".lk:checked")].map(i => i.value); save({ ...r, links: ids }); closeModal(); render(); return toast(ids.length ? `Linked ${ids.length} recipe${ids.length === 1 ? "" : "s"}` : "Links removed"); }
    case "surprise": {
      const pool = (state.view.name === "library" ? [...document.querySelectorAll(".rcard")].map(c => state.items.get(c.dataset.id)) : recipes()).filter(r => r && r.id !== state.view.id && r.id !== state.lastSurprise);
      const r = pool[Math.floor(Math.random() * pool.length)] || recipes()[0]; if (!r) return;
      state.lastSurprise = r.id; return go({ name: "recipe", id: r.id, surprise: true });
    }
    case "plan-fill": return openPlanFill();
    case "plan-week": return openPlanWeek();
    case "pw-go": return runPlanWeek();
    case "pw-calc": return pwCalc();
    case "plan-week-undo": return undoPlanWeek();
    case "plan-swap": return swapPlanEntry(el.dataset.day, id);
    case "plan-sv": return setEntrySv(el.dataset.day, id, +el.dataset.v);
    case "plan-people": { const p = pwPrefs(); p.people = Math.max(1, Math.min(12, p.people + +el.dataset.d)); savePw(p); return render(); }
    case "pw-people": { const o = $("#pw-people"); o.textContent = Math.max(1, Math.min(12, (+o.textContent || 1) + +el.dataset.d)); return readPw(); }
    case "pw-meal": el.setAttribute("aria-pressed", el.getAttribute("aria-pressed") !== "true"); return readPw();
    case "pw-cook": case "pw-whole": case "pw-sex": case "pw-goal":
      el.parentElement.querySelectorAll("button").forEach(b => b.setAttribute("aria-pressed", b === el)); readPw();
      if (a === "pw-cook") { const sub = $("#pw-cook-sub"); if (sub) sub.textContent = planner.COOK_STYLES[el.dataset.v].sub; }
      return;
    case "fill-meal": state.fillOpts.meal = el.dataset.v; document.querySelectorAll("[data-act=fill-meal]").forEach(b => b.setAttribute("aria-pressed", b.dataset.v === el.dataset.v)); return;
    case "plan-fill-go": return fillWeek();
    case "plan-fill-undo": { const f = state.lastFill; if (f) f.entries.forEach(({ day, id: eid }) => savePlanDay(day, planDay(day).entries.filter(e => e.id !== eid))); state.lastFill = null; render(); return toast("Undone"); }
    case "plan-ics": return openCalendar();
    case "ics-go": return exportIcs();
    case "feed-quick": return followBlog(el.dataset.url);
    case "feed-refresh": return refreshFeeds(true);
    case "feed-unfollow": { const fs = feedStore(); save({ ...fs, sites: fs.sites.filter(s => s.id !== id) }); return render(); }
    case "feed-save": state.addTab = "link"; state.pendingUrl = el.dataset.url; return go({ name: "add" });
    case "g-menu": return openGroceryMenu(String(el.dataset.ids).split(","), el.dataset.name || "");
    case "g-delete": { const ids = state.menuCtx.ids; return removeGrocery(ids, `Removed “${state.menuCtx.name || "item"}”`); }
    case "g-pantry": { const ids = state.menuCtx.ids, its = grocery().items.filter(i => ids.includes(i.id)); const pb = pantry().items; addToPantry(its.map(i => i.text));
      const before = grocery().items; saveGrocery(before.filter(i => !ids.includes(i.id))); closeModal(); haptic(); render();
      return toast("Moved to your pantry", () => { saveGrocery(before); savePantry(pb); render(); }); }
    case "p-menu": return openPantryMenu(el.dataset.id);
    case "p-to-list": return pantryToList(el.dataset.id);
    case "p-used": return pantryUsed(el.dataset.id);
    case "list-clear-all": { const before = grocery().items; saveGrocery([]); render(); return toast("Grocery list cleared", () => { saveGrocery(before); render(); }); }
    case "list-clear-got": { const before = grocery().items; saveGrocery(before.filter(i => !i.done)); render(); return toast("Cleared the cart", () => { saveGrocery(before); render(); }); }
    case "list-clear-ask": state.confirm = "list"; return render();
    case "list-clear-yes": state.confirm = null; saveGrocery([]); return render();
    case "list-copy": { const t = listText(); navigator.clipboard.writeText(t).then(() => toast("List copied"), () => { modal(`<h2>Your list</h2><textarea id="sh-text" rows="10" readonly>${esc(t)}</textarea><div class="row"><button class="btn" data-act="close-modal">Done</button></div>`); $("#sh-text").select(); }); return; }
    case "list-share": { try { await navigator.share({ title: "Grocery list", text: listText() }); } catch {} return; }
    case "cook-start": closeModal(); return enterCook(id);
    case "cook-exit": return exitCook();
    case "cook-next": return cookGo(1);
    case "cook-prev": return cookGo(-1);
    case "cook-ings": state.view.showAll = !state.view.showAll; return render();
    case "cook-size": { const v = Math.max(0, Math.min(3, +(settings.get("cookSize") || 1) + (+el.dataset.d))); settings.set("cookSize", String(v)); return render(); }
    case "cook-finish": { const rid = state.view.id; exitCook(); return openCookLog(rid, true); }
    case "timer-start": { e.stopPropagation(); const secs = +el.dataset.secs; startTimer(el.dataset.label || "Timer", secs); haptic(); announce(`Timer started, ${fmtClock(secs)}`); return; } // the timer strip appears; no toast
    case "timer-stop": return stopTimer(el.dataset.id);
    case "timer-add": return addTime(el.dataset.id, 60);
    case "timer-pause": return pauseTimer(el.dataset.id);
    case "photo-remove": keepDraftFields(); state.draft.image = ""; return render();
    case "tour": return openTour($("#tour-root"), QUICK_TOUR, "Quick tour", tourHooks);
    case "tour-part": return openTour($("#tour-root"), tourPart(el.dataset.v), TOUR_PARTS.find(x => x[0] === el.dataset.v)[1], tourHooks);
  }
});
/* ===== Online and offline ===== */
function showOnline() {
  const on = navigator.onLine !== false; const was = state.online; state.online = on;
  const b = $("#offline"); if (b) b.hidden = on;
  if (was === on) return;
  if (["add", "library"].includes(state.view.name) && !document.querySelector(".scrim")) render();
  if (on && pendingLinks().length) toast(`Back online. ${pendingLinks().length} saved link${pendingLinks().length === 1 ? "" : "s"} can be imported now: tap + at the top.`);
}
window.addEventListener("online", showOnline); window.addEventListener("offline", showOnline);

/* ===== Gestures. Each one has a visible button that does the same thing. ===== */
// Swipe a grocery or pantry row: right does the main thing, left opens its options.
let sw = null;
document.addEventListener("pointerdown", e => {
  const front = e.target.closest(".sfront"); if (!front || e.button > 0 || e.target.closest("button")) return;
  sw = { front, row: front.closest(".srow"), x: e.clientX, y: e.clientY, dx: 0, on: false, id: e.pointerId };
});
document.addEventListener("pointermove", e => {
  if (!sw || e.pointerId !== sw.id) return;
  const dx = e.clientX - sw.x, dy = e.clientY - sw.y;
  if (!sw.on) { if (Math.abs(dx) > 12 && Math.abs(dx) > Math.abs(dy) * 1.4) { sw.on = true; sw.row.classList.add("swiping"); try { sw.front.setPointerCapture(e.pointerId); } catch {} } else if (Math.abs(dy) > 12) { sw = null; return; } else return; }
  sw.dx = Math.max(-120, Math.min(120, dx));
  sw.front.style.transform = `translateX(${sw.dx}px)`;
  sw.row.classList.toggle("go-r", sw.dx > 72); sw.row.classList.toggle("go-l", sw.dx < -72);
});
function endSwipe() {
  if (!sw) return; const { front, row, dx, on } = sw; sw = null;
  if (!on) return;
  front.style.transform = ""; row.classList.remove("swiping", "go-r", "go-l");
  state.swallowClick = true; setTimeout(() => state.swallowClick = false, 80);
  const kind = row.dataset.swipe;
  if (dx > 72) { if (kind === "g") { const cb = row.querySelector("input[type=checkbox]"); if (cb) setTimeout(() => cb.click(), 100); } else pantryToList(row.dataset.id); }
  else if (dx < -72) { if (kind === "g") openGroceryMenu(String(row.dataset.ids).split(","), row.dataset.name || ""); else openPantryMenu(row.dataset.id); }
}
document.addEventListener("pointerup", endSwipe);
document.addEventListener("pointercancel", () => { if (sw) { sw.front.style.transform = ""; sw.row.classList.remove("swiping", "go-r", "go-l"); sw = null; } });
document.addEventListener("click", e => { if (state.swallowClick && e.target.closest(".srow")) { e.preventDefault(); e.stopPropagation(); } }, true);

// Long-press a recipe card for its actions.
let press = null;
document.addEventListener("pointerdown", e => {
  const card = e.target.closest("[data-press=recipe]"); if (!card || e.button > 0) return;
  press = { card, x: e.clientX, y: e.clientY, t: setTimeout(() => { state.pressAt = Date.now(); openCardSheet(card.dataset.id); press = null; }, 480) };
});
// The tap that ends a long-press (or a drag) shouldn't also open the recipe.
document.addEventListener("pointerup", () => { if (Date.now() - (state.pressAt || 0) < 1500) { state.pressAt = 0; state.swallowTap = true; setTimeout(() => state.swallowTap = false, 60); } }, true);
const cancelPress = e => { if (!press) return; if (e && e.type === "pointermove" && Math.hypot(e.clientX - press.x, e.clientY - press.y) < 10) return; clearTimeout(press.t); press = null; };
["pointerup", "pointercancel", "pointermove", "scroll"].forEach(ev => document.addEventListener(ev, cancelPress, { passive: true }));
document.addEventListener("contextmenu", e => { if (e.target.closest("[data-press=recipe]")) e.preventDefault(); });

// Drag a planned meal to another day: press and hold, then drag. The ⋯ button offers Move to as well.
let drag = null;
document.addEventListener("pointerdown", e => {
  const item = e.target.closest(".plan-item[data-entry]"); if (!item || e.button > 0 || e.target.closest("[data-act=plan-remove],[data-act=plan-menu]")) return;
  const start = { x: e.clientX, y: e.clientY };
  drag = { item, start, ready: false, id: e.pointerId, t: setTimeout(() => {
    if (!drag) return; drag.ready = true; haptic(12); item.classList.add("lifted");
    const g = item.cloneNode(true); g.className = "plan-item ghost"; g.style.width = item.offsetWidth + "px"; document.body.appendChild(g); drag.ghost = g; moveGhost(start.x, start.y);
    try { item.setPointerCapture(drag.id); } catch {}
  }, 380) };
});
function moveGhost(x, y) { if (drag?.ghost) drag.ghost.style.transform = `translate(${x - 24}px, ${y - 22}px)`; }
document.addEventListener("pointermove", e => {
  if (!drag) return;
  if (!drag.ready) { if (Math.hypot(e.clientX - drag.start.x, e.clientY - drag.start.y) > 8) { clearTimeout(drag.t); drag = null; } return; }
  e.preventDefault(); moveGhost(e.clientX, e.clientY);
  document.querySelectorAll(".day.drop").forEach(d => d.classList.remove("drop"));
  const over = document.elementsFromPoint(e.clientX, e.clientY).map(x => x.closest(".day")).find(Boolean); // looks through the ghost and any message
  if (over) over.classList.add("drop");
  if (e.clientY > innerHeight - 90) scrollBy(0, 12); else if (e.clientY < 110) scrollBy(0, -12);
}, { passive: false });
document.addEventListener("pointerup", e => {
  if (!drag) return; clearTimeout(drag.t);
  const d = drag; drag = null;
  if (!d.ready) return;
  d.ghost.remove(); d.item.classList.remove("lifted");
  const target = document.querySelector(".day.drop"); document.querySelectorAll(".day.drop").forEach(x => x.classList.remove("drop"));
  state.pressAt = Date.now();
  if (target && target.dataset.day !== d.item.dataset.day) movePlanEntry(d.item.dataset.day, d.item.dataset.entry, target.dataset.day);
});
function movePlanEntry(from, entryId, to) {
  const e = planDay(from).entries.find(x => x.id === entryId); if (!e) return;
  savePlanDay(from, planDay(from).entries.filter(x => x.id !== entryId));
  savePlanDay(to, [...planDay(to).entries, e]);
  state.fresh = entryId; haptic(); closeModal(); render();
  toast(`Moved to ${new Date(to + "T12:00:00").toLocaleDateString(undefined, { weekday: "long" })}`, () => { savePlanDay(to, planDay(to).entries.filter(x => x.id !== entryId)); savePlanDay(from, [...planDay(from).entries, e]); render(); });
}

let touchX = null, touchY = null;
document.addEventListener("touchstart", e => { if (state.view.name === "cook") { touchX = e.touches[0].clientX; touchY = e.touches[0].clientY; } }, { passive: true });
document.addEventListener("touchend", e => {
  if (state.view.name !== "cook" || touchX == null) return;
  const dx = e.changedTouches[0].clientX - touchX, dy = e.changedTouches[0].clientY - touchY; touchX = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) cookGo(dx < 0 ? 1 : -1);
}, { passive: true });
document.addEventListener("keydown", e => {
  if (state.view.name === "cook" && !e.target.closest("input,textarea")) {
    if (e.key === "ArrowRight") return cookGo(1);
    if (e.key === "ArrowLeft") return cookGo(-1);
  }
  if (e.target.matches?.("[role=tab]") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) {
    const tabs = [...e.target.closest("[role=tablist]").querySelectorAll("[role=tab]")], i = tabs.indexOf(e.target);
    const n = e.key === "Home" ? 0 : e.key === "End" ? tabs.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length;
    e.preventDefault(); tabs[n].click(); requestAnimationFrame(() => document.querySelector(`#${tabs[n].id}`)?.focus()); return;
  }
  if ((e.key === "Enter" || e.key === " ") && e.target.matches(".steps li.step")) { e.preventDefault(); e.target.click(); }
  if (e.key === "Escape" && $("#modal-root").innerHTML) closeModal();
  if (e.key === "Tab" && $("#modal-root .modal")) {
    const f = [...$("#modal-root .modal").querySelectorAll("button:not([disabled]),input:not([type=hidden]),select,textarea,a[href],label.btn,[tabindex='0']")].filter(x => x.offsetParent !== null);
    if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === $("#modal-root .modal"))) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
document.addEventListener("input", e => { if (e.target.id === "pp-q") return drawPlanPicker(e.target.value); if (e.target.id === "lk-q") return openLinkPicker(state.linkFor, e.target.value); if (e.target.id === "q") { state.q = e.target.value; state.focusQ = true; render(); } });
document.addEventListener("change", e => {
  if (e.target.id === "sort") { state.sort = e.target.value; render(); }
  if (e.target.id === "s-import" && e.target.files[0]) importBackup(e.target.files[0]);
  if (e.target.classList?.contains("reel-g") || e.target.id === "reel-skip") {
    const sel = state.reelGroups; if (e.target.id === "reel-skip") state.reelSkip = e.target.checked; else e.target.checked ? sel.add(e.target.value) : sel.delete(e.target.value);
    const p = state.reels, n = p ? p.recipes.filter(r => sel.has(r.group) && !(state.reelSkip && r.missing) && !state.items.has(r.id)).length : 0, btn = $("#reels-add-btn");
    if (btn) { btn.disabled = !n; btn.textContent = n ? `Add ${n} Recipe${n === 1 ? "" : "s"}` : "Nothing New Chosen"; }
    document.querySelectorAll(".reel-g").forEach(c => { const g = c.value, k = p.recipes.filter(r => r.group === g && !(state.reelSkip && r.missing)).length; const sm = c.parentElement.querySelector(".from"); if (sm) sm.textContent = `${k} recipe${k === 1 ? "" : "s"}`; });
  }
  if (e.target.id === "iw-file" && e.target.files[0]) { const f = e.target.files[0]; e.target.value = ""; f.text().then(iwRead); }
  if (e.target.classList?.contains("iw-o")) { const s = state.iwOut || (state.iwOut = new Set()); e.target.checked ? s.add(e.target.value) : s.delete(e.target.value); const c = $("#iw-out .count"); if (c) c.textContent = `${s.size} chosen`; const b = $("[data-act=iw-export]"); if (b) b.disabled = !s.size; }
  if (e.target.classList?.contains("iw-r") && state.iwSel) e.target.checked ? state.iwSel.add(e.target.value) : state.iwSel.delete(e.target.value);
  if (e.target.id === "f-photo" && e.target.files[0]) addOwnPhoto(e.target.files[0]);
});
document.addEventListener("submit", e => {
  e.preventDefault(); const f = e.target.dataset.form;
  if (f === "recipe") return saveRecipeForm();
  if (f === "sync-email") { const em = $("#sync-email").value.trim(); if (em) sendSyncCode(em); return; }
  if (f === "sync-verify") {
    const code = $("#sync-code").value.replace(/\D/g, ""); if (code.length < 6) return syncStatus("Enter the 6-digit code from the email.", true);
    syncStatus("Signing in…");
    sync.verifyCode(state.syncEmailSent, code).then(() => { state.syncEmailSent = ""; toast("Signed in. Syncing your recipes…"); render(); })
      .catch(() => syncStatus("That code didn't work. Check it, or send a new one.", true));
    return;
  }
  if (f === "pp-note") { const t = $("#pp-note").value.trim(); if (!t) return; addPlanEntry(state.planPick.day, { note: t.slice(0, 80) }); toast("Note added"); if (state.view.name === "plan") render(); return drawPlanPicker(); }
  if (f === "feed-add") return followBlog($("#feed-url").value);
  if (f === "pantry-add") { const t = $("#pa-text").value.trim(); if (!t) return; const n = addToPantry(t.split(/,|\n/).map(x => x.trim()).filter(Boolean)); render(); const i = $("#pa-text"); if (i) i.focus(); if (!n) toast("Already in your pantry"); return; }
  if (f === "list-add") { const t = $("#la-text").value.trim(); if (!t) return; saveGrocery([...grocery().items, { id: newId("g"), text: t, recipeId: "", recipeTitle: "", done: false }]); render(); const i = $("#la-text"); if (i) i.focus(); return; }
  if (f === "new-book") { const n = $("#nb-name").value.trim(); if (!n) return; const b = createBook(n); toast("Collection created"); return go({ name: "book", id: b.id, picking: recipes().length > 0 }); }
  if (f === "quick-book") { const n = $("#qb-name").value.trim(); if (!n) return; const rid = e.target.dataset.recipe; createBook(n, rid); haptic(); toast(`Saved to ${n}`); return openCollectionPick(rid); }
  if (f === "quick-import") { const u = $("#home-url").value.trim(); if (!u) return; state.addTab = "link"; state.pendingUrl = u; return go({ name: "add" }); }
  if (f === "edit-book") { const b = state.items.get(e.target.dataset.id); save({ ...b, name: $("#eb-name").value.trim() || b.name, description: $("#eb-desc").value.trim() }); state.view.editing = false; return render(); }
});

/* ===== Tour hooks: open the screen each step points at ===== */
const TOUR_DEMO = "__tour-demo";
const tourHooks = {
  async show(step) {
    closeModal();
    const needsRecipe = ["recipe", "cook", "library", "pantry", "plan"].includes(step.view);
    if (step.view === "list" && !grocery().items.length) {
      // A sample list (never saved) so the steps have something to point at.
      state.tourListBackup = state.items.get("grocery") || null;
      state.items.set("grocery", { id: "grocery", kind: "grocery", items: ["1 onion, diced", "2 onions", "2 cups milk", "1 loaf bread", "3 cloves garlic"].map((t, i) => ({ id: "tg" + i, text: t, recipeId: TOUR_DEMO, recipeTitle: "Red Lentil Soup (example)", done: false })), demo: true });
    }
    if (needsRecipe && !recipes().length) state.items.set(TOUR_DEMO, { ...JSON.parse(JSON.stringify(EXAMPLE)), id: TOUR_DEMO, kind: "recipe", title: "Red Lentil Soup (example)", updatedAt: Date.now() });
    if (step.view === "add") { state.addTab = step.tab || "link"; if (state.view.name !== "add" || $(".tabs [aria-selected=true]")?.dataset.t !== state.addTab) go({ name: "add" }); }
    else if (step.view === "recipe" || step.view === "cook") {
      const r = recipes().filter(x => (x.steps || []).length).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))[0] || recipes()[0];
      if (state.view.name !== step.view || state.view.id !== r.id) go(step.view === "cook" ? { name: "cook", id: r.id, step: 0 } : { name: "recipe", id: r.id });
    }
    else if (state.view.name !== step.view) go({ name: step.view });
  },
  done() {
    if (state.items.get("grocery")?.demo) { if (state.tourListBackup) state.items.set("grocery", state.tourListBackup); else state.items.delete("grocery"); }
    const hadDemo = state.items.delete(TOUR_DEMO);
    if (hadDemo && state.view.id === TOUR_DEMO) go({ name: "library" });
    else if (hadDemo) render();
    window.scrollTo(0, 0);
  }
};

/* ===== Timer tray ===== */
let traySig = "";
watchTimers(ts => {
  const box = $("#timers"); if (!box) return;
  const sig = ts.map(t => t.id + t.done + !!t.paused).join();
  if (sig !== traySig) {
    const newlyDone = ts.filter(t => t.done && !traySig.includes(t.id + "true"));
    traySig = sig; box.innerHTML = timersHtml(esc);
    newlyDone.forEach(t => announce(`Timer done: ${t.label}`));
    return;
  }
  box.querySelectorAll(".timer").forEach((el, i) => { const t = ts[i]; if (t && !t.done) el.querySelector(".tclock").textContent = fmtClock(timerLeft(t)); });
});

/* ===== Boot ===== */
async function openIncoming() {
  // A short share link: #s=... (needs this app's sync to be set up)
  const ms = location.hash.match(/^#s=([A-Za-z0-9]{8,32})$/);
  if (ms) {
    try {
      const payload = await sync.getShare(ms[1]);
      if (payload && ((payload.kind === "recipe" && payload.recipe) || (payload.kind === "book" && Array.isArray(payload.recipes)))) return go({ name: "shared", payload, recipeIdx: null });
      return go({ name: "message", title: "This share isn't available", body: "It may have been removed. Ask for the recipe again." });
    } catch { return go({ name: "message", title: "Couldn't open this share", body: "Check your connection and open the link again." }); }
  }
  // A shared recipe link: #r=...
  const m = location.hash.match(/^#r=([A-Za-z0-9_-]+)$/);
  if (m) {
    try {
      const payload = await unpack(m[1]);
      if ((payload.kind === "recipe" && payload.recipe) || (payload.kind === "book" && Array.isArray(payload.recipes))) return go({ name: "shared", payload, recipeIdx: null });
    } catch {}
    return go({ name: "message", title: "This link couldn't be opened", body: "It may have been cut off when it was sent. Ask for the recipe again, or have it sent as text." });
  }
  // From a calendar event: #open=<recipe id>
  const mo = location.hash.match(/^#open=([\w-]+)$/);
  if (mo) { clearHash(); return go(state.items.has(mo[1]) ? { name: "recipe", id: mo[1] } : { name: "message", title: "That recipe isn't on this device", body: "It may have been deleted, or saved on another phone. Turn on sync to have it everywhere." }); }
  // Android Share → Extract, or a link like /?url=...
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
  const syncReady = state.syncCfg ? sync.init(state.syncCfg, syncHooks) : Promise.resolve(false);
  if (/^#s=/.test(location.hash)) await Promise.race([syncReady, new Promise(r => setTimeout(r, 6000))]);
  try { if (navigator.storage && navigator.storage.persist) state.persisted = await navigator.storage.persisted() || await navigator.storage.persist(); } catch {}
  state.online = navigator.onLine !== false; showOnline();
  await openIncoming();
  if (state.view.name !== "shared") maybeShowTour($("#tour-root"), tourHooks);
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
})();
window.addEventListener("hashchange", () => { if (/^#([rs]|open)=/.test(location.hash)) openIncoming(); });
