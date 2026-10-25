// Local preview: serves public/ and runs api/*.js like Vercel does.  node test/dev-server.js [port]
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const pub = join(root, "public");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };
const port = +process.argv[2] || 5173;
const FAKE = process.env.FAKE_SB === "1";
// In-memory stand-in for the Supabase tables and functions in supabase/schema.sql.
const fake = { items: new Map(), shares: new Map(), clock: 0 };
const stamp = () => new Date(Date.UTC(2026, 0, 1) + (++fake.clock)).toISOString();
async function body(req) { const c = []; for await (const x of req) c.push(x); try { return JSON.parse(Buffer.concat(c).toString() || "{}"); } catch { return {}; } }
async function fakeApi(req, res, path) {
  const uid = req.headers["x-uid"] || "", b = await body(req), out = d => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(d)); };
  if (path === "select/items") {
    if (!uid) return out({ data: [] });
    const rows = [...fake.items.values()].filter(r => r.user_id === uid && (!b.gt || r.server_at > b.gt)).sort((a, c) => a.server_at < c.server_at ? -1 : 1);
    return out({ data: rows });
  }
  if (path === "rpc/push_items") {
    if (!uid) return out({ error: { message: "not signed in" } });
    for (const r of b.rows) {
      const k = uid + "|" + r.id, cur = fake.items.get(k);
      if (cur && !(cur.updated_at < r.updated_at)) continue; // same rule as the real function
      fake.items.set(k, { user_id: uid, id: r.id, kind: r.kind, data: r.data, updated_at: r.updated_at, deleted: !!r.deleted, server_at: stamp() });
    }
    return out({ data: null });
  }
  if (path === "insert/shares") { if (!uid) return out({ error: { message: "not signed in" } }); fake.shares.set(b.id, b.payload); return out({}); }
  if (path === "rpc/get_share") return out({ data: fake.shares.get(b.share_id) ?? null });
  return out({ error: { message: "unknown " + path } });
}

http.createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname;
  if (FAKE && path.startsWith("/__fake/")) return fakeApi(req, res, path.slice(8));
  if (FAKE && path === "/vendor/supabase.js") { res.setHeader("content-type", "text/javascript"); return res.end(await readFile(join(root, "test", "fake-supabase.js"))); }
  if (FAKE && path === "/api/status") { res.setHeader("content-type", "application/json"); return res.end(JSON.stringify({ ok: true, ai: false, locked: false, sync: { url: "https://fake.supabase.co", anonKey: "anon" } })); }
  if (path.startsWith("/api/")) {
    try {
      const mod = await import(join(root, "api", path.slice(5).replace(/[^a-z-]/gi, "") + ".js"));
      return await mod.default(req, res);
    } catch (e) { console.error(e); res.statusCode = 404; return res.end("{}"); }
  }
  let file = normalize(join(pub, path === "/" ? "index.html" : path));
  if (!file.startsWith(pub)) { res.statusCode = 403; return res.end(); }
  try { await stat(file); } catch { file = join(pub, "index.html"); }
  res.setHeader("content-type", types[extname(file)] || "application/octet-stream");
  res.end(await readFile(file));
}).listen(port, () => console.log("Extract on http://localhost:" + port));
