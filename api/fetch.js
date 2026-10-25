// GET /api/fetch?url=https://...  →  { recipe, method: "data" | "ai" }
import { fetchPage, FetchError } from "../lib/net.js";
import { extractJsonLd, htmlToText, normalize, pageTitle } from "../lib/recipe.js";
import { aiEnabled, claudeExtract } from "../lib/claude.js";
import { send, checkAccess } from "../lib/http.js";

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "method", message: "Use GET." });
  if (!checkAccess(req, res)) return;
  const url = new URL(req.url, "http://x").searchParams.get("url");
  if (!url) return send(res, 400, { error: "bad_url", message: "Add a recipe link first." });

  let page;
  try { page = await fetchPage(url); }
  catch (e) {
    if (e instanceof FetchError) return send(res, e.status, { error: e.code, message: e.message });
    console.error(e);
    return send(res, 502, { error: "fetch_failed", message: "That website couldn't be reached. Try again, or paste the page text." });
  }

  const data = extractJsonLd(page.html);
  if (data) return send(res, 200, { method: "data", recipe: normalize(data, data.source || page.finalUrl) });

  if (!aiEnabled()) {
    return send(res, 422, {
      error: "no_data",
      message: "This page doesn't include standard recipe data, and Claude reading isn't set up. Use Type it in, or add a Claude API key in Vercel (see Settings)."
    });
  }
  try {
    const text = htmlToText(page.html);
    if (text.length < 80) return send(res, 422, { error: "no_recipe", message: "That page looks empty to a reader. It may need a login, or load its recipe with scripts. Paste the page text instead." });
    const r = await claudeExtract({ text: `Page title: ${pageTitle(page.html)}\n\n${text}`, url: page.finalUrl });
    if (!r) return send(res, 422, { error: "no_recipe", message: "No recipe found on that page." });
    return send(res, 200, { method: "ai", recipe: normalize(r, page.finalUrl) });
  } catch (e) {
    return send(res, 502, { error: "ai_failed", message: "Claude couldn't read that page right now. Try again in a minute." });
  }
}
