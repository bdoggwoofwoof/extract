// GET /api/status  →  what this deployment can do, so the app shows the right options.
import { send } from "../lib/http.js";
import { aiEnabled } from "../lib/claude.js";

export default function handler(req, res) {
  // The Supabase "anon" key is meant to be public; row security in supabase/schema.sql protects the data.
  const url = process.env.SUPABASE_URL || "", anonKey = process.env.SUPABASE_ANON_KEY || "";
  send(res, 200, { ok: true, ai: aiEnabled(), locked: Boolean(process.env.ACCESS_CODE), sync: url && anonKey ? { url, anonKey } : null });
}
