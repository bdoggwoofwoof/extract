/* The tour: shows people where things are. Each step opens the right screen and spotlights the
   real button or box, with a short callout next to it. First open runs the whole tour; after an
   update, only the new steps run (as "What's new").
   Add an entry whenever a feature ships:
     view    the screen to open: library, recipe, add, plan, list, books, settings
     target  CSS selector of the thing to spotlight (no target = centered card)
     tab     for the Add screen: which tab to open first
     tip     the callout text, written for pointing ("Paste a link here")
     body    the same news for the What's new list in Settings, which has no pointing
     limit   true marks a "Limitation" step: something Extract can't do, said plainly
     news    false keeps a step out of What's new (it still runs in the full tour) */

export const TOUR = [
  { id: "welcome", added: "2026-10-25", view: "add", tab: "link", target: "#x-url",
    title: "Paste a link, get just the recipe",
    tip: "Paste a link to any recipe page here, or tap Paste link. You get just the ingredients and steps to check over before saving.",
    body: "Tap Add, paste a link to any recipe page, and Extract pulls out the ingredients and steps. No ads, no life story. You check it over before saving." },
  { id: "archive-reader", added: "2026-10-25", view: "add", tab: "link", target: "[data-act=fetch-link]",
    title: "Blocked sites work too",
    tip: "Some big sites, like Allrecipes, turn readers away. Get recipe then reads the copy saved by the Internet Archive instead.",
    body: "Some big sites, like Allrecipes and Serious Eats, turn readers away. Extract now reads the public copy saved by the Internet Archive instead, so those links work too." },
  { id: "social-import", added: "2026-10-30", view: "add", tab: "link", target: "#social-hint",
    title: "Instagram, TikTok and YouTube",
    tip: "Paste a link to a post or video here too. Extract reads the recipe from the caption or description, or follows the caption's link to the recipe page.",
    body: "Paste an Instagram, TikTok or YouTube link on Add. Extract reads the recipe written in the caption or description, or follows the link the creator put there. Pasted text, like a caption you copied, now works without Claude too." },
  { id: "limit-video", limit: true, news: false, added: "2026-10-30", view: "add", tab: "link", target: "#social-hint",
    title: "It reads captions, not videos",
    tip: "If the creator only says the recipe out loud, there's nothing to read. Instagram sometimes hides captions; copy the caption and use Paste text instead." },
  { id: "bulk-import", added: "2026-10-25", view: "add", tab: "link", target: "[data-act=add-tab][data-t=many]",
    title: "Import many at once",
    tip: "Moving from another app? Many links takes a whole batch pasted together and saves each recipe.",
    body: "Moving from another app? On Add, choose Many links and paste a whole batch. Extract reads and saves each one, and skips any you already have." },
  { id: "paste-text", added: "2026-10-30", view: "add", tab: "link", target: "[data-act=add-tab][data-t=paste]",
    title: "Paste text",
    tip: "Copied a caption, or a page that blocks readers? Paste the text here. It reads best with an ingredient list and numbered steps.",
    body: "Add → Paste text reads a recipe from text you copied, like a caption or a page that blocks readers." },
  { id: "type-it", news: false, added: "2026-10-30", view: "add", tab: "link", target: "[data-act=add-tab][data-t=type]",
    title: "Type it in",
    tip: "For family recipes and cards: start from a blank recipe and type it in. You can add your own photo too." },
  { id: "android-share", added: "2026-10-25", view: "add", tab: "link", target: "#nav-add",
    title: "Save from anywhere",
    tip: "Android: on any recipe page, tap Share and pick Extract. iPhone: copy the link, then come here and tap Paste link.",
    body: "On Android, tap Share on a recipe page and pick Extract. On iPhone, copy the link, open Extract, and tap Paste link." },
  { id: "limit-iphone-share", limit: true, news: false, added: "2026-10-30", view: "add", tab: "link", target: "#nav-add",
    title: "No Share menu on iPhone",
    tip: "iPhone doesn't let home-screen web apps appear in Safari's Share menu. Copy the link and tap Paste link instead. Android is fine." },
  { id: "limit-photo", limit: true, news: false, added: "2026-10-30", view: "add", tab: "link", target: "[data-act=add-tab][data-t=photo]",
    title: "Photos need Claude",
    tip: "Reading a photo of a recipe card, or a page with no built-in recipe data, uses Claude, which needs a key added in Vercel. Without one, the Photo tab stays off (Settings shows how)." },
  { id: "lib-search", news: false, added: "2026-10-30", view: "library", target: ".tools",
    title: "Search and sort",
    tip: "Search titles, ingredients and categories. Sort by most recent, A to Z, most cooked or top rated." },
  { id: "surprise", added: "2026-10-30", view: "library", target: "#surprise",
    title: "Surprise me",
    tip: "Can't decide? Surprise me opens a random recipe from what's showing. Filter by a category first to narrow it down.",
    body: "On Recipes, tap Surprise me for a random pick from what's showing. Tap Another for a different one, or Plan it straight onto your week." },
  { id: "organize", added: "2026-10-25", view: "library", target: ".chips",
    title: "Find recipes by category",
    tip: "Every category you give a recipe shows up here. Tap one to filter, or search above.",
    body: "Tag recipes with categories like Dinner or Baking, then filter by them. Group recipes into books for a holiday, a person, or a week of meals." },
  { id: "photos", added: "2026-10-25", view: "library", target: ".rcard",
    title: "Your recipe cards",
    tip: "Each saved recipe gets a card, with the site's photo when it has one. Tap a card to open the recipe.",
    body: "Recipes now bring their photo along, so your library looks like a cookbook. Add or change a photo in Edit, like a snapshot of your own version." },
  { id: "blogs-tab", added: "2026-10-30", view: "library", target: "#tab-feeds",
    title: "Recipes from blogs you follow",
    tip: "From blogs shows new posts from recipe blogs you follow, newest first. The number counts posts you haven't seen.",
    body: "Recipes → From blogs: follow your favorite recipe blogs and see their new posts in one place, then save any of them with one tap." },
  { id: "blogs-follow", news: false, added: "2026-10-30", view: "feeds", target: "#feed-add",
    title: "Follow a blog",
    tip: "Type a blog's address, or tap one of the suggestions. Tap Save on a post to read it into Extract." },
  { id: "limit-blogs", limit: true, news: false, added: "2026-10-30", view: "feeds", target: "#feed-add",
    title: "Blogs need a feed",
    tip: "Only blogs that publish a feed and let readers in can be followed (most do; a few, like Budget Bytes, don't). Posts are checked when you open this tab, not in the background, so there are no notifications." },
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
  { id: "keep-awake", news: false, added: "2026-10-30", view: "recipe", target: "[data-act=wake]",
    title: "Keep the screen on",
    tip: "Stops your phone dimming while you cook. Cook mode turns it on by itself." },
  { id: "units", added: "2026-10-25", view: "recipe", target: "[data-act=units]",
    title: "US and metric",
    tip: "Switch cups and pounds to millilitres and grams, and °F to °C. It sticks for every recipe until you switch back.",
    body: "Tap Convert to metric (or Convert to US) on a recipe to switch cups, ounces and pounds to millilitres and grams, and oven temperatures between °F and °C. Your choice sticks for every recipe until you switch back." },
  { id: "favorites", added: "2026-10-25", view: "recipe", target: ".fav-btn",
    title: "Favorites",
    tip: "Tap the heart to favorite a recipe, then filter your library to just those. Finishing cook mode counts how often you've made it.",
    body: "Tap ♡ to favorite a recipe, then filter your library to just those. Finishing cook mode, or tapping I made this today, keeps count, so you can sort by Most cooked. Saving a link you already have now tells you." },
  { id: "ratings", added: "2026-10-30", view: "recipe", target: ".stars",
    title: "Rate your recipes",
    tip: "Tap a star to rate this recipe; tap it again to clear. Ratings show on your recipe cards, and you can sort by Top rated.",
    body: "Tap the stars on any recipe to rate it. Stars show on your recipe cards, and Recipes can be sorted by Top rated." },
  { id: "cook-log", added: "2026-10-30", view: "recipe", target: "#cook-log",
    title: "Cooking log",
    tip: "Each time you make it, add a dated note: what you changed, what to try next time. Finishing cook mode asks too.",
    body: "Every recipe has a Cooking log. Finish cook mode, or tap + Add, to note the date, a rating, and what you changed or want to try next time." },
  { id: "linked", added: "2026-10-30", view: "recipe", target: "#links",
    title: "Linked recipes",
    tip: "Link a sauce, dough or side that's its own recipe. Recipes named in the ingredients link by themselves, with a Recipe ↗ button on that line.",
    body: "A recipe can use another one: link a sauce, dough or side with + Link a recipe. Each shows Uses and Used in, ingredients that name a saved recipe get a Recipe ↗ button, and linked ingredients can go on your list with the dish." },
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
    tip: "More has the rest: plan it, link recipes, add to a book, edit (and add your own photo), log a cook, print a clean copy, or delete. Nutrition facts sit under the steps when the site lists them.",
    body: "When a recipe's site lists nutrition facts, they're saved with the recipe under Nutrition per serving. More → Print recipe gives a clean, ad-free page for the fridge." },
  { id: "meal-plan", added: "2026-10-25", view: "plan", target: ".day",
    title: "Weekly meal plan",
    tip: "Tap + Add on a day to plan a recipe or jot a note like Leftovers. Then add the whole week to your grocery list at once.",
    body: "The Plan tab shows your week. Tap + Add on a day to pick a recipe for breakfast, lunch or dinner, or jot a note like Leftovers. Then tap Add this week to grocery list to shop for all of it at once." },
  { id: "plan-fill", added: "2026-10-30", view: "plan", target: "#plan-fill",
    title: "Fill empty days",
    tip: "Let Extract pick: dinners for every empty day from all recipes, favorites, a category, a book, or what your pantry covers. It skips what you made lately, and Undo takes it back.",
    body: "Plan → Fill empty days picks recipes for the days that don't have that meal yet: from all recipes, favorites, top rated, a category, a book, or what your pantry mostly covers. It skips recipes you made in the last two weeks." },
  { id: "plan-calendar", added: "2026-10-30", view: "plan", target: "#plan-ics",
    title: "Add to calendar",
    tip: "Puts the week's meals on your phone's calendar at the times you choose, each linking back to its recipe.",
    body: "Plan → Add to calendar makes a calendar file of the week, at the meal times you choose. Open it to add the meals to your phone's calendar; each event links back to its recipe in Extract." },
  { id: "limit-calendar", limit: true, news: false, added: "2026-10-30", view: "plan", target: "#plan-ics",
    title: "The calendar keeps a copy",
    tip: "Changing the plan later doesn't change your calendar. Add it again and most calendars update the meals instead of doubling them." },
  { id: "grocery-tab", news: false, added: "2026-10-25", view: "plan", target: "#nav-list",
    title: "Your list, ready in the store",
    tip: "The List tab holds everything you've added. The number shows what's left to get.",
    body: "The List tab keeps your grocery list, with your own items too. Check things off as you shop." },
  { id: "aisles", added: "2026-10-30", view: "list", target: "#list-mode",
    title: "Shop by aisle",
    tip: "Your list is sorted by store aisle, and repeats are added up: 1 onion and 2 onions become 3 onions. Tap By recipe to see it per recipe.",
    body: "The grocery list now sorts itself by store aisle, and adds up the same ingredient from different recipes into one line. Tap By recipe to switch back." },
  { id: "aisle-move", added: "2026-10-30", view: "list", target: "#aisle-order",
    title: "Your store's aisles",
    tip: "Tap Move next to an item to put it in another aisle; Extract remembers. Arrange aisles sets the order you walk your store.",
    body: "On the grocery list, tap Move next to an item to put it in a different aisle, and Extract remembers it for next time. Arrange aisles puts them in the order you walk your store." },
  { id: "list-share", news: false, added: "2026-10-30", view: "list", target: "[data-act=list-copy]",
    title: "Send the list",
    tip: "Copy or share the list, sorted the way you see it, to send to whoever's shopping." },
  { id: "limit-aisles", limit: true, news: false, added: "2026-10-30", view: "list", target: "#list-mode",
    title: "Aisles are a best guess",
    tip: "Aisles start as a guess from each ingredient's name until you move an item. Amounts only add up when the units match: 1 cup + 200 g stays as both." },
  { id: "pantry", added: "2026-10-30", view: "pantry", target: "#pantry-add",
    title: "Your pantry",
    tip: "Add what's in your kitchen. Those items start unticked when you add a recipe to your list. After shopping, Put in pantry moves checked items here.",
    body: "List → Pantry keeps what you have at home. Those items start unticked when you add a recipe to your list, and checked-off groceries can go straight into it." },
  { id: "can-make", added: "2026-10-30", view: "pantry", target: "#can-make",
    title: "What can I make?",
    tip: "Your recipes, ranked by how much of each you already have, with what's missing. One tap adds the missing items to your list.",
    body: "Under Pantry, What can I make? ranks your recipes by how many ingredients you already have, and adds the missing ones to your list in one tap." },
  { id: "limit-pantry", limit: true, news: false, added: "2026-10-30", view: "pantry", target: "#tab-pantry",
    title: "The pantry is simple",
    tip: "It knows what you have, not how much, and doesn't change as you cook. Salt, pepper and water always count as on hand." },
  { id: "books", news: false, added: "2026-10-25", view: "settings", target: "#nav-books",
    title: "Recipe books",
    tip: "Books group recipes for a holiday, a person, or a week of dinners. A recipe can be in as many books as you like.",
    body: "Group recipes into books for a holiday, a person, or a week of meals, and share a whole book at once." },
  { id: "sync", added: "2026-10-25", view: "settings", target: "#sync-panel",
    title: "Sync between devices",
    tip: "Once sync is set up, sign in here with your email to keep everything the same on your phone and computer.",
    body: "In Settings, sign in with your email and a 6-digit code to keep recipes, books, your meal plan and grocery list in step on your phone and computer. While you're signed in, share links are short." },
  { id: "limit-storage", limit: true, news: false, added: "2026-10-30", view: "settings", target: "[data-act=export]",
    title: "Recipes live on this phone",
    tip: "Without sync, removing Extract from your home screen deletes your recipes. Save a backup here now and then." },
  { id: "theme", added: "2026-10-25", view: "settings", target: "#theme-seg",
    title: "Light or dark",
    tip: "Extract follows your phone's light or dark mode. Pick Light or Dark here to keep it one way.",
    body: "Extract follows your phone's light or dark mode. To keep it one way, go to Settings → Appearance and pick Light or Dark." },
  { id: "icon-style", added: "2026-10-25", view: "settings", target: ".icon-pick",
    title: "Light or dark icon",
    tip: "Pick the home-screen icon here. It's used when you add Extract to your home screen.",
    body: "Extract has a new bottle icon in dark and light. Pick one in Settings → App icon. It's used when you add Extract to your home screen; to switch an icon that's already there, remove Extract and add it again." },
  { id: "week-start", news: false, added: "2026-10-30", view: "settings", target: "[data-act=week-start]",
    title: "When your week starts",
    tip: "The meal plan starts weeks on Sunday. Pick Monday here if that suits you better." },
  { id: "tour-v2", firstRun: false, added: "2026-10-25", view: "settings", target: "[data-act=tour]",
    title: "The tour now shows you around",
    tip: "The tour now opens each screen and points at the real buttons. Take it any time from here.",
    body: "The tour now opens each screen and points at the real buttons, instead of just describing them. Take it from Settings any time." },
  { id: "limit-native", limit: true, news: false, added: "2026-10-30", view: "settings",
    title: "Not a native app",
    tip: "As a home-screen web app, Extract can't use Apple Watch, Siri, the Reminders app, or kitchen scales." },
  { id: "help", added: "2026-10-30", view: "help", target: "#nav-help",
    title: "Help is up here",
    tip: "Help has how-tos, everything Extract can't do yet, what's new, and this tour, whole or one part at a time.",
    body: "The new ? button at the top opens Help: how-tos, a list of what Extract can't do yet, what's new, and the tour." },
  { id: "settings-gear", news: false, added: "2026-10-25", view: "settings", target: "#nav-settings",
    title: "That's the tour",
    tip: "Settings is next to it: backups, sync and appearance. Take the tour again any time from Help.",
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
  window.addEventListener("scroll", onScroll, { passive: true });
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
  setTimeout(place, 250); // late layout (photos, fonts) can still move the target
  busy = false;
}

function drawCard() {
  const s = steps[at], last = at === steps.length - 1;
  const card = root.querySelector(".coach-card");
  card.classList.toggle("limit", !!s.limit);
  card.innerHTML = `
    <div class="tour-eyebrow">${s.limit ? `<span class="lim">Limitation</span> · ` : ""}${esc(heading)}${steps.length > 1 ? ` · ${at + 1} of ${steps.length}` : ""}</div>
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

let scrollFrame = 0;
function onScroll() { cancelAnimationFrame(scrollFrame); scrollFrame = requestAnimationFrame(place); }
function close() {
  markSeen(TOUR.map(t => t.id));
  root.innerHTML = "";
  root.removeEventListener("click", onClick);
  document.removeEventListener("keydown", onKey);
  window.removeEventListener("resize", place);
  window.removeEventListener("scroll", onScroll);
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
