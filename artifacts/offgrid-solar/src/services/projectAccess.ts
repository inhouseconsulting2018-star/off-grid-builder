const STORAGE_KEY = "offgrid.projectRefs.v1";

export interface ProjectRef {
  id: number;
  accessToken: string;
}

export function getProjectRefs(): ProjectRef[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as ProjectRef[];
    return Array.isArray(parsed)
      ? parsed.filter((ref) => Number.isFinite(ref.id) && typeof ref.accessToken === "string" && ref.accessToken.length > 0)
      : [];
  } catch {
    return [];
  }
}

export function saveProjectRef(ref: ProjectRef): void {
  const refs = getProjectRefs().filter((item) => item.id !== ref.id);
  refs.unshift(ref);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(refs.slice(0, 50)));
}

export function getProjectAccessToken(id: number): string {
  const urlToken = new URLSearchParams(window.location.search).get("accessToken");
  if (urlToken) return urlToken;
  return getProjectRefs().find((ref) => ref.id === id)?.accessToken ?? "";
}

export function removeProjectRef(id: number): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(getProjectRefs().filter((ref) => ref.id !== id)));
}

export function encodeProjectRefs(): string {
  return btoa(JSON.stringify(getProjectRefs())).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

export function appendAccessToken(path: string, projectId: number): string {
  const token = getProjectAccessToken(projectId);
  const separator = path.includes("?") ? "&" : "?";
  return token ? `${path}${separator}accessToken=${encodeURIComponent(token)}` : path;
}
