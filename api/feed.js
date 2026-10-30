// GET /api/feed?url=https://blog.example  →  { feedUrl, title, site, items: [{ title, link, date, image }] }
// Accepts a blog's home page (finds its feed) or a feed address.
import { fetchPage, FetchError } from "../lib/net.js";
import { looksLikeFeed, feedLinksIn, parseFeed } from "../lib/feed.js";
import { send, checkAccess } from "../lib/http.js";

const FEED_TYPES = /xml|rss|atom|html|text\/plain/i;

async function readFeed(url) {
  const page = await fetchPage(url, { accept: FEED_TYPES, headers: { accept: "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/html;q=0.8, */*;q=0.5" } });
  return page;
}

export default async function handler(req, res) {
  if (req.method !== "GET") return send(res, 405, { error: "method", message: "Use GET." });
  if (!checkAccess(req, res)) return;
  const raw = new URL(req.url, "http://x").searchParams.get("url");
  if (!raw) return send(res, 400, { error: "bad_url", message: "Add a blog's address first." });
  let url = /^https?:\/\//i.test(raw.trim()) ? raw.trim() : "https://" + raw.trim();
  try {
    let page = await readFeed(url);
    if (!looksLikeFeed(page.html)) {
      // A web page: follow its feed link, or try the usual WordPress address.
      const candidates = [...feedLinksIn(page.html, page.finalUrl)];
      const origin = new URL(page.finalUrl).origin;
      if (!candidates.length) candidates.push(origin + "/feed/", origin + "/rss.xml", origin + "/feed.xml", origin + "/atom.xml");
      let found = null;
      for (const c of candidates.slice(0, 4)) {
        try { const p = await readFeed(c); if (looksLikeFeed(p.html)) { found = p; break; } } catch {}
      }
      if (!found) return send(res, 422, { error: "no_feed", message: "That site doesn't publish a feed Extract can follow. Try the blog's home page address." });
      page = found;
    }
    const feed = parseFeed(page.html, page.finalUrl);
    if (!feed.items.length) return send(res, 422, { error: "empty_feed", message: "That blog's feed has no posts in it right now." });
    return send(res, 200, { feedUrl: page.finalUrl, ...feed });
  } catch (e) {
    const err = e instanceof FetchError ? e : new FetchError("fetch_failed", "That blog couldn't be reached. Check the address and try again.", 502);
    return send(res, err.status, { error: err.code, message: err.code === "site_blocked" ? "That blog blocks readers, so it can't be followed." : err.message });
  }
}
