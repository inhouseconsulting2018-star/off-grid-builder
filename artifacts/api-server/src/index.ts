import { runMigrations } from "stripe-replit-sync";
import { getStripeSync } from "./lib/stripeClient";
import app from "./app";
import { logger } from "./lib/logger";

/**
 * Initialize the Stripe schema and sync existing Stripe data on startup.
 * This is safe to run on every startup — runMigrations() is idempotent.
 */
async function initStripe() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is required for Stripe initialization");
  }

  try {
    logger.info("Initializing Stripe schema...");
    // 1. Create stripe.* tables (idempotent)
    await runMigrations({ databaseUrl });
    logger.info("Stripe schema ready");

    // 2. Get StripeSync instance (credentials from Replit integration)
    const stripeSync = await getStripeSync();

    // 3. Register a managed webhook so Stripe pushes events to this server
    const webhookBaseUrl = `https://${process.env.REPLIT_DOMAINS?.split(",")[0]}`;
    await stripeSync.findOrCreateManagedWebhook(`${webhookBaseUrl}/api/stripe/webhook`);
    logger.info("Stripe webhook configured");

    // 4. Sync all existing Stripe data (products, prices, customers, etc.)
    //    Run fire-and-forget so it doesn't block server startup
    stripeSync.syncBackfill()
      .then(() => logger.info("Stripe backfill complete"))
      .catch((err: unknown) => logger.error({ err }, "Stripe backfill error"));
  } catch (error: unknown) {
    // Log the error but don't crash the server — app still works without Stripe
    // until the integration is connected via the Integrations tab.
    logger.warn({ err: error }, "Stripe initialization skipped (integration not connected?)");
  }
}

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Initialize Stripe (non-blocking on failure)
await initStripe();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
