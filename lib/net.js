// Fetches a public web page for the recipe reader, refusing anything that
// points at private or internal addresses (so the function can't be used to
// probe Vercel's own network), and capping time and size.
import { lookup } from "node:dns/promises";
import net from "node:net";

const MAX_BYTES = 4 * 1024 * 1024;
const MAX_REDIRECTS = 5;
const TIMEOUT_MS = 12000;

export class FetchError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 198 && (b === 18 || b === 19)) || a >= 224;
  }
  const v = ip.toLowerCase();
  if (v === "::" || v === "::1") return true;
  if (v.startsWith("::ffff:")) return isPrivateIp(v.slice(7));
  return v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe8") || v.startsWith("fe9") || v.startsWith("fea") || v.startsWith("feb") || v.startsWith("ff");
}

export function parsePublicUrl(raw) {
  let u;
  try { u = new URL(String(raw || "").trim()); } catch { throw new FetchError("bad_url", "That doesn't look like a web address."); }
  if (!/^https?:$/.test(u.protocol)) throw new FetchError("bad_url", "Only http and https links can be opened.");
  if (u.username || u.password) throw new FetchError("bad_url", "Links with a username or password can't be opened.");
  if (u.port && !["80", "443"].includes(u.port)) throw new FetchError("blocked_host", "That address can't be opened.");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (!host.includes(".") || /\.(local|internal|localhost)$/i.test(host)) throw new FetchError("blocked_host", "That address can't be opened.");
  return u;
}

async function assertPublic(u) {
  const host = u.hostname.replace(/^\[|\]$/g, "");
  let addrs;
  if (net.isIP(host)) addrs = [{ address: host }];
  else {
    try { addrs = await lookup(host, { all: true }); }
    catch { throw new FetchError("fetch_failed", "That website couldn't be found. Check the link.", 502); }
  }
  if (!addrs.length || addrs.some(a => isPrivateIp(a.address))) throw new FetchError("blocked_host", "That address can't be opened.");
}

const BROWSER_HEADERS = {
  "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
  "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
  "cache-control": "no-cache",
  "pragma": "no-cache",
  "sec-fetch-dest": "document",
  "sec-fetch-mode": "navigate",
  "sec-fetch-site": "none",
  "sec-fetch-user": "?1",
  "upgrade-insecure-requests": "1"
};
const BLOCKED = new Set([401, 402, 403, 406, 429, 451, 503]);

// Reader pages that a bot wall served instead of the recipe.
export function looksLikeBotWall(html) {
  return /cf-chl|challenge-platform|Just a moment\.\.\.|Attention Required!|captcha-delivery|px-captcha|Access to this page has been denied|Pardon Our Interruption/i.test(html.slice(0, 20000));
}

export async function fetchPage(rawUrl, { timeoutMs = TIMEOUT_MS, maxBytes = MAX_BYTES, headers = {}, accept = /html|xml|text\/plain/i } = {}) {
  let u = parsePublicUrl(rawUrl);
  const deadline = AbortSignal.timeout(timeoutMs);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(u);
    let res;
    try {
      res = await fetch(u, { redirect: "manual", signal: deadline, headers: { ...BROWSER_HEADERS, ...headers } });
    } catch (e) {
      if (e && (e.name === "TimeoutError" || e.name === "AbortError")) throw new FetchError("timeout", "That website took too long to answer. Try again, or paste the page text.", 504);
      throw new FetchError("fetch_failed", "That website couldn't be reached. Try again, or paste the page text.", 502);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      u = parsePublicUrl(new URL(res.headers.get("location"), u).toString());
      continue;
    }
    if (BLOCKED.has(res.status)) throw new FetchError("site_blocked", "That website blocks automatic readers. Open it, copy the page text, and use Paste text instead.", 502);
    if (!res.ok) throw new FetchError("fetch_failed", `That page answered with an error (${res.status}). Check the link.`, 502);
    const type = res.headers.get("content-type") || "";
    if (type && !accept.test(type)) throw new FetchError("not_html", "That link isn't a web page. Use Photo for images or PDFs.", 415);
    const reader = res.body.getReader();
    const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) { reader.cancel().catch(() => {}); break; }
      chunks.push(value);
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
    return { html, finalUrl: u.toString() };
  }
  throw new FetchError("fetch_failed", "That link redirects too many times.", 502);
}

// The Internet Archive keeps public copies of most popular recipe pages. When a
// site turns readers away, its archived copy usually still carries the recipe.
export async function fetchArchived(rawUrl) {
  const u = parsePublicUrl(rawUrl);
  const clean = u.origin + u.pathname; // tracking parameters rarely match an archived copy
  // Newest few complete (status 200, HTML) captures, newest last.
  let stamps = [];
  try {
    const cdx = "https://web.archive.org/cdx/search/cdx?output=json&fl=timestamp&filter=statuscode:200&filter=mimetype:text/html&limit=-3&url=" + encodeURIComponent(clean);
    const res = await fetch(cdx, { signal: AbortSignal.timeout(8000), headers: { "user-agent": "Extract recipe reader (personal use)" } });
    const rows = await res.json();
    stamps = rows.slice(1).map(r => r[0]).filter(Boolean).reverse();
  } catch (e) { return { reason: "index_unavailable" }; }
  if (!stamps.length) return { reason: "no_capture" };
  let reason = "unreadable";
  for (const ts of stamps.slice(0, 2)) {
    // "id_" asks for the page exactly as captured, without the Archive's toolbar.
    try {
      const page = await fetchPage(`https://web.archive.org/web/${ts}id_/${clean}`, { timeoutMs: 15000, maxBytes: 8 * 1024 * 1024 });
      return { html: page.html, finalUrl: clean, archivedAt: ts };
    } catch (e) { reason = e.code || "error"; }
  }
  return { reason };
}
