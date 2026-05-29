import { eq } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import { getPlanForWebhook, type CheckoutPlan } from "./plans";
import { deliverReportEmail } from "../reports/reportDeliveryService";

export type StripeCheckoutSessionLike = {
  id: string;
  payment_status?: string | null;
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

  const projectId = parseInt(session.metadata?.projectId ?? "", 10);
  if (!Number.isFinite(projectId)) return null;

  const [project] = await db
    .select({ accessToken: projectsTable.accessToken })
    .from(projectsTable)
    .where(eq(projectsTable.id, projectId));
  if (!project) return null;

  const plan = getPlanForWebhook(session.metadata?.selectedPlan);
  const update = buildEntitlementUpdate(session, plan);
  const reportUrl = `${options.protocol}://${options.host}/results/${projectId}?accessToken=${encodeURIComponent(project.accessToken)}`;
  const reportDeliveryStatus = update.purchaserEmail
    ? await deliverReportEmail({ projectId, email: update.purchaserEmail, reportUrl })
    : "unavailable";

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
  const contractorStatus = !["canceled", "incomplete_expired", "unpaid"].includes(paymentStatus);

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
