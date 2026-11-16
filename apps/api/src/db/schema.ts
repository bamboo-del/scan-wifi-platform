import type { AdminRole, WifiSecurityType } from "@scan-wifi/shared-types";
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const adminStatusEnum = pgEnum("admin_status", ["active", "disabled"]);
export const storeStatusEnum = pgEnum("store_status", ["active", "disabled"]);
export const wifiStatusEnum = pgEnum("wifi_status", ["active", "disabled"]);
export const qrCodeStatusEnum = pgEnum("qr_code_status", ["active", "disabled"]);
export const connectionEventTypeEnum = pgEnum("connection_event_type", [
  "page_view",
  "ad_load_success",
  "ad_load_failure",
  "connect_click",
  "connect_success",
  "connect_failure",
]);
export const clientPlatformEnum = pgEnum("client_platform", [
  "ios",
  "android",
  "devtools",
  "unknown",
]);

export const admins = pgTable(
  "admins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    username: text("username").notNull(),
    passwordHash: text("password_hash").notNull(),
    role: text("role").$type<AdminRole>().notNull().default("admin"),
    status: adminStatusEnum("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("admins_username_lower_uidx").on(sql`lower(${table.username})`),
    index("admins_status_idx").on(table.status),
    check("admins_role_check", sql`${table.role} in ('admin', 'operator')`),
  ],
);

export const adminSessions = pgTable(
  "admin_sessions",
  {
    tokenHash: text("token_hash").primaryKey(),
    adminId: uuid("admin_id")
      .notNull()
      .references(() => admins.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("admin_sessions_admin_id_idx").on(table.adminId),
    index("admin_sessions_expires_at_idx").on(table.expiresAt),
  ],
);

export const stores = pgTable(
  "stores",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdById: uuid("created_by_id").references(() => admins.id),
    ownerId: uuid("owner_id").references(() => admins.id),
    name: text("name").notNull(),
    shortName: text("short_name"),
    logoUrl: text("logo_url"),
    address: text("address"),
    contactName: text("contact_name"),
    contactPhone: text("contact_phone"),
    status: storeStatusEnum("status").notNull().default("active"),
    adEnabled: boolean("ad_enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("stores_status_created_at_idx").on(table.status, table.createdAt.desc()),
    index("stores_created_at_idx").on(table.createdAt.desc()),
    index("stores_owner_id_idx").on(table.ownerId),
  ],
);

export const wifiConfigs = pgTable(
  "wifi_configs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    ssid: text("ssid").notNull(),
    encryptedPassword: text("encrypted_password").notNull(),
    passwordIv: text("password_iv").notNull(),
    passwordAuthTag: text("password_auth_tag").notNull(),
    bssid: text("bssid"),
    securityType: text("security_type").$type<WifiSecurityType>(),
    status: wifiStatusEnum("status").notNull().default("active"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("wifi_configs_store_id_uidx").on(table.storeId),
    index("wifi_configs_status_idx").on(table.status),
    check("wifi_configs_version_check", sql`${table.version} > 0`),
    check(
      "wifi_configs_security_type_check",
      sql`${table.securityType} in ('WPA', 'WPA2', 'WPA3', 'WPA2_WPA3', 'WEP', 'OPEN')`,
    ),
  ],
);

export const qrCodes = pgTable(
  "qr_codes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    sceneToken: text("scene_token").notNull(),
    imageUrl: text("image_url").notNull(),
    provider: text("provider").notNull(),
    status: qrCodeStatusEnum("status").notNull().default("active"),
    generatedAt: timestamp("generated_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
    disabledAt: timestamp("disabled_at", { withTimezone: true, mode: "date" }),
  },
  (table) => [
    uniqueIndex("qr_codes_scene_token_uidx").on(table.sceneToken),
    index("qr_codes_store_status_generated_idx").on(
      table.storeId,
      table.status,
      table.generatedAt.desc(),
    ),
    uniqueIndex("qr_codes_one_active_per_store_uidx")
      .on(table.storeId)
      .where(sql`${table.status} = 'active'`),
    check("qr_codes_scene_token_check", sql`${table.sceneToken} ~ '^[a-f0-9]{32}$'`),
    check("qr_codes_provider_check", sql`${table.provider} in ('wechat', 'local-placeholder')`),
  ],
);

export const connectionEvents = pgTable(
  "connection_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    storeId: uuid("store_id")
      .notNull()
      .references(() => stores.id, { onDelete: "cascade" }),
    qrCodeId: uuid("qr_code_id").references(() => qrCodes.id, { onDelete: "set null" }),
    eventType: connectionEventTypeEnum("event_type").notNull(),
    platform: clientPlatformEnum("platform").notNull().default("unknown"),
    errorCode: text("error_code"),
    errorMessageSanitized: text("error_message_sanitized"),
    occurredAt: timestamp("occurred_at", { withTimezone: true, mode: "date" })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("connection_events_store_occurred_idx").on(table.storeId, table.occurredAt.desc()),
    index("connection_events_type_occurred_idx").on(table.eventType, table.occurredAt.desc()),
    index("connection_events_qr_code_id_idx").on(table.qrCodeId),
    index("connection_events_occurred_at_idx").on(table.occurredAt.desc()),
    index("connection_events_failure_error_idx")
      .on(table.storeId, table.errorCode, table.occurredAt.desc())
      .where(sql`${table.eventType} = 'connect_failure'`),
    check(
      "connection_events_failure_error_check",
      sql`${table.eventType} = 'connect_failure' or (${table.errorCode} is null and ${table.errorMessageSanitized} is null)`,
    ),
  ],
);

export const operationLogs = pgTable(
  "operation_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    adminId: uuid("admin_id").references(() => admins.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    resourceType: text("resource_type").notNull(),
    resourceId: text("resource_id"),
    sanitizedMetadata: jsonb("sanitized_metadata")
      .$type<Record<string, unknown>>()
      .notNull()
      .default({}),
    createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
  },
  (table) => [
    index("operation_logs_admin_created_idx").on(table.adminId, table.createdAt.desc()),
    index("operation_logs_resource_created_idx").on(
      table.resourceType,
      table.resourceId,
      table.createdAt.desc(),
    ),
    index("operation_logs_action_created_idx").on(table.action, table.createdAt.desc()),
  ],
);

export const systemSettings = pgTable("system_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").$type<unknown>().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true, mode: "date" }).notNull().defaultNow(),
});

export type AdminRow = typeof admins.$inferSelect;
export type StoreRow = typeof stores.$inferSelect;
export type WifiConfigRow = typeof wifiConfigs.$inferSelect;
export type QrCodeRow = typeof qrCodes.$inferSelect;
