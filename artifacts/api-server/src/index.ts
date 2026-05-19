import { runMigrations } from "stripe-replit-sync";
import app from "./app";
import { env, requireEnv } from "./config/env";
import { logger } from "./utils/logger";
import { db, settingsTable } from "@workspace/db";

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
    }
  } catch (error: unknown) {
    logger.warn({ err: error }, "Settings seed skipped");
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

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
