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
  // Home and adding
  { id: "redesign", firstRun: false, added: "2026-11-02", view: "library", target: "#home-import",
    title: "A fresh look",
    tip: "Extract has a new design: a home screen that shows what's next, tabs for Groceries and Pantry, and bigger, calmer cooking controls. This quick tour shows what moved.",
    body: "A new, calmer design: Recipes opens on a home screen with Paste Recipe Link, what's up next, and your grocery list and pantry at a glance. Groceries and Pantry have their own tabs; Collections, blogs, help and settings live under More." },
  { id: "home-import", added: "2026-11-02", view: "library", target: "#home-import",
    title: "Paste a link, get the recipe",
    tip: "Copy a recipe page's link, then tap Paste Recipe Link. You check it over before anything is saved. Other Ways has text, photos and typing it in.",
    body: "Copy a recipe link, then tap Paste Recipe Link on the home screen. You check the recipe over before it's saved." },
  { id: "welcome", added: "2026-10-25", news: false, view: "add", tab: "link", target: "#x-url",
    title: "The + button",
    tip: "The + at the top opens this page from anywhere. Paste a link here, or tap Paste Link.",
    body: "Tap + at the top, paste a link to any recipe page, and Extract pulls out the ingredients and instructions." },
  { id: "archive-reader", added: "2026-10-25", view: "add", tab: "link", target: "[data-act=fetch-link]",
    title: "Blocked sites work too",
    tip: "Some big sites, like Allrecipes, turn readers away. Import Link then reads the copy saved by the Internet Archive instead.",
    body: "Some big sites, like Allrecipes and Serious Eats, turn readers away. Extract reads the public copy saved by the Internet Archive instead." },
  { id: "save-later", added: "2026-11-02", view: "add", tab: "link", target: "#x-url",
    title: "If an import doesn't work",
    tip: "Extract keeps your link and says why: try again, paste the page's text, type it in, or Save for Later. Saved links wait at the bottom of this page.",
    body: "When an import fails, Extract keeps your link and explains why, with Try Again, Paste the Text, Type It In and Save for Later. Saved links wait on the Add Recipe page until you import them, which also works for links you save while offline." },
  { id: "social-import", added: "2026-10-30", view: "add", tab: "link", target: "#social-hint",
    title: "Instagram, TikTok and YouTube",
    tip: "Paste a post or video link too. Extract reads the recipe from the caption or description, or follows the caption's link to the recipe page.",
    body: "Paste an Instagram, TikTok or YouTube link. Extract reads the recipe written in the caption or description, or follows the link the creator put there." },
  { id: "limit-video", limit: true, news: false, added: "2026-10-30", view: "add", tab: "link", target: "#social-hint",
    title: "It reads captions, not videos",
    tip: "If the creator only says the recipe out loud, there's nothing to read. Instagram sometimes hides captions; copy the caption and use the Text tab instead." },
  { id: "paste-text", added: "2026-10-30", view: "add", tab: "link", target: "[data-act=add-tab][data-t=paste]",
    title: "Paste text",
    tip: "The Text tab: copied a caption, or a page that blocks readers? Paste the text here. It reads best with an ingredient list and numbered steps.",
    body: "Add Recipe → Text reads a recipe from text you copied, like a caption or a page that blocks readers." },
  { id: "type-it", news: false, added: "2026-10-30", view: "add", tab: "link", target: "[data-act=add-tab][data-t=type]",
    title: "Type it in",
    tip: "The Type tab: for family recipes and cards: start from a blank recipe. You can add your own photo too." },
  { id: "bulk-import", added: "2026-10-25", view: "add", tab: "link", target: "[data-act=add-tab][data-t=many]",
    title: "Many links at once",
    tip: "Moving from another app? The Bulk tab takes a whole batch pasted together and saves each recipe.",
    body: "Moving from another app? Add Recipe → Bulk reads and saves a whole batch, and skips any you already have." },
  { id: "android-share", added: "2026-10-25", view: "add", tab: "link", target: "#nav-add",
    title: "Save from anywhere",
    tip: "Android: on any recipe page, tap Share and pick Extract. iPhone: copy the link, then tap + at the top and Paste Link.",
    body: "On Android, tap Share on a recipe page and pick Extract. On iPhone, copy the link, open Extract, and tap Paste Link." },
  { id: "limit-iphone-share", limit: true, news: false, added: "2026-10-30", view: "add", tab: "link", target: "#nav-add",
    title: "No Share menu on iPhone",
    tip: "iPhone doesn't let home-screen web apps appear in Safari's Share menu. Copy the link and tap Paste Link instead. Android is fine." },
  { id: "limit-photo", limit: true, news: false, added: "2026-10-30", view: "add", tab: "link", target: "[data-act=add-tab][data-t=photo]",
    title: "Photos need Claude",
    tip: "Reading a photo of a recipe card, or a page with no built-in recipe data, uses Claude, which needs a key added in Vercel. Without one, the Photo tab stays off (Settings shows how)." },

  // Recipes
  { id: "refine-paste", firstRun: false, added: "2026-11-03", view: "library", target: "#home-import",
    title: "Paste Recipe Link",
    tip: "The home screen's link box is now a button: copy a recipe link, tap Paste Recipe Link, and it imports. The search box above is only for your own recipes.",
    body: "Search and import no longer look alike: search your recipes in the box, or tap Paste Recipe Link to import one." },
  { id: "home-collections", added: "2026-11-03", view: "library", target: "#home-collections",
    title: "Collections, closer",
    tip: "Your collections now sit on the Recipes screen, under Recently saved. They're still under More too.",
    body: "Collections now show on the Recipes screen. Each one's ⋯ has Rename and Delete." },
  { id: "up-next", added: "2026-11-02", view: "library", target: "#up-next",
    title: "Up next",
    tip: "The home screen shows your next planned meals, and how much is on your grocery list and what your pantry covers.",
    body: "The home screen shows the next meals on your plan, how many things are on your grocery list, and how many recipes your pantry already covers." },
  { id: "lib-search", news: false, added: "2026-10-30", view: "library", target: "#q",
    title: "Search",
    tip: "Search titles, ingredients and categories. Got chicken and lemons? Search either one." },
  { id: "organize", added: "2026-10-25", news: false, view: "library", target: ".collection .head",
    title: "Find recipes by category",
    tip: "Every category you give a recipe becomes a filter here. Sort by recent, A to Z, most cooked or top rated.",
    body: "Tag recipes with categories like Dinner or Baking, then filter and sort by them." },
  { id: "photos", added: "2026-10-25", news: false, view: "library", target: ".rcard",
    title: "Your recipe cards",
    tip: "Tap a card to open the recipe. Press and hold it for quick actions: Start Cooking, Add to Plan, Add to Grocery List, and more.",
    body: "Recipes bring their photo along, so your collection looks like a cookbook." },
  { id: "long-press", added: "2026-11-02", view: "library", target: ".rcard",
    title: "Press and hold",
    tip: "Press and hold any recipe card for its actions without opening it.",
    body: "Press and hold a recipe card to Start Cooking, Add to Plan, Add to Grocery List, favorite it, add it to a collection or delete it, right from the list." },
  { id: "surprise", added: "2026-10-30", view: "library", target: "#surprise",
    title: "Surprise Me",
    tip: "Can't decide? Surprise Me opens a random recipe from what's showing. Filter by a category first to narrow it down.",
    body: "Tap Surprise Me for a random pick from what's showing. Tap Another for a different one, or Add to Plan." },

  // A recipe
  { id: "cook-mode", added: "2026-10-25", view: "recipe", target: "[data-act=cook-start]",
    title: "Start Cooking",
    tip: "Start Cooking sits at the bottom, in thumb reach, right above the tabs.",
    body: "Start Cooking opens one step at a time in big type, with timers and the ingredients for that step." },
  { id: "refine-recipe", firstRun: false, added: "2026-11-03", view: "recipe", target: ".ractions",
    title: "Recipe actions, in one place",
    tip: "Add to List, Add to Plan and ⋯ (edit, collections, links, share, print) now sit under the recipe's details. Start Cooking stays at the bottom, and the tabs no longer repeat them.",
    body: "Recipe pages are tidier: Add to List, Add to Plan and ⋯ sit under the recipe's details, and Start Cooking stays at the bottom." },
  { id: "cook-basics", added: "2026-10-25", news: false, view: "recipe", target: ".scaler",
    title: "Scale it",
    tip: "Tap + or − to change servings and every amount updates. Amounts sit in their own column so they're easy to find mid-cook." },
  { id: "units", added: "2026-10-25", news: false, view: "recipe", target: "[data-act=units]",
    title: "US and metric",
    tip: "Switch cups and pounds to millilitres and grams, and °F to °C. It sticks for every recipe until you switch back." },
  { id: "keep-awake", news: false, added: "2026-10-30", view: "recipe", target: "[data-act=wake]",
    title: "Keep the screen on",
    tip: "Stops your phone dimming while you read. Cooking mode turns it on by itself." },
  { id: "favorites", added: "2026-10-25", news: false, view: "recipe", target: ".fav-btn",
    title: "Favorites and sharing",
    tip: "The heart saves it to Favorites. Next to it, Share sends a link anyone can open and save, no account needed." },
  { id: "ratings", added: "2026-10-30", view: "recipe", target: ".stars",
    title: "Rate it",
    tip: "Tap a star to rate this recipe; tap it again to clear. Ratings show on your recipe cards, and you can sort by Top rated.",
    body: "Tap the stars on any recipe to rate it, and sort Recipes by Top rated." },
  { id: "linked", added: "2026-10-30", view: "recipe", target: "#recipe-more",
    title: "Linked recipes",
    tip: "⋯ → Link Other Recipes ties a sauce, dough or side that's its own recipe to this one. Recipes named in the ingredients link by themselves, with a Recipe button on that line.",
    body: "Link a sauce, dough or side from ⋯ → Link Other Recipes. Ingredients that name a saved recipe get a Recipe button, and linked ingredients can go on your list with the dish." },
  { id: "cook-log", added: "2026-10-30", view: "recipe", target: "#cook-log",
    title: "Cooking log",
    tip: "Each time you make it, add a dated note: what you changed, what to try next time. Finishing cooking asks too.",
    body: "Every recipe has a Cooking log for the date, a rating, and what you changed." },
  { id: "grocery", added: "2026-10-25", news: false, view: "recipe", target: "[data-act=list-pick]",
    title: "Add to List",
    tip: "Adds this recipe's ingredients to your grocery list, scaled to your servings. Things in your pantry start unticked." },
  { id: "nutrition-print", added: "2026-10-25", news: false, view: "recipe", target: "#recipe-more",
    title: "More actions",
    tip: "The ⋯ button: edit the recipe, add it to a collection, link recipes, log a cook, share, print, or delete (with Undo)." },

  // Cooking
  { id: "cook-big", added: "2026-11-02", view: "cook", target: ".cm-nav",
    title: "Hands-free cooking",
    tip: "One step at a time, in big type. Back and Next Step are large enough to tap with a knuckle, or swipe the screen left and right.",
    body: "Cooking mode is calmer and bigger: one step at a time in large type, big Back and Next Step buttons, and a swipe moves between steps." },
  { id: "cook-size", added: "2026-11-02", view: "cook", target: ".cm-size",
    title: "Read it from across the counter",
    tip: "A+ and A− change the size of the step text. On a tablet, every ingredient stays on screen beside the step.",
    body: "In cooking mode, A+ and A− make the step text bigger or smaller, and on a tablet all the ingredients stay on screen beside the step." },
  { id: "read-aloud", added: "2026-10-25", news: false, view: "cook", target: ".cm-tools",
    title: "Read Aloud and voice",
    tip: "Read Aloud reads each step as you move on. On Android, Voice Control lets you say next, back or repeat." },
  { id: "timers", added: "2026-11-02", view: "cook", target: ".cm-step",
    title: "Timers",
    tip: "Times in a step, like 25 minutes, get a big Start Timer button under the step. Timers can be paused, get another minute, or be dismissed when they ring.",
    body: "Timers can now be paused and resumed. Sound and vibration can be turned off in Settings." },

  // Plan
  { id: "meal-plan", added: "2026-10-25", news: false, view: "plan", target: ".day",
    title: "Meal Plan",
    tip: "Tap + Add on a day to plan a recipe or jot a note like Leftovers. Press and hold a meal to drag it to another day.",
    body: "The Plan tab shows your week. Tap + Add on a day, and press and hold a meal to drag it to another day." },
  { id: "plan-drag", added: "2026-11-02", view: "plan", target: ".day",
    title: "Drag meals around",
    tip: "Press and hold a planned meal, then drag it to another day. Its ⋯ button can move it too.",
    body: "Press and hold a planned meal and drag it to another day, or use its ⋯ button to move or remove it (with Undo)." },
  { id: "plan-fill", added: "2026-10-30", view: "plan", target: "#plan-fill",
    title: "Fill Empty Days",
    tip: "Let Extract pick dinners for every empty day, from all recipes, favorites, a category, a collection, or what your pantry covers. Undo takes it back.",
    body: "Fill Empty Days picks recipes for the days that don't have that meal yet, skipping what you made lately." },
  { id: "plan-calendar", added: "2026-10-30", view: "plan", target: "#plan-ics",
    title: "Add to Calendar",
    tip: "Puts the week's meals on your phone's calendar at the times you choose, each linking back to its recipe.",
    body: "Add to Calendar makes a calendar file of the week at the meal times you choose." },
  { id: "limit-calendar", limit: true, news: false, added: "2026-10-30", view: "plan", target: "#plan-ics",
    title: "The calendar keeps a copy",
    tip: "Changing the plan later doesn't change your calendar. Add it again and most calendars update the meals instead of doubling them." },

  // Groceries
  { id: "grocery-tab", news: false, added: "2026-10-25", view: "list", target: "#nav-list",
    title: "Groceries",
    tip: "Everything you add from recipes and the plan, sorted by aisle. The number shows what's left to get." },
  { id: "aisles", added: "2026-10-30", news: false, view: "list", target: "#list-mode",
    title: "By aisle",
    tip: "Repeats are added up: 1 onion and 2 onions become 3 onions. By Recipe shows it per recipe instead." },
  { id: "swipe-rows", added: "2026-11-02", view: "list", target: ".srow",
    title: "Swipe to check off",
    tip: "Swipe an item right to check it off, or left for options: In My Pantry, move it to another aisle, or delete it (with Undo). The ⋯ button does the same.",
    body: "Swipe a grocery item right to check it off, or left for options. Pantry items swipe right to go on your grocery list. Every swipe has a ⋯ button too, and deletes can be undone." },
  { id: "refine-list", firstRun: false, added: "2026-11-03", view: "list", target: ".srow",
    title: "Shorter rows",
    tip: "Each item is one line now, so more fit on screen at the store. Which recipe it's for is in its ⋯ menu, and By Recipe groups by recipe.",
    body: "Grocery rows are one line each; the recipe an item is for is in its ⋯ menu and in By Recipe." },
  { id: "aisle-move", added: "2026-10-30", news: false, view: "list", target: "#aisle-order",
    title: "Your store's aisles",
    tip: "Arrange Aisles sets the order you walk your store. Move an item to another aisle from its ⋯ menu; Extract remembers." },
  { id: "list-share", news: false, added: "2026-10-30", view: "list", target: "[data-act=list-copy]",
    title: "Send the list",
    tip: "Copy or share the list, sorted the way you see it, to send to whoever's shopping." },
  { id: "limit-aisles", limit: true, news: false, added: "2026-10-30", view: "list", target: "#list-mode",
    title: "Aisles start as a guess",
    tip: "Aisles come from each ingredient's name until you move an item. Amounts only add up when the units match: 1 cup + 200 g stays as both." },

  // Pantry
  { id: "pantry", added: "2026-10-30", news: false, view: "pantry", target: "#pantry-add",
    title: "Pantry",
    tip: "Add what's in your kitchen. Those items start unticked when you add a recipe to your list. After shopping, Put in Pantry moves checked items here." },
  { id: "can-make", added: "2026-10-30", news: false, view: "pantry", target: "#can-make",
    title: "What can I make?",
    tip: "Your recipes, ranked by how much of each you already have, with what's missing. One tap adds the missing items to your list." },
  { id: "limit-pantry", limit: true, news: false, added: "2026-10-30", view: "pantry", target: "#nav-pantry",
    title: "The pantry is simple",
    tip: "It knows what you have, not how much, and doesn't change as you cook. Salt, pepper and water always count as on hand." },

  // More
  { id: "books", news: false, added: "2026-10-25", view: "more", target: "#more-collections",
    title: "Collections",
    tip: "Group recipes for a holiday, a person, or a week of dinners, and share a whole collection at once." },
  { id: "blogs-tab", added: "2026-10-30", news: false, view: "more", target: "#more-feeds",
    title: "From Blogs",
    tip: "Follow recipe blogs you like and see their new posts in one place. Tap Save on a post to import it." },
  { id: "limit-blogs", limit: true, news: false, added: "2026-10-30", view: "feeds", target: "#feed-add",
    title: "Blogs need a feed",
    tip: "Only blogs that publish a feed and let readers in can be followed (most do; a few, like Budget Bytes, don't). Posts are checked when you open this page, not in the background." },
  { id: "text-size", added: "2026-11-02", view: "settings", target: "#text-seg",
    title: "Text size",
    tip: "Extract follows your phone's text size. Pick Large or Larger here to make everything bigger.",
    body: "Settings → Text size makes all of Extract bigger, and Timer sound and Vibration can be turned off." },
  { id: "theme", added: "2026-10-25", news: false, view: "settings", target: "#theme-seg",
    title: "Light or dark",
    tip: "Extract follows your phone's light or dark mode. Pick Light or Dark here to keep it one way." },
  { id: "sync", added: "2026-10-25", news: false, view: "settings", target: "#sync-panel",
    title: "Sync between devices",
    tip: "Once sync is set up, sign in here with your email to keep everything the same on your phone and computer." },
  { id: "limit-storage", limit: true, news: false, added: "2026-10-30", view: "settings", target: "[data-act=export]",
    title: "Recipes live on this phone",
    tip: "Without sync, removing Extract from your home screen deletes your recipes. Save a backup here now and then." },
  { id: "limit-offline", limit: true, news: false, added: "2026-11-02", view: "settings", target: "#theme-seg",
    title: "What works offline",
    tip: "Saved recipes, cooking, timers, the plan, groceries and pantry all work offline. Importing a link, blogs and sync need internet." },
  { id: "limit-native", limit: true, news: false, added: "2026-10-30", view: "settings",
    title: "Not a native app",
    tip: "As a home-screen web app, Extract can't use Apple Watch, Siri or the Reminders app, and timers only ring while it's open." },
  { id: "ironwood", added: "2026-11-03", view: "more", target: "#more-ironwood",
    title: "Works with Ironwood",
    tip: "Bring in Ironwood's meal prep from its backup file, with the groceries and a week plan, paste in its shopping list, or send Extract recipes back to Ironwood.",
    body: "More → Ironwood: import Ironwood's meal prep (recipes, groceries, a week plan) from its backup file, paste in its shopping list, or send recipes to Ironwood. On a recipe, ⋯ → Send to Ironwood copies it for Ironwood's From a post." },
  { id: "limit-ironwood", limit: true, news: false, added: "2026-11-03", view: "ironwood", target: "#iw-out",
    title: "Two apps, two copies",
    tip: "Extract and Ironwood can't read each other's data directly, so changes don't flow by themselves. Import or send again after you change a recipe. A fresh Ironwood with no workouts takes a Restore file whole, so use Send to Ironwood there." },
  { id: "help", added: "2026-10-30", news: false, view: "more", target: "#more-help",
    title: "Help and Tour",
    tip: "How-tos, everything Extract can't do yet, what's new, and this tour, whole or one part at a time." },
  { id: "settings-gear", news: false, added: "2026-10-25", view: "more", target: "#nav-more",
    title: "That's the tour",
    tip: "Collections, blogs, help and settings are all under More. Take the tour again any time from Help and Tour." }
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
  if (!steps.length || !root.querySelector(".coach-card")) { busy = false; return; } // closed while this step was opening
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
