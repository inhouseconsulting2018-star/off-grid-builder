export type AnalyticsEvent =
  | "start_estimate"
  | "preview_generated"
  | "pricing_viewed"
  | "checkout_clicked"
  | "purchase_completed"
  | "pdf_downloaded"
  | "contractor_beta_clicked";

type EventProperties = Record<string, string | number | boolean | null | undefined>;

declare global {
  interface Window {
    dataLayer?: Array<Record<string, unknown>>;
  }
}

export function trackEvent(event: AnalyticsEvent, properties: EventProperties = {}): void {
  if (typeof window === "undefined") return;

  const detail = { event, ...properties };
  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push(detail);
  window.dispatchEvent(new CustomEvent("offgrid:analytics", { detail }));
}
