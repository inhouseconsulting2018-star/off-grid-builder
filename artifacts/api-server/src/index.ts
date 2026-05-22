import { runMigrations } from "stripe-replit-sync";
import app from "./app";
import { env, requireEnv } from "./config/env";
import { logger } from "./utils/logger";

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

function warnOnMissingPaymentEnv() {
  const hasConnector = !!env.replitConnectorsHostname && (!!env.replitIdentity || !!env.webReplRenewal);
  const missing = [
    !env.stripeHomeownerReportPriceId ? "STRIPE_HOMEOWNER_REPORT_PRICE_ID or STRIPE_PRICE_ID" : null,
    !env.stripePropertyPackPriceId ? "STRIPE_PROPERTY_PACK_PRICE_ID" : null,
    !env.stripeContractorAnnualPriceId ? "STRIPE_CONTRACTOR_ANNUAL_PRICE_ID" : null,
    !env.stripeContractorLifetimePriceId ? "STRIPE_CONTRACTOR_LIFETIME_PRICE_ID" : null,
    !env.stripeWebhookSecret ? "STRIPE_WEBHOOK_SECRET" : null,
    !hasConnector && !process.env.STRIPE_SECRET_KEY ? "STRIPE_SECRET_KEY or Replit Stripe connector variables" : null,
  ].filter(Boolean);

  if (missing.length > 0) {
    logger.warn({ missing }, "Payment environment is incomplete; paid report unlocks are not production-ready");
  }
  if (!env.adminToken) {
    logger.warn("ADMIN_TOKEN is not configured; admin routes will be unavailable");
  }
}

const rawPort = requireEnv("port");

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

// Run stripe schema migration fire-and-forget (non-blocking)
initStripeSchema().catch(() => {});
warnOnMissingPaymentEnv();

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
