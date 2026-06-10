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
