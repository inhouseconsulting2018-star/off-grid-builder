import { apiGet, apiPost, apiRequest } from "./apiService";
import { appendAccessToken, encodeProjectRefs, getProjectAccessToken } from "./projectAccess";

export interface RegeocodeProjectResponse {
  lat?: number;
  lon?: number;
  locationAccuracy?: string;
}

export function regeocodeProject(projectId: number): Promise<RegeocodeProjectResponse> {
  return apiPost<RegeocodeProjectResponse>(appendAccessToken(`/projects/${projectId}/regeocode`, projectId));
}

export type CheckoutPlanId = "homeowner_report" | "property_pack" | "contractor_annual" | "contractor_lifetime_beta";

export function createProjectCheckoutSession(projectId: number, plan: CheckoutPlanId = "homeowner_report"): Promise<{ url?: string }> {
  return apiPost<{ url?: string }>(appendAccessToken(`/projects/${projectId}/create-checkout-session`, projectId), { plan });
}

export function emailUnlockedReport(
  projectId: number,
  email: string,
): Promise<{ ok: boolean; reportDeliveryStatus: string; reportDeliveredAt: string | Date }> {
  return apiPost(appendAccessToken(`/projects/${projectId}/email-report`, projectId), { email });
}

export interface AdminPurchase {
  projectId: number;
  projectName: string;
  purchaserEmail?: string | null;
  paidAt?: string | null;
  stripeSessionId?: string | null;
  stripePriceId?: string | null;
  selectedPlan?: string | null;
  paidAmount?: number | null;
  reportCredits?: number | null;
  contractorStatus?: boolean | null;
  contractorPlan?: string | null;
  reportDeliveryStatus: string;
  reportDeliveredAt?: string | null;
  systemType: string;
  installationType: string;
  city: string;
  state: string;
}

export function getAdminPurchases(): Promise<{ purchases: AdminPurchase[] }> {
  const token = sessionStorage.getItem("offgrid.adminToken") ?? "";
  return apiRequest("/admin/purchases", {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
}

export function listSessionProjects<T>(): Promise<T[]> {
  return apiGet("/projects", { refs: encodeProjectRefs() });
}

export function getProjectPreview<T>(projectId: number): Promise<T> {
  return apiGet(appendAccessToken(`/projects/${projectId}/preview`, projectId));
}

export function getProjectReport<T>(projectId: number): Promise<T> {
  return apiGet(appendAccessToken(`/projects/${projectId}/report`, projectId));
}

export function getEditableProject<T>(projectId: number): Promise<T> {
  return apiGet(appendAccessToken(`/projects/${projectId}`, projectId));
}

export function getReportPdfUrl(projectId: number): string {
  return `${window.location.origin}${appendAccessToken(`/api/projects/${projectId}/report.pdf`, projectId)}`;
}

export function calculateSessionProject<T>(projectId: number): Promise<T> {
  return apiPost(appendAccessToken(`/projects/${projectId}/calculate`, projectId));
}

export function updateSessionProject<T>(projectId: number, data: unknown): Promise<T> {
  return apiRequest(appendAccessToken(`/projects/${projectId}`, projectId), {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteSessionProject(projectId: number): Promise<void> {
  return apiRequest(appendAccessToken(`/projects/${projectId}`, projectId), { method: "DELETE" });
}

export function getStoredAccessToken(projectId: number): string {
  return getProjectAccessToken(projectId);
}
