// Small helpers shared by the API routes.
import { timingSafeEqual } from "node:crypto";

export function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("content-type", "application/json; charset=utf-8");
  res.setHeader("cache-control", "no-store");
  res.end(JSON.stringify(body));
}

// If ACCESS_CODE is set in Vercel, every API call must carry it, so strangers
// who find your app's address can't run up your Claude bill.
export function checkAccess(req, res) {
  const code = process.env.ACCESS_CODE;
  if (!code) return true;
  const given = String(req.headers["x-access-code"] || "");
  const a = Buffer.from(given), b = Buffer.from(code);
  if (a.length === b.length && timingSafeEqual(a, b)) return true;
  send(res, 401, { error: "locked", message: "Enter your access code in Settings to use this." });
  return false;
}

export async function readJson(req, limit = 4_000_000) {
  if (req.body && typeof req.body === "object") return req.body;
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > limit) throw Object.assign(new Error("too_large"), { status: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); } catch { return {}; }
}
