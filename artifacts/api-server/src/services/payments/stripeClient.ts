import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';
import { env, requireEnv } from "../../config/env";
import { logger } from "../../utils/logger";

/**
 * Fetches Stripe credentials from the Replit connection API.
 * Not cached — tokens can rotate, so fetch fresh each time.
 */
async function getStripeCredentials(): Promise<{ secretKey: string; publishableKey?: string }> {
  const hostname = env.replitConnectorsHostname;
  const xReplitToken = env.replitIdentity
    ? "repl " + env.replitIdentity
    : env.webReplRenewal
      ? "depl " + env.webReplRenewal
      : null;

  if (!hostname || !xReplitToken) {
    throw new Error(
      'Missing Replit environment variables. ' +
      'Ensure the Stripe integration is connected via the Integrations tab.'
    );
  }

  const targetEnvironment = env.isReplitDeployment ? "production" : "development";

  const url = new URL(`https://${hostname}/api/v2/connection`);
  url.searchParams.set("include_secrets", "true");
  url.searchParams.set("connector_names", "stripe");
  url.searchParams.set("environment", targetEnvironment);

  const resp = await fetch(url.toString(), {
    headers: { Accept: "application/json", "X-Replit-Token": xReplitToken },
    signal: AbortSignal.timeout(10_000),
  });

  if (!resp.ok) {
    throw new Error(`Failed to fetch Stripe credentials: ${resp.status} ${resp.statusText}`);
  }

  const data = await resp.json() as {
    items?: Array<{ settings?: { publishable?: string; secret?: string } }>
  };
  const settings = data.items?.[0]?.settings;

  if (!settings?.secret) {
    throw new Error(
      'Stripe integration not connected or missing secret key. ' +
      'Connect Stripe via the Integrations tab first.'
    );
  }

  return {
    secretKey: settings.secret,
    publishableKey: settings.publishable,
  };
}

/**
 * Returns a fresh authenticated Stripe client.
 * Not cached — fetches credentials on every call so rotated keys are picked up.
 */
export async function getUncachableStripeClient(): Promise<Stripe> {
  const { secretKey } = await getStripeCredentials();
  return new Stripe(secretKey, { apiVersion: "2026-04-22.dahlia" });
}

/**
 * Returns the Stripe publishable key for use in frontend configuration.
 */
export async function getStripePublishableKey(): Promise<string | undefined> {
  const { publishableKey } = await getStripeCredentials();
  return publishableKey;
}

/**
 * Constructs and verifies a Stripe webhook event from a raw Buffer payload.
 *
 * Verification strategy:
 *   - If STRIPE_WEBHOOK_SECRET is set: always verify the Stripe signature (HMAC-SHA256).
 *   - If STRIPE_WEBHOOK_SECRET is not set AND we are in a Replit deployment: throw — production
 *     must always verify signatures to prevent webhook spoofing.
 *   - If STRIPE_WEBHOOK_SECRET is not set in development: log a warning and skip verification
 *     (allows local testing with the Stripe CLI before setting up the secret).
 */
export async function constructStripeEvent(payload: Buffer, signature: string): Promise<Stripe.Event> {
  const webhookSecret = env.stripeWebhookSecret;

  if (!webhookSecret) {
    if (env.isReplitDeployment) {
      throw new Error(
        "STRIPE_WEBHOOK_SECRET must be set in production. " +
        "Configure it via the environment secrets before deploying."
      );
    }
    logger.warn(
      "STRIPE_WEBHOOK_SECRET is not set — skipping webhook signature verification. " +
      "This is only acceptable in local development. Set it before deploying."
    );
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
 * Returns a fresh StripeSync instance for webhook processing and data sync.
 * Not cached — fetches credentials on every call so rotated keys are picked up.
 */
export async function getStripeSync(): Promise<StripeSync> {
  const databaseUrl = requireEnv("databaseUrl");
  const { secretKey } = await getStripeCredentials();
  return new StripeSync({
    poolConfig: { connectionString: databaseUrl, max: 2 },
    stripeSecretKey: secretKey,
  });
}
