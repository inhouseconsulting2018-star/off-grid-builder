import type { Request, Response, NextFunction } from "express";
import { and, eq } from "drizzle-orm";
import { db, projectsTable } from "@workspace/db";
import { env } from "../config/env";

type ProjectRow = typeof projectsTable.$inferSelect;

export function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  const adminToken = env.adminToken;
  if (!adminToken) {
    res.status(503).json({ error: "Admin access not configured — set ADMIN_TOKEN" });
    return;
  }
  const auth = req.headers["authorization"];
  const bearer = typeof auth === "string" && auth.startsWith("Bearer ") ? auth.slice("Bearer ".length) : null;
  const provided = req.headers["x-admin-token"];
  if ((typeof provided !== "string" || provided !== adminToken) && bearer !== adminToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  next();
}

export function extractAccessToken(req: Request): string | null {
  const header = req.headers["x-access-token"];
  if (typeof header === "string" && header.length > 0) return header;
  const query = req.query["accessToken"];
  if (typeof query === "string" && query.length > 0) return query;
  return null;
}

function isAdminRequest(req: Request): boolean {
  const adminToken = env.adminToken;
  if (!adminToken) return false;
  const auth = req.headers["authorization"];
  if (typeof auth === "string" && auth === `Bearer ${adminToken}`) return true;
  const provided = req.headers["x-admin-token"];
  return typeof provided === "string" && provided === adminToken;
}

export async function resolveProjectByToken(
  req: Request,
  id: number,
): Promise<ProjectRow | null> {
  // Admin token bypasses all access-token checks
  if (isAdminRequest(req)) {
    const [project] = await db
      .select()
      .from(projectsTable)
      .where(eq(projectsTable.id, id));
    return project ?? null;
  }

  // Fetch the project first so we can check its token state
  const [project] = await db
    .select()
    .from(projectsTable)
    .where(eq(projectsTable.id, id));

  if (!project) return null;

  // Guest projects always require the correct token. Run the paid launch
  // migration before deploy so old rows receive tokens safely.
  const token = extractAccessToken(req);
  if (!token || token !== project.accessToken) return null;

  return project;
}

export function previewProject(project: ProjectRow) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { accessToken: _t, calculationResult: fullCalc, ...rest } = project;
  const raw = fullCalc as Record<string, unknown> | null;

  const range = (value: unknown, spreadPct: number, minSpread: number, decimals = 0) => {
    const numeric = typeof value === "number" && Number.isFinite(value) ? value : 0;
    const spread = Math.max(Math.abs(numeric) * spreadPct, minSpread);
    const factor = 10 ** decimals;
    return {
      low: Math.max(0, Math.floor((numeric - spread) * factor) / factor),
      high: Math.ceil((numeric + spread) * factor) / factor,
    };
  };

  // Return only safe ranges — never expose exact sizing, cost, brand, BOM,
  // monthly production, or loss data in the free preview.
  const calculationResult = raw
    ? {
        preview: true as const,
        systemSizeKwRange: range(raw["adjustedArraySizeKw"], 0.12, 0.5, 1),
        panelCountRange: range(raw["numPanels"], 0.12, 2),
        yearlyProductionKwhRange: range(raw["yearlyProductionKwh"], 0.15, 750),
        batteryUsableKwhRange: range(raw["batteryUsableKwh"], 0.15, 2, 1),
        inverterSizeKwRange: range(raw["inverterSizeKw"], 0.15, 1, 1),
        pvwattsSource:         (raw["pvwattsSource"]         as string  | null) ?? null,
      }
    : null;

  return { ...rest, calculationResult, paid: false as const };
}

export function sanitizeProject(project: ProjectRow): Omit<ProjectRow, "accessToken"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { accessToken: _t, ...rest } = project;
  return rest;
}
