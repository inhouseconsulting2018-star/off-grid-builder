import { Router, type IRouter } from "express";
import { desc, eq, inArray } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
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
import { getOrCreateSettings } from "../services/settings/settingsService";
import { logger } from "../utils/logger";
import { requireAdmin } from "../middlewares/adminAuth";
import { buildPaidReport, buildPreview, renderReportPdfBuffer, renderReportPdfHtml } from "../services/reports/reportService";
import { createAccessToken, getAuthorizedProject, isAdminRequest } from "../services/projects/projectAccess";

const router: IRouter = Router();

function parseId(raw: unknown): number | null {
  const value = Array.isArray(raw) ? raw[0] : raw;
  const id = parseInt(String(value), 10);
  return Number.isFinite(id) ? id : null;
}

function parseProjectRefs(raw: unknown): Array<{ id: number; accessToken: string }> {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.flatMap((item) => {
      const id = typeof item === "object" && item && "id" in item ? Number((item as { id: unknown }).id) : NaN;
      const accessToken = typeof item === "object" && item && "accessToken" in item ? String((item as { accessToken: unknown }).accessToken) : "";
      return Number.isFinite(id) && accessToken ? [{ id, accessToken }] : [];
    });
  } catch {
    return [];
  }
}

async function calculateAndPersist(project: typeof projectsTable.$inferSelect) {
  const settingsRow = await getOrCreateSettings();
  if (!Number.isFinite(project.annualKwh) || project.annualKwh <= 0) {
    throw new Error("Annual kWh must be greater than 0 before calculating.");
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
  await db.update(projectsTable).set({ calculationResult: finalResult }).where(eq(projectsTable.id, project.id));
  return finalResult;
}

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
  // Never overwrite manually-entered coordinates
  if (project.useManualCoords) {
    if (project.lat != null && project.lon != null && project.locationAccuracy !== "manual_coordinates") {
      await db.update(projectsTable).set({ locationAccuracy: "manual_coordinates" }).where(eq(projectsTable.id, project.id));
    }
    return;
  }

  // Only geocode if we have enough address info
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
        logger.info(
          { id: project.id, existingAccuracy: project.locationAccuracy, attemptedAccuracy: result.accuracy },
          "Preserving existing exact geocode; refusing to downgrade to approximate coordinates"
        );
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
    // Geocoding failure is non-fatal — project is still saved, map falls back gracefully
    logger.warn({ err, id: project.id }, "Geocode failed — project saved without coords");
  }
}

router.get("/projects", async (req, res): Promise<void> => {
  if (isAdminRequest(req)) {
    const projects = await db.select().from(projectsTable).orderBy(desc(projectsTable.createdAt));
    res.json(projects.map(buildPreview));
    return;
  }

  const refs = parseProjectRefs(req.query.refs);
  if (refs.length === 0) {
    res.json([]);
    return;
  }
  const ids = refs.map((ref) => ref.id);
  const tokensById = new Map(refs.map((ref) => [ref.id, ref.accessToken]));
  const projects = await db
    .select()
    .from(projectsTable)
    .where(inArray(projectsTable.id, ids))
    .orderBy(desc(projectsTable.createdAt));
  res.json(
    projects
      .filter((project) => project.isGuestProject && tokensById.get(project.id) === project.accessToken)
      .map(buildPreview),
  );
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [project] = await db.insert(projectsTable).values({
    ...parsed.data,
    accessToken: createAccessToken(),
    ownerUserId: null,
    isGuestProject: true,
    ...(parsed.data.useManualCoords && parsed.data.lat != null && parsed.data.lon != null
      ? { locationAccuracy: "manual_coordinates" }
      : {}),
  }).returning();

  // Geocode in the background — don't block the response
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

  res.status(201).json(project);
});

router.get("/projects/stats/summary", requireAdmin, async (req, res): Promise<void> => {
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
    recentProjects: projects.slice(0, 5),
  });
});

router.get("/projects/:id/preview", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (id == null) {
    res.status(400).json({ error: "Invalid project ID" });
    return;
  }
  const project = await getAuthorizedProject(req, id);
  if (project === null) { res.status(404).json({ error: "Project not found" }); return; }
  if (project === "forbidden") { res.status(403).json({ error: "Invalid project access token" }); return; }

  if (!project.calculationResult) {
    await calculateAndPersist(project);
    const refreshed = await getAuthorizedProject(req, id);
    if (!refreshed || refreshed === "forbidden") { res.status(500).json({ error: "Could not refresh project" }); return; }
    res.json(buildPreview(refreshed));
    return;
  }
  res.json(buildPreview(project));
});

router.get("/projects/:id/report", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid project ID" }); return; }
  const project = await getAuthorizedProject(req, id);
  if (project === null) { res.status(404).json({ error: "Project not found" }); return; }
  if (project === "forbidden") { res.status(403).json({ error: "Invalid project access token" }); return; }
  if (!project.paidAt && !isAdminRequest(req)) { res.status(402).json({ error: "Unlock this report before viewing full details" }); return; }
  const calculated = project.calculationResult ? project : { ...project, calculationResult: await calculateAndPersist(project) };
  const report = buildPaidReport(calculated);
  if (!report) { res.status(500).json({ error: "Report is not available" }); return; }
  res.json(report);
});

router.get("/projects/:id/report.pdf", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid project ID" }); return; }
  const project = await getAuthorizedProject(req, id);
  if (project === null) { res.status(404).json({ error: "Project not found" }); return; }
  if (project === "forbidden") { res.status(403).json({ error: "Invalid project access token" }); return; }
  if (!project.paidAt && !isAdminRequest(req)) { res.status(402).json({ error: "Unlock this report before downloading PDF" }); return; }
  const calculated = project.calculationResult ? project : { ...project, calculationResult: await calculateAndPersist(project) };
  const report = buildPaidReport(calculated);
  if (!report) { res.status(500).json({ error: "Report is not available" }); return; }
  const pdf = renderReportPdfBuffer(report);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", `attachment; filename="solar-report-${project.id}.pdf"`);
  res.send(pdf);
});

router.get("/projects/:id/report.html", async (req, res): Promise<void> => {
  const id = parseId(req.params.id);
  if (id == null) { res.status(400).json({ error: "Invalid project ID" }); return; }
  const project = await getAuthorizedProject(req, id);
  if (project === null) { res.status(404).json({ error: "Project not found" }); return; }
  if (project === "forbidden") { res.status(403).json({ error: "Invalid project access token" }); return; }
  if (!project.paidAt && !isAdminRequest(req)) { res.status(402).json({ error: "Unlock this report before viewing full report" }); return; }
  const calculated = project.calculationResult ? project : { ...project, calculationResult: await calculateAndPersist(project) };
  const report = buildPaidReport(calculated);
  if (!report) { res.status(500).json({ error: "Report is not available" }); return; }
  res.type("html").send(renderReportPdfHtml(report));
});

router.get("/projects/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetProjectParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const project = await getAuthorizedProject(req, params.data.id);
  if (project === null) { res.status(404).json({ error: "Project not found" }); return; }
  if (project === "forbidden") { res.status(403).json({ error: "Invalid project access token" }); return; }
  res.json(project.paidAt || isAdminRequest(req) ? project : { ...project, calculationResult: null });
});

router.patch("/projects/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = UpdateProjectParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const authorized = await getAuthorizedProject(req, params.data.id);
  if (authorized === null) { res.status(404).json({ error: "Project not found" }); return; }
  if (authorized === "forbidden") { res.status(403).json({ error: "Invalid project access token" }); return; }

  const updateData = {
    ...parsed.data,
    ...(
      parsed.data.useManualCoords && parsed.data.lat != null && parsed.data.lon != null
        ? { locationAccuracy: "manual_coordinates" }
        : {}
    ),
  };

  const [project] = await db
    .update(projectsTable)
    .set(updateData)
    .where(eq(projectsTable.id, params.data.id))
    .returning();

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  // Re-geocode if address fields changed and not using manual coordinates
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

  res.json(project);
});

router.delete("/projects/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = DeleteProjectParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const authorized = await getAuthorizedProject(req, params.data.id);
  if (authorized === null) { res.status(404).json({ error: "Project not found" }); return; }
  if (authorized === "forbidden") { res.status(403).json({ error: "Invalid project access token" }); return; }

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

// ── POST /projects/:id/regeocode ──────────────────────────────────────────────
// Geocodes (or re-geocodes) a project's address and persists the result.
// Returns the updated project row.

router.post("/projects/:id/regeocode", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(raw, 10);
  if (isNaN(id)) { res.status(400).json({ error: "Invalid project ID" }); return; }

  const project = await getAuthorizedProject(req, id);
  if (project === null) { res.status(404).json({ error: "Project not found" }); return; }
  if (project === "forbidden") { res.status(403).json({ error: "Invalid project access token" }); return; }

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
    logger.info(
      { id, existingAccuracy: project.locationAccuracy, attemptedAccuracy: result.accuracy },
      "Preserving existing exact geocode during re-geocode"
    );
    res.json(project);
    return;
  }

  const [updated] = await db
    .update(projectsTable)
    .set({ lat: result.lat, lon: result.lon, locationAccuracy: result.accuracy, useManualCoords: false })
    .where(eq(projectsTable.id, id))
    .returning();

  logger.info({ id, accuracy: result.accuracy }, "Project re-geocoded via API");
  res.json(updated);
});

router.post("/projects/:id/calculate", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = CalculateProjectParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const project = await getAuthorizedProject(req, params.data.id);
  if (project === null) { res.status(404).json({ error: "Project not found" }); return; }
  if (project === "forbidden") { res.status(403).json({ error: "Invalid project access token" }); return; }

  if (!Number.isFinite(project.annualKwh) || project.annualKwh <= 0) {
    res.status(400).json({ error: "Annual kWh must be greater than 0 before calculating." });
    return;
  }

  try {
    await calculateAndPersist(project);
    const refreshed = await getAuthorizedProject(req, params.data.id);
    if (!refreshed || refreshed === "forbidden") { res.status(500).json({ error: "Could not refresh project" }); return; }
    res.json(buildPreview(refreshed));
  } catch (err) {
    logger.error({ err, projectId: project.id }, "Project calculation failed");
    res.status(500).json({ error: "Calculation failed. Check project inputs and try again." });
  }
});

export default router;
