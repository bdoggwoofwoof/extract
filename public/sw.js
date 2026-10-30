// Keeps the app working offline: the app itself is cached; recipe fetching needs a connection.
const CACHE = "extract-v17";
const IMG_CACHE = "extract-photos";
async function trimImages(c) { const keys = await c.keys(); for (const k of keys.slice(0, Math.max(0, keys.length - 300))) await c.delete(k); }
const SHELL = ["/", "/index.html", "/app.js", "/tour.js", "/cook.js", "/units.js", "/grocery.js", "/textparse.js", "/sync.js", "/vendor/supabase.js", "/styles.css", "/manifest.webmanifest", "/icons/icon-192.png", "/icons/icon-512.png", "/icons/apple-touch-icon.png", "/icons/apple-touch-icon-light.png", "/manifest-light.webmanifest"];

self.addEventListener("install", e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE && k !== IMG_CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin === location.origin && url.pathname.startsWith("/api/")) return; // always live
  if (req.mode === "navigate") {
    // Fresh page when online, cached app when offline (keeps ?url= and #r= intact).
    e.respondWith(fetch(req).then(res => { const copy = res.clone(); caches.open(CACHE).then(c => c.put("/index.html", copy)); return res; })
      .catch(() => caches.match("/index.html")));
    return;
  }
  const isFont = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (req.destination === "image" && url.origin !== location.origin) {
    // Recipe photos from other sites: keep a copy so they show offline.
    e.respondWith(caches.open(IMG_CACHE).then(async c => {
      const hit = await c.match(req); if (hit) return hit;
      try { const res = await fetch(req); if (res && (res.ok || res.type === "opaque")) { c.put(req, res.clone()); trimImages(c); } return res; } catch { return hit || Response.error(); }
    }));
    return;
  }
  if (url.origin !== location.origin && !isFont) return;
  // App files: serve from cache, refresh in the background.
  e.respondWith(caches.match(req).then(hit => {
    const net = fetch(req).then(res => { if (res && (res.ok || res.type === "opaque")) { const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy)); } return res; }).catch(() => hit);
    return hit || net;
  }));
});
