// Local preview: serves public/ and runs api/*.js like Vercel does.  node test/dev-server.js [port]
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const pub = join(root, "public");
const types = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json", ".json": "application/json" };
const port = +process.argv[2] || 5173;

http.createServer(async (req, res) => {
  const path = new URL(req.url, "http://x").pathname;
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
}).listen(port, () => console.log("Recipe Keep on http://localhost:" + port));
