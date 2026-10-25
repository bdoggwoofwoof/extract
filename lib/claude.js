// Optional: reads a recipe out of messy text or a photo with Claude.
// Only used when ANTHROPIC_API_KEY is set in Vercel, and only when a page
// has no built-in recipe data (or for photos / pasted text).

const MODEL = process.env.RECIPE_MODEL || "claude-haiku-5-5";

const RULES = `You pull the recipe out of messy recipe content. Skip the life story, ads, comments, navigation, ratings and nutrition panels. Use only what the source says; never invent quantities, ingredients or steps.
Reply with only JSON in this shape, and nothing else:
{"found":true,"title":"","servings":null,"yield":"","prepTime":"","cookTime":"","totalTime":"","ingredients":[""],"steps":[""],"notes":"","tags":[""]}
Rules:
- ingredients: one item per line exactly as written (quantity, unit, ingredient, prep). A group heading is its own line starting with "## ".
- steps: one instruction per item, in order, without leading numbers. Group headings start with "## ".
- servings: a number if stated, else null. yield: text like "1 loaf" or "24 cookies" if that is how it's given, else "".
- times as "15 min" or "1 hr 10 min"; "" if not given.
- notes: the cook's tips or substitutions from the recipe itself, briefly; else "".
- tags: up to 4 short categories, e.g. "Dinner", "Vegetarian", "Soup", "Baking".
If there is no recipe at all, reply {"found":false}.`;

export const aiEnabled = () => Boolean(process.env.ANTHROPIC_API_KEY);

function parseJson(text) {
  const t = text.trim();
  try { return JSON.parse(t); } catch {}
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) { try { return JSON.parse(fence[1]); } catch {} }
  const a = t.indexOf("{"), b = t.lastIndexOf("}");
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  return null;
}

export async function claudeExtract({ text, url, image }) {
  const content = [];
  if (image) {
    content.push({ type: "image", source: { type: "base64", media_type: image.media_type, data: image.data } });
    content.push({ type: "text", text: RULES + "\n\nThe content is the photo above: a recipe card, cookbook page or screenshot. Read it carefully, including handwriting." });
  } else {
    content.push({ type: "text", text: RULES + "\n\nCONTENT" + (url ? ` (from ${url})` : "") + ":\n" + String(text).slice(0, 60000) });
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json"
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: "user", content }] }),
    signal: AbortSignal.timeout(55000)
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    console.error("Claude API error", res.status, detail.slice(0, 500));
    const err = new Error("ai_failed"); err.status = res.status; throw err;
  }
  const data = await res.json();
  const out = (data.content || []).filter(b => b.type === "text").map(b => b.text).join("\n");
  const r = parseJson(out);
  if (!r || r.found === false || !Array.isArray(r.ingredients) || !r.ingredients.length) return null;
  return r;
}
