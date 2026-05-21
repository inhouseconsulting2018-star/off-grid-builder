import { randomUUID } from "crypto";
import { Router, type IRouter } from "express";
import { eq, desc } from "drizzle-orm";
import { db, projectsTable, settingsTable } from "@workspace/db";
import {
  CreateProjectBody,
  UpdateProjectBody,
  GetProjectParams,
  UpdateProjectParams,
  DeleteProjectParams,
  CalculateProjectParams,
} from "@workspace/api-zod";
import { geocodeAddress } from "../services/geocoding/geocodingService";
import { runCalculationsWithPVWatts } from "../services/solar/calculationEngine";
import { logger } from "../utils/logger";
import { env } from "../config/env";
import { getUncachableStripeClient } from "../services/payments/stripeClient";
import {
  requireAdminToken,
  resolveProjectByToken,
  sanitizeProject,
  previewProject,
} from "../middlewares/auth";

const router: IRouter = Router();

// ── Helper: geocode a project row and persist lat/lon/locationAccuracy ─────────
async function geocodeAndPersist(project: {
  id: number;
  address: string;
  city: string;
  state: string;
  zip: string;
  useManualCoords: boolean;
  lat: number | null;
  lon: number | null;
}): Promise<void> {
  if (project.useManualCoords) return;
  if (!project.city || !project.state) return;

  try {
    const result = await geocodeAddress({
      address: project.address,
      city: project.city,
      state: project.state,
      zip: project.zip,
    });

    if (result) {
      await db
        .update(projectsTable)
        .set({ lat: result.lat, lon: result.lon, locationAccuracy: result.accuracy })
        .where(eq(projectsTable.id, project.id));
      logger.info({ id: project.id, accuracy: result.accuracy }, "Project geocoded");
    }
  } catch (err) {
    logger.warn({ err, id: project.id }, "Geocode failed — project saved without coords");
  }
}

// ── GET /projects — admin only ─────────────────────────────────────────────────
router.get("/projects", requireAdminToken, async (_req, res): Promise<void> => {
  const projects = await db
    .select()
    .from(projectsTable)
    .orderBy(desc(projectsTable.createdAt));
  res.json(projects.map(sanitizeProject));
});

// ── POST /projects ─────────────────────────────────────────────────────────────
// Public — creates a new project and returns a one-time accessToken.
router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const accessToken = randomUUID();

  const [project] = await db
    .insert(projectsTable)
    .values({ ...parsed.data, accessToken })
    .returning();

  void geocodeAndPersist({
    id: project.id,
    address: project.address,
    city: project.city,
    state: project.state,
    zip: project.zip,
    useManualCoords: project.useManualCoords,
    lat: project.lat,
    lon: project.lon,
  });

  // Return the full row including accessToken — this is the ONLY time it is disclosed.
  res.status(201).json(project);
});

// ── GET /projects/stats/summary — admin only ───────────────────────────────────
router.get("/projects/stats/summary", requireAdminToken, async (_req, res): Promise<void> => {
  const projects = await db.select().from(projectsTable).orderBy(desc(projectsTable.createdAt));

  const totalProjects = projects.length;
  let totalSystemKw = 0;
  let offGridCount = 0;
  let gridTiedCount = 0;
  let hybridCount = 0;

  for (const p of projects) {
    const calc = p.calculationResult as Record<string, number> | null;
    if (calc?.adjustedArraySizeKw) totalSystemKw += calc.adjustedArraySizeKw;
    if (p.systemType === "off-grid") offGridCount++;
    else if (p.systemType === "grid-tied") gridTiedCount++;
    else if (p.systemType === "hybrid") hybridCount++;
  }

  res.json({
    totalProjects,
    totalSystemKw: Math.round(totalSystemKw * 100) / 100,
    avgSystemKw: totalProjects > 0 ? Math.round((totalSystemKw / totalProjects) * 100) / 100 : 0,
    offGridCount,
    gridTiedCount,
    hybridCount,
    recentProjects: projects.slice(0, 5).map(sanitizeProject),
  });
});

// ── GET /projects/:id ──────────────────────────────────────────────────────────
// Requires valid accessToken (or admin token).
// Returns full calculationResult only if project is paid; preview otherwise.
router.get("/projects/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetProjectParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const project = await resolveProjectByToken(req, params.data.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  if (!project.paidAt) {
    res.json(previewProject(project));
    return;
  }

  res.json(sanitizeProject(project));
});

// ── PATCH /projects/:id ────────────────────────────────────────────────────────
// Requires valid accessToken or admin token.
router.patch("/projects/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateProjectParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const existingProject = await resolveProjectByToken(req, params.data.id);
  if (!existingProject) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [project] = await db
    .update(projectsTable)
    .set(parsed.data)
    .where(eq(projectsTable.id, params.data.id))
    .returning();

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const body = parsed.data as Record<string, unknown>;
  const addressChanged = "address" in body || "city" in body || "state" in body || "zip" in body;
  const manualDisabled = "useManualCoords" in body && body["useManualCoords"] === false;
  if ((addressChanged || manualDisabled) && !project.useManualCoords) {
    void geocodeAndPersist({
      id: project.id,
      address: project.address,
      city: project.city,
      state: project.state,
      zip: project.zip,
      useManualCoords: project.useManualCoords,
      lat: project.lat,
      lon: project.lon,
    });
  }

  res.json(sanitizeProject(project));
});

// ── DELETE /projects/:id ───────────────────────────────────────────────────────
// Requires valid accessToken or admin token.
router.delete("/projects/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteProjectParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const existingProject = await resolveProjectByToken(req, params.data.id);
  if (!existingProject) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const [project] = await db
    .delete(projectsTable)
    .where(eq(projectsTable.id, params.data.id))
    .returning();

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.sendStatus(204);
});

// ── POST /projects/:id/regeocode ───────────────────────────────────────────────
// Requires valid accessToken or admin token.
router.post("/projects/:id/regeocode", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project ID" }); return; }

  const project = await resolveProjectByToken(req, id);
  if (!project) { res.status(404).json({ error: "Project not found" }); return; }

  if (!project.city || !project.state) {
    res.status(400).json({ error: "Project is missing city/state — cannot geocode" });
    return;
  }

  const result = await geocodeAddress({
    address: project.address,
    city: project.city,
    state: project.state,
    zip: project.zip,
  });

  if (!result) {
    res.status(422).json({ error: "Could not geocode this address — try adding more detail or use manual coordinates" });
    return;
  }

  const [updated] = await db
    .update(projectsTable)
    .set({ lat: result.lat, lon: result.lon, locationAccuracy: result.accuracy, useManualCoords: false })
    .where(eq(projectsTable.id, id))
    .returning();

  logger.info({ id, accuracy: result.accuracy }, "Project re-geocoded via API");
  res.json(sanitizeProject(updated));
});

// ── POST /projects/:id/calculate ───────────────────────────────────────────────
// Requires valid accessToken or admin token.
// Runs calculations and persists results.
// Returns full data if paid; preview-only (system sizing without BOM/costs) if unpaid.
router.post("/projects/:id/calculate", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = CalculateProjectParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const project = await resolveProjectByToken(req, params.data.id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const [settingsRow] = await db.select().from(settingsTable).limit(1);
  if (!settingsRow) {
    res.status(500).json({ error: "Settings not initialized" });
    return;
  }

  const finalResult = await runCalculationsWithPVWatts(
    {
      address: project.address,
      city: project.city,
      annualKwh: project.annualKwh,
      systemType: project.systemType,
      shadeLevel: project.shadeLevel,
      backupHours: project.backupHours,
      customBackupHours: project.customBackupHours,
      batteryChemistry: project.batteryChemistry,
      hasGenerator: project.hasGenerator,
      wantsGenerator: project.wantsGenerator,
      generatorKw: project.generatorKw,
      highWindArea: project.highWindArea,
      snowArea: project.snowArea,
      availableSqft: project.availableSqft,
      budgetTier: project.budgetTier,
      utilityRatePerKwh: project.utilityRatePerKwh,
      state: project.state,
      zip: project.zip,
      installationType: project.installationType,
      roofPitch: project.roofPitch,
      roofDirection: project.roofDirection,
      arrayLat: project.arrayLat,
      arrayLon: project.arrayLon,
    },
    settingsRow,
  );

  await db
    .update(projectsTable)
    .set({ calculationResult: finalResult })
    .where(eq(projectsTable.id, params.data.id));

  if (!project.paidAt) {
    const calc = finalResult as Record<string, unknown>;
    res.json({
      preview: true,
      paid: false,
      arraySizeKw: calc["arraySizeKw"],
      adjustedArraySizeKw: calc["adjustedArraySizeKw"],
      numPanels: calc["numPanels"],
      inverterSizeKw: calc["inverterSizeKw"],
      batteryUsableKwh: calc["batteryUsableKwh"],
      yearlyProductionKwh: calc["yearlyProductionKwh"],
      peakSunHours: calc["peakSunHours"],
      pvwattsSource: calc["pvwattsSource"],
      notes: (calc["notes"] as string[] | undefined)?.slice(0, 2) ?? [],
    });
    return;
  }

  res.json(finalResult);
});

// ── GET /projects/:id/report ───────────────────────────────────────────────────
// Requires valid accessToken AND payment entitlement (paidAt must be set).
// Returns full calculation result and BOM data as JSON.
// PDF rendering is a TODO — this endpoint enforces the payment gate now.
router.get("/projects/:id/report", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project ID" }); return; }

  const project = await resolveProjectByToken(req, id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  if (!project.paidAt) {
    res.status(402).json({
      error: "Payment required",
      message: "Purchase the full report to access system design, BOM, and cost analysis.",
      projectId: id,
    });
    return;
  }

  res.json({
    project: sanitizeProject(project),
    report: {
      generatedAt: new Date().toISOString(),
      paidAt: project.paidAt,
      calculationResult: project.calculationResult,
    },
  });
});

// ── POST /projects/:id/create-checkout-session ─────────────────────────────────
// Requires valid accessToken or admin token.
router.post("/projects/:id/create-checkout-session", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project ID" }); return; }

  const project = await resolveProjectByToken(req, id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  if (project.paidAt) {
    res.status(400).json({ error: "Project is already unlocked" });
    return;
  }

  const productType = (req.body?.productType as string) || "homeowner";

  const priceMap: Record<string, string | undefined> = {
    homeowner: env.stripePriceId,
    property_pack: env.stripePropertyPackPriceId,
    contractor_annual: env.stripeContractorAnnualPriceId,
  };

  const priceId = priceMap[productType] ?? env.stripePriceId;
  if (!priceId) {
    res.status(500).json({
      error: "Stripe price not configured for this product type.",
    });
    return;
  }

  const isSubscription = productType === "contractor_annual";
  const stripe = await getUncachableStripeClient();

  const accessToken = req.headers["x-access-token"] ?? req.query["accessToken"] ?? "";
  // Prefer explicit FRONTEND_URL (set in production secrets) so redirects always
  // go to the correct domain even when the API and frontend are on separate origins.
  // Fall back to reconstructing from the request headers (works in dev).
  const baseOrigin = env.frontendUrl?.replace(/\/$/, "")
    ?? `${req.protocol}://${req.get("x-forwarded-host") ?? req.get("host") ?? "localhost"}`;
  const successUrl = `${baseOrigin}/payment-success?projectId=${id}&session_id={CHECKOUT_SESSION_ID}&accessToken=${accessToken}`;
  const cancelUrl = `${baseOrigin}/payment-cancel?projectId=${id}&accessToken=${accessToken}`;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const session = await stripe.checkout.sessions.create({
    automatic_payment_methods: { enabled: true },
    line_items: [{ price: priceId, quantity: 1 }],
    mode: isSubscription ? "subscription" : "payment",
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata: { projectId: String(id), productType },
  } as any);

  res.json({ url: session.url });
});

export default router;
