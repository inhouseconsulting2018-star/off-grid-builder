import { randomUUID } from "crypto";
import { Router, type IRouter, type Request, type Response } from "express";
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
import { getFrontendOrigin } from "../config/frontendOrigin";
import { getUncachableStripeClient } from "../services/payments/stripeClient";
import { buildPaidReport, renderReportPdfBuffer, renderReportPdfHtml } from "../services/reports/reportService";
import { getCheckoutPlan, parseCheckoutPlan } from "../services/payments/plans";
import { hasActivePaidEntitlement } from "../services/payments/entitlements";
import {
  requireAdminToken,
  extractAccessToken,
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
  locationAccuracy?: string | null;
}): Promise<void> {
  if (project.useManualCoords) {
    if (project.lat != null && project.lon != null && project.locationAccuracy !== "manual_coordinates") {
      await db.update(projectsTable).set({ locationAccuracy: "manual_coordinates" }).where(eq(projectsTable.id, project.id));
    }
    return;
  }
  if (!project.city || !project.state) return;

  try {
    const result = await geocodeAddress({
      address: project.address,
      city: project.city,
      state: project.state,
      zip: project.zip,
    });

    if (result) {
      if (
        (project.locationAccuracy === "exact_address" || project.locationAccuracy === "exact") &&
        project.lat != null &&
        project.lon != null &&
        result.accuracy !== "exact_address"
      ) {
        logger.info({ id: project.id, attemptedAccuracy: result.accuracy }, "Preserving existing exact geocode");
        return;
      }
      await db
        .update(projectsTable)
        .set({ lat: result.lat, lon: result.lon, locationAccuracy: result.accuracy })
        .where(eq(projectsTable.id, project.id));
      logger.info({ id: project.id, accuracy: result.accuracy }, "Project geocoded");
    } else {
      await db.update(projectsTable).set({ locationAccuracy: "failed" }).where(eq(projectsTable.id, project.id));
    }
  } catch (err) {
    await db.update(projectsTable).set({ locationAccuracy: "failed" }).where(eq(projectsTable.id, project.id));
    logger.warn({ err, id: project.id }, "Geocode failed — project saved without coords");
  }
}

function range(value: unknown, spreadPct: number, minSpread: number, decimals = 0) {
  const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
  const spread = Math.max(Math.abs(numeric) * spreadPct, minSpread);
  const factor = 10 ** decimals;
  return {
    low: Math.max(0, Math.floor((numeric - spread) * factor) / factor),
    high: Math.ceil((numeric + spread) * factor) / factor,
  };
}

async function createCheckoutSession(req: Request, res: Response, input: {
  projectId: number;
  accessToken: string;
  selectedPlan: unknown;
}): Promise<void> {
  if (!Number.isFinite(input.projectId)) {
    res.status(400).json({ error: "Invalid project ID" });
    return;
  }

  const project = await resolveProjectByToken(req, input.projectId);
  if (!project || project.accessToken !== input.accessToken) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  const planId = parseCheckoutPlan(input.selectedPlan);
  if (!planId) {
    res.status(400).json({ error: "A valid selectedPlan is required" });
    return;
  }
  const plan = getCheckoutPlan(planId);
  if (project.paidAt && plan.id === "homeowner_report") {
    res.status(400).json({ error: "Project is already unlocked" });
    return;
  }

  const priceId = plan.priceId;
  if (!priceId) {
    res.status(500).json({ error: `${plan.envName} is not configured. Set it in Replit Secrets.` });
    return;
  }

  const stripe = await getUncachableStripeClient();
  const requestOrigin = `${req.protocol}://${req.get("x-forwarded-host") ?? req.get("host") ?? "localhost"}`;
  const baseOrigin = getFrontendOrigin(requestOrigin);
  const successUrl = `${baseOrigin}/payment-success?projectId=${project.id}&accessToken=${encodeURIComponent(project.accessToken ?? "")}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseOrigin}/payment-cancel?projectId=${project.id}&accessToken=${encodeURIComponent(project.accessToken ?? "")}`;
  const metadata = {
    projectId: String(project.id),
    accessToken: project.accessToken ?? "",
    selectedPlan: plan.id,
    productType: plan.id,
    creditAmount: String(plan.includedCredits),
    stripePriceId: priceId,
  };

  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    mode: plan.checkoutMode,
    ...(plan.checkoutMode === "subscription" ? { subscription_data: { metadata } } : {}),
    success_url: successUrl,
    cancel_url: cancelUrl,
    metadata,
  });

  res.json({ url: session.url });
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
    .values({
      ...parsed.data,
      accessToken,
      ...(parsed.data.useManualCoords && parsed.data.lat != null && parsed.data.lon != null
        ? { locationAccuracy: "manual_coordinates" }
        : {}),
    })
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
    locationAccuracy: project.locationAccuracy,
  });

  // Return the full row including accessToken — this is the ONLY time it is disclosed.
  res.status(201).json(project);
});

// ── GET /projects/purchases — admin only ───────────────────────────────────────
// Returns all projects that have completed payment, sorted by paidAt desc.
router.get("/projects/purchases", requireAdminToken, async (_req, res): Promise<void> => {
  const purchases = await db
    .select({
      id:              projectsTable.id,
      name:            projectsTable.name,
      address:         projectsTable.address,
      city:            projectsTable.city,
      state:           projectsTable.state,
      zip:             projectsTable.zip,
      systemType:      projectsTable.systemType,
      paidAt:          projectsTable.paidAt,
      paidAmount:      projectsTable.paidAmount,
      selectedPlan:    projectsTable.selectedPlan,
      entitlementType: projectsTable.entitlementType,
      reportCredits:   projectsTable.reportCredits,
      creditsUsed:     projectsTable.creditsUsed,
      paymentStatus:   projectsTable.paymentStatus,
      stripeSessionId: projectsTable.stripeSessionId,
      purchaserEmail:  projectsTable.purchaserEmail,
      createdAt:       projectsTable.createdAt,
    })
    .from(projectsTable)
    .where(eq(projectsTable.paymentStatus, "paid"))
    .orderBy(desc(projectsTable.paidAt));

  res.json(purchases);
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

  if (!hasActivePaidEntitlement(project)) {
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
    .set({
      ...parsed.data,
      ...(parsed.data.useManualCoords && parsed.data.lat != null && parsed.data.lon != null
        ? { locationAccuracy: "manual_coordinates" }
        : {}),
    })
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
      locationAccuracy: project.locationAccuracy,
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

  if (
    (project.locationAccuracy === "exact_address" || project.locationAccuracy === "exact") &&
    project.lat != null &&
    project.lon != null &&
    result.accuracy !== "exact_address"
  ) {
    logger.info({ id, attemptedAccuracy: result.accuracy }, "Preserving existing exact geocode during re-geocode");
    res.json(sanitizeProject(project));
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

  if (!hasActivePaidEntitlement(project)) {
    const calc = finalResult as Record<string, unknown>;
    res.json({
      preview: true,
      paid: false,
      systemSizeKwRange: range(calc["adjustedArraySizeKw"], 0.12, 0.5, 1),
      panelCountRange: range(calc["numPanels"], 0.12, 2),
      inverterSizeKwRange: range(calc["inverterSizeKw"], 0.15, 1, 1),
      batteryUsableKwhRange: range(calc["batteryUsableKwh"], 0.15, 2, 1),
      yearlyProductionKwhRange: range(calc["yearlyProductionKwh"], 0.15, 750),
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

  if (!hasActivePaidEntitlement(project)) {
    res.status(402).json({
      error: "Payment required",
      message: "Purchase the full report to access system design, BOM, and cost analysis.",
      projectId: id,
    });
    return;
  }

  const report = buildPaidReport(project);
  if (!report) {
    res.status(500).json({ error: "Report is not available" });
    return;
  }
  res.json(report);
});

router.get("/projects/:id/report.pdf", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project ID" }); return; }

  const project = await resolveProjectByToken(req, id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!hasActivePaidEntitlement(project)) {
    res.status(402).json({ error: "Payment required", message: "Purchase the full report to download the PDF." });
    return;
  }

  const report = buildPaidReport(project);
  if (!report) { res.status(500).json({ error: "Report is not available" }); return; }
  const pdf = renderReportPdfBuffer(report);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="solar-report-${project.id}.pdf"`);
  res.send(pdf);
});

router.get("/projects/:id/report.html", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project ID" }); return; }

  const project = await resolveProjectByToken(req, id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  if (!hasActivePaidEntitlement(project)) {
    res.status(402).json({ error: "Payment required", message: "Purchase the full report to view printable report HTML." });
    return;
  }

  const report = buildPaidReport(project);
  if (!report) { res.status(500).json({ error: "Report is not available" }); return; }
  res.type("html").send(renderReportPdfHtml(report));
});

// ── POST /projects/:id/create-checkout-session ─────────────────────────────────
// Requires valid accessToken or admin token.
router.post("/projects/:id/create-checkout-session", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  const selectedPlan = req.body?.selectedPlan ?? req.body?.productType;
  await createCheckoutSession(req, res, {
    projectId: id,
    accessToken: extractAccessToken(req) ?? "",
    selectedPlan,
  });
});

router.post("/stripe/create-checkout-session", async (req, res): Promise<void> => {
  await createCheckoutSession(req, res, {
    projectId: Number(req.body?.projectId),
    accessToken: typeof req.body?.accessToken === "string" ? req.body.accessToken : "",
    selectedPlan: req.body?.selectedPlan,
  });
});

export default router;
