/* Reads a recipe out of plain text without Claude: an Instagram or TikTok caption, a YouTube
   description, or text pasted from a page. Looks for "Ingredients" and "Method"-style headings,
   and falls back to lines that start with an amount (ingredients) or a number (steps).
   Returns null when there isn't a recipe in the text. Shared by the server and the app. */

const ING_HEAD = /^(?:the\s+)?(?:ingredients?|you(?:'|’)?ll need|what you(?:'|’)?ll need|what you need|shopping list|for the [a-z ]{2,30})\s*[:：-]?\s*(.*)$/i;
const STEP_HEAD = /^(?:the\s+)?(?:instructions?|directions?|method|steps|preparation|prep|how to make(?: it)?|how to|to make|recipe steps|cooking steps)\s*[:：-]?\s*(.*)$/i;
const NOTE_HEAD = /^(?:notes?|tips?|storage|to store|substitutions?|nutrition)\s*[:：-]?\s*(.*)$/i;
const END = /^(?:#\w|follow\b|link in (?:my )?bio|full recipe (?:on|at|in)|save (?:this|for later)|tag (?:a|someone)|comment\b|music\b|♬|\d+(?:\.\d+)?[km]? (?:likes|views|comments)|subscribe\b|shop (?:my|the)|affiliate|use code\b)/i;
const SUB_HEAD = /^(?:for the\s+)?[a-z][a-z &'-]{1,30}:\s*$/i;
const UF = "½⅓⅔¼¾⅛⅜⅝⅞⅕⅖⅗⅘⅙⅚";
const STARTS_AMOUNT = new RegExp(`^(?:\\d|[${UF}]|a\\s+(?:pinch|handful|dash|few|couple|splash|cup|can|bunch)|one\\b|two\\b|three\\b|half\\b|pinch\\b|handful\\b|dash\\b|splash\\b|juice of\\b|zest of\\b)`, "i");
const LEADS_DIGIT = new RegExp(`^[\\d${UF}]`);
const NUMBERED = /^(?:step\s*)?(\d{1,2})\s*[.):\-–]\s+(.*)$/i;

function tidyLine(l) {
  return String(l)
    .replace(/(\d)️?⃣/gu, "$1. ")                       // 1️⃣ → "1. "
    .replace(/[\p{Extended_Pictographic}️‍]/gu, " ")      // other emoji
    .replace(/^[\s•·▪▫◦‣⁃●○■□☐▢✓✔︎✅*>-]+/u, "")                  // bullets
    .replace(/\s+(?:full recipe (?:on|at|in)|link in (?:my )?bio|recipe in (?:my )?bio|follow (?:me|for)).*$/i, "")
    .replace(/(?:\s+#[\p{L}\p{N}_]+)+\s*$/u, "")                     // trailing hashtags
    .replace(/\s+/g, " ").trim();
}
const META = /^(?:serves|servings?|makes|yields?|prep time|cook time|total time|ready in)\b/i;
// "1 lb chicken, 1 cup orzo, 2 cups broth" on one line → three ingredients.
function splitIngredientRun(l) {
  const parts = l.split(new RegExp(`,\\s*(?=(?:\\d|[${UF}]|a\\s|one\\s|two\\s|half\\s))`, "i"));
  return parts.length >= 3 ? parts.map(x => x.trim()).filter(Boolean) : [l];
}
// Captions sometimes run everything into one line: "Ingredients: 1 cup x, 2 eggs. Method: ..."
function splitRunOn(text) {
  return text
    .replace(/\s*(ingredients?|instructions?|directions?|method|steps)\s*[:：]\s*/gi, "\n$1:\n")
    .replace(/(?<=[.!?])\s+(?=(?:step\s*)?\d{1,2}[.)]\s)/gi, "\n")
    .replace(/\s*\|\s*/g, "\n");
}

export function parseRecipeText(raw, { title: givenTitle = "" } = {}) {
  let text = String(raw || "").replace(/\r/g, "");
  if (!/\n.*\n/.test(text) || /ingredients?\s*[:：]\s*\S/i.test(text)) text = splitRunOn(text);
  const lines = text.split("\n").map(tidyLine);

  let title = "", ings = [], steps = [], notes = [], mode = "", sawHead = false;
  const push = (arr, l) => { if (l) arr.push(l); };
  for (const l of lines) {
    if (!l) continue;
    if (META.test(l) && l.length < 50) continue;
    if (END.test(l)) { if (ings.length || steps.length) break; else continue; }
    let m;
    if ((m = l.match(ING_HEAD)) && l.length < 60 && !STARTS_AMOUNT.test(l)) {
      if (/^for the/i.test(l) && mode === "ing") { ings.push("## " + l.replace(/[:：-]\s*$/, "").replace(/^for the\s+/i, "").replace(/^\w/, c => c.toUpperCase())); continue; }
      mode = "ing"; sawHead = true; push(ings, m[1]); continue;
    }
    if ((m = l.match(STEP_HEAD)) && l.length < 60) { mode = "step"; sawHead = true; push(steps, m[1].replace(NUMBERED, "$2")); continue; }
    if ((m = l.match(NOTE_HEAD)) && l.length < 40 && (ings.length || steps.length)) { mode = "note"; push(notes, m[1]); continue; }
    if (mode === "ing") {
      if (SUB_HEAD.test(l) && !STARTS_AMOUNT.test(l)) { ings.push("## " + l.replace(/:\s*$/, "").replace(/^for the\s+/i, "").replace(/^\w/, c => c.toUpperCase())); continue; }
      // A numbered line right after the ingredients usually starts the method.
      if (NUMBERED.test(l) && !STARTS_AMOUNT.test(l.replace(NUMBERED, "$2")) && ings.length > 1) { mode = "step"; steps.push(l.replace(NUMBERED, "$2")); continue; }
      ings.push(...splitIngredientRun(l)); continue;
    }
    if (mode === "step") { steps.push(l.replace(NUMBERED, "$2")); continue; }
    if (mode === "note") { notes.push(l); continue; }
    if (!title && !ings.length && !steps.length && l.length <= 90 && !LEADS_DIGIT.test(l) && !NUMBERED.test(l) && !/,.*,/.test(l)) { title = l.replace(/[:：.!]+$/, ""); continue; }
    // No headings yet: amounts look like ingredients, numbers look like steps.
    if (!sawHead) {
      if (NUMBERED.test(l)) steps.push(l.replace(NUMBERED, "$2"));
      else if (STARTS_AMOUNT.test(l) && l.length < 200) ings.push(...splitIngredientRun(l));
    }
  }
  // Long steps pasted as one paragraph: split into sentences only when there's a single step.
  if (steps.length === 1 && steps[0].length > 220) steps = steps[0].split(/(?<=[.!?])\s+(?=[A-Z])/).map(s => s.trim()).filter(Boolean);
  ings = ings.map(s => s.replace(/[.;,]+$/, "").trim()).filter(s => s && s.length < 160);
  steps = steps.map(s => s.trim()).filter(s => s && !/^\d+$/.test(s));
  if (ings.filter(l => !l.startsWith("## ")).length < 2) return null;
  const all = lines.join(" ");
  const sv = all.match(/\b(?:serves|servings?|makes|yield)\s*[:：]?\s*(\d{1,2})\b/i) || all.match(/\b(\d{1,2})\s+servings\b/i);
  const tt = all.match(/\b(?:total time|ready in|takes)\s*[:：]?\s*(\d+\s*(?:min(?:ute)?s?|hours?|hrs?)(?:\s*\d+\s*min(?:ute)?s?)?)/i);
  return {
    title: (givenTitle || title || "Untitled recipe").replace(/\s*#\w.*$/, "").replace(/\s*[-–,]?\s*(?:ready in|in (?:just |under )?\d+ ?min).*$/i, "").trim().slice(0, 120),
    ingredients: ings, steps, notes: notes.join("\n"),
    servings: sv ? +sv[1] : null, totalTime: tt ? tt[1] : "", tags: []
  };
}
