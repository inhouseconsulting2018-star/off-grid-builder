import express, { type Express, type ErrorRequestHandler } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import { eq } from "drizzle-orm";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { db, projectsTable } from "@workspace/db";
import router from "./routes";
import { logger } from "./utils/logger";
import { WebhookHandlers } from "./services/payments/webhookHandlers";
import { constructStripeEvent } from "./services/payments/stripeClient";
import { deliverReportEmail } from "./services/reports/reportDeliveryService";

const app: Express = express();
const dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = process.env.FRONTEND_DIST_DIR
  ? path.resolve(process.env.FRONTEND_DIST_DIR)
  : path.resolve(dirname, "../../offgrid-solar/dist/public");

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
          customer_details?: { email?: string | null } | null;
          customer_email?: string | null;
          metadata?: Record<string, string>;
        };
        const projectId = parseInt(session.metadata?.projectId ?? "", 10);
        if (!isNaN(projectId) && session.payment_status === "paid") {
          const purchaserEmail = session.customer_details?.email ?? session.customer_email ?? null;
          const host = req.get("host") ?? "localhost";
          const [project] = await db
            .select({ accessToken: projectsTable.accessToken })
            .from(projectsTable)
            .where(eq(projectsTable.id, projectId));
          const reportUrl = `${req.protocol}://${host}/results/${projectId}${project?.accessToken ? `?accessToken=${encodeURIComponent(project.accessToken)}` : ""}`;
          const reportDeliveryStatus = purchaserEmail
            ? await deliverReportEmail({ projectId, email: purchaserEmail, reportUrl })
            : "unavailable";
          await db
            .update(projectsTable)
            .set({
              paidAt: new Date(),
              stripeSessionId: session.id,
              purchaserEmail,
              reportDeliveryStatus,
              reportDeliveredAt: reportDeliveryStatus === "sent" ? new Date() : null,
            })
            .where(eq(projectsTable.id, projectId));
          logger.info({ projectId, sessionId: session.id, purchaserEmail }, "Project unlocked via Stripe payment");
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

if (existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get(/^(?!\/api).*/, (_req, res) => {
    res.sendFile(path.join(frontendDist, "index.html"));
  });
}

app.use((_req, res) => {
  res.status(404).json({ error: "Not found" });
});

const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  logger.error({ err: error }, "Unhandled API error");
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
};

app.use(errorHandler);

export default app;
