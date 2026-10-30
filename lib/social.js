// Instagram, TikTok and YouTube: read the caption or description of a post, where creators
// usually write the recipe (or link to it). Nothing here watches the video itself.
import { fetchPage, parsePublicUrl, FetchError } from "./net.js";
import { clean, decodeEntities } from "./recipe.js";

const BROWSER_UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

export function platformOf(raw) {
  let u; try { u = parsePublicUrl(raw); } catch { return null; }
  const h = u.hostname.replace(/^(www|m|mobile)\./, "");
  if (h === "instagram.com" || h === "instagr.am") return "instagram";
  if (h === "tiktok.com" || h.endsWith(".tiktok.com")) return "tiktok";
  if (h === "youtube.com" || h === "youtu.be" || h === "music.youtube.com" || h === "youtube-nocookie.com") return "youtube";
  return null;
}
export const PLATFORM_NAME = { instagram: "Instagram", tiktok: "TikTok", youtube: "YouTube" };

export function youtubeId(raw) {
  try {
    const u = new URL(raw);
    if (u.hostname.endsWith("youtu.be")) return u.pathname.slice(1).split("/")[0] || null;
    if (u.searchParams.get("v")) return u.searchParams.get("v");
    const m = u.pathname.match(/^\/(?:shorts|embed|live|v)\/([\w-]{6,})/);
    return m ? m[1] : null;
  } catch { return null; }
}
export function instagramCode(raw) {
  try { const m = new URL(raw).pathname.match(/\/(?:p|reel|reels|tv)\/([\w-]{5,})/); return m ? m[1] : null; } catch { return null; }
}

// A JSON string body out of a page script: "shortDescription":"..."
function jsonString(html, key) {
  const m = html.match(new RegExp(`"${key}":"((?:[^"\\\\]|\\\\.)*)"`));
  if (!m) return "";
  try { return JSON.parse(`"${m[1]}"`); } catch { return ""; }
}
const meta = (html, prop) => { const m = html.match(new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]*content=["']([^"']*)["']`, "i")) || html.match(new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${prop}["']`, "i")); return m ? decodeEntities(m[1]) : ""; };

async function youtube(url) {
  const id = youtubeId(url);
  if (!id) throw new FetchError("bad_url", "That YouTube link doesn't point to a video.");
  const page = await fetchPage(`https://www.youtube.com/watch?v=${encodeURIComponent(id)}&hl=en`, { headers: { cookie: "CONSENT=YES+cb; SOCS=CAI" } });
  const caption = jsonString(page.html, "shortDescription") || meta(page.html, "og:description");
  const title = jsonString(page.html, "title") || meta(page.html, "og:title");
  const author = jsonString(page.html, "author");
  return { platform: "youtube", caption, title, author, image: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`, url: `https://www.youtube.com/watch?v=${id}` };
}

async function tiktok(url) {
  const tried = [];
  // 1. TikTok's public oEmbed endpoint returns the caption as "title".
  try {
    const res = await fetch("https://www.tiktok.com/oembed?url=" + encodeURIComponent(url), { signal: AbortSignal.timeout(10000), headers: { "user-agent": BROWSER_UA, accept: "application/json" } });
    tried.push("oembed " + res.status);
    if (res.ok) {
      const j = await res.json().catch(() => ({}));
      if (j.title) return { platform: "tiktok", caption: j.title, title: "", author: j.author_name || "", image: j.thumbnail_url || "", url };
    }
  } catch (e) { tried.push("oembed " + (e.name || "error")); }
  // 2. The video page: its description sits in the page data and the share description.
  try {
    const page = await fetchPage(url);
    const caption = jsonString(page.html, "desc") || meta(page.html, "og:description") || meta(page.html, "description");
    tried.push("page " + (caption ? "ok" : "empty"));
    if (caption) return { platform: "tiktok", caption, title: "", author: jsonString(page.html, "uniqueId"), image: meta(page.html, "og:image"), url: page.finalUrl || url };
  } catch (e) { tried.push("page " + (e.code || e.name || "error")); }
  const err = new FetchError("site_blocked", "TikTok didn't share that video's caption. Open the video, copy its caption, and use Paste text.", 502);
  err.detail = tried.join(", ");
  throw err;
}

// Instagram's embed page carries the caption without a login.
export function instagramCaptionFromEmbed(html) {
  const start = html.search(/class="Caption"/);
  if (start < 0) return "";
  let chunk = html.slice(start, start + 40000);
  const end = chunk.search(/class="CaptionComments"|<div class="CaptionComments|class="SocialProof"/);
  if (end > 0) chunk = chunk.slice(0, end);
  chunk = chunk.replace(/^[^>]*>/, "").replace(/<a[^>]+class="CaptionUsername"[^>]*>[\s\S]*?<\/a>/i, "");
  return decodeEntities(chunk.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "")).replace(/[ \t]+/g, " ").replace(/\n /g, "\n").trim();
}
async function instagram(url) {
  const code = instagramCode(url);
  if (!code) throw new FetchError("bad_url", "That Instagram link doesn't point to a post or reel.");
  let caption = "", image = "", author = "";
  try {
    const page = await fetchPage(`https://www.instagram.com/p/${code}/embed/captioned/`);
    caption = instagramCaptionFromEmbed(page.html);
    const im = page.html.match(/class="EmbeddedMediaImage"[^>]*src="([^"]+)"/) || page.html.match(/<img[^>]+src="(https:\/\/[^"]+cdninstagram[^"]+)"/);
    image = im ? decodeEntities(im[1]) : "";
    const au = page.html.match(/class="UsernameText"[^>]*>([^<]+)</); author = au ? clean(au[1]) : "";
  } catch {}
  if (!caption) {
    // Fallback: the post page's description, which holds the start of the caption.
    try {
      const page = await fetchPage(`https://www.instagram.com/p/${code}/`, { headers: { "user-agent": "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)" } });
      const d = meta(page.html, "og:description") || meta(page.html, "description");
      const m = d.match(/:\s*["“]([\s\S]+)["”]\s*\.?\s*$/);
      caption = m ? m[1] : "";
      image = image || meta(page.html, "og:image");
    } catch {}
  }
  if (!caption) throw new FetchError("site_blocked", "Instagram didn't share this post's caption. Open the post, copy the caption, and use Paste text.", 502);
  return { platform: "instagram", caption, title: "", author, image, url: `https://www.instagram.com/p/${code}/` };
}

export async function fetchSocial(url) {
  const p = platformOf(url);
  if (p === "youtube") return youtube(url);
  if (p === "tiktok") return tiktok(url);
  if (p === "instagram") return instagram(url);
  return null;
}

// A recipe page the caption points to ("Full recipe: https://…"), skipping shops and link-in-bio services.
const NOT_RECIPE = /(instagram|tiktok|youtube|youtu\.be|facebook|fb\.me|twitter|x\.com|pinterest|amzn|amazon|ltk|liketoknow|linktr\.ee|beacons\.ai|stan\.store|patreon|spotify|apple\.com|bit\.ly\/?$|shopmy|walmart|target\.com|etsy|threads\.net|snapchat|discord|onlyfans|gofundme|paypal|venmo)/i;
export function recipeLinksIn(caption) {
  const urls = (String(caption || "").match(/https?:\/\/[^\s<>"')\]]+/gi) || []).map(u => u.replace(/[.,;!?]+$/, ""));
  return [...new Set(urls)].filter(u => { try { return !NOT_RECIPE.test(new URL(u).hostname); } catch { return false; } }).slice(0, 3);
}
