import { Router, type IRouter } from "express";
import { env } from "../config/env";
import { requireAdminToken } from "../middlewares/auth";
import { getCheckoutPlans } from "../services/payments/plans";
import { getUncachableStripeClient } from "../services/payments/stripeClient";

const router: IRouter = Router();

router.get("/launch-status", requireAdminToken, async (_req, res): Promise<void> => {
  const plans = Object.values(getCheckoutPlans());
  const configuredPlans = plans.map((plan) => ({
    id: plan.id,
    configured: Boolean(plan.priceId),
  }));

  let stripeMode: "live" | "test" | "unknown" = "unknown";
  let stripeReachable = false;
  let stripeError: string | null = null;
  try {
    const stripe = await getUncachableStripeClient();
    const configuredPrice = plans.find((plan) => plan.priceId)?.priceId;
    if (configuredPrice) {
      const price = await stripe.prices.retrieve(configuredPrice);
      stripeMode = price.livemode ? "live" : "test";
      stripeReachable = true;
    } else {
      stripeError = "No Stripe price IDs are configured.";
    }
  } catch (error) {
    stripeError = error instanceof Error ? error.message : "Stripe status check failed.";
  }

  res.json({
    stripe: {
      mode: stripeMode,
      reachable: stripeReachable,
      webhookSecretConfigured: Boolean(env.stripeWebhookSecret),
      plans: configuredPlans,
      error: stripeError,
    },
    environment: {
      databaseConfigured: Boolean(env.databaseUrl),
      adminTokenConfigured: Boolean(env.adminToken),
      solarApiConfigured: Boolean(env.pvwattsApiKey),
      frontendUrl: env.frontendUrl ?? null,
      replitDeployment: env.isReplitDeployment,
    },
  });
});

export default router;
