import { pgTable, serial, real, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const settingsTable = pgTable("settings", {
  id: serial("id").primaryKey(),
  panelWattage: real("panel_wattage").notNull().default(400),
  baseSystemLossPct: real("base_system_loss_pct").notNull().default(14),
  inverterLossPct: real("inverter_loss_pct").notNull().default(4),
  wireLossPct: real("wire_loss_pct").notNull().default(2),
  dirtLossPct: real("dirt_loss_pct").notNull().default(3),
  tempLossPct: real("temp_loss_pct").notNull().default(5),
  batteryRoundTripLossPct: real("battery_round_trip_loss_pct").notNull().default(10),
  batteryDod: real("battery_dod").notNull().default(80),
  defaultUtilityRate: real("default_utility_rate").notNull().default(0.35),
  economyDiyPerWatt: real("economy_diy_per_watt").notNull().default(1.25),
  economyInstalledPerWatt: real("economy_installed_per_watt").notNull().default(2.75),
  midRangeDiyPerWatt: real("mid_range_diy_per_watt").notNull().default(1.75),
  midRangeInstalledPerWatt: real("mid_range_installed_per_watt").notNull().default(3.25),
  premiumDiyPerWatt: real("premium_diy_per_watt").notNull().default(2.25),
  premiumInstalledPerWatt: real("premium_installed_per_watt").notNull().default(4.0),
  // Component-level cost estimates (used for line-item cost breakdown)
  inverterCostPerKw: real("inverter_cost_per_kw").notNull().default(300),
  mountingCostPerPanel: real("mounting_cost_per_panel").notNull().default(125),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertSettingsSchema = createInsertSchema(settingsTable).omit({
  id: true,
  updatedAt: true,
});
export type InsertSettings = z.infer<typeof insertSettingsSchema>;
export type Settings = typeof settingsTable.$inferSelect;
