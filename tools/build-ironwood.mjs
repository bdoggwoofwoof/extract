// Builds Extract's Ironwood bridge from an Ironwood checkout:  node tools/build-ironwood.mjs ../ironwood
//  - public/ironwood/ing.js: Ironwood's own ingredient parser and formatter, copied as-is, so recipes sent to
//    Ironwood are stored exactly the way Ironwood stores them.
//  - public/ironwood/library.json: Ironwood's built-in recipes and mix-and-match combos, as text, so an Ironwood
//    backup's meal prep (which names built-ins only by id) can be turned into Extract recipes.
// Rerun it after Ironwood's recipes change. Needs Playwright (npm i -g playwright) for the library dump.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createServer } from "node:http";
import { join, extname, resolve } from "node:path";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const iwDir = resolve(process.argv[2] || "../ironwood");
const html = readFileSync(join(iwDir, "index.html"), "utf8");
const out = new URL("../public/ironwood/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });

// --- copy the parser source (functions by balanced braces, consts to the end of their statement)
function grab(name) {
  let i = html.indexOf(`function ${name}(`);
  if (i >= 0) { let d = 0, j = html.indexOf("{", i); for (; j < html.length; j++) { if (html[j] === "{") d++; else if (html[j] === "}" && --d === 0) break; } return html.slice(i, j + 1); }
  i = html.indexOf(`const ${name} =`); if (i < 0) throw new Error("not found in Ironwood: " + name);
  let d = 0, j = i; for (; j < html.length; j++) { const c = html[j]; if ("{([".includes(c)) d++; else if ("})]".includes(c)) d--; else if (c === ";" && d === 0) break; } return html.slice(i, j + 1);
}
const names = ["UFRAC", "numOf", "UNIT_ALIAS", "guessAisle", "parseIng", "FRACS", "fracStr", "ingToText"];
const sha = (() => { try { return execSync("git rev-parse --short HEAD", { cwd: iwDir }).toString().trim(); } catch { return ""; } })();
writeFileSync(join(out, "ing.js"), `// Copied from Ironwood (${sha}) by tools/build-ironwood.mjs. Do not edit by hand.\n${names.map(grab).join("\n")}\nexport { parseIng, ingToText, guessAisle };\n`);

// --- dump the recipe library by running Ironwood itself in a headless browser
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".wasm": "application/wasm", ".woff2": "font/woff2", ".png": "image/png", ".webmanifest": "application/json" };
const srv = createServer((q, r) => { const p = join(iwDir, decodeURIComponent(q.url.split("?")[0]) === "/" ? "index.html" : decodeURIComponent(q.url.split("?")[0])); try { r.setHeader("content-type", types[extname(p)] || "application/octet-stream"); r.end(readFileSync(p)); } catch { r.statusCode = 404; r.end(); } }).listen(0);
const port = srv.address().port;
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_PATH || "playwright");
const b = await chromium.launch(); const pg = await b.newPage({ serviceWorkers: "block" });
await pg.goto(`http://localhost:${port}/`); await pg.waitForTimeout(1500);
const lib = await pg.evaluate(() => {
  const ids = [...Object.keys(MEAL_BUILTIN)];
  for (const base of MIX_BASES) { ids.push(base.id); for (const f of MIX_FLAVORS) if (f.for.includes(base.fam)) ids.push(base.id + "~" + f.id); }
  const out = {};
  for (const id of ids) {
    const r = getRecipe(id); if (!r) continue;
    let m = null; try { m = macros(r); } catch (e) {}
    out[id] = { name: r.name, cat: r.cat, serves: r.serves || 1, mins: r.mins || 0, size: r.size || "", keeps: r.keeps || 0, freezes: !!r.freezes,
      ing: (r.ing || []).map(g => { const l = ingLine(g, 1); return ((l.q ? l.q + " " : "") + l.n).trim(); }), steps: r.steps || [], note: r.note || "", src: r.src && r.src.url ? r.src.url : "",
      macros: m ? { kcal: Math.round(m.kcal || 0), p: Math.round(m.p || 0), c: Math.round(m.c || 0), f: Math.round(m.f || 0) } : null };
  }
  return { cats: Object.fromEntries(MEAL_CATS), recipes: out };
});
await b.close(); srv.close();
writeFileSync(join(out, "library.json"), JSON.stringify({ from: sha, ...lib }));
console.log(`ing.js and library.json written: ${Object.keys(lib.recipes).length} Ironwood recipes`);
