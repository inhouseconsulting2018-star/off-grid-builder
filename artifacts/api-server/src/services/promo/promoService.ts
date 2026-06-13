import { and, eq, gt, isNull, lt, or, sql } from "drizzle-orm";
import {
  db,
  projectsTable,
  promoCodesTable,
  promoRedemptionsTable,
  type PromoCode,
} from "@workspace/db";
import { logger } from "../../utils/logger";

/** The default homeowner trial code, seeded automatically at startup. */
export const DEFAULT_TRIAL_CODE = "SOLARTRIAL";

/**
 * Server-validated redemption outcomes. The frontend renders a distinct,
 * friendly message per state and only treats `valid` as an unlock.
 */
export type RedeemState =
  | "valid"
  | "invalid"
  | "inactive"
  | "expired"
  | "limit-reached"
  | "used";

export interface RedeemResult {
  state: RedeemState;
  message: string;
}

const MESSAGES: Record<Exclude<RedeemState, "valid">, string> = {
  invalid: "That promo code isn't valid.",
  inactive: "That promo code is no longer active.",
  expired: "That promo code has expired.",
  "limit-reached": "That promo code has reached its redemption limit.",
  used: "This promo code has already been used for this email or report.",
};

// Lightweight email sanity check — the real anti-abuse guard is the unique
// (code, email) index, this just rejects obvious garbage before a DB round-trip.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isUniqueViolation(error: unknown): boolean {
  // drizzle wraps the driver error in a `_DrizzleQueryError`; the real Postgres
  // error (whose `code` is "23505" for a unique violation) sits on `.cause`.
  // Walk the cause chain so we classify the duplicate as `used` rather than 500.
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth++) {
    if (
      typeof current === "object" &&
      current !== null &&
      "code" in current &&
      (current as { code?: string }).code === "23505"
    ) {
      return true;
    }
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

/** Thrown inside the transaction to roll back a reservation that lost the race. */
class PromoRaceLostError extends Error {}

function isExpired(promo: Pick<PromoCode, "expiresAt">): boolean {
  return !!promo.expiresAt && promo.expiresAt.getTime() <= Date.now();
}

function isLimitReached(promo: Pick<PromoCode, "maxRedemptions" | "redemptionCount">): boolean {
  return promo.maxRedemptions != null && promo.redemptionCount >= promo.maxRedemptions;
}

/**
 * Ensure the default trial code exists. Idempotent — a unique index on
 * `code` means repeated startups are no-ops.
 */
export async function seedDefaultPromoCode(): Promise<void> {
  try {
    await db
      .insert(promoCodesTable)
      .values({
        code: DEFAULT_TRIAL_CODE,
        description: "Default homeowner free trial — one free report per email.",
        entitlementType: "promo_trial",
        grantedPlan: "homeowner_report",
        maxRedemptions: null,
        active: true,
      })
      .onConflictDoNothing({ target: promoCodesTable.code });
    logger.info({ code: DEFAULT_TRIAL_CODE }, "Default promo code ensured");
  } catch (error: unknown) {
    logger.warn({ err: error }, "Default promo code seed skipped");
  }
}

/**
 * Redeem a promo code against a project. Grants the same entitlement fields a
 * Stripe `homeowner_report` purchase would, so the report gate, paid results
 * view, and email delivery all work unchanged.
 *
 * Race-proof: a redemption row is reserved first (unique (code,email) and
 * (code,project) indexes reject duplicates), then the counter is incremented
 * with a guarded UPDATE; if either step loses a race the whole transaction
 * rolls back.
 */
export async function redeemPromoCode(params: {
  projectId: number;
  rawCode: string;
  rawEmail: string;
  ipHash?: string | null;
}): Promise<RedeemResult> {
  const code = params.rawCode.trim().toUpperCase();
  const email = params.rawEmail.trim().toLowerCase();

  if (!code) return { state: "invalid", message: MESSAGES.invalid };
  if (!EMAIL_RE.test(email)) {
    return { state: "invalid", message: "Enter a valid email address to receive your report." };
  }

  const [promo] = await db
    .select()
    .from(promoCodesTable)
    .where(eq(promoCodesTable.code, code));

  if (!promo) return { state: "invalid", message: MESSAGES.invalid };
  if (!promo.active) return { state: "inactive", message: MESSAGES.inactive };
  if (isExpired(promo)) return { state: "expired", message: MESSAGES.expired };
  if (isLimitReached(promo)) return { state: "limit-reached", message: MESSAGES["limit-reached"] };

  try {
    return await db.transaction(async (tx) => {
      // 1) Reserve the slot. Unique indexes make this the race-proof gate.
      try {
        await tx.insert(promoRedemptionsTable).values({
          promoCodeId: promo.id,
          projectId: params.projectId,
          email,
          ipHash: params.ipHash ?? null,
        });
      } catch (error: unknown) {
        if (isUniqueViolation(error)) {
          return { state: "used", message: MESSAGES.used };
        }
        throw error;
      }

      // 2) Atomically increment the counter only while the code is still valid.
      const incremented = await tx
        .update(promoCodesTable)
        .set({
          redemptionCount: sql`${promoCodesTable.redemptionCount} + 1`,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(promoCodesTable.id, promo.id),
            eq(promoCodesTable.active, true),
            or(isNull(promoCodesTable.expiresAt), gt(promoCodesTable.expiresAt, new Date())),
            or(
              isNull(promoCodesTable.maxRedemptions),
              lt(promoCodesTable.redemptionCount, promoCodesTable.maxRedemptions),
            ),
          ),
        )
        .returning({ id: promoCodesTable.id });

      if (incremented.length === 0) {
        // Code flipped inactive / expired / hit its limit between read and write.
        throw new PromoRaceLostError();
      }

      // 3) Grant the entitlement (mirrors a homeowner_report Stripe purchase).
      await tx
        .update(projectsTable)
        .set({
          paidAt: new Date(),
          paymentStatus: "paid",
          entitlementType: promo.entitlementType,
          selectedPlan: promo.grantedPlan,
          paidAmount: 0,
          reportCredits: 1,
          creditsUsed: 0,
          purchaserEmail: email,
          stripeSessionId: `promo_${code}_${params.projectId}`,
          stripePriceId: null,
        })
        .where(eq(projectsTable.id, params.projectId));

      return { state: "valid", message: "Code applied — your full report is unlocked." };
    });
  } catch (error: unknown) {
    if (error instanceof PromoRaceLostError) {
      // Re-read to report the precise reason the guarded update failed.
      const [fresh] = await db
        .select()
        .from(promoCodesTable)
        .where(eq(promoCodesTable.id, promo.id));
      if (fresh && !fresh.active) return { state: "inactive", message: MESSAGES.inactive };
      if (fresh && isExpired(fresh)) return { state: "expired", message: MESSAGES.expired };
      return { state: "limit-reached", message: MESSAGES["limit-reached"] };
    }
    throw error;
  }
}
