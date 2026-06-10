// Local "my projects" registry.
//
// This app has no user login. Each project is protected by a per-project
// access token (returned once at creation). To let a visitor see and reopen
// their own projects (including paid ones) on this device, we keep a small
// registry in localStorage mapping projectId -> accessToken. We also mirror
// each token under `project-token-:id` so the results/edit pages keep working.
//
// Security note: these tokens are bearer credentials the visitor already owns
// (their own projects). The registry never stores anyone else's tokens and is
// never sent to admin endpoints.

const REGISTRY_KEY = "offgrid-my-projects";

export type ProjectRegistryEntry = {
  id: number;
  accessToken: string;
  name?: string;
  addedAt: string; // ISO timestamp
};

function tokenKey(id: number): string {
  return `project-token-${id}`;
}

function readRaw(): ProjectRegistryEntry[] {
  try {
    const raw = localStorage.getItem(REGISTRY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (e): e is ProjectRegistryEntry =>
        e != null &&
        typeof e === "object" &&
        Number.isFinite((e as ProjectRegistryEntry).id) &&
        typeof (e as ProjectRegistryEntry).accessToken === "string" &&
        (e as ProjectRegistryEntry).accessToken.length > 0,
    );
  } catch {
    return [];
  }
}

function writeRaw(entries: ProjectRegistryEntry[]): void {
  try {
    localStorage.setItem(REGISTRY_KEY, JSON.stringify(entries));
  } catch {
    // ignore quota / private-mode errors
  }
}

/** Newest first. */
export function getProjectRegistry(): ProjectRegistryEntry[] {
  return readRaw().sort((a, b) => (b.addedAt ?? "").localeCompare(a.addedAt ?? ""));
}

/** Read a stored per-project access token (URL token still takes precedence at call sites). */
export function getProjectToken(id: number): string {
  try {
    return localStorage.getItem(tokenKey(id)) ?? "";
  } catch {
    return "";
  }
}

/**
 * Add or refresh a project in the registry. Dedupes by id, preserves the
 * original addedAt, and updates the stored name/token when provided.
 */
export function addProjectToRegistry(entry: {
  id: number;
  accessToken: string;
  name?: string;
}): void {
  if (!Number.isFinite(entry.id) || !entry.accessToken) return;
  const existing = readRaw();
  const prior = existing.find((e) => e.id === entry.id);
  const without = existing.filter((e) => e.id !== entry.id);
  const next: ProjectRegistryEntry = {
    id: entry.id,
    accessToken: entry.accessToken,
    name: entry.name ?? prior?.name,
    addedAt: prior?.addedAt ?? new Date().toISOString(),
  };
  writeRaw([next, ...without]);
  try {
    localStorage.setItem(tokenKey(entry.id), entry.accessToken);
  } catch {
    // ignore
  }
}

/** Remove a project from the registry (e.g. after delete or a 404 on load). */
export function removeProjectFromRegistry(id: number): void {
  const existing = readRaw();
  writeRaw(existing.filter((e) => e.id !== id));
  try {
    localStorage.removeItem(tokenKey(id));
  } catch {
    // ignore
  }
}

/** Clear every project credential saved by this browser without deleting server data. */
export function clearProjectRegistry(): void {
  const entries = readRaw();
  try {
    localStorage.removeItem(REGISTRY_KEY);
    entries.forEach((entry) => localStorage.removeItem(tokenKey(entry.id)));
  } catch {
    // ignore
  }
}
