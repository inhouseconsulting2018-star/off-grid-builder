import {
  boolean,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { projectsTable } from "./projects";

export const promoCodesTable = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  code: text("code").notNull(),
  purpose: text("purpose").notNull().default("Free professional solar report"),
  active: boolean("active").notNull().default(true),
  maxRedemptions: integer("max_redemptions"),
  maxRedemptionsPerEmail: integer("max_redemptions_per_email").notNull().default(1),
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("promo_codes_code_unique").on(table.code),
]);

export const promoRedemptionsTable = pgTable("promo_redemptions", {
  id: serial("id").primaryKey(),
  promoCodeId: integer("promo_code_id").notNull().references(() => promoCodesTable.id),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  email: text("email").notNull(),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("promo_redemptions_code_project_unique").on(table.promoCodeId, table.projectId),
]);

export type PromoCode = typeof promoCodesTable.$inferSelect;
export type PromoRedemption = typeof promoRedemptionsTable.$inferSelect;
