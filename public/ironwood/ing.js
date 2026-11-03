// Copied from Ironwood (5ff5348) by tools/build-ironwood.mjs. Do not edit by hand.
const UFRAC = { '½': 1 / 2, '⅓': 1 / 3, '⅔': 2 / 3, '¼': 1 / 4, '¾': 3 / 4, '⅛': 1 / 8 };
function numOf(s) {
  s = String(s).trim().replace(',', '.'); let v = 0;
  const u = s.match(/[½⅓⅔¼¾⅛]/); if (u) { v += UFRAC[u[0]]; s = s.replace(u[0], '').trim(); }
  if (!s) return v;
  const parts = s.split(/\s+/);
  for (const p of parts) { if (p.includes('/')) { const [a, b] = p.split('/'); if (+b) v += +a / +b; } else v += +p || 0; }
  return v;
}
const UNIT_ALIAS = { tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', tbsp: 'tbsp', tbs: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp', cup: 'cup', cups: 'cup', oz: 'oz', ounce: 'oz', ounces: 'oz', lb: 'lb', lbs: 'lb', pound: 'lb', pounds: 'lb',
  g: 'g', gram: 'g', grams: 'g', kg: 'kg', kgs: 'kg', ml: 'ml', l: 'l', liter: 'l', liters: 'l', litre: 'l', litres: 'l', can: 'can', cans: 'can', clove: 'clove', cloves: 'clove', pinch: 'pinch', bunch: 'bunch', bunches: 'bunch',
  bag: 'bag', bags: 'bag', jar: 'jar', jars: 'jar', head: 'head', heads: 'head', pkg: 'package', package: 'package', packages: 'package', box: 'box', boxes: 'box', stalk: 'stalk', stalks: 'stalk', pint: 'pint', pints: 'pint', scoop: 'scoop', scoops: 'scoop', slice: 'slice', slices: 'slice', serving: 'serving', servings: 'serving' };
function guessAisle(n, u) {
  const t = String(n).toLowerCase().split(',')[0];
  if (/\bfrozen\b/.test(t)) return 'frozen';
  if (/protein powder/.test(t)) return 'pantry';
  if (u === 'can' || u === 'jar' || /\bcanned\b|\bbeans?\b|chickpea|salsa|marinara|tomato (paste|sauce)|crushed tomato|diced tomato|coconut milk|broth|stock\b|pickle|olives/.test(t)) return 'canned';
  if (/peanut butter|almond butter|powder|seasoning|flakes|\bdried\b|cumin|paprika|oregano|cinnamon|nutmeg|\bsalt\b|black pepper|curry|vanilla|honey|maple|syrup|soy sauce|vinegar|\boil\b|mustard|sriracha|hot sauce|tahini|chia|flax|cornstarch|baking|bay lea|za.?atar|allspice|cayenne|gochujang|\bmiso\b|tamari|\bsage\b|sugar|chocolate|almonds?\b|walnut|pecan|cashew|\bnuts?\b|sesame|ketchup|mayo/.test(t)) return 'pantry';
  if (/\beggs?\b|yogurt|\bmilk\b|\bbutter\b|kefir|cream\b|cheese|cheddar|mozzarella/.test(t)) return 'dairy';
  if (/chicken|turkey|salmon|shrimp|tofu|tempeh|\bfish\b|\bcod\b|tilapia|steak|\bbeef\b|\bpork\b|sausage|bacon/.test(t)) return 'protein';
  if (/\brice\b|cereal|quinoa|\boats?\b|pasta|noodle|tortilla|bread|granola|crumbs|cracker|lentil|pita|\bwraps?\b|couscous|farro|flour|bagel|\bbuns?\b/.test(t)) return 'grains';
  if (/onion|garlic|pepper|broccoli|spinach|lettuce|romaine|tomato|cucumber|carrot|celery|zucchini|potato|\blimes?\b|lemon|cilantro|parsley|basil|berr|banana|apple|grape|avocado|ginger|scallion|kale|cabbage|dill|chive|brussels|collard|tomatillo|jalape|turmeric|coleslaw|\bpeas?\b|mushroom|squash|green bean|\bcorn\b|hummus|orange|cauliflower|asparagus|herb|mint|fruit/.test(t)) return 'produce';
  return 'other';
}
function parseIng(line) {
  let s = String(line || '').trim().replace(/^[-•*]\s*/, ''); if (!s) return null;
  const m = s.match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?\s*[½⅓⅔¼¾⅛]?|[½⅓⅔¼¾⅛])\s*(?:(?:-|–|to)\s*[\d.,\/½⅓⅔¼¾⅛]+\s*)?/);
  let q = null, u = '';
  if (m) { q = numOf(m[1]); s = s.slice(m[0].length); }
  let paren = ''; const pm = s.match(/^(\([^)]*\))\s*/); if (q != null && pm) { paren = pm[1]; s = s.slice(pm[0].length); }
  const um = s.match(/^([A-Za-z]+)\.?(\s+(?:of\s+)?|$)/);
  if (q != null && um && UNIT_ALIAS[um[1].toLowerCase()]) { u = UNIT_ALIAS[um[1].toLowerCase()]; s = s.slice(um[0].length); }
  let n = s.trim(); if (paren) { const c = n.indexOf(','); n = c < 0 ? n + ' ' + paren : n.slice(0, c) + ' ' + paren + n.slice(c); }
  if (!n) return null;
  return { q: q != null && q > 0 ? q : null, u, n, a: guessAisle(n, u) };
}
const FRACS = [[0, ''], [1 / 8, '⅛'], [1 / 4, '¼'], [1 / 3, '⅓'], [1 / 2, '½'], [2 / 3, '⅔'], [3 / 4, '¾'], [1, '']];
function fracStr(q) {
  if (q == null || !isFinite(q)) return '';
  if (q >= 20) return String(Math.round(q));
  let w = Math.floor(q + 1e-9); const f = q - w; let best = FRACS[0], d = 9;
  for (const x of FRACS) { const e = Math.abs(f - x[0]); if (e < d) { d = e; best = x; } }
  if (best[0] === 1) { w++; best = FRACS[0]; }
  if (!w && !best[1]) return q > 0 ? '⅛' : '0';
  return (w ? String(w) : '') + best[1];
}
const ingToText = g => (g.q != null ? fracStr(g.q) + ' ' : '') + (g.u ? g.u + ' ' : '') + g.n;
export { parseIng, ingToText, guessAisle };
