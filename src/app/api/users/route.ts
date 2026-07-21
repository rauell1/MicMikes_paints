import { NextRequest, NextResponse } from "next/server";
import { db } from "@/server/db/client";
import { sql } from "drizzle-orm";
import crypto from "crypto";
import { cookies, headers } from "next/headers";
import { auth } from "@/server/auth/session";

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

async function isAuthorized(req: NextRequest, action: "read" | "write" | "delete"): Promise<boolean> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE)?.value;

  // 1. Fallback legacy token check
  if (verifyAdminToken(token, process.env.ADMIN_JWT_SECRET || "default_secret")) {
    return true;
  }

  // 2. Better Auth session check
  try {
    const session = await auth.api.getSession({
      headers: await headers()
    });

    if (!session?.user) {
      return false;
    }

    const email = session.user.email;

    // 3. Look up in iam.staff_users
    const staffQuery = await db.execute(sql`
      SELECT id, status, is_super_admin
      FROM iam.staff_users
      WHERE LOWER(email) = LOWER(${email}) AND status = 'active'
      LIMIT 1
    `);

    if (staffQuery.rows.length === 0) {
      return false;
    }

    const staffUser = staffQuery.rows[0] as any;

    // 4. If super admin, allow
    if (staffUser.is_super_admin) {
      return true;
    }

    // 5. Check if staff has 'staff' resource permissions
    const rbacQuery = await db.execute(sql`
      SELECT 1
      FROM iam.staff_role_assignments sra
      JOIN iam.role_permissions rp ON rp.role_id = sra.role_id
      JOIN iam.permissions p ON p.id = rp.permission_id
      WHERE sra.staff_user_id = ${staffUser.id}
        AND sra.revoked_at IS NULL
        AND p.resource = 'staff'
        AND p.action = ${action}
      LIMIT 1
    `);

    return rbacQuery.rows.length > 0;
  } catch (err) {
    console.error("[api/users] Auth/RBAC check failed:", err);
    return false;
  }
}

export async function GET(req: NextRequest) {
  if (!(await isAuthorized(req, "read"))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = req.nextUrl;
  const resource = searchParams.get("_r");

  try {
    if (resource === "list") {
      const rows = (await db.execute(sql`
        SELECT su.id, su.full_name AS name, su.email, su.phone_e164 AS phone, 
               COALESCE(r.code, CASE WHEN su.is_super_admin = true THEN 'admin' ELSE 'staff' END) AS role,
               su.created_at
        FROM iam.staff_users su
        LEFT JOIN iam.staff_role_assignments sra ON sra.staff_user_id = su.id AND sra.revoked_at IS NULL
        LEFT JOIN iam.roles r ON r.id = sra.role_id
        WHERE su.status != 'disabled'
        ORDER BY su.created_at DESC
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
  if (!(await isAuthorized(req, "write"))) {
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

      const insertResult = (await db.execute(sql`
        INSERT INTO iam.staff_users (full_name, email, phone_e164, is_super_admin, status)
        VALUES (${name}, ${email}, ${phone || null}, ${isSuper}, 'active')
        ON CONFLICT (email) DO UPDATE SET 
          full_name = EXCLUDED.full_name,
          phone_e164 = EXCLUDED.phone_e164,
          is_super_admin = EXCLUDED.is_super_admin,
          status = 'active'
        RETURNING id
      `)).rows;

      const insertedUserId = insertResult[0]?.id;

      if (insertedUserId) {
        // Revoke previous assignments
        await db.execute(sql`
          UPDATE iam.staff_role_assignments
          SET revoked_at = now()
          WHERE staff_user_id = ${insertedUserId} AND revoked_at IS NULL
        `);

        // Add new role assignment
        const roleRows = (await db.execute(sql`
          SELECT id FROM iam.roles WHERE code = ${role} LIMIT 1
        `)).rows;
        const roleId = roleRows.length > 0 ? roleRows[0].id : null;
        if (roleId) {
          await db.execute(sql`
            INSERT INTO iam.staff_role_assignments (staff_user_id, role_id)
            VALUES (${insertedUserId}, ${roleId})
          `);
        }
      }

      return NextResponse.json({ ok: true }, { status: 201 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[api/users] POST failed:", err);
    return NextResponse.json({ error: "Database operation failed" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  if (!(await isAuthorized(req, "write"))) {
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

      // Revoke previous assignments
      await db.execute(sql`
        UPDATE iam.staff_role_assignments
        SET revoked_at = now()
        WHERE staff_user_id = ${id} AND revoked_at IS NULL
      `);

      // Add new role assignment
      const roleRows = (await db.execute(sql`
        SELECT id FROM iam.roles WHERE code = ${role} LIMIT 1
      `)).rows;
      const roleId = roleRows.length > 0 ? roleRows[0].id : null;
      if (roleId) {
        await db.execute(sql`
          INSERT INTO iam.staff_role_assignments (staff_user_id, role_id)
          VALUES (${id}, ${roleId})
        `);
      }

      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[api/users] PATCH failed:", err);
    return NextResponse.json({ error: "Database operation failed" }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  if (!(await isAuthorized(req, "delete"))) {
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

      // Revoke assignments
      await db.execute(sql`
        UPDATE iam.staff_role_assignments
        SET revoked_at = now()
        WHERE staff_user_id = ${id} AND revoked_at IS NULL
      `);

      return new NextResponse(null, { status: 204 });
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    console.error("[api/users] DELETE failed:", err);
    return NextResponse.json({ error: "Database operation failed" }, { status: 500 });
  }
}
