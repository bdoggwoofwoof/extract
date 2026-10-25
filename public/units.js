/* US ↔ metric conversion for ingredient lines and oven temperatures.
   Volume stays volume and weight stays weight: converting cups of flour to grams needs
   the ingredient's density, which a recipe line doesn't give us. */

const UF = { "½": .5, "⅓": 1 / 3, "⅔": 2 / 3, "¼": .25, "¾": .75, "⅛": .125, "⅜": .375, "⅝": .625, "⅞": .875 };
const UFC = Object.keys(UF).join("");
const NUM = `(?:\\d+\\s*[${UFC}]|\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d+(?:\\.\\d+)?|[${UFC}])`;
function parseNum(s) {
  s = s.trim(); let m;
  if ((m = s.match(new RegExp(`^(\\d+)\\s*([${UFC}])$`)))) return +m[1] + UF[m[2]];
  if (UF[s] != null) return UF[s];
  if ((m = s.match(/^(\d+)\s+(\d+)\/(\d+)$/))) return +m[1] + m[2] / m[3];
  if ((m = s.match(/^(\d+)\/(\d+)$/))) return m[1] / m[2];
  return parseFloat(s);
}
function frac(n) {
  if (n >= 10) return String(Math.round(n));
  const w = Math.floor(n), f = n - w;
  const c = [[0, ""], [1 / 4, "¼"], [1 / 3, "⅓"], [1 / 2, "½"], [2 / 3, "⅔"], [3 / 4, "¾"], [1, ""]];
  let best = c[0], d = 1; for (const x of c) { const dd = Math.abs(f - x[0]); if (dd < d) { d = dd; best = x; } }
  const whole = best[0] === 1 ? w + 1 : w;
  return ((whole ? String(whole) : "") + best[1]) || "0";
}
const round5 = n => n < 10 ? Math.round(n * 10) / 10 : n < 100 ? Math.round(n / 5) * 5 : Math.round(n / 10) * 10;

// unit word → [system, kind, size in ml or g]
const UNITS = [
  [/^(cups?|c\.?)(?=\W|$)/i, "us", "vol", 240],
  [/^(tablespoons?|tbsps?\.?|tbs\.?|T)(?=\W|$)/, "spoon", "vol", 15],
  [/^(teaspoons?|tsps?\.?|t)(?=\W|$)/, "spoon", "vol", 5],
  [/^(fl\.? ?oz\.?|fluid ounces?)(?=\W|$)/i, "us", "vol", 29.57],
  [/^(pints?|pt\.?)(?=\W|$)/i, "us", "vol", 473],
  [/^(quarts?|qt\.?)(?=\W|$)/i, "us", "vol", 946],
  [/^(gallons?|gal\.?)(?=\W|$)/i, "us", "vol", 3785],
  [/^(ounces?|oz\.?)(?=\W|$)/i, "us", "wt", 28.35],
  [/^(pounds?|lbs?\.?)(?=\W|$)/i, "us", "wt", 453.6],
  [/^(milliliters?|millilitres?|ml)(?=\W|$)/i, "metric", "vol", 1],
  [/^(liters?|litres?|l)(?=\W|$)/i, "metric", "vol", 1000],
  [/^(grams?|g)(?=\W|$)/i, "metric", "wt", 1],
  [/^(kilograms?|kilos?|kg)(?=\W|$)/i, "metric", "wt", 1000]
];
const QTY_RE = new RegExp(`^\\s*(${NUM})(?:\\s*(?:-|–|to)\\s*(${NUM}))?\\s*`);

function toMetric(base, kind) {
  if (kind === "wt") return base >= 1000 ? `${Math.round(base / 100) / 10} kg` : `${round5(base)} g`;
  return base >= 1000 ? `${Math.round(base / 100) / 10} L` : `${round5(base)} ml`;
}
function toUS(base, kind) {
  if (kind === "wt") return base >= 450 ? `${frac(base / 453.6)} lb` : `${base / 28.35 < 10 ? Math.round(base / 28.35 * 2) / 2 : Math.round(base / 28.35)} oz`;
  if (base < 15) return `${frac(base / 5)} tsp`;
  if (base < 60) return `${frac(base / 15)} tbsp`;
  return `${frac(base / 240)} cup${base / 240 > 1.1 ? "s" : ""}`;
}

/* Returns { q, rest } like the scaler does, with q converted, or null when the line has no
   convertible unit (or already gives the other system in brackets, e.g. "2 cups (281g)"). */
export function convertLine(line, k, target) {
  const m = line.match(QTY_RE); if (!m) return null;
  const after = line.slice(m[0].length);
  const u = UNITS.find(([re]) => re.test(after)); if (!u) return null;
  const [re, sys, kind, size] = u;
  if (sys === "spoon") return null; // teaspoons and tablespoons are used everywhere
  if ((target === "metric" && sys === "metric") || (target === "us" && sys === "us")) return null;
  const has = target === "metric" ? /\(\s*[\d.]+\s*(g|kg|ml|l)\b/i : /\(\s*[\d.\/ ]+\s*(cups?|oz|lb|tbsp|tsp)\b/i;
  if (has.test(line)) return null;
  const a = parseNum(m[1]), b = m[2] ? parseNum(m[2]) : null; if (!isFinite(a)) return null;
  const conv = target === "metric" ? toMetric : toUS;
  const unitLen = after.match(re)[0].length;
  const q = conv(a * k * size, kind) + (b != null ? "–" + conv(b * k * size, kind) : "");
  return { q, rest: after.slice(unitLen).replace(/^\s*(of\s+)?/i, m2 => m2.includes("of") ? "of " : " ").trim() };
}

// Which system a recipe mostly uses, so the toggle can offer the other one.
export function systemOf(lines) {
  let us = 0, metric = 0;
  for (const l of lines) {
    const m = l.match(QTY_RE); if (!m) continue;
    const u = UNITS.find(([re]) => re.test(l.slice(m[0].length)));
    if (u && u[1] === "us") us++; else if (u && u[1] === "metric") metric++;
  }
  return metric > us ? "metric" : "us";
}

// "350°F", "350 degrees F", "190C", "200 °C" → the other scale, unless both are already given.
export function convertTemps(text, target) {
  if (/\d\s*°?\s*F\b.{0,12}\d\s*°?\s*C\b|\d\s*°?\s*C\b.{0,12}\d\s*°?\s*F\b/i.test(text)) return text;
  if (target === "metric") return text.replace(/(\d{3})\s*(?:°|degrees?)\s*F\b|(\d{3})\s*°F/gi, (all, a, b) => `${Math.round(((+(a || b) - 32) * 5 / 9) / 5) * 5}°C`);
  return text.replace(/(\d{2,3})\s*(?:°|degrees?)\s*C\b|(\d{2,3})\s*°?C\b(?!\w)/g, (all, a, b) => `${Math.round(((+(a || b)) * 9 / 5 + 32) / 5) * 5}°F`);
}
