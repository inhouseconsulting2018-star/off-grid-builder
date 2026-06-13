import { Router, type IRouter } from "express";
import { desc, eq } from "drizzle-orm";
import {
  db,
  promoCodesTable,
  promoRedemptionsTable,
  projectsTable,
} from "@workspace/db";
import { requireAdminToken } from "../middlewares/auth";
import { isUniqueViolation } from "../services/promo/promoService";
import { logger } from "../utils/logger";

const router: IRouter = Router();

const INVALID = Symbol("invalid");

/** Parse a nullable timestamp from an ISO string / number; "" and null clear it. */
function parseDate(v: unknown): Date | null | typeof INVALID {
  if (v === null || v === "") return null;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return isNaN(d.getTime()) ? INVALID : d;
  }
  if (v instanceof Date) return isNaN(v.getTime()) ? INVALID : v;
  return INVALID;
}

/** Parse a positive-integer-or-null redemption cap. "" and null mean unlimited. */
function parseMaxRedemptions(v: unknown): number | null | typeof INVALID {
  if (v === null || v === "") return null;
  const n = typeof v === "number" ? v : parseInt(String(v), 10);
  if (!Number.isInteger(n) || n <= 0) return INVALID;
  return n;
}

// ── GET /promo-codes — admin only ──────────────────────────────────────────────
// Lists every promo code (newest first), including its live redemption count.
router.get("/promo-codes", requireAdminToken, async (_req, res): Promise<void> => {
  const codes = await db
    .select()
    .from(promoCodesTable)
    .orderBy(desc(promoCodesTable.createdAt));
  res.json(codes);
});

// ── GET /promo-codes/:id/redemptions — admin only ──────────────────────────────
// Lists who redeemed a given code (email + project), newest first.
router.get("/promo-codes/:id/redemptions", requireAdminToken, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid promo code ID" }); return; }

  const rows = await db
    .select({
      id:          promoRedemptionsTable.id,
      email:       promoRedemptionsTable.email,
      projectId:   promoRedemptionsTable.projectId,
      projectName: projectsTable.name,
      redeemedAt:  promoRedemptionsTable.redeemedAt,
    })
    .from(promoRedemptionsTable)
    .leftJoin(projectsTable, eq(promoRedemptionsTable.projectId, projectsTable.id))
    .where(eq(promoRedemptionsTable.promoCodeId, id))
    .orderBy(desc(promoRedemptionsTable.redeemedAt));

  res.json(rows);
});

// ── POST /promo-codes — admin only ─────────────────────────────────────────────
// Creates a new promo code. Code is stored normalized to UPPERCASE; duplicates
// return 409.
router.post("/promo-codes", requireAdminToken, async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;

  const code = typeof body.code === "string" ? body.code.trim().toUpperCase() : "";
  if (!code) { res.status(400).json({ error: "A promo code is required." }); return; }
  if (code.length > 64) { res.status(400).json({ error: "Promo code is too long (max 64 characters)." }); return; }

  const values: Record<string, unknown> = { code };

  if (typeof body.description === "string") values.description = body.description.trim();
  if (typeof body.entitlementType === "string" && body.entitlementType.trim()) {
    values.entitlementType = body.entitlementType.trim();
  }
  if (typeof body.grantedPlan === "string" && body.grantedPlan.trim()) {
    values.grantedPlan = body.grantedPlan.trim();
  }
  if (typeof body.active === "boolean") values.active = body.active;

  if ("maxRedemptions" in body) {
    const max = parseMaxRedemptions(body.maxRedemptions);
    if (max === INVALID) { res.status(400).json({ error: "Redemption limit must be a positive whole number, or blank for unlimited." }); return; }
    values.maxRedemptions = max;
  }

  if ("expiresAt" in body) {
    const exp = parseDate(body.expiresAt);
    if (exp === INVALID) { res.status(400).json({ error: "Expiry date is invalid." }); return; }
    values.expiresAt = exp;
  }

  try {
    const [created] = await db.insert(promoCodesTable).values(values as never).returning();
    res.status(201).json(created);
  } catch (error: unknown) {
    if (isUniqueViolation(error)) {
      res.status(409).json({ error: "A promo code with that name already exists." });
      return;
    }
    logger.error({ err: error }, "Create promo code failed");
    res.status(500).json({ error: "Failed to create promo code." });
  }
});

// ── PATCH /promo-codes/:id — admin only ────────────────────────────────────────
// Updates active flag, redemption limit, expiry, or description. The code itself
// is immutable so existing redemption links stay valid.
router.patch("/promo-codes/:id", requireAdminToken, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid promo code ID" }); return; }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if ("description" in body) {
    updates.description = typeof body.description === "string" ? body.description.trim() : "";
  }
  if ("active" in body) {
    if (typeof body.active !== "boolean") { res.status(400).json({ error: "active must be true or false." }); return; }
    updates.active = body.active;
  }
  if ("maxRedemptions" in body) {
    const max = parseMaxRedemptions(body.maxRedemptions);
    if (max === INVALID) { res.status(400).json({ error: "Redemption limit must be a positive whole number, or blank for unlimited." }); return; }
    updates.maxRedemptions = max;
  }
  if ("expiresAt" in body) {
    const exp = parseDate(body.expiresAt);
    if (exp === INVALID) { res.status(400).json({ error: "Expiry date is invalid." }); return; }
    updates.expiresAt = exp;
  }

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update." });
    return;
  }
  updates.updatedAt = new Date();

  const [updated] = await db
    .update(promoCodesTable)
    .set(updates)
    .where(eq(promoCodesTable.id, id))
    .returning();

  if (!updated) { res.status(404).json({ error: "Promo code not found." }); return; }
  res.json(updated);
});

export default router;
