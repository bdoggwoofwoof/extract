# Extract

A free, ad-free recipe app for your phone. Paste or share a link to any recipe page and get just the recipe: ingredients and steps, no life story. Save recipes, sort them into categories and recipe books, scale servings while you cook, and share them with anyone.

- Works on iPhone and Android as a home-screen app, and on a computer in any browser.
- Recipes are stored on your phone and work offline in the kitchen.
- Most recipe sites work instantly and for free. Extract reads their standard recipe data, and for sites that block readers (like Allrecipes or Serious Eats) it reads the public copy saved by the Internet Archive.
- **Cook mode:** one big step at a time, with that step's ingredients shown and tappable times that start kitchen timers.
- **Grocery list** from any recipe, scaled to your servings, plus your own items.
- **Weekly meal plan** that turns into a grocery list in one tap.
- **Sync between devices** with your own free Supabase project (optional), plus short share links.
- **Photos, favorites, a cooked count, US/metric conversion, nutrition facts, printing, read-aloud steps**, importing many links at once, categories, and recipe books.
- A short tour on first open, and a What's new note after each update.
- Optional: add a Claude API key to also read recipe photos, pasted text, and sites without recipe data.

---

## 1. Put it online (Vercel, free)

1. Go to [vercel.com/new](https://vercel.com/new) and import this GitHub repository.
2. Leave every setting at its default and click **Deploy**. The project settings in `vercel.json` handle the rest.
3. When it finishes, Vercel gives you an address like `extract-yourname.vercel.app`. That's your app.

To use your own domain, for example `recipes.bnewt.com`, open the project in Vercel, go to **Settings → Domains**, and add it.

## 2. Install it on your phone

**iPhone:** open your app's address in **Safari**, tap the **Share** button, then **Add to Home Screen**.

**Android:** open the address in **Chrome**, tap **⋮**, then **Install app** (or **Add to Home screen**).

Open it from the home-screen icon from then on. On iPhone, the home-screen app keeps its own storage, separate from Safari.

## 3. Save recipes

- **Android:** on any recipe page, tap **Share → Extract**. The app opens and fetches the recipe.
- **iPhone:** on the recipe page, tap **Share → Copy**. Open Extract, tap **Add**, then **Paste link**.
- **Any phone:** you can also type or paste a link into the Link box, or use **Type it in**.

Every recipe opens on a review screen first, so you can fix anything before saving.

## 4. Optional: Claude reading for photos and other sites

Without this, links from sites that publish standard recipe data work fine. Most big recipe sites and food blogs do. With it, you can also read photos of recipe cards, cookbook pages, and pasted text, plus sites without that data.

1. Create an API key at [platform.claude.com](https://platform.claude.com/) under **API Keys**, and add a little credit. This is billed separately from a Claude.ai subscription. Reading one recipe with Claude Haiku costs a fraction of a cent.
2. In Vercel, open your project, go to **Settings → Environment Variables**, and add:
   - `ANTHROPIC_API_KEY`: your key.
   - `ACCESS_CODE`: any password you choose. This stops strangers who find your app's address from using your key. Enter the same code once in the app under **Settings → Access code**.
3. Redeploy: open **Deployments**, then on the latest one tap **⋯ → Redeploy**.

Optional: set `RECIPE_MODEL` to use a different Claude model. The default is `claude-haiku-5-5`.

## 5. Optional: sync between devices (free Supabase account, about 10 minutes)

Sync keeps your recipes, books, meal plan and grocery list the same on your phone, computer, and anyone else who signs in with your email. It also makes share links short. Without it, everything still works on one device.

1. **Create the project.** Sign up at [supabase.com](https://supabase.com), click **New project**, give it a name (e.g. `extract`) and a database password (save it somewhere), and pick the region nearest you. Wait a minute for it to finish setting up.
2. **Create the tables.** Open **SQL Editor → New query**, paste the whole of [`supabase/schema.sql`](supabase/schema.sql) from this repo, and click **Run**. It should say "Success. No rows returned."
3. **Turn on sign-in codes.** Open **Authentication → Emails → Templates → Magic Link** (newer dashboards call it **Magic link or One-time code**). Replace the message body with:
   ```html
   <h2>Your Extract sign-in code</h2>
   <p>Enter this code in Extract: <strong>{{ .Token }}</strong></p>
   ```
   Save. (The app signs in with this 6-digit code instead of a link, because on iPhone a link would open Safari instead of the installed app.)
4. **Copy two values.** Open **Project Settings → API** (or **Data API**). Copy the **Project URL** and the **anon public** key.
5. **Give them to Vercel.** In your Vercel project, open **Settings → Environment Variables** and add `SUPABASE_URL` (the Project URL) and `SUPABASE_ANON_KEY` (the anon key). Then redeploy: **Deployments → ⋯ on the latest → Redeploy**.
6. **Sign in.** In the app, go to **Settings → Sync between devices**, enter your email, and type the code you receive. Do the same on each device. Everything already on a device is uploaded the first time it signs in.

About the free plan: Supabase pauses a free project after about a week with no use, and emails you first. Your data is kept; open the Supabase dashboard and click **Resume project**. Using the app every few days keeps it awake. The anon key is designed to be public: the database rules in `schema.sql` let each person read and change only their own data, and a share can be opened only by someone who has its link.

Supabase's built-in email sender allows only about 2 emails per hour for the whole project, and one code request per minute per person. Each device needs one sign-in, so set up one device, wait if needed, then the next. To lift the limit, add your own email sender (for example a free Brevo or Resend account) under **Authentication → Emails → SMTP Settings**.

## Adding to the tour

Every new feature gets an entry in `public/tour.js` (`TOUR`). People who already took the tour see only the new entries, under "What's new", the next time they open the app.

## Sharing

**Share** on a recipe or a book makes a link anyone can open, no account needed; they can save their own copy. With sync on, links are short. Without it, the link carries the recipe itself, so books with many recipes make long links; if a messaging app cuts one off, send it as text instead. A shared link is a copy: later edits don't change it.

## Backups

Under **Settings → Backup**, **Save a backup** saves a file you can keep in Files or Google Drive, and **Restore from backup** loads it on a new phone. With sync on, your data is also in your Supabase project.

---

## For developers

No build step. `public/` is the app (plain HTML/CSS/JS, installable PWA with an offline service worker and an Android share target). `api/` holds Vercel serverless functions:

| Route | What it does |
| --- | --- |
| `GET /api/fetch?url=` | Fetches the page server-side and reads its schema.org Recipe data. Falls back to Claude when the page has none and a key is set. Blocks private and internal addresses, with redirect, size and time limits. |
| `POST /api/extract` | Reads `{ text, url? }` or `{ image: { data, media_type } }` with Claude. |
| `GET /api/status` | Reports whether Claude reading is on, whether an access code is required, and the Supabase project to sync with. |

Sync (`public/sync.js`): each recipe, book, planned day and the grocery list is one row in `items`. Devices pull rows by server time and push through `push_items`, which only accepts a change newer than the stored one, so an offline phone can't overwrite newer edits. Deletions are synced as tombstones.

```sh
npm test                              # reader, cook mode, units and sync-rule tests
node test/dev-server.js               # local preview at http://localhost:5173
FAKE_SB=1 node test/dev-server.js     # same, with an in-memory stand-in for Supabase
```
