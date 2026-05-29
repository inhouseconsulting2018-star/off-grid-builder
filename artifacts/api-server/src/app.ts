import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { eq } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import router from "./routes";
import { logger } from "./utils/logger";
import { WebhookHandlers } from "./services/payments/webhookHandlers";
import { constructStripeEvent } from "./services/payments/stripeClient";

const app: Express = express();

// Trust the first proxy hop so req.protocol correctly returns "https" in production
// (Replit's load balancer terminates TLS and forwards X-Forwarded-Proto)
app.set("trust proxy", 1);

// ── Stripe Webhook — MUST be registered BEFORE express.json() ──────────────
// Stripe sends a raw Buffer body for signature verification.
// If express.json() runs first it parses the body, breaking the HMAC check.
app.post(
  "/api/stripe/webhook",
  express.raw({ type: "application/json" }),
  async (req, res) => {
    const signature = req.headers["stripe-signature"];
    if (!signature) {
      res.status(400).json({ error: "Missing stripe-signature header" });
      return;
    }
    const sig = Array.isArray(signature) ? signature[0] : signature;

    try {
      // Construct and verify the Stripe event
      const event = await constructStripeEvent(req.body as Buffer, sig);

      // ── checkout.session.completed — grant entitlement ─────────────────────
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as {
          id: string;
          payment_status: string;
          amount_total?: number | null;
          metadata?: Record<string, string>;
        };
        const projectId = parseInt(session.metadata?.projectId ?? "", 10);
        const productType = session.metadata?.productType ?? "homeowner";

        if (!isNaN(projectId) && session.payment_status === "paid") {
          const creditsMap: Record<string, number> = {
            homeowner:           1,
            property_pack:       3,
            contractor_annual:   50,
            contractor_lifetime: 100,
          };
          const reportCredits = creditsMap[productType] ?? 1;

          await db
            .update(projectsTable)
            .set({
              paidAt:          new Date(),
              stripeSessionId: session.id,
              paymentStatus:   "paid",
              selectedPlan:    productType,
              entitlementType: productType,
              reportCredits,
              paidAmount:      session.amount_total ?? null,
            })
            .where(eq(projectsTable.id, projectId));

          logger.info(
            { projectId, sessionId: session.id, productType, reportCredits },
            "Project unlocked via Stripe payment"
          );
        }
      }

      // ── payment_intent.payment_failed — log failed payments ─────────────────
      if (event.type === "payment_intent.payment_failed") {
        const pi = event.data.object as { id: string; last_payment_error?: { message?: string } };
        logger.warn(
          { paymentIntentId: pi.id, reason: pi.last_payment_error?.message },
          "Stripe payment failed"
        );
      }

      // ── Subscription lifecycle — contractor_annual plan ──────────────────────
      // stripe-replit-sync keeps stripe.subscriptions in sync automatically.
      // We log state changes here; full per-project entitlement revocation requires
      // stripeSubscriptionId stored on the project (future enhancement).
      if (event.type === "customer.subscription.created") {
        const sub = event.data.object as { id: string; status: string; customer: string };
        logger.info({ subscriptionId: sub.id, customerId: sub.customer, status: sub.status }, "Stripe subscription created");
      }

      if (event.type === "customer.subscription.updated") {
        const sub = event.data.object as { id: string; status: string; customer: string };
        logger.info({ subscriptionId: sub.id, customerId: sub.customer, status: sub.status }, "Stripe subscription updated");
        // If subscription moves to past_due or unpaid, log a warning
        if (sub.status === "past_due" || sub.status === "unpaid") {
          logger.warn({ subscriptionId: sub.id, status: sub.status }, "Stripe subscription payment past due");
        }
      }

      if (event.type === "customer.subscription.deleted") {
        const sub = event.data.object as { id: string; status: string; customer: string };
        logger.warn({ subscriptionId: sub.id, customerId: sub.customer }, "Stripe subscription cancelled — manual entitlement review may be needed");
      }

      // Also sync event data via stripe-replit-sync (products, customers, etc.)
      await WebhookHandlers.processWebhook(req.body as Buffer, sig);

      res.status(200).json({ received: true });
    } catch (error: unknown) {
      logger.error({ err: error }, "Stripe webhook error");
      res.status(400).json({ error: "Webhook processing error" });
    }
  }
);

// ── Standard middleware (after webhook route) ──────────────────────────────
app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

export default app;
