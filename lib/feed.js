// Recipe blogs publish RSS or Atom feeds. Given a blog's address (or its feed), find the feed
// and turn its newest posts into { title, link, date, image }.
import { decodeEntities, clean } from "./recipe.js";

const tag = (xml, name) => { const m = xml.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i")); return m ? m[1] : ""; };
const attr = (xml, name, a) => { const m = xml.match(new RegExp(`<${name}\\b[^>]*\\b${a}=["']([^"']+)["']`, "i")); return m ? decodeEntities(m[1]) : ""; };
const unCdata = s => String(s || "").replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
const text = s => clean(unCdata(s));

export const looksLikeFeed = body => /<(rss|feed|rdf:RDF)\b/i.test(body.slice(0, 2000));

// <link rel="alternate" type="application/rss+xml" href="…"> on a blog's page.
export function feedLinksIn(html, base) {
  const out = [];
  for (const m of html.matchAll(/<link\b[^>]*>/gi)) {
    const l = m[0];
    if (!/rel=["']?alternate/i.test(l) || !/type=["']?application\/(rss|atom)\+xml/i.test(l)) continue;
    if (/comments/i.test(l)) continue;
    const h = l.match(/href=["']([^"']+)["']/i);
    if (h) { try { out.push(new URL(decodeEntities(h[1]), base).toString()); } catch {} }
  }
  return [...new Set(out)];
}

function imageOf(item) {
  const media = attr(item, "media:content", "url") || attr(item, "media:thumbnail", "url");
  if (media) return media;
  const enc = item.match(/<enclosure\b[^>]*type=["']image\/[^"']+["'][^>]*>/i); if (enc) { const u = enc[0].match(/url=["']([^"']+)["']/i); if (u) return decodeEntities(u[1]); }
  const body = unCdata(tag(item, "content:encoded") || tag(item, "content") || tag(item, "description") || tag(item, "summary"));
  const img = decodeEntities(body).match(/<img\b[^>]*\bsrc=["']([^"']+)["']/i);
  return img ? img[1] : "";
}

export function parseFeed(xml, base = "") {
  const isAtom = /<feed\b/i.test(xml.slice(0, 2000));
  const channel = isAtom ? xml : tag(xml, "channel") || xml;
  const head = channel.split(/<(?:item|entry)\b/i)[0];
  const title = text(tag(head, "title"));
  const site = isAtom ? (attr(head.replace(/<link\b[^>]*rel=["']self["'][^>]*>/gi, ""), "link", "href")) : text(tag(head, "link"));
  const blocks = [...xml.matchAll(isAtom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi)].map(m => m[0]);
  const items = blocks.slice(0, 25).map(b => {
    let link = isAtom ? (attr(b.replace(/<link\b[^>]*rel=["'](?!alternate)[^"']*["'][^>]*>/gi, ""), "link", "href")) : text(tag(b, "link")) || text(tag(b, "guid"));
    try { link = new URL(link, base || undefined).toString(); } catch { link = ""; }
    const d = text(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date"));
    const t = Date.parse(d);
    let image = imageOf(b); try { image = image ? new URL(image, link || base).toString() : ""; } catch { image = ""; }
    if (!/^https:/.test(image)) image = "";
    return { title: text(tag(b, "title")).slice(0, 200), link, date: isFinite(t) ? t : 0, image };
  }).filter(i => i.title && /^https?:/.test(i.link));
  return { title: title || "", site: site || base, items };
}
