export const checkoutPlanIds = [
  "homeowner_report",
  "property_pack",
  "contractor_annual",
  "contractor_lifetime_beta",
] as const;

export type CheckoutPlanId = (typeof checkoutPlanIds)[number];

export type CheckoutPlanOption = {
  id: CheckoutPlanId;
  name: string;
  price: string;
  cadence: string;
  detail: string;
  action: string;
};

const paymentLinks: Partial<Record<CheckoutPlanId, string>> = {
  homeowner_report: "https://buy.stripe.com/8x2cN7gjXbCX4v88yT3ks02",
  property_pack: "https://buy.stripe.com/4gM14paZDayTe5I5mH3ks01",
  contractor_annual: "https://buy.stripe.com/fZu7sNc3H36r0eSbL53ks00",
  contractor_lifetime_beta: "https://buy.stripe.com/aFacN73xbgXh6Dg9CX3ks04",
};

export const checkoutPlans: CheckoutPlanOption[] = [
  {
    id: "homeowner_report",
    name: "Homeowner Full Report",
    price: "$19",
    cadence: "one-time",
    detail: "1 full report credit",
    action: "Choose Full Report",
  },
  {
    id: "property_pack",
    name: "Property Pack",
    price: "$39",
    cadence: "one-time",
    detail: "3 full report credits",
    action: "Choose Property Pack",
  },
  {
    id: "contractor_annual",
    name: "Contractor Annual",
    price: "$149/year",
    cadence: "subscription",
    detail: "Contractor access + 50 credits",
    action: "Choose Annual Access",
  },
  {
    id: "contractor_lifetime_beta",
    name: "Contractor Lifetime Beta",
    price: "$199",
    cadence: "one-time",
    detail: "Contractor access + 100 credits",
    action: "Choose Lifetime Beta",
  },
];

export function parseCheckoutPlan(value: string | null | undefined): CheckoutPlanId | null {
  return checkoutPlanIds.includes(value as CheckoutPlanId) ? value as CheckoutPlanId : null;
}

export function getCheckoutPlan(planId: CheckoutPlanId): CheckoutPlanOption {
  return checkoutPlans.find((plan) => plan.id === planId) ?? checkoutPlans[0];
}

export function getPlanWizardHref(planId: CheckoutPlanId): string {
  return `/wizard?selectedPlan=${encodeURIComponent(planId)}`;
}

export function getPaymentLinkCheckoutUrl(planId: CheckoutPlanId, projectId: number): string | null {
  const paymentLink = paymentLinks[planId];
  if (!paymentLink) return null;
  const url = new URL(paymentLink);
  url.searchParams.set("client_reference_id", `project_${projectId}`);
  return url.toString();
}
