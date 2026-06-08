import { apiGet, apiPost } from "./apiService";

export function getProposalEquipment<T>(adminToken: string): Promise<T> {
  return apiGet<T>("/proposals/equipment", undefined, {
    headers: { "x-admin-token": adminToken },
  });
}

export function createProposalEstimate<T>(payload: unknown, adminToken: string): Promise<T> {
  return apiPost<T>("/proposals/estimate", payload, {
    headers: { "x-admin-token": adminToken },
  });
}
