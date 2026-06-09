import express, {
  type Express,
  type NextFunction,
  type Request,
  type Response,
} from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./utils/logger";
import { env } from "./config/env";
import { productionFrontendOrigin } from "./config/frontendOrigin";
import { WebhookHandlers } from "./services/payments/webhookHandlers";
import { constructStripeEvent } from "./services/payments/stripeClient";
import { unlockProjectFromCheckoutSession, updateProjectFromSubscription } from "./services/payments/entitlements";

const app: Express = express();
const allowedOrigins = new Set(
  [
    env.frontendUrl?.replace(/\/$/, ""),
    productionFrontendOrigin,
    "https://offgridsolarbuilder.com",
    "https://off-grid-builder-1.replit.app",
    env.nodeEnv === "development" ? "http://localhost:5173" : null,
    env.nodeEnv === "development" ? "http://localhost:8081" : null,
  ].filter((origin): origin is string => Boolean(origin)),
);

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
          payment_status?: string | null;
          client_reference_id?: string | null;
          payment_link?: string | null;
          subscription?: string | { id?: string | null } | null;
          customer_details?: { email?: string | null } | null;
          customer_email?: string | null;
          amount_total?: number | null;
          metadata?: Record<string, string> | null;
        };
        const result = await unlockProjectFromCheckoutSession(session, {
          protocol: req.protocol,
          host: req.get("host") ?? "localhost",
        });
        if (result) logger.info({ ...result, sessionId: session.id }, "Project unlocked via Stripe payment");
      }

      // ── payment_intent.payment_failed — log failed payments ─────────────────
      if (event.type === "payment_intent.payment_failed") {
        const pi = event.data.object as { id: string; last_payment_error?: { message?: string } };
        logger.warn(
          { paymentIntentId: pi.id, reason: pi.last_payment_error?.message },
          "Stripe payment failed"
        );
      }

      if (
        event.type === "customer.subscription.created" ||
        event.type === "customer.subscription.updated" ||
        event.type === "customer.subscription.deleted"
      ) {
        const sub = event.data.object as { id: string; status?: string | null; metadata?: Record<string, string> | null };
        const result = await updateProjectFromSubscription(sub);
        if (result) {
          logger.info({ ...result, subscriptionId: sub.id, eventType: event.type }, "Stripe subscription status updated");
        }
      }

      // Also sync event data via stripe-replit-sync (products, customers, etc.)
      try {
        await WebhookHandlers.processWebhook(req.body as Buffer, sig);
      } catch (error) {
        logger.warn({ err: error }, "Stripe-Replit sync failed after entitlement update");
      }

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
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }
    const error = new Error("Origin not allowed by CORS") as Error & { status?: number };
    error.status = 403;
    callback(error);
  },
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use("/api", router);

app.use((error: Error & { status?: number }, req: Request, res: Response, _next: NextFunction) => {
  const status = error.status === 403 ? 403 : 500;
  if (status === 403) {
    logger.warn({ origin: req.headers.origin }, "Blocked CORS origin");
  } else {
    logger.error({ err: error, status }, "Unhandled API error");
  }
  res.status(status).json({
    error: status === 403 ? "Origin not allowed" : "Internal server error",
  });
});

export default app;
