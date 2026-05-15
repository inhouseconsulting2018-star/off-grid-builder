import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import { env } from "../config/env";
import { getUncachableStripeClient } from "../services/payments/stripeClient";

const router: IRouter = Router();

/**
 * POST /api/projects/:id/create-checkout-session
 *
 * Creates a Stripe Checkout session (one-time payment mode) to unlock the
 * full solar PDF report for a given project.
 *
 * Required env vars:
 *   STRIPE_PRICE_ID — the one-time price ID from your Stripe Dashboard
 *                     (test mode: price_... starting with price_)
 *                     Set this after running: pnpm --filter @workspace/scripts run seed-stripe
 */
router.post("/projects/:id/create-checkout-session", async (req, res): Promise<void> => {
  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId)) {
    res.status(400).json({ error: "Invalid project ID" });
    return;
  }

  // Verify project exists
  const [project] = await db
    .select({ id: projectsTable.id, paidAt: projectsTable.paidAt })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  if (project.paidAt) {
    res.status(400).json({ error: "Project is already unlocked" });
    return;
  }

  // STRIPE_PRICE_ID: set this env var to your one-time price ID.
  // Create the price by running: pnpm --filter @workspace/scripts run seed-stripe
  // Then copy the printed price ID and set STRIPE_PRICE_ID=price_xxx in Secrets.
  const priceId = env.stripePriceId;
  if (!priceId) {
    res.status(500).json({
      error: "STRIPE_PRICE_ID is not configured. Run the seed script and set the env var.",
    });
    return;
  }

  const stripe = await getUncachableStripeClient();

  // Build success/cancel URLs — works in both dev (proxied) and production
  const host = req.get("host") ?? "localhost";
  const protocol = req.protocol;
  const successUrl = `${protocol}://${host}/payment-success?projectId=${projectId}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${protocol}://${host}/payment-cancel?projectId=${projectId}`;

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    // "payment" mode = one-time purchase (not a subscription)
    mode: "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    // Embed projectId in metadata so the webhook knows which project to unlock
    metadata: { projectId: String(projectId) },
  });

  res.json({ url: session.url });
});

export default router;
