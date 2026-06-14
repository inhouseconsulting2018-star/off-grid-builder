import { Router, type IRouter } from "express";
import { asc, count, desc, eq } from "drizzle-orm";
import {
  db,
  promoCodesTable,
  promoRedemptionsTable,
} from "@workspace/db";
import { requireAdminToken, resolveProjectByToken } from "../middlewares/auth";
import {
  isValidPromoEmail,
  normalizePromoCode,
  promoRejectionMessage,
  redeemPromoCode,
} from "../services/payments/promoCodes";
import { hasActiveReportEntitlement } from "../services/payments/entitlements";

const router: IRouter = Router();

function parseOptionalDate(value: unknown): Date | null | "invalid" {
  if (value == null || value === "") return null;
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

function parsePositiveInteger(value: unknown, fallback: number | null): number | null | "invalid" {
  if (value == null || value === "") return fallback;
  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : "invalid";
}

router.get("/promo-codes", requireAdminToken, async (_req, res): Promise<void> => {
  const codes = await db.select().from(promoCodesTable).orderBy(asc(promoCodesTable.code));
  const totals = await db
    .select({
      promoCodeId: promoRedemptionsTable.promoCodeId,
      value: count(),
    })
    .from(promoRedemptionsTable)
    .groupBy(promoRedemptionsTable.promoCodeId);
  const totalByCode = new Map(totals.map((row) => [row.promoCodeId, Number(row.value)]));
  const redemptions = await db
    .select()
    .from(promoRedemptionsTable)
    .orderBy(desc(promoRedemptionsTable.redeemedAt));

  res.json(codes.map((code) => ({
    ...code,
    redemptionCount: totalByCode.get(code.id) ?? 0,
    redemptions: redemptions.filter((redemption) => redemption.promoCodeId === code.id),
  })));
});

router.post("/promo-codes", requireAdminToken, async (req, res): Promise<void> => {
  const code = normalizePromoCode(String(req.body?.code ?? ""));
  const maxRedemptions = parsePositiveInteger(req.body?.maxRedemptions, null);
  const maxRedemptionsPerEmail = parsePositiveInteger(req.body?.maxRedemptionsPerEmail, 1);
  const expiresAt = parseOptionalDate(req.body?.expiresAt);

  if (!/^[A-Z0-9_-]{4,40}$/.test(code)) {
    res.status(400).json({ error: "Code must be 4-40 characters using letters, numbers, hyphens, or underscores." });
    return;
  }
  if (maxRedemptions === "invalid" || maxRedemptionsPerEmail === "invalid" || expiresAt === "invalid") {
    res.status(400).json({ error: "Enter valid positive usage limits and expiration date." });
    return;
  }

  try {
    const [created] = await db.insert(promoCodesTable).values({
      code,
      purpose: String(req.body?.purpose ?? "Free professional solar report").trim(),
      active: req.body?.active !== false,
      maxRedemptions,
      maxRedemptionsPerEmail: maxRedemptionsPerEmail ?? 1,
      expiresAt,
    }).returning();
    res.status(201).json(created);
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(409).json({ error: "That promo code already exists." });
      return;
    }
    throw error;
  }
});

router.patch("/promo-codes/:id", requireAdminToken, async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const maxRedemptions = parsePositiveInteger(req.body?.maxRedemptions, null);
  const maxRedemptionsPerEmail = parsePositiveInteger(req.body?.maxRedemptionsPerEmail, 1);
  const expiresAt = parseOptionalDate(req.body?.expiresAt);
  if (!Number.isInteger(id) || maxRedemptions === "invalid" || maxRedemptionsPerEmail === "invalid" || expiresAt === "invalid") {
    res.status(400).json({ error: "Enter valid promo code settings." });
    return;
  }

  const [updated] = await db
    .update(promoCodesTable)
    .set({
      purpose: String(req.body?.purpose ?? "Free professional solar report").trim(),
      active: req.body?.active !== false,
      maxRedemptions,
      maxRedemptionsPerEmail: maxRedemptionsPerEmail ?? 1,
      expiresAt,
    })
    .where(eq(promoCodesTable.id, id))
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Promo code not found." });
    return;
  }
  res.json(updated);
});

router.post("/projects/:id/redeem-promo", async (req, res): Promise<void> => {
  const projectId = Number(req.params.id);
  if (!Number.isInteger(projectId)) {
    res.status(400).json({ error: "Invalid project ID." });
    return;
  }
  const project = await resolveProjectByToken(req, projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found." });
    return;
  }
  if (hasActiveReportEntitlement(project)) {
    res.status(409).json({ error: "This report is already unlocked." });
    return;
  }
  if (!project.calculationResult) {
    res.status(409).json({ error: "Generate the solar estimate before redeeming a trial code." });
    return;
  }

  const code = String(req.body?.code ?? "");
  const email = String(req.body?.email ?? "");
  if (!isValidPromoEmail(email)) {
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  try {
    const decision = await redeemPromoCode({ projectId, code, email });
    if (!decision.ok) {
      res.status(400).json({
        error: promoRejectionMessage(decision.reason),
        reason: decision.reason,
      });
      return;
    }
    res.json({
      unlocked: true,
      message: "Trial code accepted. One professional report is now unlocked.",
    });
  } catch (error) {
    if ((error as { code?: string }).code === "23505") {
      res.status(400).json({
        error: "This trial code has already been used by this email or project.",
        reason: "already_used",
      });
      return;
    }
    throw error;
  }
});

export default router;
