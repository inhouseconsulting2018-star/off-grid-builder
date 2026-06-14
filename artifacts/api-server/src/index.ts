import { runMigrations } from "stripe-replit-sync";
import app from "./app";
import { env, requireEnv } from "./config/env";
import { logger } from "./utils/logger";
import { db, promoCodesTable, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

/**
 * Attempt to create the stripe.* schema tables via stripe-replit-sync.
 * Non-blocking — if this fails (e.g. integration not connected yet), the server
 * still starts and the checkout route still works via getUncachableStripeClient().
 */
async function initStripeSchema() {
  const databaseUrl = env.databaseUrl;
  if (!databaseUrl) return;

  try {
    await runMigrations({ databaseUrl });
    logger.info("Stripe schema ready");
  } catch (error: unknown) {
    logger.warn({ err: error }, "Stripe schema migration skipped");
  }
}

/**
 * Ensure the settings table has exactly one row with default values.
 * Idempotent — skips insertion if a row already exists.
 */
async function seedSettings() {
  try {
    const [existing] = await db.select().from(settingsTable).limit(1);
    if (!existing) {
      await db.insert(settingsTable).values({});
      logger.info("Settings row seeded with defaults");
    } else if (existing.panelWattage === 400) {
      await db
        .update(settingsTable)
        .set({ panelWattage: 440 });
      logger.info("Legacy default panel wattage updated from 400W to 440W");
    }
  } catch (error: unknown) {
    logger.warn({ err: error }, "Settings seed skipped");
  }
}

async function seedDefaultPromoCode() {
  try {
    const code = "SOLARTRIAL";
    const [existing] = await db
      .select({ id: promoCodesTable.id })
      .from(promoCodesTable)
      .where(eq(promoCodesTable.code, code))
      .limit(1);
    if (existing) return;

    const configuredExpiration = env.solarTrialExpiresAt
      ? new Date(env.solarTrialExpiresAt)
      : new Date("2026-12-31T23:59:59-08:00");
    if (Number.isNaN(configuredExpiration.getTime())) {
      throw new Error("SOLARTRIAL_EXPIRES_AT must be a valid ISO date");
    }

    await db.insert(promoCodesTable).values({
      code,
      purpose: "Allows one free professional report per user email",
      active: true,
      maxRedemptions: null,
      maxRedemptionsPerEmail: 1,
      expiresAt: configuredExpiration,
    });
    logger.info({ expiresAt: configuredExpiration }, "Default SOLARTRIAL promo code seeded");
  } catch (error: unknown) {
    logger.warn({ err: error }, "Default promo code seed skipped");
  }
}

// Fail fast on startup if critical env vars are absent.
// Better to crash immediately with a clear message than to boot and fail on the first request.
requireEnv("databaseUrl");

const rawPort = requireEnv("port");

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Run stripe schema migration fire-and-forget (non-blocking)
initStripeSchema().catch(() => {});

// Seed default settings row if the table is empty (non-blocking)
seedSettings().catch(() => {});
seedDefaultPromoCode().catch(() => {});

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
