/* The tour: shown in full on first open, then only the new entries after each update.
   Add one entry here whenever a feature ships. `added` is the release date shown in What's new. */

const I = {
  link: '<path d="M10 14a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-1 1"/><path d="M14 10a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l1-1"/>',
  book: '<path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4z"/><path d="M5 17a3 3 0 0 1 3-3h11"/>',
  share: '<path d="M12 3v12"/><path d="M7 8l5-5 5 5"/><path d="M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/>',
  archive: '<rect x="3" y="4" width="18" height="5" rx="1"/><path d="M5 9v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9"/><path d="M10 13h4"/>',
  scale: '<path d="M5 12h14"/><path d="M12 5v14"/><circle cx="12" cy="12" r="9"/>',
  photo: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="11" r="2"/><path d="M21 17l-5-5-8 8"/>',
  timer: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M9 2h6"/>',
  cart: '<path d="M3 4h2l2.5 11h11L21 7H6.2"/><circle cx="9" cy="19.5" r="1.4"/><circle cx="17" cy="19.5" r="1.4"/>',
  heart: '<path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>',
  units: '<path d="M4 7h16"/><path d="M4 17h16"/><path d="M8 4l-4 3 4 3"/><path d="M16 14l4 3-4 3"/>',
  plan: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  voice: '<path d="M11 5L6 9H3v6h3l5 4V5z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
  stack: '<path d="M12 3l9 5-9 5-9-5 9-5z"/><path d="M3 13l9 5 9-5"/>',
  chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  sync: '<path d="M20 11a8 8 0 0 0-14.5-4.5L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0 0 14.5 4.5L20 16"/><path d="M20 20v-4h-4"/>',
  home: '<path d="M3 11l9-7 9 7"/><path d="M5 10v10h14V10"/>'
};

export const TOUR = [
  { id: "welcome", added: "2026-10-25", icon: "link", title: "Paste a link, get just the recipe",
    body: "Tap Add, paste a link to any recipe page, and Extract pulls out the ingredients and steps. No ads, no life story. You check it over before saving." },
  { id: "android-share", added: "2026-10-25", icon: "home", title: "Save from anywhere",
    body: "On Android, tap Share on a recipe page and pick Extract. On iPhone, copy the link, open Extract, and tap Paste link." },
  { id: "organize", added: "2026-10-25", icon: "book", title: "Categories and books",
    body: "Tag recipes with categories like Dinner or Baking, then filter by them. Group recipes into books for a holiday, a person, or a week of meals." },
  { id: "cook-basics", added: "2026-10-25", icon: "scale", title: "Scale while you cook",
    body: "Tap + or − to change servings and every amount updates. Tick off ingredients as you go, and keep the screen on." },
  { id: "share", added: "2026-10-25", icon: "share", title: "Share recipes and books",
    body: "Share makes a link that holds the recipe itself, so anyone can open it and save their own copy. No account needed." },
  { id: "archive-reader", added: "2026-10-25", icon: "archive", title: "Blocked sites now work",
    body: "Some big sites, like Allrecipes and Serious Eats, turn readers away. Extract now reads the public copy saved by the Internet Archive instead, so those links work too." },
  { id: "photos", added: "2026-10-25", icon: "photo", title: "Recipe photos",
    body: "Recipes now bring their photo along, so your library looks like a cookbook. Add or change a photo in Edit, like a snapshot of your own version." },
  { id: "cook-mode", added: "2026-10-25", icon: "timer", title: "Cook mode and timers",
    body: "Tap Start cooking for one big step at a time, with that step's ingredients right under it. Swipe or tap Next. Times in a step, like 25 minutes, are buttons: tap one to start a timer that rings when it's done." },
  { id: "grocery", added: "2026-10-25", icon: "cart", title: "Grocery list",
    body: "On any recipe, tap Add to list and untick what you already have. Amounts match the servings you picked. Add your own items, check things off in the store, and share the list." },
  { id: "favorites", added: "2026-10-25", icon: "heart", title: "Favorites and what you've cooked",
    body: "Tap ♡ to favorite a recipe, then filter your library to just those. Finishing cook mode, or tapping I made this today, keeps count, so you can sort by Most cooked. Saving a link you already have now tells you." },
  { id: "units", added: "2026-10-25", icon: "units", title: "US and metric",
    body: "Tap Convert to metric (or Convert to US) on a recipe to switch cups, ounces and pounds to millilitres and grams, and oven temperatures between °F and °C. Your choice sticks for every recipe until you switch back." },
  { id: "meal-plan", added: "2026-10-25", icon: "plan", title: "Weekly meal plan",
    body: "The Plan tab shows your week. Tap + Add on a day to pick a recipe for breakfast, lunch or dinner, or jot a note like Leftovers. Then tap Add this week to grocery list to shop for all of it at once." },
  { id: "read-aloud", added: "2026-10-25", icon: "voice", title: "Hands-free cooking",
    body: "In cook mode, tap Read steps aloud and each step is read to you as you move on. On Android (Chrome), Voice control lets you say next, back, or repeat without touching the screen." },
  { id: "bulk-import", added: "2026-10-25", icon: "stack", title: "Import many recipes at once",
    body: "Moving from another app? On Add, choose Many links and paste a whole batch. Extract reads and saves each one, and skips any you already have." },
  { id: "nutrition-print", added: "2026-10-25", icon: "chart", title: "Nutrition and printing",
    body: "When a recipe's site lists nutrition facts, they're saved with the recipe under Nutrition per serving. More → Print recipe gives a clean, ad-free page for the fridge." },
  { id: "sync", added: "2026-10-25", icon: "sync", title: "Sync between devices",
    body: "In Settings, sign in with your email and a 6-digit code to keep recipes, books, your meal plan and grocery list in step on your phone and computer. While you're signed in, share links are short." }
];

const SEEN_KEY = "rk-tour-seen";
const seen = () => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || "[]")); } catch { return new Set(); } };
const markSeen = ids => { try { const s = seen(); ids.forEach(i => s.add(i)); localStorage.setItem(SEEN_KEY, JSON.stringify([...s])); } catch {} };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const icon = k => `<svg viewBox="0 0 24 24" aria-hidden="true">${I[k] || I.link}</svg>`;

let root = null, cards = [], at = 0, heading = "";
function draw() {
  const c = cards[at], last = at === cards.length - 1;
  root.innerHTML = `<div class="scrim tour-scrim" data-tour="scrim"><div class="modal tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
    <div class="tour-eyebrow">${esc(heading)}${cards.length > 1 ? ` · ${at + 1} of ${cards.length}` : ""}</div>
    <div class="tour-icon">${icon(c.icon)}</div>
    <h2 id="tour-title">${esc(c.title)}</h2>
    <p>${esc(c.body)}</p>
    ${cards.length > 1 ? `<div class="tour-dots" aria-hidden="true">${cards.map((_, i) => `<span class="${i === at ? "on" : ""}"></span>`).join("")}</div>` : ""}
    <div class="row tour-actions">
      ${at > 0 ? `<button class="btn" data-tour="back">Back</button>` : `<button class="btn ghost" data-tour="done">Skip</button>`}
      <span class="spacer"></span>
      <button class="btn primary" data-tour="${last ? "done" : "next"}">${last ? "Start cooking" : "Next"}</button>
    </div></div></div>`;
  root.querySelector("[data-tour=" + (last ? "done" : "next") + "]").focus();
}
function close() { markSeen(TOUR.map(t => t.id)); root.innerHTML = ""; root.removeEventListener("click", onClick); document.removeEventListener("keydown", onKey); }
function onClick(e) {
  const a = e.target.closest("[data-tour]"); if (!a) return;
  const k = a.dataset.tour;
  if (k === "scrim" && e.target !== a) return;
  if (k === "next") { at++; draw(); } else if (k === "back") { at--; draw(); } else close();
}
function onKey(e) {
  if (e.key === "Escape") close();
  if (e.key === "ArrowRight" && at < cards.length - 1) { at++; draw(); }
  if (e.key === "ArrowLeft" && at > 0) { at--; draw(); }
}
export function openTour(el, list, title) {
  root = el; cards = list; at = 0; heading = title;
  root.addEventListener("click", onClick); document.addEventListener("keydown", onKey);
  draw();
}
// First open: the whole tour. After an update: just the new entries.
export function maybeShowTour(el) {
  const s = seen();
  const fresh = TOUR.filter(t => !s.has(t.id));
  if (!fresh.length) return;
  if (!s.size) openTour(el, TOUR, "Welcome to Extract");
  else openTour(el, fresh, "What's new");
}
export function whatsNewHtml(show = 3) {
  const li = t => `<li><strong>${esc(t.title)}</strong><span class="meta">${esc(new Date(t.added + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }))}</span><p class="hint">${esc(t.body)}</p></li>`;
  const all = [...TOUR].reverse();
  const rest = all.slice(show);
  return `<ul class="news">${all.slice(0, show).map(li).join("")}</ul>` +
    (rest.length ? `<details class="news-more"><summary>Show all ${all.length} updates</summary><ul class="news">${rest.map(li).join("")}</ul></details>` : "");
}
