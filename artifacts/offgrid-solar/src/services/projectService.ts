import { apiPost } from "./apiService";

export interface RegeocodeProjectResponse {
  lat?: number;
  lon?: number;
  locationAccuracy?: string;
}

export function regeocodeProject(projectId: number): Promise<RegeocodeProjectResponse> {
  return apiPost<RegeocodeProjectResponse>(`/projects/${projectId}/regeocode`);
}

export function createProjectCheckoutSession(projectId: number): Promise<{ url?: string }> {
  return apiPost<{ url?: string }>(`/projects/${projectId}/create-checkout-session`);
}
