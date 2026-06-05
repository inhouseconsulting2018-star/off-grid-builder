import { apiPost } from "./apiService";

export interface RegeocodeProjectResponse {
  lat?: number;
  lon?: number;
  locationAccuracy?: string;
}

export function regeocodeProject(
  projectId: number,
  accessToken?: string
): Promise<RegeocodeProjectResponse> {
  const headers: Record<string, string> = {};
  if (accessToken) headers["x-access-token"] = accessToken;
  return apiPost<RegeocodeProjectResponse>(
    `/projects/${projectId}/regeocode`,
    undefined,
    Object.keys(headers).length ? { headers } : undefined
  );
}

export function createProjectCheckoutSession(
  projectId: number,
  accessToken: string,
  selectedPlan = "homeowner_report",
): Promise<{ url?: string }> {
  return apiPost<{ url?: string }>("/stripe/create-checkout-session", {
    projectId,
    accessToken,
    selectedPlan,
  });
}
