import { timingSafeEqual } from "node:crypto";
import { Router, type IRouter, type Request, type Response } from "express";
import { desc, eq, isNotNull } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import { getUncachableStripeClient } from "../services/payments/stripeClient";
import { getCheckoutPlan, parseCheckoutPlan } from "../services/payments/plans";
import { deliverReportEmail } from "../services/reports/reportDeliveryService";
import { requireAdmin } from "../middlewares/adminAuth";
import { getAuthorizedProject } from "../services/projects/projectAccess";
import { env } from "../config/env";

const router: IRouter = Router();

function resolveCheckoutBaseUrl(req: Request): string {
  if (env.nodeEnv === "production" || env.isReplitDeployment) {
    return "https://offgridsolarbuilders.com";
  }
  const host = req.get("host") ?? "localhost";
  return `${req.protocol}://${host}`;
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

type CheckoutRequest = {
  projectId: number;
  accessToken: string;
  selectedPlan?: unknown;
  plan?: unknown;
};

async function createCheckoutSession(req: Request, res: Response, input: CheckoutRequest): Promise<void> {
  const projectId = input.projectId;
  if (!Number.isFinite(projectId)) {
    res.status(400).json({ error: "Invalid project ID" });
    return;
  }

  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, projectId));
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }
  if (!input.accessToken || !constantTimeEquals(input.accessToken, project.accessToken)) {
    res.status(403).json({ error: "Invalid project access token" });
    return;
  }

  const planId = parseCheckoutPlan(input.selectedPlan ?? input.plan);
  const plan = getCheckoutPlan(planId);

  if (project.paidAt && planId === "homeowner_report") {
    res.status(400).json({ error: "Project is already unlocked" });
    return;
  }

  const priceId = plan.priceId;
  if (!priceId) {
    res.status(500).json({
      error: `${plan.envName} is not configured. Run the seed script and set the env var.`,
    });
    return;
  }

  const stripe = await getUncachableStripeClient();
  const baseUrl = resolveCheckoutBaseUrl(req);
  const successUrl = `${baseUrl}/payment-success?projectId=${projectId}&accessToken=${encodeURIComponent(project.accessToken)}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/payment-cancel?projectId=${projectId}&accessToken=${encodeURIComponent(project.accessToken)}`;
  const checkoutMetadata = {
    projectId: String(projectId),
    accessToken: project.accessToken,
    selectedPlan: plan.id,
    creditAmount: String(plan.includedCredits),
    stripePriceId: priceId,
    reportCredits: String(plan.includedCredits),
    reportType: "solar-design-report",
  };

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: plan.checkoutMode,
    ...(plan.checkoutMode === "payment" ? { customer_creation: "if_required" as const } : {}),
    ...(plan.checkoutMode === "subscription" ? { subscription_data: { metadata: checkoutMetadata } } : {}),
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: checkoutMetadata,
  });

  res.json({ url: session.url });
}

/**
 * POST /api/projects/:id/create-checkout-session
 *
 * Creates a Stripe Checkout session to unlock reports or buy launch credits.
 *
 * Required env vars:
 *   STRIPE_HOMEOWNER_REPORT_PRICE_ID or STRIPE_PRICE_ID
 *   STRIPE_PROPERTY_PACK_PRICE_ID
 *   STRIPE_CONTRACTOR_ANNUAL_PRICE_ID
 *   STRIPE_CONTRACTOR_LIFETIME_PRICE_ID
 */
router.post("/projects/:id/create-checkout-session", async (req, res): Promise<void> => {
  const projectId = parseInt(req.params.id, 10);
  const accessToken = typeof req.query.accessToken === "string" ? req.query.accessToken : "";
  await createCheckoutSession(req, res, {
    projectId,
    accessToken,
    selectedPlan: req.body?.selectedPlan ?? req.body?.plan,
  });
});

router.post("/stripe/create-checkout-session", async (req, res): Promise<void> => {
  await createCheckoutSession(req, res, {
    projectId: Number(req.body?.projectId),
    accessToken: typeof req.body?.accessToken === "string" ? req.body.accessToken : "",
    selectedPlan: req.body?.selectedPlan,
  });
});

/**
 * POST /api/projects/:id/email-report
 *
 * Records report delivery for paid projects. In production this is where an
 * SMTP/transactional-email provider can attach the branded PDF or include the
 * secure report link. For now the app records the delivery event and exposes it
 * in admin purchases.
 */
router.post("/projects/:id/email-report", async (req, res): Promise<void> => {
  const projectId = parseInt(req.params.id, 10);
  if (isNaN(projectId)) {
    res.status(400).json({ error: "Invalid project ID" });
    return;
  }

  const email = typeof req.body?.email === "string" ? req.body.email.trim() : "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: "A valid email is required" });
    return;
  }

  const project = await getAuthorizedProject(req, projectId);
  if (project === null) { res.status(404).json({ error: "Project not found" }); return; }
  if (project === "forbidden") { res.status(403).json({ error: "Invalid project access token" }); return; }

  if (!project.paidAt) {
    res.status(402).json({ error: "Unlock this report before emailing it" });
    return;
  }

  const host = req.get("host") ?? "localhost";
  const reportUrl = `${req.protocol}://${host}/results/${projectId}?accessToken=${encodeURIComponent(project.accessToken)}`;
  const deliveryStatus = await deliverReportEmail({
    projectId,
    email,
    reportUrl,
    projectName: project.name,
  });
  const deliveredAt = deliveryStatus === "sent" ? new Date() : null;
  const [updated] = await db
    .update(projectsTable)
    .set({
      purchaserEmail: email,
      reportDeliveryStatus: deliveryStatus,
      reportDeliveredAt: deliveredAt,
    })
    .where(eq(projectsTable.id, projectId))
    .returning();

  res.json({
    ok: true,
    projectId: updated.id,
    email,
    reportDeliveryStatus: updated.reportDeliveryStatus,
    reportDeliveredAt: updated.reportDeliveredAt,
  });
});

router.get("/admin/purchases", requireAdmin, async (_req, res): Promise<void> => {
  const purchases = await db
    .select({
      projectId: projectsTable.id,
      projectName: projectsTable.name,
      purchaserEmail: projectsTable.purchaserEmail,
      paidAt: projectsTable.paidAt,
      stripeSessionId: projectsTable.stripeSessionId,
      stripePriceId: projectsTable.stripePriceId,
      entitlementType: projectsTable.entitlementType,
      selectedPlan: projectsTable.selectedPlan,
      paidAmount: projectsTable.paidAmount,
      reportCredits: projectsTable.reportCredits,
      creditsUsed: projectsTable.creditsUsed,
      paymentStatus: projectsTable.paymentStatus,
      contractorStatus: projectsTable.contractorStatus,
      contractorPlan: projectsTable.contractorPlan,
      reportDeliveryStatus: projectsTable.reportDeliveryStatus,
      reportDeliveredAt: projectsTable.reportDeliveredAt,
      systemType: projectsTable.systemType,
      installationType: projectsTable.installationType,
      city: projectsTable.city,
      state: projectsTable.state,
    })
    .from(projectsTable)
    .where(isNotNull(projectsTable.paidAt))
    .orderBy(desc(projectsTable.paidAt));

  res.json({ purchases });
});

export default router;
