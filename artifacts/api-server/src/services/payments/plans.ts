import { env } from "../../config/env";

export const checkoutPlanIds = [
  "homeowner_report",
  "property_pack",
  "contractor_annual",
  "contractor_lifetime_beta",
] as const;

export type CheckoutPlanId = (typeof checkoutPlanIds)[number];

export type CheckoutPlan = {
  id: CheckoutPlanId;
  name: string;
  priceLabel: string;
  amountCents: number;
  includedCredits: number;
  contractorStatus: boolean;
  checkoutMode: "payment" | "subscription";
  envName: string;
  priceId?: string;
};

export function getCheckoutPlans(): Record<CheckoutPlanId, CheckoutPlan> {
  return {
    homeowner_report: {
      id: "homeowner_report",
      name: "Homeowner Full Report",
      priceLabel: "$19 one-time",
      amountCents: 1900,
      includedCredits: 1,
      contractorStatus: false,
      checkoutMode: "payment",
      envName: "STRIPE_HOMEOWNER_REPORT_PRICE_ID",
      priceId: env.stripeHomeownerReportPriceId,
    },
    property_pack: {
      id: "property_pack",
      name: "Property Pack",
      priceLabel: "$39 for 3 reports",
      amountCents: 3900,
      includedCredits: 3,
      contractorStatus: false,
      checkoutMode: "payment",
      envName: "STRIPE_PROPERTY_PACK_PRICE_ID",
      priceId: env.stripePropertyPackPriceId,
    },
    contractor_annual: {
      id: "contractor_annual",
      name: "Contractor Annual Access",
      priceLabel: "$149/year",
      amountCents: 14900,
      includedCredits: 50,
      contractorStatus: true,
      checkoutMode: "subscription",
      envName: "STRIPE_CONTRACTOR_ANNUAL_PRICE_ID",
      priceId: env.stripeContractorAnnualPriceId,
    },
    contractor_lifetime_beta: {
      id: "contractor_lifetime_beta",
      name: "Contractor Lifetime Beta",
      priceLabel: "$199 one-time",
      amountCents: 19900,
      includedCredits: 100,
      contractorStatus: true,
      checkoutMode: "payment",
      envName: "STRIPE_CONTRACTOR_LIFETIME_PRICE_ID",
      priceId: env.stripeContractorLifetimePriceId,
    },
  };
}

export function parseCheckoutPlan(value: unknown): CheckoutPlanId {
  if (value === "homeowner") return "homeowner_report";
  if (value === "contractor_lifetime") return "contractor_lifetime_beta";
  return checkoutPlanIds.includes(value as CheckoutPlanId) ? value as CheckoutPlanId : "homeowner_report";
}

export function getCheckoutPlan(planId: CheckoutPlanId): CheckoutPlan {
  return getCheckoutPlans()[planId];
}

export function getPlanForWebhook(planId: string | undefined): CheckoutPlan {
  return getCheckoutPlan(parseCheckoutPlan(planId));
}
