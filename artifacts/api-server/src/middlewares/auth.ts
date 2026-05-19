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
  const provided = req.headers["x-admin-token"];
  if (!provided || provided !== adminToken) {
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

  // Pre-launch rows (null accessToken) are accessible without a token.
  // This covers projects created before the access-token feature shipped.
  if (project.accessToken === null) return project;

  // Post-launch rows require the correct token
  const token = extractAccessToken(req);
  if (!token || token !== project.accessToken) return null;

  return project;
}

export function previewProject(project: ProjectRow): Omit<ProjectRow, "accessToken" | "calculationResult"> & { calculationResult: null; paid: false } {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { accessToken: _t, calculationResult: _c, ...rest } = project;
  return { ...rest, calculationResult: null, paid: false };
}

export function sanitizeProject(project: ProjectRow): Omit<ProjectRow, "accessToken"> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { accessToken: _t, ...rest } = project;
  return rest;
}
