import type { RequestHandler } from "express";
import { env } from "../config/env";

export const requireAdmin: RequestHandler = (req, res, next) => {
  if (!env.adminToken) {
    res.status(503).json({ error: "Admin access is not configured" });
    return;
  }

  const header = req.get("authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice("Bearer ".length).trim() : "";

  if (token !== env.adminToken) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  next();
};
