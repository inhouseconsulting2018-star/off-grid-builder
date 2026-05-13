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
import { runCalculations } from "../lib/solar-calculator";

const router: IRouter = Router();

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

  const calcResult = runCalculations(
    {
      annualKwh: project.annualKwh,
      systemType: project.systemType,
      shadeLevel: project.shadeLevel,
      backupHours: project.backupHours,
      customBackupHours: project.customBackupHours,
      budgetTier: project.budgetTier,
      utilityRatePerKwh: project.utilityRatePerKwh,
      state: project.state,
      installationType: project.installationType,
    },
    settingsRow,
  );

  await db
    .update(projectsTable)
    .set({ calculationResult: calcResult })
    .where(eq(projectsTable.id, params.data.id));

  res.json(calcResult);
});

export default router;
