import { getUncachableStripeClient } from './stripeClient';

type SeedPlan = {
  productName: string;
  description: string;
  envName: string;
  unitAmount: number;
  metadataType: string;
  recurring?: { interval: "year" };
};

const PLANS: SeedPlan[] = [
  {
    productName: "Homeowner Full Report",
    description: "One full OffGrid Solar Builder report and branded PDF for one project.",
    envName: "STRIPE_HOMEOWNER_REPORT_PRICE_ID",
    unitAmount: 1900,
    metadataType: "homeowner_report",
  },
  {
    productName: "Property Pack",
    description: "Three full report credits for guest homeowner projects.",
    envName: "STRIPE_PROPERTY_PACK_PRICE_ID",
    unitAmount: 3900,
    metadataType: "property_pack",
  },
  {
    productName: "Contractor Annual Access",
    description: "Annual contractor access with 50 full report credits.",
    envName: "STRIPE_CONTRACTOR_ANNUAL_PRICE_ID",
    unitAmount: 14900,
    metadataType: "contractor_annual",
    recurring: { interval: "year" },
  },
  {
    productName: "Contractor Lifetime Beta",
    description: "Founding contractor beta plan with 100 full report credits and core calculator access.",
    envName: "STRIPE_CONTRACTOR_LIFETIME_PRICE_ID",
    unitAmount: 19900,
    metadataType: "contractor_lifetime_beta",
  },
];

function validateExplicitKeyMode() {
  const mode = process.env.STRIPE_MODE === "live" ? "live" : "test";
  const explicitSecret = process.env.STRIPE_SECRET_KEY;
  const allowedPrefixes = mode === "live" ? ["sk_live_", "rk_live_"] : ["sk_test_", "rk_test_"];

  if (explicitSecret && !allowedPrefixes.some((prefix) => explicitSecret.startsWith(prefix))) {
    throw new Error(`STRIPE_SECRET_KEY does not look like a ${mode} mode Stripe secret or restricted key.`);
  }

  return mode;
}

async function upsertPlan(plan: SeedPlan) {
  const stripe = await getUncachableStripeClient();
  const existing = await stripe.products.search({
    query: `name:'${plan.productName}' AND active:'true'`,
  });

  const product = existing.data[0] ?? await stripe.products.create({
    name: plan.productName,
    description: plan.description,
    metadata: {
      app: 'offgrid-solar-builder',
      type: plan.metadataType,
    },
  });

  const prices = await stripe.prices.list({ product: product.id, active: true });
  const existingPrice = prices.data.find((price) => {
    const sameAmount = price.unit_amount === plan.unitAmount && price.currency === "usd";
    const sameRecurring = plan.recurring
      ? price.recurring?.interval === plan.recurring.interval
      : !price.recurring;
    return sameAmount && sameRecurring;
  });

  const price = existingPrice ?? await stripe.prices.create({
    product: product.id,
    unit_amount: plan.unitAmount,
    currency: 'usd',
    recurring: plan.recurring,
    metadata: {
      app: 'offgrid-solar-builder',
      type: plan.metadataType,
    },
  });

  const cadence = plan.recurring ? `/${plan.recurring.interval}` : " one-time";
  console.log(`${plan.productName}: $${(plan.unitAmount / 100).toFixed(2)}${cadence} (${price.id})`);
  console.log(`  ${plan.envName}=${price.id}`);

  if (plan.metadataType === "homeowner_report") {
    console.log(`  STRIPE_PRICE_ID=${price.id}  # legacy fallback`);
  }
}

async function seedStripeProducts() {
  const mode = validateExplicitKeyMode();
  console.log(`Running Stripe seed in ${mode.toUpperCase()} mode.`);
  console.log("Creating or reusing OffGrid Solar Builder launch prices...\n");

  for (const plan of PLANS) {
    await upsertPlan(plan);
  }
}

seedStripeProducts().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
