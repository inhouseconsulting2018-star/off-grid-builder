import { Router, type IRouter } from "express";
import { db, settingsTable } from "@workspace/db";
import { UpdateSettingsBody } from "@workspace/api-zod";

const router: IRouter = Router();

router.get("/settings", async (req, res): Promise<void> => {
  const [settings] = await db.select().from(settingsTable).limit(1);
  if (!settings) {
    res.status(404).json({ error: "Settings not initialized" });
    return;
  }
  res.json(settings);
});

router.patch("/settings", async (req, res): Promise<void> => {
  const parsed = UpdateSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [existing] = await db.select().from(settingsTable).limit(1);
  if (!existing) {
    res.status(404).json({ error: "Settings not initialized" });
    return;
  }

  const [updated] = await db
    .update(settingsTable)
    .set(parsed.data)
    .returning();

  res.json(updated);
});

export default router;
