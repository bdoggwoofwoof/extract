/* The tour: shows people where things are. Each step opens the right screen and spotlights the
   real button or box, with a short callout next to it. First open runs the whole tour; after an
   update, only the new steps run (as "What's new").
   Add an entry whenever a feature ships:
     view    the screen to open: library, recipe, add, plan, list, books, settings
     target  CSS selector of the thing to spotlight (no target = centered card)
     tab     for the Add screen: which tab to open first
     tip     the callout text, written for pointing ("Paste a link here")
     body    the same news for the What's new list in Settings, which has no pointing */

export const TOUR = [
  { id: "welcome", added: "2026-10-25", view: "add", tab: "link", target: "#x-url",
    title: "Paste a link, get just the recipe",
    tip: "Paste a link to any recipe page here, or tap Paste link. You get just the ingredients and steps to check over before saving.",
    body: "Tap Add, paste a link to any recipe page, and Extract pulls out the ingredients and steps. No ads, no life story. You check it over before saving." },
  { id: "archive-reader", added: "2026-10-25", view: "add", tab: "link", target: "[data-act=fetch-link]",
    title: "Blocked sites work too",
    tip: "Some big sites, like Allrecipes, turn readers away. Get recipe then reads the copy saved by the Internet Archive instead.",
    body: "Some big sites, like Allrecipes and Serious Eats, turn readers away. Extract now reads the public copy saved by the Internet Archive instead, so those links work too." },
  { id: "bulk-import", added: "2026-10-25", view: "add", tab: "link", target: "[data-act=add-tab][data-t=many]",
    title: "Import many at once",
    tip: "Moving from another app? Many links takes a whole batch pasted together and saves each recipe.",
    body: "Moving from another app? On Add, choose Many links and paste a whole batch. Extract reads and saves each one, and skips any you already have." },
  { id: "android-share", added: "2026-10-25", view: "add", tab: "link", target: "#nav-add",
    title: "Save from anywhere",
    tip: "Android: on any recipe page, tap Share and pick Extract. iPhone: copy the link, then come here and tap Paste link.",
    body: "On Android, tap Share on a recipe page and pick Extract. On iPhone, copy the link, open Extract, and tap Paste link." },
  { id: "organize", added: "2026-10-25", view: "library", target: ".chips",
    title: "Find recipes by category",
    tip: "Every category you give a recipe shows up here. Tap one to filter, or search above.",
    body: "Tag recipes with categories like Dinner or Baking, then filter by them. Group recipes into books for a holiday, a person, or a week of meals." },
  { id: "photos", added: "2026-10-25", view: "library", target: ".rcard",
    title: "Your recipe cards",
    tip: "Each saved recipe gets a card, with the site's photo when it has one. Tap a card to open the recipe.",
    body: "Recipes now bring their photo along, so your library looks like a cookbook. Add or change a photo in Edit, like a snapshot of your own version." },
  { id: "cook-mode", added: "2026-10-25", view: "recipe", target: "[data-act=cook-start]",
    title: "Cook mode and timers",
    tip: "Start cooking shows one big step at a time with its ingredients. Times in a step, like 25 minutes, are buttons that start a timer.",
    body: "Tap Start cooking for one big step at a time, with that step's ingredients right under it. Swipe or tap Next. Times in a step, like 25 minutes, are buttons: tap one to start a timer that rings when it's done." },
  { id: "read-aloud", added: "2026-10-25", view: "recipe", target: "[data-act=cook-start]",
    title: "Hands-free cooking",
    tip: "Inside cook mode, Read steps aloud reads each step to you. On Android, Voice control lets you say next, back, or repeat.",
    body: "In cook mode, tap Read steps aloud and each step is read to you as you move on. On Android (Chrome), Voice control lets you say next, back, or repeat without touching the screen." },
  { id: "cook-basics", added: "2026-10-25", view: "recipe", target: ".scaler",
    title: "Scale while you cook",
    tip: "Tap + or − to change servings and every amount updates. Tick ingredients off below as you go.",
    body: "Tap + or − to change servings and every amount updates. Tick off ingredients as you go, and keep the screen on." },
  { id: "units", added: "2026-10-25", view: "recipe", target: "[data-act=units]",
    title: "US and metric",
    tip: "Switch cups and pounds to millilitres and grams, and °F to °C. It sticks for every recipe until you switch back.",
    body: "Tap Convert to metric (or Convert to US) on a recipe to switch cups, ounces and pounds to millilitres and grams, and oven temperatures between °F and °C. Your choice sticks for every recipe until you switch back." },
  { id: "favorites", added: "2026-10-25", view: "recipe", target: ".fav-btn",
    title: "Favorites",
    tip: "Tap the heart to favorite a recipe, then filter your library to just those. Finishing cook mode counts how often you've made it.",
    body: "Tap ♡ to favorite a recipe, then filter your library to just those. Finishing cook mode, or tapping I made this today, keeps count, so you can sort by Most cooked. Saving a link you already have now tells you." },
  { id: "grocery", added: "2026-10-25", view: "recipe", target: "[data-act=list-pick]",
    title: "Grocery list",
    tip: "Add to list puts this recipe's ingredients on your list, scaled to your servings. Untick what you already have.",
    body: "On any recipe, tap Add to list and untick what you already have. Amounts match the servings you picked. Add your own items, check things off in the store, and share the list." },
  { id: "share", added: "2026-10-25", view: "recipe", target: "[data-act=share]",
    title: "Share recipes and books",
    tip: "Share makes a link anyone can open to save their own copy. No account needed.",
    body: "Share makes a link that holds the recipe itself, so anyone can open it and save their own copy. No account needed." },
  { id: "nutrition-print", added: "2026-10-25", view: "recipe", target: "[data-act=more]",
    title: "More: plan, print, edit",
    tip: "More has the rest: add to your meal plan, add to a book, edit, print a clean copy, or delete. Nutrition facts sit under the steps when the site lists them.",
    body: "When a recipe's site lists nutrition facts, they're saved with the recipe under Nutrition per serving. More → Print recipe gives a clean, ad-free page for the fridge." },
  { id: "meal-plan", added: "2026-10-25", view: "plan", target: ".day",
    title: "Weekly meal plan",
    tip: "Tap + Add on a day to plan a recipe or jot a note like Leftovers. Then add the whole week to your grocery list at once.",
    body: "The Plan tab shows your week. Tap + Add on a day to pick a recipe for breakfast, lunch or dinner, or jot a note like Leftovers. Then tap Add this week to grocery list to shop for all of it at once." },
  { id: "grocery-tab", news: false, added: "2026-10-25", view: "plan", target: "#nav-list",
    title: "Your list, ready in the store",
    tip: "The List tab holds everything you've added, grouped by recipe. The number shows what's left to get.",
    body: "The List tab keeps your grocery list, grouped by recipe, with your own items too. Check things off as you shop." },
  { id: "books", news: false, added: "2026-10-25", view: "plan", target: "#nav-books",
    title: "Recipe books",
    tip: "Books group recipes for a holiday, a person, or a week of dinners. A recipe can be in as many books as you like.",
    body: "Group recipes into books for a holiday, a person, or a week of meals, and share a whole book at once." },
  { id: "sync", added: "2026-10-25", view: "settings", target: "#sync-panel",
    title: "Sync between devices",
    tip: "Once sync is set up, sign in here with your email to keep everything the same on your phone and computer.",
    body: "In Settings, sign in with your email and a 6-digit code to keep recipes, books, your meal plan and grocery list in step on your phone and computer. While you're signed in, share links are short." },
  { id: "theme", added: "2026-10-25", view: "settings", target: "#theme-seg",
    title: "Light or dark",
    tip: "Extract follows your phone's light or dark mode. Pick Light or Dark here to keep it one way.",
    body: "Extract follows your phone's light or dark mode. To keep it one way, go to Settings → Appearance and pick Light or Dark." },
  { id: "icon-style", added: "2026-10-25", view: "settings", target: ".icon-pick",
    title: "Light or dark icon",
    tip: "Pick the home-screen icon here. It's used when you add Extract to your home screen.",
    body: "Extract has a new bottle icon in dark and light. Pick one in Settings → App icon. It's used when you add Extract to your home screen; to switch an icon that's already there, remove Extract and add it again." },
  { id: "tour-v2", firstRun: false, added: "2026-10-25", view: "settings", target: "[data-act=tour]",
    title: "The tour now shows you around",
    tip: "The tour now opens each screen and points at the real buttons. Take it any time from here.",
    body: "The tour now opens each screen and points at the real buttons, instead of just describing them. Take it from Settings any time." },
  { id: "settings-gear", news: false, added: "2026-10-25", view: "settings", target: "#nav-settings",
    title: "That's the tour",
    tip: "Settings is always up here: backups, sync, appearance, and Take the tour if you want this again.",
    body: "Settings has backups, sync, appearance, and the tour." }
];

const SEEN_KEY = "rk-tour-seen";
const seen = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch { return new Set(); } };
const markSeen = ids => { try { const s = seen(); ids.forEach(i => s.add(i)); localStorage.setItem(SEEN_KEY, JSON.stringify([...s])); } catch {} };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const nextFrame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

let root = null, steps = [], at = 0, heading = "", hooks = null, busy = false;

// hooks.show(step) opens the step's screen (app.js); hooks.done() tidies up afterwards.
export function openTour(el, list, title, h) {
  if (!list.length) return;
  root = el; steps = list; at = 0; heading = title; hooks = h;
  root.innerHTML = `<div class="coach" role="dialog" aria-modal="true" aria-labelledby="coach-title">
      <div class="coach-hole" aria-hidden="true"></div>
      <div class="coach-card" tabindex="-1"></div></div>`;
  root.addEventListener("click", onClick);
  document.addEventListener("keydown", onKey);
  window.addEventListener("resize", place);
  show();
}

async function show() {
  if (busy) return; busy = true;
  const s = steps[at];
  try { await hooks.show(s); } catch {}
  await nextFrame();
  const t = s.target && document.querySelector(s.target);
  if (t && t.getBoundingClientRect().height) {
    t.scrollIntoView({ block: "center", inline: "nearest" });
    await nextFrame();
  }
  drawCard();
  place();
  busy = false;
}

function drawCard() {
  const s = steps[at], last = at === steps.length - 1;
  const card = root.querySelector(".coach-card");
  card.innerHTML = `
    <div class="tour-eyebrow">${esc(heading)}${steps.length > 1 ? ` · ${at + 1} of ${steps.length}` : ""}</div>
    <h2 id="coach-title">${esc(s.title)}</h2>
    <p>${esc(s.tip || s.body)}</p>
    ${steps.length > 1 ? `<div class="coach-progress" aria-hidden="true"><span style="width:${((at + 1) / steps.length) * 100}%"></span></div>` : ""}
    <div class="row tour-actions">
      ${at > 0 ? `<button class="btn sm" data-tour="back">Back</button>` : `<button class="btn sm ghost" data-tour="done">Skip tour</button>`}
      <span class="spacer"></span>
      <button class="btn sm primary" data-tour="${last ? "done" : "next"}">${last ? "Done" : "Next"}</button>
    </div>`;
  card.querySelector(`[data-tour=${last ? "done" : "next"}]`).focus({ preventScroll: true });
}

// Put the spotlight over the target and the callout next to it (below if there's room, else above).
function place() {
  if (!root || !steps.length) return;
  const s = steps[at];
  const hole = root.querySelector(".coach-hole"), card = root.querySelector(".coach-card");
  const t = s.target && document.querySelector(s.target);
  const r = t && t.getBoundingClientRect();
  const vw = window.innerWidth, vh = window.innerHeight, pad = 8, gap = 14;
  const cw = Math.min(340, vw - 32);
  card.style.width = cw + "px";
  if (!r || !r.width || !r.height) {
    hole.classList.add("none");
    card.classList.remove("above", "below");
    card.style.left = (vw - cw) / 2 + "px";
    card.style.top = Math.max(16, (vh - card.offsetHeight) / 2) + "px";
    return;
  }
  hole.classList.remove("none");
  const x = Math.max(4, r.left - pad), y = Math.max(4, r.top - pad);
  const w = Math.min(vw - 8, r.right + pad) - x, h = Math.min(vh - 4, r.bottom + pad) - y;
  Object.assign(hole.style, { left: x + "px", top: y + "px", width: w + "px", height: h + "px" });
  const ch = card.offsetHeight;
  const below = y + h + gap + ch < vh - 12 || y < ch + gap + 12;
  const top = below ? Math.min(y + h + gap, vh - ch - 12) : y - gap - ch;
  const left = Math.min(Math.max(16, r.left + r.width / 2 - cw / 2), vw - cw - 16);
  card.style.left = left + "px";
  card.style.top = Math.max(12, top) + "px";
  card.classList.toggle("below", below); card.classList.toggle("above", !below);
  card.style.setProperty("--arrow-x", Math.min(Math.max(18, r.left + r.width / 2 - left), cw - 18) + "px");
}

function close() {
  markSeen(TOUR.map(t => t.id));
  root.innerHTML = "";
  root.removeEventListener("click", onClick);
  document.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", place);
  steps = [];
  try { hooks.done(); } catch {}
}
function go(d) { const n = at + d; if (n < 0 || n >= steps.length || busy) return; at = n; show(); }
function onClick(e) {
  const a = e.target.closest("[data-tour]");
  if (!a) { e.stopPropagation(); return; } // taps outside the callout do nothing during the tour
  e.stopPropagation();
  const k = a.dataset.tour;
  if (k === "next") go(1); else if (k === "back") go(-1); else close();
}
function onKey(e) {
  if (!steps.length) return;
  if (e.key === "Escape") close();
  if (e.key === "ArrowRight") go(1);
  if (e.key === "ArrowLeft") go(-1);
}

// First open: the whole tour. After an update: just the new steps.
export const FULL_TOUR = TOUR.filter(t => t.firstRun !== false);
export function maybeShowTour(el, h) {
  const s = seen();
  if (!s.size) return openTour(el, FULL_TOUR, "Welcome to Extract", h);
  const fresh = TOUR.filter(t => !s.has(t.id) && t.news !== false);
  if (fresh.length) openTour(el, fresh, "What's new", h);
  else markSeen(TOUR.map(t => t.id));
}
export function whatsNewHtml(show = 3) {
  const li = t => `<li><strong>${esc(t.title)}</strong><span class="meta">${esc(new Date(t.added + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }))}</span><p class="hint">${esc(t.body)}</p></li>`;
  const all = [...TOUR].reverse().filter(t => t.news !== false);
  const rest = all.slice(show);
  return `<ul class="news">${all.slice(0, show).map(li).join("")}</ul>` +
    (rest.length ? `<details class="news-more"><summary>Show all ${all.length} updates</summary><ul class="news">${rest.map(li).join("")}</ul></details>` : "");
}
