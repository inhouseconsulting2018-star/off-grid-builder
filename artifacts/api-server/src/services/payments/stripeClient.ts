import Stripe from 'stripe';
import { StripeSync } from 'stripe-replit-sync';
import { env, requireEnv } from "../../config/env";

/**
 * Fetches Stripe credentials from the Replit connection API.
 * Not cached — tokens can rotate, so fetch fresh each time.
 *
 * Keys come from the Stripe integration connected via the Replit Integrations tab.
 * In development: uses the Stripe sandbox (test) keys.
 * In production: uses the live keys (when deployed).
 */
async function getStripeCredentials(): Promise<{ secretKey: string; publishableKey?: string }> {
  if (env.stripeSecretKey) {
    return {
      secretKey: env.stripeSecretKey,
      publishableKey: env.stripePublishableKey,
    };
  }

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
 * In production, STRIPE_WEBHOOK_SECRET must be set so custom unlock logic never
 * trusts unsigned JSON before stripe-replit-sync processes the event.
 */
export async function constructStripeEvent(payload: Buffer, signature: string): Promise<Stripe.Event> {
  if (env.stripeWebhookSecret) {
    const stripe = await getUncachableStripeClient();
    return stripe.webhooks.constructEvent(payload, signature, env.stripeWebhookSecret);
  }

  if (env.nodeEnv === "production") {
    throw new Error("STRIPE_WEBHOOK_SECRET is required in production");
  }

  return JSON.parse(payload.toString()) as Stripe.Event;
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
