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

      // ── Custom business logic: mark project as paid on checkout completion ──
      if (event.type === "checkout.session.completed") {
        const session = event.data.object as {
          id: string;
          payment_status: string;
          metadata?: Record<string, string>;
        };
        const projectId = parseInt(session.metadata?.projectId ?? "", 10);
        if (!isNaN(projectId) && session.payment_status === "paid") {
          await db
            .update(projectsTable)
            .set({
              paidAt: new Date(),
              stripeSessionId: session.id,
            })
            .where(eq(projectsTable.id, projectId));
          logger.info({ projectId, sessionId: session.id }, "Project unlocked via Stripe payment");
        }
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
