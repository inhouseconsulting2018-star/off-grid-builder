import { apiGet, apiPost, apiPatch } from "@/services/apiService";
import { adminRequestOpts } from "@/hooks/useAdminToken";

export interface PromoCode {
  id: number;
  code: string;
  description: string;
  entitlementType: string;
  grantedPlan: string;
  maxRedemptions: number | null;
  redemptionCount: number;
  expiresAt: string | null;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromoRedemption {
  id: number;
  projectId: number;
  projectName: string | null;
  email: string;
  redeemedAt: string;
}

export interface CreatePromoCodeInput {
  code: string;
  description?: string | null;
  maxRedemptions?: number | null;
  expiresAt?: string | null;
  active?: boolean;
}

export interface UpdatePromoCodeInput {
  description?: string | null;
  maxRedemptions?: number | null;
  expiresAt?: string | null;
  active?: boolean;
}

export function listPromoCodes(token: string): Promise<PromoCode[]> {
  return apiGet<PromoCode[]>("/promo-codes", undefined, adminRequestOpts(token));
}

export function createPromoCode(token: string, input: CreatePromoCodeInput): Promise<PromoCode> {
  return apiPost<PromoCode>("/promo-codes", input, adminRequestOpts(token));
}

export function updatePromoCode(token: string, id: number, input: UpdatePromoCodeInput): Promise<PromoCode> {
  return apiPatch<PromoCode>(`/promo-codes/${id}`, input, adminRequestOpts(token));
}

export function listPromoRedemptions(token: string, id: number): Promise<PromoRedemption[]> {
  return apiGet<PromoRedemption[]>(`/promo-codes/${id}/redemptions`, undefined, adminRequestOpts(token));
}
