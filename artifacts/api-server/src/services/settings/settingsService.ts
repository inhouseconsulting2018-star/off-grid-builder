import { db, settingsTable, type Settings } from "@workspace/db";

export async function getOrCreateSettings(): Promise<Settings> {
  const [existing] = await db.select().from(settingsTable).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(settingsTable).values({}).returning();
  return created;
}
