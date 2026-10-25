// GET /api/fetch?url=https://...  →  { recipe, method: "data" | "archive" | "ai" }
import { fetchPage, fetchArchived, looksLikeBotWall, FetchError } from "../lib/net.js";
import { extractJsonLd, htmlToText, normalize, pageTitle } from "../lib/recipe.js";
import { aiEnabled, claudeExtract } from "../lib/claude.js";
import { send, checkAccess } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "method", message: "Use GET." });
  if (!checkAccess(req, res)) return;
  const url = new URL(req.url, "http://x").searchParams.get("url");
  if (!url) return send(res, 400, { error: "bad_url", message: "Add a recipe link first." });

  // 1. The page itself.
  let page = null, firstError = null;
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
    if (archived) {
      const data = extractJsonLd(archived.html);
      if (data) return send(res, 200, { method: "archive", archivedAt: archived.archivedAt, recipe: normalize(data, url) });
      if (!page && aiEnabled()) page = archived;
    }
  }

  if (!page) return send(res, firstError.status, { error: firstError.code, message: firstError.message });

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
