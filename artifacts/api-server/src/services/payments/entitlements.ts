import { eq } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import { getFrontendOrigin } from "../../config/frontendOrigin";
import { getPlanForWebhook, type CheckoutPlan } from "./plans";
import { deliverReportEmail } from "../reports/reportDeliveryService";

export type StripeCheckoutSessionLike = {
  id: string;
  payment_status?: string | null;
  client_reference_id?: string | null;
  payment_link?: string | null;
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
  return {
    paidAt: new Date(),
    stripeSessionId: session.id,
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
      accessToken: projectsTable.accessToken,
      stripeSessionId: projectsTable.stripeSessionId,
      selectedPlan: projectsTable.selectedPlan,
    })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) return null;

  const isLifetimePaymentLink = Boolean(
    session.payment_link
    && paymentLinkProjectId
    && !session.metadata?.selectedPlan
    && session.amount_total === 19_900,
  );
  const plan = getPlanForWebhook(
    session.metadata?.selectedPlan
    ?? (isLifetimePaymentLink ? "contractor_lifetime_beta" : undefined),
  );
  if (!session.metadata?.selectedPlan && !isLifetimePaymentLink) return null;
  if (project.stripeSessionId === session.id) {
    return { projectId, selectedPlan: project.selectedPlan ?? plan.id };
  }
  const update = buildEntitlementUpdate(session, plan);
  const baseOrigin = getFrontendOrigin(`${options.protocol}://${options.host}`);
  const reportUrl = `${baseOrigin}/results/${projectId}?accessToken=${encodeURIComponent(project.accessToken ?? "")}`;
  const reportDeliveryStatus = update.purchaserEmail
    ? await deliverReportEmail({ projectId, email: update.purchaserEmail, reportUrl })
    : "not_sent";

  await db
    .update(projectsTable)
    .set({
      ...update,
      reportDeliveryStatus,
      reportDeliveredAt: reportDeliveryStatus === "sent" ? new Date() : null,
    })
    .where(eq(projectsTable.id, projectId));

  return { projectId, selectedPlan: plan.id };
}

export async function updateProjectFromSubscription(
  subscription: StripeSubscriptionLike,
): Promise<{ projectId: number; selectedPlan: string; paymentStatus: string } | null> {
  const projectId = parseInt(subscription.metadata?.projectId ?? "", 10);
  if (!Number.isFinite(projectId)) return null;

  const [project] = await db
    .select({ id: projectsTable.id })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) return null;

  const plan = getPlanForWebhook(subscription.metadata?.selectedPlan);
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
