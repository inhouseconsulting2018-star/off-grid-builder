import { pgTable, text, serial, timestamp, real, integer, boolean, jsonb } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const projectsTable = pgTable("projects", {
  id: serial("id").primaryKey(),
  name: text("name").notNull(),
  address: text("address").notNull().default(""),
  city: text("city").notNull().default(""),
  state: text("state").notNull().default(""),
  zip: text("zip").notNull().default(""),
  installationType: text("installation_type").notNull().default("roof"),
  systemType: text("system_type").notNull().default("grid-tied"),
  annualKwh: real("annual_kwh").notNull().default(0),
  monthlyBill: real("monthly_bill").notNull().default(0),
  utilityRatePerKwh: real("utility_rate_per_kwh").notNull().default(0.35),
  backupHours: real("backup_hours").notNull().default(0),
  customBackupHours: real("custom_backup_hours"),
  batteryChemistry: text("battery_chemistry").notNull().default("lifepo4"),
  hasGenerator: boolean("has_generator").notNull().default(false),
  generatorKw: real("generator_kw"),
  wantsGenerator: boolean("wants_generator").notNull().default(false),
  shadeLevel: text("shade_level").notNull().default("none"),
  roofPitch: text("roof_pitch").notNull().default(""),
  roofDirection: text("roof_direction").notNull().default(""),
  availableSqft: real("available_sqft").notNull().default(0),
  snowArea: boolean("snow_area").notNull().default(false),
  highWindArea: boolean("high_wind_area").notNull().default(false),
  budgetTier: text("budget_tier").notNull().default("mid-range"),
  customBudget: real("custom_budget"),
  arrayLat: real("array_lat"),
  arrayLon: real("array_lon"),
  arrayLocationNote: text("array_location_note"),
  // Saved geocode result for the main property location
  lat: real("lat"),
  lon: real("lon"),
  // 'exact' = street-level, 'zip' = ZIP centroid, 'city' = city centroid, 'manual' = user-entered
  locationAccuracy: text("location_accuracy"),
  useManualCoords: boolean("use_manual_coords").notNull().default(false),
  calculationResult: jsonb("calculation_result"),
  // Guest access token
  accessToken: text("access_token"),
  // Future auth
  ownerUserId: text("owner_user_id"),
  isGuestProject: boolean("is_guest_project").notNull().default(true),
  // Stripe payment fields
  paidAt: timestamp("paid_at", { withTimezone: true }),
  stripeSessionId: text("stripe_session_id"),
  stripePriceId: text("stripe_price_id"),
  paidAmount: integer("paid_amount"),       // in cents
  paymentStatus: text("payment_status").notNull().default("unpaid"),
  // Entitlement / credits
  entitlementType: text("entitlement_type"),
  reportCredits: integer("report_credits").notNull().default(0),
  creditsUsed: integer("credits_used").notNull().default(0),
  selectedPlan: text("selected_plan"),
  // Purchaser contact + delivery
  purchaserEmail: text("purchaser_email"),
  reportDeliveryStatus: text("report_delivery_status").notNull().default("not_sent"),
  reportDeliveredAt: timestamp("report_delivered_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertProjectSchema = createInsertSchema(projectsTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertProject = z.infer<typeof insertProjectSchema>;
export type Project = typeof projectsTable.$inferSelect;
