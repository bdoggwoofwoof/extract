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
    body: "Tap Start cooking for one big step at a time, with that step's ingredients right under it. Swipe or tap Next. Times in a step, like 25 minutes, are buttons: tap one to start a timer that rings when it's done." }
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
export function whatsNewHtml() {
  return [...TOUR].reverse().map(t => `<li><strong>${esc(t.title)}</strong><span class="meta">${esc(new Date(t.added + "T12:00:00").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }))}</span><p class="hint">${esc(t.body)}</p></li>`).join("");
}
