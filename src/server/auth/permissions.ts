import { db } from "../db/client";
import { staffUsers, staffRoleAssignments, roles, rolePermissions, permissions } from "../db/schema/iam";
import { eq, and, isNull } from "drizzle-orm";

/**
 * Check if a staff user is a super admin.
 */
export async function isSuperAdmin(staffUserId: string): Promise<boolean> {
  try {
    const [user] = await db
      .select({ isSuperAdmin: staffUsers.isSuperAdmin })
      .from(staffUsers)
      .where(eq(staffUsers.id, staffUserId))
      .limit(1);
    
    return user?.isSuperAdmin ?? false;
  } catch (err) {
    console.error("[RBAC] isSuperAdmin check failed:", err);
    return false;
  }
}

/**
 * Check if a staff user has a specific role.
 */
export async function hasRole(staffUserId: string, roleCode: string): Promise<boolean> {
  try {
    // Super admin bypasses all role checks
    if (await isSuperAdmin(staffUserId)) return true;

    const assignments = await db
      .select({ roleCode: roles.code })
      .from(staffRoleAssignments)
      .innerJoin(roles, eq(roles.id, staffRoleAssignments.roleId))
      .where(
        and(
          eq(staffRoleAssignments.staffUserId, staffUserId),
          eq(roles.code, roleCode),
          isNull(staffRoleAssignments.revokedAt)
        )
      );

    return assignments.length > 0;
  } catch (err) {
    console.error("[RBAC] hasRole check failed:", err);
    return false;
  }
}

/**
 * Real-time RBAC check for a resource and action.
 * Bypasses checks for super admins.
 */
export async function checkPermission(
  staffUserId: string,
  resource: string,
  action: string
): Promise<boolean> {
  try {
    // 1. Super admin bypasses all checks
    if (await isSuperAdmin(staffUserId)) return true;

    // 2. Query active assignments with matching permissions
    const matches = await db
      .select({ permissionId: permissions.id })
      .from(staffRoleAssignments)
      .innerJoin(roles, eq(roles.id, staffRoleAssignments.roleId))
      .innerJoin(rolePermissions, eq(rolePermissions.roleId, roles.id))
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(
        and(
          eq(staffRoleAssignments.staffUserId, staffUserId),
          eq(permissions.resource, resource),
          eq(permissions.action, action),
          isNull(staffRoleAssignments.revokedAt)
        )
      )
      .limit(1);

    return matches.length > 0;
  } catch (err) {
    console.error("[RBAC] checkPermission check failed:", err);
    return false;
  }
}
