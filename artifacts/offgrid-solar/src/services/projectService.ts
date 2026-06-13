import { apiPost } from "./apiService";
import { appEnv } from "@/config/env";

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

export type RedeemCodeState =
  | "valid"
  | "expired"
  | "used"
  | "invalid"
  | "inactive"
  | "limit-reached"
  | "error";

export interface RedeemCodeResult {
  state: RedeemCodeState;
  message: string;
  unlocked: boolean;
}

/**
 * Applies a promo/trial code to unlock a project's full report without Stripe.
 * The endpoint returns a typed state (with a user-facing message) on both 200
 * and 422, so we read the body regardless of status instead of throwing.
 */
export async function redeemProjectCode(
  projectId: number,
  accessToken: string,
  code: string,
  email: string,
): Promise<RedeemCodeResult> {
  const base = appEnv.apiBaseUrl.replace(/\/+$/, "");
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (accessToken) headers["x-access-token"] = accessToken;

  const res = await fetch(`${base}/projects/${projectId}/redeem-code`, {
    method: "POST",
    headers,
    body: JSON.stringify({ code, email }),
  });

  const data = (await res.json().catch(() => null)) as Partial<RedeemCodeResult> | null;
  if (!data || typeof data.state !== "string") {
    throw new Error("Unexpected response from the server. Please try again.");
  }
  return {
    state: data.state as RedeemCodeState,
    message: data.message ?? "",
    unlocked: !!data.unlocked,
  };
}
