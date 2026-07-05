import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

/* ─────────────────────────────────────────────────────────────────────────────
   /api/auth — staff/delivery-app session auth (separate from admin cookie auth).

   Routes (via ?_r=): login | logout | me

   Uses the sessions table (id, user_id, expires_at) and a session_token cookie.
   Driver: @neondatabase/serverless — sql`...` returns rows array directly.
───────────────────────────────────────────────────────────────────────────── */

let ensured = false;
async function ensureSchema(sql: ReturnType<typeof neon>) {
  if (ensured) return;
  await sql`
    CREATE TABLE IF NOT EXISTS sessions (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
    )`;
  ensured = true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const sql = neon(process.env.DATABASE_URL!);
  const resource = req.query._r as string | undefined;

  try {
    await ensureSchema(sql);

    /* ── LOGIN ────────────────────────────────────────────────────────── */
    if (resource === "login") {
      if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
      const { phone, password } = req.body ?? {};
      if (!phone || !password) {
        return res.status(400).json({ ok: false, error: "phone and password required" });
      }
      const rows = await sql`
        SELECT id, name, phone, role, password_hash
        FROM users
        WHERE phone = ${phone} AND deleted_at IS NULL
        LIMIT 1`;
      if (!rows.length) return res.status(401).json({ ok: false, error: "Invalid credentials" });

      const user = rows[0];
      const match = await bcrypt.compare(password, user.password_hash ?? "");
      if (!match) return res.status(401).json({ ok: false, error: "Invalid credentials" });

      const [session] = await sql`
        INSERT INTO sessions (user_id) VALUES (${user.id}) RETURNING id`;
      res.setHeader(
        "Set-Cookie",
        `session_token=${session.id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
      );
      return res.json({
        ok: true,
        user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
      });
    }

    /* ── LOGOUT ───────────────────────────────────────────────────────── */
    if (resource === "logout") {
      const token = req.cookies?.session_token;
      if (token) {
        try { await sql`DELETE FROM sessions WHERE id = ${token}`; } catch { /* ignore */ }
      }
      res.setHeader("Set-Cookie", "session_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0");
      return res.status(200).json({ ok: true });
    }

    /* ── ME ───────────────────────────────────────────────────────────── */
    if (resource === "me") {
      const token = req.cookies?.session_token;
      if (!token) return res.status(401).json({ error: "No session" });
      const rows = await sql`
        SELECT u.id, u.name, u.phone, u.role
        FROM sessions s JOIN users u ON u.id = s.user_id
        WHERE s.id = ${token} AND s.expires_at > NOW() AND u.deleted_at IS NULL
        LIMIT 1`;
      if (!rows.length) return res.status(401).json({ error: "Session expired" });
      return res.json({ user: rows[0] });
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    console.error("[api/auth]", err);
    return res.status(500).json({ error: "Server error" });
  }
}
