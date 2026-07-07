import { pgSchema, uuid, text, boolean, timestamp, jsonb, pgTable, primaryKey, bigserial, inet } from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const iamSchema = pgSchema("iam");

export const staffUsers = iamSchema.table("staff_users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  phoneE164: text("phone_e164"),
  fullName: text("full_name").notNull(),
  status: text("status", { enum: ["invited", "active", "suspended", "disabled"] }).notNull().default("active"),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow()
});

export const departments = iamSchema.table("departments", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull()
});

export const teams = iamSchema.table("teams", {
  id: uuid("id").primaryKey().defaultRandom(),
  departmentId: uuid("department_id").references(() => departments.id, { onDelete: "set null" }),
  code: text("code").notNull().unique(),
  name: text("name").notNull()
});

export const roles = iamSchema.table("roles", {
  id: uuid("id").primaryKey().defaultRandom(),
  code: text("code").notNull().unique(),
  name: text("name").notNull(),
  scopeType: text("scope_type", { enum: ["global", "department", "team", "vendor", "category"] }).notNull(),
  isSystem: boolean("is_system").notNull().default(false)
});

export const permissions = iamSchema.table("permissions", {
  id: uuid("id").primaryKey().defaultRandom(),
  resource: text("resource").notNull(),
  action: text("action").notNull()
}, (t) => [
  primaryKey({ columns: [t.resource, t.action] }) // wait, database definition: UNIQUE(resource, action), primary key is id. Let's model UNIQUE as unique index or keep it.
]);

export const rolePermissions = iamSchema.table("role_permissions", {
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  permissionId: uuid("permission_id").notNull().references(() => permissions.id, { onDelete: "cascade" })
}, (t) => [
  primaryKey({ columns: [t.roleId, t.permissionId] })
]);

export const staffRoleAssignments = iamSchema.table("staff_role_assignments", {
  id: uuid("id").primaryKey().defaultRandom(),
  staffUserId: uuid("staff_user_id").notNull().references(() => staffUsers.id, { onDelete: "cascade" }),
  roleId: uuid("role_id").notNull().references(() => roles.id, { onDelete: "cascade" }),
  teamId: uuid("team_id").references(() => teams.id, { onDelete: "cascade" }),
  vendorId: uuid("vendor_id"),
  categoryId: uuid("category_id"),
  grantedBy: uuid("granted_by").references(() => staffUsers.id),
  grantedAt: timestamp("granted_at", { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp("revoked_at", { withTimezone: true })
});

export const auditLogs = iamSchema.table("audit_logs", {
  id: bigserial("id", { mode: "bigint" }).primaryKey(),
  actorType: text("actor_type", { enum: ["staff", "vendor", "customer", "system"] }).notNull(),
  actorId: uuid("actor_id"),
  action: text("action").notNull(),
  entityType: text("entity_type").notNull(),
  entityId: uuid("entity_id"),
  metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
  ipAddress: text("ip_address"), // Using text for inet representation
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow()
});
