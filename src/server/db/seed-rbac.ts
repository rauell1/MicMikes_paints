import { db } from "./client";
import { sql } from "drizzle-orm";

export async function seedRbac() {
  console.log("[RBAC Seed] Starting RBAC database seeding...");
  try {
    // 1. Seed Permissions
    const perms = [
      { resource: "dashboard", action: "read" },
      { resource: "customers", action: "read" },
      { resource: "customers", action: "write" },
      { resource: "orders", action: "read" },
      { resource: "orders", action: "write" },
      { resource: "products", action: "read" },
      { resource: "products", action: "write" },
      { resource: "products", action: "delete" },
      { resource: "colours", action: "read" },
      { resource: "colours", action: "write" },
      { resource: "colours", action: "delete" },
      { resource: "rooms", action: "read" },
      { resource: "rooms", action: "write" },
      { resource: "rooms", action: "delete" },
      { resource: "delivery-rates", action: "read" },
      { resource: "delivery-rates", action: "write" },
      { resource: "delivery-rates", action: "delete" },
      { resource: "stock", action: "read" },
      { resource: "stock", action: "write" },
      { resource: "staff", action: "read" },
      { resource: "staff", action: "write" },
      { resource: "staff", action: "delete" }
    ];

    const permIds: Record<string, string> = {};

    for (const p of perms) {
      const query = await db.execute(sql`
        INSERT INTO iam.permissions (resource, action)
        VALUES (${p.resource}, ${p.action})
        ON CONFLICT (resource, action)
        DO UPDATE SET resource = EXCLUDED.resource
        RETURNING id
      `);
      if (query.rows.length > 0) {
        const id = query.rows[0].id as string;
        permIds[`${p.resource}:${p.action}`] = id;
      }
    }

    console.log(`[RBAC Seed] Seeded ${Object.keys(permIds).length} permissions.`);

    // 2. Seed Roles
    const roles = [
      { code: "admin", name: "Admin", scopeType: "global", isSystem: true },
      { code: "staff", name: "Staff", scopeType: "global", isSystem: true }
    ];

    const roleIds: Record<string, string> = {};

    for (const r of roles) {
      const query = await db.execute(sql`
        INSERT INTO iam.roles (code, name, scope_type, is_system)
        VALUES (${r.code}, ${r.name}, ${r.scopeType}, ${r.isSystem})
        ON CONFLICT (code)
        DO UPDATE SET name = EXCLUDED.name
        RETURNING id, code
      `);
      if (query.rows.length > 0) {
        const row = query.rows[0] as any;
        roleIds[row.code] = row.id;
      }
    }

    console.log("[RBAC Seed] Seeded roles:", Object.keys(roleIds));

    // 3. Link Permissions to Roles
    // Admin has ALL permissions
    if (roleIds.admin) {
      for (const key of Object.keys(permIds)) {
        const permId = permIds[key];
        await db.execute(sql`
          INSERT INTO iam.role_permissions (role_id, permission_id)
          VALUES (${roleIds.admin}, ${permId})
          ON CONFLICT (role_id, permission_id) DO NOTHING
        `);
      }
    }

    // Staff has READ-ONLY catalog, READ-ONLY dashboard, but can READ/WRITE orders & customers
    if (roleIds.staff) {
      const staffPerms = [
        "dashboard:read",
        "customers:read",
        "customers:write",
        "orders:read",
        "orders:write",
        "products:read",
        "colours:read",
        "rooms:read",
        "delivery-rates:read",
        "stock:read"
      ];

      for (const key of staffPerms) {
        const permId = permIds[key];
        if (permId) {
          await db.execute(sql`
            INSERT INTO iam.role_permissions (role_id, permission_id)
            VALUES (${roleIds.staff}, ${permId})
            ON CONFLICT (role_id, permission_id) DO NOTHING
          `);
        }
      }
    }

    console.log("[RBAC Seed] Role permissions linked successfully.");
  } catch (err) {
    console.error("[RBAC Seed] Failed to seed RBAC roles/permissions:", err);
  }
}
