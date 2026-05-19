import { randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { eq } from "drizzle-orm";
import { db, projectsTable, type Project } from "@workspace/db";
import { env } from "../../config/env";

export function createAccessToken(): string {
  return randomBytes(32).toString("base64url");
}

export function getAccessToken(req: Request): string {
  const queryToken = req.query.accessToken;
  if (typeof queryToken === "string") return queryToken;
  const headerToken = req.get("x-project-access-token");
  return headerToken ?? "";
}

function constantTimeEquals(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function isAdminRequest(req: Request): boolean {
  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";
  return !!env.adminToken && constantTimeEquals(token, env.adminToken);
}

export function canAccessProject(req: Request, project: Project): boolean {
  if (isAdminRequest(req)) return true;
  if (project.ownerUserId) {
    // Future authenticated owner support lives here. Until then, owner projects
    // are not accessible through guest tokens unless an admin token is supplied.
    return false;
  }
  if (!project.isGuestProject) return false;
  const token = getAccessToken(req);
  return !!token && constantTimeEquals(token, project.accessToken);
}

export async function getAuthorizedProject(req: Request, id: number): Promise<Project | null | "forbidden"> {
  const [project] = await db.select().from(projectsTable).where(eq(projectsTable.id, id));
  if (!project) return null;
  if (!canAccessProject(req, project)) return "forbidden";
  return project;
}

