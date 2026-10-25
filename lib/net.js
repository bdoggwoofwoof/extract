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

export async function fetchPage(rawUrl) {
  let u = parsePublicUrl(rawUrl);
  const deadline = AbortSignal.timeout(TIMEOUT_MS);
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    await assertPublic(u);
    let res;
    try {
      res = await fetch(u, {
        redirect: "manual",
        signal: deadline,
        headers: {
          "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36 Extract/1.0",
          "accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "accept-language": "en-US,en;q=0.8"
        }
      });
    } catch (e) {
      if (e && (e.name === "TimeoutError" || e.name === "AbortError")) throw new FetchError("timeout", "That website took too long to answer. Try again, or paste the page text.", 504);
      throw new FetchError("fetch_failed", "That website couldn't be reached. Try again, or paste the page text.", 502);
    }
    if (res.status >= 300 && res.status < 400 && res.headers.get("location")) {
      u = parsePublicUrl(new URL(res.headers.get("location"), u).toString());
      continue;
    }
    if (res.status === 403 || res.status === 429 || res.status === 503) throw new FetchError("site_blocked", "That website blocks automatic readers. Open it, copy the page text, and use Paste text instead.", 502);
    if (!res.ok) throw new FetchError("fetch_failed", `That page answered with an error (${res.status}). Check the link.`, 502);
    const type = res.headers.get("content-type") || "";
    if (type && !/html|xml|text\/plain/i.test(type)) throw new FetchError("not_html", "That link isn't a web page. Use Photo for images or PDFs.", 415);
    const reader = res.body.getReader();
    const chunks = []; let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BYTES) { reader.cancel().catch(() => {}); break; }
      chunks.push(value);
    }
    const html = new TextDecoder("utf-8", { fatal: false }).decode(Buffer.concat(chunks));
    return { html, finalUrl: u.toString() };
  }
  throw new FetchError("fetch_failed", "That link redirects too many times.", 502);
}
