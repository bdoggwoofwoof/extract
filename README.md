# Extract

A free, ad-free recipe app for your phone. Paste or share a link to any recipe page and get just the recipe: ingredients and steps, no life story. Save recipes, sort them into categories and recipe books, scale servings while you cook, and share them with anyone.

- Works on iPhone and Android as a home-screen app, and on a computer in any browser.
- Recipes are stored on your phone and work offline in the kitchen.
- Most big recipe sites work instantly, for free. They publish standard recipe data, which the app reads directly.
- Optional: add a Claude API key to also read recipe photos, pasted text, and sites without standard recipe data.

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

## Sharing

**Share** on a recipe or a book makes a link that carries the recipe itself, so it opens for anyone with no account. The link is a copy: later edits don't change it. Books with many recipes make long links. If a messaging app cuts one off, send it as text instead.

## Backups

Your recipes live on your phone. Under **Settings → Backup**, **Save a backup** saves a file you can keep in Files or Google Drive. **Restore from backup** loads it on a new phone. Planned next: optional sync across devices with a free Supabase account.

---

## For developers

No build step. `public/` is the app (plain HTML/CSS/JS, installable PWA with an offline service worker and an Android share target). `api/` holds Vercel serverless functions:

| Route | What it does |
| --- | --- |
| `GET /api/fetch?url=` | Fetches the page server-side and reads its schema.org Recipe data. Falls back to Claude when the page has none and a key is set. Blocks private and internal addresses, with redirect, size and time limits. |
| `POST /api/extract` | Reads `{ text, url? }` or `{ image: { data, media_type } }` with Claude. |
| `GET /api/status` | Reports whether Claude reading is on and whether an access code is required. |

```sh
npm test                      # recipe reader and address-safety tests
node test/dev-server.js       # local preview at http://localhost:5173
```
