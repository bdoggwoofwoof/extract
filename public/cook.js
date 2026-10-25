/* Cook mode helpers: times in steps, kitchen timers, and which ingredients a step uses. */

const WORDS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20, thirty: 30, forty: 40, "forty-five": 45, fifty: 50, sixty: 60, ninety: 90 };
const NUMW = `(\\d+(?:\\.\\d+)?|${Object.keys(WORDS).sort((a, b) => b.length - a.length).join("|")})`;
const TIME_RE = new RegExp(`\\b${NUMW}(?:\\s*(?:-|–|—|to|or)\\s*${NUMW})?\\s*(seconds?|secs?|minutes?|mins?|hours?|hrs?)\\b`, "gi");
const num = w => WORDS[String(w).toLowerCase()] ?? parseFloat(w);
const unitSecs = u => /^s/i.test(u) ? 1 : /^h/i.test(u) ? 3600 : 60;

// Finds "25 minutes", "13–14 minutes", "about ten minutes", "1 hour" in a step.
export function findTimes(text) {
  const out = []; let m; TIME_RE.lastIndex = 0;
  while ((m = TIME_RE.exec(text))) {
    const a = num(m[1]), b = m[2] ? num(m[2]) : null, k = unitSecs(m[3]);
    if (!(a > 0)) continue;
    const lo = Math.round(a * k), hi = b ? Math.round(b * k) : null;
    if (lo < 5 || lo > 48 * 3600) continue;
    out.push({ start: m.index, end: m.index + m[0].length, text: m[0], secs: lo, maxSecs: hi });
  }
  return out;
}
export function fmtClock(s) {
  s = Math.max(0, Math.ceil(s));
  const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), ss = s % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}` : `${m}:${String(ss).padStart(2, "0")}`;
}

// --- which ingredients a step mentions ---
const SKIP = new Set("cup cups tablespoon tablespoons tbsp tbs teaspoon teaspoons tsp ounce ounces oz pound pounds lb lbs gram grams g kg ml l liter liters litre quart quarts pint pints can cans package packages jar jars clove cloves pinch dash bunch large small medium whole fresh freshly dried ground chopped minced diced sliced finely roughly thinly peeled melted softened room temperature to taste plus more for extra optional about of the and or a an into cut packed level heaping divided stick sticks piece pieces".split(" "));
function keyWords(line) {
  let core = line.toLowerCase()
    .replace(/\([^)]*\)/g, " ")
    .replace(/^[\d\s.,/½⅓⅔¼¾⅛⅜⅝⅞⅕-]+/, " ")
    .split(/,|;| - /)[0];
  return core.split(/\band\b|\bor\b|\/|&/).map(part => {
    const w = part.match(/[a-zà-ÿ']{3,}/g) || [];
    const kept = w.filter(x => !SKIP.has(x));
    return kept[kept.length - 1] || ""; // the head noun: "red lentils" → "lentils"
  }).filter(Boolean);
}
const stem = w => w.replace(/(ies)$/, "y").replace(/(oes|es)$/, "o").replace(/s$/, "");
export function ingredientsForStep(step, ingredients) {
  const s = " " + step.toLowerCase().replace(/[^a-zà-ÿ']+/g, " ") + " ";
  const words = new Set(s.trim().split(" ").map(stem));
  return ingredients.map((line, i) => ({ line, i }))
    .filter(({ line }) => !line.startsWith("## ") && keyWords(line).some(k => words.has(stem(k))));
}

// --- timers (kept across reloads, alarm while the app is open) ---
const KEY = "rk-timers";
let timers = []; let tick = null; let onChange = () => {}; let audio = null;
try { timers = JSON.parse(localStorage.getItem(KEY) || "[]"); } catch {}
const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(timers)); } catch {} };

function unlockAudio() {
  try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === "suspended") audio.resume(); } catch {}
}
function ring() {
  try {
    if (!audio) return;
    const t0 = audio.currentTime;
    for (let i = 0; i < 6; i++) {
      const o = audio.createOscillator(), g = audio.createGain();
      o.type = "sine"; o.frequency.value = i % 2 ? 880 : 1175;
      g.gain.setValueAtTime(0.0001, t0 + i * 0.32); g.gain.exponentialRampToValueAtTime(0.35, t0 + i * 0.32 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + i * 0.32 + 0.28);
      o.connect(g).connect(audio.destination); o.start(t0 + i * 0.32); o.stop(t0 + i * 0.32 + 0.3);
    }
  } catch {}
  try { navigator.vibrate && navigator.vibrate([300, 150, 300, 150, 600]); } catch {}
}
function loop() {
  const now = Date.now(); let changed = false;
  for (const t of timers) if (!t.done && now >= t.end) { t.done = true; changed = true; ring(); }
  if (changed) persist();
  onChange(timers);
  if (!timers.some(t => !t.done)) { clearInterval(tick); tick = null; }
}
export function watchTimers(fn) { onChange = fn; if (timers.length) { if (!tick) tick = setInterval(loop, 500); loop(); } }
export function startTimer(label, secs) {
  unlockAudio();
  timers.push({ id: Date.now().toString(36), label: String(label).slice(0, 60), end: Date.now() + secs * 1000, total: secs, done: false });
  persist(); if (!tick) tick = setInterval(loop, 500); loop();
}
export function addTime(id, secs) { const t = timers.find(x => x.id === id); if (t) { t.end = (t.done ? Date.now() : t.end) + secs * 1000; t.done = false; persist(); if (!tick) tick = setInterval(loop, 500); loop(); } }
export function stopTimer(id) { timers = timers.filter(t => t.id !== id); persist(); loop(); }
export function timersHtml(esc) {
  if (!timers.length) return "";
  const now = Date.now();
  return `<div class="timer-tray" role="region" aria-label="Timers">${timers.map(t => `
    <div class="timer${t.done ? " done" : ""}" role="timer">
      <div class="tt"><span class="tclock">${t.done ? "Done" : fmtClock((t.end - now) / 1000)}</span><span class="tlabel">${esc(t.label)}</span></div>
      <button class="btn sm ghost" data-act="timer-add" data-id="${t.id}" aria-label="Add one minute">+1 min</button>
      <button class="btn sm ghost" data-act="timer-stop" data-id="${t.id}" aria-label="${t.done ? "Dismiss" : "Cancel"} timer">${t.done ? "OK" : "✕"}</button>
    </div>`).join("")}</div>`;
}
