import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";
import bcrypt from "bcryptjs";

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const resource = searchParams.get("_r");

  try {
    /* ── ME ── */
    if (resource === "me") {
      const cookieHeader = req.headers.get("cookie") || "";
      const match = cookieHeader.match(/session_token=([^;]+)/);
      const token = match ? match[1] : null;

      if (!token) {
        return NextResponse.json({ error: "No session" }, { status: 401 });
      }

      const rows = (await db.execute(sql`
        SELECT u.id, u.name, u.phone, u.role
        FROM public.sessions s 
        JOIN public.users u ON u.id = s.user_id
        WHERE s.id = ${token} AND s.expires_at > NOW() AND u.deleted_at IS NULL
        LIMIT 1
      `)).rows;

      if (rows.length === 0) {
        return NextResponse.json({ error: "Session expired" }, { status: 401 });
      }

      return NextResponse.json({ user: rows[0] });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[api/auth-custom] GET failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const resource = searchParams.get("_r");

  try {
    /* ── LOGIN ── */
    if (resource === "login") {
      const { phone, password } = await req.json();
      if (!phone || !password) {
        return NextResponse.json({ ok: false, error: "phone and password required" }, { status: 400 });
      }

      // Ensure sessions table exists
      await db.execute(sql`
        CREATE TABLE IF NOT EXISTS public.sessions (
          id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id    UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
          created_at TIMESTAMPTZ DEFAULT NOW(),
          expires_at TIMESTAMPTZ DEFAULT NOW() + INTERVAL '7 days'
        )
      `);

      const rows = (await db.execute(sql`
        SELECT id, name, phone, role, password_hash
        FROM public.users
        WHERE phone = ${phone} AND deleted_at IS NULL
        LIMIT 1
      `)).rows;

      if (rows.length === 0) {
        return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
      }

      const user = rows[0] as any;
      const match = await bcrypt.compare(password, user.password_hash ?? "");
      if (!match) {
        return NextResponse.json({ ok: false, error: "Invalid credentials" }, { status: 401 });
      }

      const session = (await db.execute(sql`
        INSERT INTO public.sessions (user_id) VALUES (${user.id}) RETURNING id
      `)).rows[0] as any;

      const response = NextResponse.json({
        ok: true,
        user: { id: user.id, name: user.name, phone: user.phone, role: user.role },
      });

      response.headers.set(
        "Set-Cookie",
        `session_token=${session.id}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
      );

      return response;
    }

    /* ── LOGOUT ── */
    if (resource === "logout") {
      const cookieHeader = req.headers.get("cookie") || "";
      const match = cookieHeader.match(/session_token=([^;]+)/);
      const token = match ? match[1] : null;

      if (token) {
        await db.execute(sql`DELETE FROM public.sessions WHERE id = ${token}`).catch(() => {});
      }

      const response = NextResponse.json({ ok: true });
      response.headers.set(
        "Set-Cookie",
        "session_token=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0"
      );
      return response;
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[api/auth-custom] POST failed:", err);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
