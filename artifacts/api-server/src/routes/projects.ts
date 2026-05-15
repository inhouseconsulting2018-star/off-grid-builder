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
  // Never overwrite manually-entered coordinates
  if (project.useManualCoords) return;

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
      await db
        .update(projectsTable)
        .set({ lat: result.lat, lon: result.lon, locationAccuracy: result.accuracy })
        .where(eq(projectsTable.id, project.id));
      logger.info({ id: project.id, accuracy: result.accuracy }, "Project geocoded");
    }
  } catch (err) {
    // Geocoding failure is non-fatal — project is still saved, map falls back gracefully
    logger.warn({ err, id: project.id }, "Geocode failed — project saved without coords");
  }
}

router.get("/projects", async (req, res): Promise<void> => {
  const projects = await db
    .select()
    .from(projectsTable)
    .orderBy(desc(projectsTable.createdAt));
  res.json(projects);
});

router.post("/projects", async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [project] = await db.insert(projectsTable).values(parsed.data).returning();

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
  });

  res.status(201).json(project);
});

router.get("/projects/stats/summary", async (req, res): Promise<void> => {
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

router.get("/projects/:id", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = GetProjectParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));

  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }

  res.json(project);
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

  const [project] = await db
    .update(projectsTable)
    .set(parsed.data)
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

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, id));

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
  res.json(updated);
});

router.post("/projects/:id/calculate", async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const params = CalculateProjectParams.safeParse({ id: parseInt(raw, 10) });
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }

  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, params.data.id));

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

  res.json(finalResult);
});

export default router;
