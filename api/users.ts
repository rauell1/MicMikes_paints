import type { VercelRequest, VercelResponse } from "@vercel/node";
import { neon } from "@neondatabase/serverless";
import bcrypt from "bcryptjs";

/* ─────────────────────────────────────────────────────────────────────────────
   /api/users — admin-protected RBAC user management (staff + customers).

   Routes (via ?_r=): list | create | update | delete

   NOTE ON AUTH: this repo uses HMAC-signed admin cookies (see api/admin.ts),
   NOT a shared ADMIN_PASSWORD cookie. Per the Vercel function-isolation rule,
   the verify logic is inlined here rather than imported from a shared lib.

   NOTE ON DRIVER: uses @neondatabase/serverless — sql`...` returns the rows
   array directly (no { rows } wrapper).
───────────────────────────────────────────────────────────────────────────── */

import crypto from "crypto";

const COOKIE = "mm-admin-token";

function verifyAdminToken(token: string | undefined): boolean {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const lastDot = decoded.lastIndexOf(".");
    const payload = decoded.slice(0, lastDot);
    const sig = decoded.slice(lastDot + 1);
    const expected = crypto
      .createHmac("sha256", process.env.ADMIN_JWT_SECRET!)
      .update(payload)
      .digest("hex");
    const sigBuf = Buffer.from(sig, "hex");
    const expBuf = Buffer.from(expected, "hex");
    if (sigBuf.length !== expBuf.length || sigBuf.length === 0) return false;
    if (!crypto.timingSafeEqual(sigBuf, expBuf)) return false;
    const ts = parseInt(payload, 10);
    return !isNaN(ts) && Date.now() - ts < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

// Ensure the columns this handler relies on exist. Runs once per warm instance.
let ensured = false;
async function ensureSchema(sql: ReturnType<typeof neon>) {
  if (ensured) return;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT`;
  await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ`;
  ensured = true;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!verifyAdminToken(req.cookies?.[COOKIE] as string | undefined)) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const sql = neon(process.env.DATABASE_URL!);
  const resource = req.query._r as string | undefined;

  try {
    await ensureSchema(sql);

    /* ── LIST ─────────────────────────────────────────────────────────── */
    if (resource === "list") {
      const { role } = req.query;
      const users = role
        ? await sql`
            SELECT id, name, email, phone, role, created_at
            FROM users
            WHERE deleted_at IS NULL AND role = ${role as string}
            ORDER BY created_at DESC`
        : await sql`
            SELECT id, name, email, phone, role, created_at
            FROM users
            WHERE deleted_at IS NULL
            ORDER BY created_at DESC`;
      return res.json({ users });
    }

    /* ── CREATE ───────────────────────────────────────────────────────── */
    if (resource === "create") {
      const { name, email, phone, role, password } = req.body ?? {};
      if (!name) return res.status(400).json({ error: "Name is required" });
      const password_hash = password ? await bcrypt.hash(password, 10) : null;
      await sql`
        INSERT INTO users (name, email, phone, role, password_hash)
        VALUES (${name}, ${email ?? null}, ${phone ?? null}, ${role ?? "customer"}, ${password_hash})`;
      return res.status(201).json({ ok: true });
    }

    /* ── UPDATE ───────────────────────────────────────────────────────── */
    if (resource === "update") {
      const { id, name, email, phone, role } = req.body ?? {};
      if (!id) return res.status(400).json({ error: "id is required" });
      await sql`
        UPDATE users
        SET name = ${name}, email = ${email ?? null}, phone = ${phone ?? null},
            role = ${role}, updated_at = NOW()
        WHERE id = ${id}`;
      return res.json({ ok: true });
    }

    /* ── DELETE (soft) ────────────────────────────────────────────────── */
    if (resource === "delete") {
      const { id } = req.query;
      if (!id) return res.status(400).json({ error: "id is required" });
      await sql`UPDATE users SET deleted_at = NOW() WHERE id = ${id as string}`;
      return res.status(204).end();
    }

    return res.status(400).json({ error: "Unknown action" });
  } catch (err) {
    console.error("[api/users]", err);
    return res.status(500).json({ error: "Server error" });
  }
}
