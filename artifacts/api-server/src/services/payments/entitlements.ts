import { eq } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import { getFrontendOrigin } from "../../config/frontendOrigin";
import { getCheckoutPlan, getPlanForWebhook, type CheckoutPlan, type CheckoutPlanId } from "./plans";
import { deliverReportEmail } from "../reports/reportDeliveryService";

export type StripeCheckoutSessionLike = {
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

export type StripeSubscriptionLike = {
  id: string;
  status?: string | null;
  metadata?: Record<string, string> | null;
};

export function hasActivePaidEntitlement(project: {
  paidAt?: Date | null;
  selectedPlan?: string | null;
  paymentStatus?: string | null;
}): boolean {
  if (!project.paidAt) return false;
  if (project.selectedPlan !== "contractor_annual") return project.paymentStatus === "paid";
  return project.paymentStatus === "paid"
    || project.paymentStatus === "active"
    || project.paymentStatus === "trialing";
}

export function buildEntitlementUpdate(session: StripeCheckoutSessionLike, plan: CheckoutPlan) {
  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id ?? null;
  return {
    paidAt: new Date(),
    stripeSessionId: plan.checkoutMode === "subscription" && subscriptionId
      ? subscriptionId
      : session.id,
    stripePriceId: session.metadata?.stripePriceId ?? null,
    selectedPlan: plan.id,
    entitlementType: plan.id,
    paidAmount: session.amount_total ?? plan.amountCents,
    reportCredits: plan.includedCredits,
    creditsUsed: 0,
    contractorStatus: plan.contractorStatus,
    contractorPlan: plan.contractorStatus ? plan.id : null,
    paymentStatus: session.payment_status ?? "paid",
    purchaserEmail: session.customer_details?.email ?? session.customer_email ?? null,
  };
}

export function getPaymentLinkPlanId(amountTotal: number | null | undefined): CheckoutPlanId | null {
  switch (amountTotal) {
    case 1_900:
      return "homeowner_report";
    case 3_900:
      return "property_pack";
    case 14_900:
      return "contractor_annual";
    case 19_900:
      return "contractor_lifetime_beta";
    default:
      return null;
  }
}

export async function unlockProjectFromCheckoutSession(
  session: StripeCheckoutSessionLike,
  options: { protocol: string; host: string },
): Promise<{ projectId: number; selectedPlan: string } | null> {
  if (session.payment_status !== "paid") return null;

  const paymentLinkProjectId = session.client_reference_id?.match(/^project_(\d+)$/)?.[1];
  const projectId = parseInt(session.metadata?.projectId ?? paymentLinkProjectId ?? "", 10);
  if (!Number.isFinite(projectId)) return null;

  const [project] = await db
    .select({
      name: projectsTable.name,
      accessToken: projectsTable.accessToken,
      stripeSessionId: projectsTable.stripeSessionId,
      selectedPlan: projectsTable.selectedPlan,
    })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) return null;

  const subscriptionId = typeof session.subscription === "string"
    ? session.subscription
    : session.subscription?.id ?? null;
  const entitlementReference = subscriptionId ?? session.id;
  const paymentLinkPlanId = session.payment_link && paymentLinkProjectId && !session.metadata?.selectedPlan
    ? getPaymentLinkPlanId(session.amount_total)
    : null;
  const plan = session.metadata?.selectedPlan
    ? getPlanForWebhook(session.metadata.selectedPlan)
    : paymentLinkPlanId
    ? getCheckoutPlan(paymentLinkPlanId)
    : null;
  if (!plan) return null;
  if (project.stripeSessionId === session.id || project.stripeSessionId === entitlementReference) {
    return { projectId, selectedPlan: project.selectedPlan ?? plan.id };
  }
  const update = buildEntitlementUpdate(session, plan);

  // 1) Persist the entitlement FIRST. The paywall must unlock regardless of
  //    whether email delivery later succeeds, fails, or is unconfigured.
  await db
    .update(projectsTable)
    .set(update)
    .where(eq(projectsTable.id, projectId));

  // 2) Attempt report-ready email delivery. deliverReportEmail never throws.
  const baseOrigin = getFrontendOrigin(`${options.protocol}://${options.host}`);
  const token = encodeURIComponent(project.accessToken ?? "");
  const reportUrl = `${baseOrigin}/results/${projectId}?accessToken=${token}`;
  const pdfUrl = `${baseOrigin}/api/projects/${projectId}/report.pdf?accessToken=${token}`;
  const reportDeliveryStatus = update.purchaserEmail
    ? await deliverReportEmail({
        projectId,
        email: update.purchaserEmail,
        reportUrl,
        pdfUrl,
        projectName: project.name,
        planLabel: plan.name,
      })
    : "not_configured";

  // 3) Record delivery status separately — best-effort, never affects the unlock.
  await db
    .update(projectsTable)
    .set({
      reportDeliveryStatus,
      reportDeliveredAt: reportDeliveryStatus === "sent" ? new Date() : null,
    })
    .where(eq(projectsTable.id, projectId));

  return { projectId, selectedPlan: plan.id };
}

export async function updateProjectFromSubscription(
  subscription: StripeSubscriptionLike,
): Promise<{ projectId: number; selectedPlan: string; paymentStatus: string } | null> {
  const metadataProjectId = parseInt(subscription.metadata?.projectId ?? "", 10);
  const [project] = Number.isFinite(metadataProjectId)
    ? await db
        .select({ id: projectsTable.id, selectedPlan: projectsTable.selectedPlan })
        .from(projectsTable)
        .where(eq(projectsTable.id, metadataProjectId))
    : await db
        .select({ id: projectsTable.id, selectedPlan: projectsTable.selectedPlan })
        .from(projectsTable)
        .where(eq(projectsTable.stripeSessionId, subscription.id));
  if (!project) return null;
  const projectId = project.id;

  const plan = getPlanForWebhook(subscription.metadata?.selectedPlan ?? project.selectedPlan ?? undefined);
  const paymentStatus = subscription.status ?? "unknown";
  const contractorStatus = paymentStatus === "active" || paymentStatus === "trialing";

  await db
    .update(projectsTable)
    .set({
      paymentStatus,
      contractorStatus: plan.contractorStatus ? contractorStatus : false,
      contractorPlan: plan.contractorStatus ? plan.id : null,
    })
    .where(eq(projectsTable.id, projectId));

  return { projectId, selectedPlan: plan.id, paymentStatus };
}
