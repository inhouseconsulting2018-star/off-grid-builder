import { pgTable, text, serial, timestamp, integer, boolean, uniqueIndex } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

import { projectsTable } from "./projects";

// ─── Promo / trial codes ──────────────────────────────────────────────────────
// A promo code grants a project the same entitlement a Stripe purchase would,
// so the existing report.pdf gate, paid results view, and email delivery all
// work unchanged once a code is redeemed.
export const promoCodesTable = pgTable("promo_codes", {
  id: serial("id").primaryKey(),
  // Stored normalized to UPPERCASE; unique index enforces no duplicates.
  code: text("code").notNull(),
  description: text("description").notNull().default(""),
  // Entitlement granted on redemption (mirrors projects.entitlementType / selectedPlan)
  entitlementType: text("entitlement_type").notNull().default("promo_trial"),
  grantedPlan: text("granted_plan").notNull().default("homeowner_report"),
  // null = unlimited total redemptions across all users
  maxRedemptions: integer("max_redemptions"),
  redemptionCount: integer("redemption_count").notNull().default(0),
  // null = never expires
  expiresAt: timestamp("expires_at", { withTimezone: true }),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
}, (table) => [
  uniqueIndex("promo_codes_code_unique").on(table.code),
]);

// One redemption row per successful unlock. Unique indexes provide race-proof
// abuse prevention: one redemption per (code, email) and one per (code, project).
export const promoRedemptionsTable = pgTable("promo_redemptions", {
  id: serial("id").primaryKey(),
  promoCodeId: integer("promo_code_id").notNull().references(() => promoCodesTable.id),
  projectId: integer("project_id").notNull().references(() => projectsTable.id),
  // Stored normalized to lowercase.
  email: text("email").notNull(),
  ipHash: text("ip_hash"),
  redeemedAt: timestamp("redeemed_at", { withTimezone: true }).notNull().defaultNow(),
}, (table) => [
  uniqueIndex("promo_redemptions_code_email_unique").on(table.promoCodeId, table.email),
  uniqueIndex("promo_redemptions_code_project_unique").on(table.promoCodeId, table.projectId),
]);

export const insertPromoCodeSchema = createInsertSchema(promoCodesTable).omit({
  id: true,
  redemptionCount: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertPromoCode = z.infer<typeof insertPromoCodeSchema>;
export type PromoCode = typeof promoCodesTable.$inferSelect;

export const insertPromoRedemptionSchema = createInsertSchema(promoRedemptionsTable).omit({
  id: true,
  redeemedAt: true,
});
export type InsertPromoRedemption = z.infer<typeof insertPromoRedemptionSchema>;
export type PromoRedemption = typeof promoRedemptionsTable.$inferSelect;
