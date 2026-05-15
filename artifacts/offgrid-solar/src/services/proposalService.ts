import { apiGet, apiPost } from "./apiService";

export function getProposalEquipment<T>(): Promise<T> {
  return apiGet<T>("/proposals/equipment");
}

export function createProposalEstimate<T>(payload: unknown): Promise<T> {
  return apiPost<T>("/proposals/estimate", payload);
}
