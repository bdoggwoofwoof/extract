// GET /api/status  →  what this deployment can do, so the app shows the right options.
import { send } from "../lib/http.js";
import { aiEnabled } from "../lib/claude.js";

export default function handler(req, res) {
  send(res, 200, { ok: true, ai: aiEnabled(), locked: Boolean(process.env.ACCESS_CODE) });
}
