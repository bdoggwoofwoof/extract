/* Sync between devices through your own Supabase project (optional).
   The phone stays the source of truth while offline; changes are pushed and pulled when online.
   Sign-in uses a 6-digit code from email, which works inside an installed iPhone app
   (a sign-in link would open Safari instead, and Safari keeps separate storage). */

const K = { dirty: "rk-sync-dirty", tomb: "rk-sync-tomb", last: "rk-sync-last", time: "rk-sync-time", user: "rk-sync-user" };
const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

/* Which side wins for one row. Pure, so it can be tested on its own.
   local: the item on this device (or undefined); tomb: when this device deleted it (or 0). */
export function decide(row, local, tomb = 0) {
  const at = Number(row.updated_at) || 0;
  if (tomb && tomb >= at) return "skip"; // deleted here after that change
  if (row.deleted) return !local || (local.updatedAt || 0) <= at ? "delete" : "skip";
  return !local || (local.updatedAt || 0) < at ? "apply" : "skip";
}

let sb = null, cfg = null, hooks = null, session = null, channel = null;
let pushTimer = null, pullTimer = null, busy = null, lastError = "";
const listeners = new Set();
const emit = () => listeners.forEach(f => { try { f(info()); } catch {} });

export function info() {
  return { configured: !!cfg, signedIn: !!session, email: session?.user?.email || "", lastSync: read(K.time, 0), error: lastError, syncing: !!busy };
}
export const onChange = f => { listeners.add(f); return () => listeners.delete(f); };

function loadLib() {
  if (window.supabase && window.supabase.createClient) return Promise.resolve();
  return new Promise((res, rej) => { const s = document.createElement("script"); s.src = "/vendor/supabase.js"; s.onload = res; s.onerror = () => rej(new Error("lib")); document.head.appendChild(s); });
}

// hooks: { allItems(), applyRemote(item), applyRemoteDelete(id), afterPull() }
export async function init(config, h) {
  hooks = h;
  if (!config || !config.url || !config.anonKey) return false;
  cfg = config;
  try { await loadLib(); } catch { cfg = null; lastError = "Sync couldn't load. Check your connection."; emit(); return false; }
  sb = window.supabase.createClient(cfg.url, cfg.anonKey, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "extract-auth" } });
  const { data } = await sb.auth.getSession();
  session = data.session;
  sb.auth.onAuthStateChange((ev, s) => {
    const was = session; session = s;
    if (s && (!was || was.user.id !== s.user.id)) startFor(s.user.id);
    if (!s) stopLive();
    emit();
  });
  if (session) startFor(session.user.id, true);
  window.addEventListener("online", () => schedulePush(500));
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && session) syncNow(); });
  emit();
  return true;
}

function startFor(uid, quiet) {
  // A new account on this device: send everything here up, then pull theirs down.
  if (read(K.user, "") !== uid) {
    write(K.user, uid); write(K.last, ""); write(K.tomb, {});
    write(K.dirty, hooks.allItems().map(i => i.id));
  }
  startLive(uid);
  syncNow(quiet);
}

function startLive(uid) {
  stopLive();
  try {
    channel = sb.channel("items-" + uid)
      .on("postgres_changes", { event: "*", schema: "public", table: "items", filter: `user_id=eq.${uid}` }, () => schedulePull(400))
      .subscribe();
  } catch {}
}
function stopLive() { if (channel) { try { sb.removeChannel(channel); } catch {} channel = null; } }

export function markDirty(id) {
  const d = new Set(read(K.dirty, [])); d.add(id); write(K.dirty, [...d]);
  const t = read(K.tomb, {}); if (t[id]) { delete t[id]; write(K.tomb, t); }
  schedulePush();
}
export function markDeleted(id) {
  const t = read(K.tomb, {}); t[id] = Date.now(); write(K.tomb, t);
  const d = new Set(read(K.dirty, [])); d.add(id); write(K.dirty, [...d]);
  schedulePush();
}
function schedulePush(ms = 1500) { if (!session) return; clearTimeout(pushTimer); pushTimer = setTimeout(() => syncNow(true), ms); }
function schedulePull(ms) { clearTimeout(pullTimer); pullTimer = setTimeout(() => syncNow(true), ms); }

async function pull() {
  let last = read(K.last, ""), changed = 0;
  for (let page = 0; page < 50; page++) {
    let q = sb.from("items").select("id,kind,data,updated_at,deleted,server_at").order("server_at", { ascending: true }).limit(500);
    if (last) q = q.gt("server_at", last);
    const { data, error } = await q;
    if (error) throw error;
    const tombs = read(K.tomb, {});
    const dirty = new Set(read(K.dirty, []));
    for (const row of data) {
      const local = hooks.get(row.id);
      const act = decide(row, local, tombs[row.id] || 0);
      if (act === "apply") { await hooks.applyRemote({ ...row.data, id: row.id, kind: row.kind, updatedAt: Number(row.updated_at) }); changed++; dirty.delete(row.id); }
      else if (act === "delete") { await hooks.applyRemoteDelete(row.id); changed++; dirty.delete(row.id); }
      last = row.server_at;
    }
    write(K.last, last); write(K.dirty, [...dirty]);
    if (data.length < 500) break;
  }
  return changed;
}

async function push() {
  const ids = read(K.dirty, []); if (!ids.length) return 0;
  const tombs = read(K.tomb, {});
  const rows = ids.map(id => {
    const it = hooks.get(id);
    if (it) { const { id: _i, kind, ...data } = it; return { id, kind, data, updated_at: it.updatedAt || Date.now(), deleted: false }; }
    return { id, kind: "deleted", data: {}, updated_at: tombs[id] || Date.now(), deleted: true };
  });
  for (let i = 0; i < rows.length; i += 200) {
    const { error } = await sb.rpc("push_items", { rows: rows.slice(i, i + 200) });
    if (error) throw error;
  }
  const left = read(K.dirty, []).filter(id => !ids.includes(id)); // changes made while pushing stay queued
  write(K.dirty, left);
  return rows.length;
}

export function syncNow(quiet) {
  if (!sb || !session) return Promise.resolve();
  if (busy) return busy;
  busy = (async () => {
    emit();
    try {
      const pulled = await pull();
      await push();
      write(K.time, Date.now()); lastError = "";
      if (pulled) hooks.afterPull();
    } catch (e) {
      lastError = navigator.onLine === false ? "You're offline. Changes will sync when you're back online." : "Couldn't sync just now. It will try again.";
      if (!quiet) console.warn("sync", e);
    } finally { busy = null; emit(); }
  })();
  return busy;
}

export async function sendCode(email) {
  const { error } = await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: true } });
  if (error) throw error;
}
export async function verifyCode(email, code) {
  const { error } = await sb.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) throw error;
}
export async function signOut() {
  stopLive();
  try { await sb.auth.signOut(); } catch {}
  session = null; write(K.last, ""); write(K.dirty, []); write(K.tomb, {}); write(K.user, "");
  emit();
}

// Short share links (needs sign-in to create; anyone can open).
const randomId = () => { const a = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"; const b = crypto.getRandomValues(new Uint8Array(12)); return [...b].map(x => a[x % a.length]).join(""); };
export async function createShare(payload) {
  if (!sb || !session) return null;
  const id = randomId();
  const { error } = await sb.from("shares").insert({ id, owner: session.user.id, payload });
  if (error) throw error;
  return id;
}
export async function getShare(id) {
  if (!sb) return null;
  const { data, error } = await sb.rpc("get_share", { share_id: id });
  if (error) throw error;
  return data;
}
