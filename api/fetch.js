// GET /api/fetch?url=https://...  →  { recipe, method: "data" | "archive" | "ai" }
import { fetchPage, fetchArchived, looksLikeBotWall, FetchError } from "../lib/net.js";
import { extractJsonLd, htmlToText, normalize, pageTitle } from "../lib/recipe.js";
import { aiEnabled, claudeExtract } from "../lib/claude.js";
import { send, checkAccess } from "../lib/http.js";
import { platformOf, fetchSocial, recipeLinksIn, PLATFORM_NAME } from "../lib/social.js";
import { parseRecipeText } from "../public/textparse.js";

// Instagram, TikTok, YouTube: the recipe is in the caption, or on a page the caption links to.
async function fromSocial(url, res) {
  let post;
  try { post = await fetchSocial(url); }
  catch (e) {
    const err = e instanceof FetchError ? e : new FetchError("fetch_failed", "That post couldn't be reached. Try again, or paste its caption.", 502);
    return send(res, err.status, { error: err.code === "site_blocked" || err.code === "post_missing" ? "site_blocked" : err.code, message: err.message, platform: platformOf(url) });
  }
  const name = PLATFORM_NAME[post.platform];
  const extra = r => ({ ...r, image: r.image || post.image, notes: [r.notes, post.author ? `From ${post.author} on ${name}.` : ""].filter(Boolean).join("\n") });
  const parsed = parseRecipeText(post.caption, { title: post.platform === "youtube" ? post.title : "" });
  const good = parsed && parsed.ingredients.length >= 3 && parsed.steps.length >= 1;
  if (good) return send(res, 200, { method: "social", platform: post.platform, recipe: normalize(extra(parsed), post.url) });
  // "Full recipe on my blog: https://…"
  for (const link of recipeLinksIn(post.caption)) {
    try {
      const page = await fetchPage(link);
      const data = extractJsonLd(page.html);
      if (data) return send(res, 200, { method: "linked", platform: post.platform, recipe: normalize({ ...data, image: data.image || post.image }, data.source || page.finalUrl) });
    } catch {}
  }
  if (aiEnabled() && post.caption.trim().length > 40) {
    try {
      const r = await claudeExtract({ text: `${name} post${post.title ? ` titled "${post.title}"` : ""}${post.author ? ` by ${post.author}` : ""}. Caption:\n\n${post.caption}`, url: post.url });
      if (r) return send(res, 200, { method: "social-ai", platform: post.platform, recipe: normalize(extra(r), post.url) });
    } catch {}
  }
  if (parsed) return send(res, 200, { method: "social", platform: post.platform, recipe: normalize(extra(parsed), post.url) });
  return send(res, 422, { error: "no_recipe_in_post", platform: post.platform, message: `This ${name} post doesn't write the recipe in its ${post.platform === "youtube" ? "description" : "caption"}${post.platform === "youtube" ? "" : ", and doesn't link to one"}. If the creator lists it on their website (often the link in their bio), paste that link instead.` });
}

export default async function handler(req, res0) {
  // TEMP: ?check=1 reports the real status in a 200 so it can be inspected; removed after testing.
  const check = new URL(req.url, "http://x").searchParams.get("check") === "1";
  const res = check ? { setHeader: (...a) => res0.setHeader(...a), end: b => { res0.statusCode = 200; res0.end(JSON.stringify({ status: res.statusCode, body: JSON.parse(b) })); } } : res0;
  if (req.method !== "GET") return send(res, 405, { error: "method", message: "Use GET." });
  if (!checkAccess(req, res)) return;
  const url = new URL(req.url, "http://x").searchParams.get("url");
  if (!url) return send(res, 400, { error: "bad_url", message: "Add a recipe link first." });
  if (platformOf(url)) return fromSocial(url, res);

  // 1. The page itself.
  let page = null, firstError = null, archiveNote = "";
  try { page = await fetchPage(url); }
  catch (e) {
    if (!(e instanceof FetchError)) console.error(e);
    if (e instanceof FetchError && (e.code === "bad_url" || e.code === "blocked_host" || e.code === "not_html")) return send(res, e.status, { error: e.code, message: e.message });
    firstError = e instanceof FetchError ? e : new FetchError("fetch_failed", "That website couldn't be reached. Try again, or paste the page text.", 502);
  }
  if (page) {
    const data = extractJsonLd(page.html);
    if (data) return send(res, 200, { method: "data", recipe: normalize(data, data.source || page.finalUrl) });
  }

  // 2. The Internet Archive's copy, when the site turned us away or hid its recipe data.
  if (!page || looksLikeBotWall(page.html) || !aiEnabled()) {
    const archived = await fetchArchived(url);
    archiveNote = archived.reason || "";
    if (archived.html) {
      const data = extractJsonLd(archived.html);
      if (data) return send(res, 200, { method: "archive", archivedAt: archived.archivedAt, recipe: normalize(data, url) });
      archiveNote = "no_recipe_data";
      if (!page && aiEnabled()) page = archived;
    }
  }

  if (!page) return send(res, firstError.status, { error: firstError.code, message: firstError.message, archive: archiveNote });

  // 3. Claude reads the page text.
  if (!aiEnabled()) {
    return send(res, 422, {
      error: "no_data",
      message: "This page doesn't include standard recipe data, and Claude reading isn't set up. Use Type it in, or add a Claude API key in Vercel (see Settings)."
    });
  }
  try {
    const text = htmlToText(page.html);
    if (text.length < 80 || looksLikeBotWall(page.html)) return send(res, 422, { error: "no_recipe", message: "That site blocks readers, and no saved copy was found. Open the page, copy its text, and use Paste text." });
    const r = await claudeExtract({ text: `Page title: ${pageTitle(page.html)}\n\n${text}`, url: page.finalUrl });
    if (!r) return send(res, 422, { error: "no_recipe", message: "No recipe found on that page." });
    return send(res, 200, { method: "ai", recipe: normalize(r, url) });
  } catch (e) {
    return send(res, 502, { error: "ai_failed", message: "Claude couldn't read that page right now. Try again in a minute." });
  }
}
