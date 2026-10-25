// POST /api/extract  { text, url? } or { image: { data: base64, media_type } }  →  { recipe, method }
import { extractJsonLd, normalize } from "../lib/recipe.js";
import { aiEnabled, claudeExtract } from "../lib/claude.js";
import { send, checkAccess, readJson } from "../lib/http.js";

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];

export default async function handler(req, res) {
  if (req.method !== "POST") return send(res, 405, { error: "method", message: "Use POST." });
  if (!checkAccess(req, res)) return;
  let body;
  try { body = await readJson(req); }
  catch { return send(res, 413, { error: "too_large", message: "That's too big to send. Use a smaller photo or less text." }); }

  const { text, url, image } = body || {};
  if (text && typeof text === "string") {
    const data = /ld\+json/i.test(text) ? extractJsonLd(text) : null;
    if (data) return send(res, 200, { method: "data", recipe: normalize(data, url || data.source) });
  }
  if (!aiEnabled()) return send(res, 501, { error: "ai_off", message: "Reading photos and pasted text needs a Claude API key in Vercel. See Settings for how." });

  if (image) {
    if (!image.data || !IMAGE_TYPES.includes(image.media_type)) return send(res, 400, { error: "bad_image", message: "Use a JPEG, PNG, WebP or GIF photo." });
  } else if (!text || String(text).trim().length < 40) {
    return send(res, 400, { error: "no_text", message: "Paste the recipe text first." });
  }
  try {
    const r = await claudeExtract({ text, url, image });
    if (!r) return send(res, 422, { error: "no_recipe", message: image ? "Couldn't find a recipe in that photo. Try a sharper, closer shot." : "No recipe found in that text. Copy the whole page, including the ingredient list." });
    return send(res, 200, { method: "ai", recipe: normalize(r, url) });
  } catch {
    return send(res, 502, { error: "ai_failed", message: "Claude couldn't read that right now. Try again in a minute." });
  }
}
