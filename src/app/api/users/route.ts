import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";
import crypto from "crypto";
import { cookies } from "next/headers";

const COOKIE = "mm-admin-token";

function verifyAdminToken(token: string | undefined, secret: string): boolean {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, "base64url").toString();
    const lastDot = decoded.lastIndexOf(".");
    if (lastDot === -1) return false;
    const payload = decoded.slice(0, lastDot);
    const sig = decoded.slice(lastDot + 1);
    const expected = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");
    const ts = parseInt(payload, 10);
    return sig === expected && Date.now() - ts < 24 * 60 * 60 * 1000;
  } catch {
    return false;
  }
}

async function isAuthorized(req: NextRequest): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;
  return verifyAdminToken(token, process.env.ADMIN_JWT_SECRET || "default_secret");
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const resource = searchParams.get("_r");

  try {
    if (resource === "list") {
      const rows = (await db.execute(sql`
        SELECT id, full_name AS name, email, phone_e164 AS phone, 
               CASE WHEN is_super_admin = true THEN 'admin' ELSE 'staff' END AS role,
               created_at
        FROM iam.staff_users
        WHERE status != 'disabled'
        ORDER BY created_at DESC
      `)).rows;

      return NextResponse.json({ users: rows });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[api/users] GET failed:", err);
    return NextResponse.json({ error: "Database operation failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const resource = searchParams.get("_r");

  try {
    const body = await req.json();

    if (resource === "create") {
      const { name, email, phone, role } = body ?? {};
      if (!name || !email) {
        return NextResponse.json({ error: "Name and Email are required" }, { status: 400 });
      }

      const isSuper = role === "admin";

      await db.execute(sql`
        INSERT INTO iam.staff_users (full_name, email, phone_e164, is_super_admin, status)
        VALUES (${name}, ${email}, ${phone || null}, ${isSuper}, 'active')
        ON CONFLICT (email) DO UPDATE SET 
          full_name = EXCLUDED.full_name,
          phone_e164 = EXCLUDED.phone_e164,
          is_super_admin = EXCLUDED.is_super_admin,
          status = 'active'
      `);

      return NextResponse.json({ ok: true }, { status: 201 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[api/users] POST failed:", err);
    return NextResponse.json({ error: "Database operation failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const resource = searchParams.get("_r");

  try {
    const body = await req.json();

    if (resource === "update") {
      const { id, name, email, phone, role } = body ?? {};
      if (!id || !name || !email) {
        return NextResponse.json({ error: "id, name and email are required" }, { status: 400 });
      }

      const isSuper = role === "admin";

      await db.execute(sql`
        UPDATE iam.staff_users
        SET full_name = ${name}, email = ${email}, phone_e164 = ${phone || null},
            is_super_admin = ${isSuper}, updated_at = now()
        WHERE id = ${id}
      `);

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[api/users] PATCH failed:", err);
    return NextResponse.json({ error: "Database operation failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const resource = searchParams.get("_r");
  const id = searchParams.get("id");

  try {
    if (resource === "delete") {
      if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
      
      // Soft delete by disabling status
      await db.execute(sql`
        UPDATE iam.staff_users SET status = 'disabled', updated_at = now() WHERE id = ${id}
      `);
      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[api/users] DELETE failed:", err);
    return NextResponse.json({ error: "Database operation failed" }, { status: 500 });
  }
}
