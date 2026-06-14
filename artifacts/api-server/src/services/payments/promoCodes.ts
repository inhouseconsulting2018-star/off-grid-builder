import { and, count, eq } from "drizzle-orm";
import {
  db,
  projectsTable,
  promoCodesTable,
  promoRedemptionsTable,
  type PromoCode,
} from "@workspace/db";

export type PromoRejection =
  | "invalid"
  | "inactive"
  | "expired"
  | "already_used"
  | "usage_limit_reached";

export type PromoDecision =
  | { ok: true }
  | { ok: false; reason: PromoRejection };

export function normalizePromoCode(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, "");
}

export function normalizePromoEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function isValidPromoEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizePromoEmail(value));
}

export function evaluatePromoCode(input: {
  promo: Pick<PromoCode, "active" | "expiresAt" | "maxRedemptions" | "maxRedemptionsPerEmail"> | null;
  totalRedemptions: number;
  emailRedemptions: number;
  projectAlreadyRedeemed: boolean;
  now?: Date;
}): PromoDecision {
  const { promo, totalRedemptions, emailRedemptions, projectAlreadyRedeemed } = input;
  if (!promo) return { ok: false, reason: "invalid" };
  if (!promo.active) return { ok: false, reason: "inactive" };
  if (promo.expiresAt && promo.expiresAt.getTime() <= (input.now ?? new Date()).getTime()) {
    return { ok: false, reason: "expired" };
  }
  if (projectAlreadyRedeemed || emailRedemptions >= promo.maxRedemptionsPerEmail) {
    return { ok: false, reason: "already_used" };
  }
  if (promo.maxRedemptions != null && totalRedemptions >= promo.maxRedemptions) {
    return { ok: false, reason: "usage_limit_reached" };
  }
  return { ok: true };
}

export function promoRejectionMessage(reason: PromoRejection): string {
  switch (reason) {
    case "inactive":
      return "This trial code is inactive.";
    case "expired":
      return "This trial code has expired.";
    case "already_used":
      return "This trial code has already been used by this email or project.";
    case "usage_limit_reached":
      return "This trial code has reached its usage limit.";
    default:
      return "Invalid trial code.";
  }
}

export async function redeemPromoCode(input: {
  projectId: number;
  code: string;
  email: string;
}): Promise<PromoDecision> {
  const code = normalizePromoCode(input.code);
  const email = normalizePromoEmail(input.email);

  return db.transaction(async (tx) => {
    const [promo] = await tx
      .select()
      .from(promoCodesTable)
      .where(eq(promoCodesTable.code, code))
      .for("update");

    if (!promo) return { ok: false, reason: "invalid" } as const;

    const [[total], [emailCount], [projectRedemption]] = await Promise.all([
      tx
        .select({ value: count() })
        .from(promoRedemptionsTable)
        .where(eq(promoRedemptionsTable.promoCodeId, promo.id)),
      tx
        .select({ value: count() })
        .from(promoRedemptionsTable)
        .where(and(
          eq(promoRedemptionsTable.promoCodeId, promo.id),
          eq(promoRedemptionsTable.email, email),
        )),
      tx
        .select({ id: promoRedemptionsTable.id })
        .from(promoRedemptionsTable)
        .where(and(
          eq(promoRedemptionsTable.promoCodeId, promo.id),
          eq(promoRedemptionsTable.projectId, input.projectId),
        ))
        .limit(1),
    ]);

    const decision = evaluatePromoCode({
      promo,
      totalRedemptions: Number(total?.value ?? 0),
      emailRedemptions: Number(emailCount?.value ?? 0),
      projectAlreadyRedeemed: Boolean(projectRedemption),
    });
    if (!decision.ok) return decision;

    await tx.insert(promoRedemptionsTable).values({
      promoCodeId: promo.id,
      projectId: input.projectId,
      email,
    });

    await tx
      .update(projectsTable)
      .set({
        paidAt: new Date(),
        paidAmount: 0,
        paymentStatus: "trial",
        selectedPlan: "trial_report",
        entitlementType: `promo:${promo.code}`,
        reportCredits: 1,
        creditsUsed: 0,
        purchaserEmail: email,
      })
      .where(eq(projectsTable.id, input.projectId));

    return { ok: true } as const;
  });
}
