import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';
import { env, requireEnv } from "../../config/env";
import { logger } from "../../utils/logger";

/**
 * Fetches Stripe credentials — tries the Replit connector first,
 * then falls back to STRIPE_SECRET_KEY / STRIPE_PUBLISHABLE_KEY env vars.
 */
async function getStripeCredentials(): Promise<{ secretKey: string; publishableKey?: string }> {
  // ── Fallback: direct env var keys (always checked, used when connector unavailable) ──
  const envSecretKey = process.env.STRIPE_SECRET_KEY;
  const envPublishableKey = process.env.STRIPE_PUBLISHABLE_KEY;

  const hostname = env.replitConnectorsHostname;
  const xReplitToken = env.replitIdentity
    ? "repl " + env.replitIdentity
    : env.webReplRenewal
      ? "depl " + env.webReplRenewal
      : null;

  // If connector infrastructure isn't present, fall back to direct keys immediately
  if (!hostname || !xReplitToken) {
    if (envSecretKey) {
      logger.info("Stripe: using STRIPE_SECRET_KEY env var (no connector context)");
      return { secretKey: envSecretKey, publishableKey: envPublishableKey };
    }
    throw new Error(
      'Stripe not configured. Set STRIPE_SECRET_KEY in environment secrets.'
    );
  }

  // ── Try the Replit connector ──
  try {
    const targetEnvironment = env.isReplitDeployment ? "production" : "development";

    const url = new URL(`https://${hostname}/api/v2/connection`);
    url.searchParams.set("include_secrets", "true");
    url.searchParams.set("connector_names", "stripe");
    url.searchParams.set("environment", targetEnvironment);

    const resp = await fetch(url.toString(), {
      headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
      signal: AbortSignal.timeout(8_000),
    });

    if (resp.ok) {
      const data = await resp.json() as {
        items?: Array<{ settings?: { publishable?: string; secret?: string } }>
      };
      const settings = data.items?.[0]?.settings;

      if (settings?.secret) {
        return { secretKey: settings.secret, publishableKey: settings.publishable };
      }
    }
  } catch (err) {
    logger.warn({ err }, "Stripe connector fetch failed — will try env var fallback");
  }

  // ── Connector returned nothing — fall back to env var ──
  if (envSecretKey) {
    logger.info("Stripe: connector returned no credentials, using STRIPE_SECRET_KEY env var");
    return { secretKey: envSecretKey, publishableKey: envPublishableKey };
  }

  throw new Error(
    'Stripe not configured. Connect Stripe via the Integrations tab or set STRIPE_SECRET_KEY in environment secrets.'
  );
}

/**
 * Returns a fresh authenticated Stripe client.
 */
export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey, { apiVersion: "2026-04-22.dahlia" });
}

/**
 * Returns the Stripe publishable key for frontend use.
 */
export async function getStripePublishableKey(): Promise<string | undefined> {
  const { publishableKey } = await getStripeCredentials();
  return publishableKey;
}

/**
 * Constructs and verifies a Stripe webhook event from a raw Buffer payload.
 */
export async function constructStripeEvent(payload: Buffer, signature: string): Promise<Stripe.Event> {
  const webhookSecret = env.stripeWebhookSecret;

  if (!webhookSecret) {
    if (env.isReplitDeployment) {
      throw new Error(
        "STRIPE_WEBHOOK_SECRET must be set in production."
      );
    }
    logger.warn("STRIPE_WEBHOOK_SECRET not set — skipping webhook signature verification (dev only).");
    return JSON.parse(payload.toString()) as Stripe.Event;
  }

  const stripe = await getUncachableStripeClient();
  return stripe.webhooks.constructEvent(
    payload,
    signature,
    webhookSecret,
  ) as Stripe.Event;
}

/**
 * Returns a fresh StripeSync instance for webhook processing.
 */
export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = requireEnv("databaseUrl");
  const { secretKey } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl, max: 2 },
    stripeSecretKey: secretKey,
  });
}
