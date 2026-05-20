import { getUncachableStripeClient } from './stripeClient';

/**
 * Creates the "Full Solar Report" one-time product + $49 price in Stripe.
 *
 * Test mode:
 *   pnpm --filter @workspace/scripts run seed-stripe
 *
 * Live mode:
 *   STRIPE_MODE=live pnpm --filter @workspace/scripts run seed-stripe
 *
 * After running:
 *   1. Copy the printed price ID (price_xxx...)
 *   2. Set STRIPE_PRICE_ID=price_xxx... in the Replit Secrets tab
 *
 * This script is idempotent — safe to run multiple times.
 * It skips creation if the product already exists.
 */
async function seedStripeProduct() {
  const stripe = await getUncachableStripeClient();
  const mode = process.env.STRIPE_MODE === "live" ? "live" : "test";
  const expectedPrefixes = mode === "live" ? ["sk_live_", "rk_live_"] : ["sk_test_", "rk_test_"];
  const explicitSecret = process.env.STRIPE_SECRET_KEY;
  const productName = "Full Solar Report";

  if (explicitSecret && !expectedPrefixes.some((prefix) => explicitSecret.startsWith(prefix))) {
    throw new Error(`STRIPE_SECRET_KEY does not look like a ${mode} mode Stripe secret or restricted key.`);
  }

  console.log(`Running Stripe seed in ${mode.toUpperCase()} mode.`);
  console.log(`Checking for existing ${productName} product...`);

  // Check idempotently — skip if product already exists
  const existing = await stripe.products.search({
    query: `name:'${productName}' AND active:'true'`,
  });

  if (existing.data.length > 0) {
    const product = existing.data[0];
    console.log(`Product already exists: ${product.name} (${product.id})`);

    // Find its active one-time price
    const prices = await stripe.prices.list({ product: product.id, active: true });
    const oneTime = prices.data.find(p => !p.recurring);
    if (oneTime) {
      console.log(`\n✓ Price already exists: $${(oneTime.unit_amount ?? 0) / 100} one-time (${oneTime.id})`);
      console.log(`\nSet this in Replit Secrets:\n  STRIPE_PRICE_ID=${oneTime.id}`);
    } else {
      console.log('No one-time price found. Creating one...');
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: 4900, // $49.00
        currency: 'usd',
      });
      console.log(`\n✓ Created price: $49.00 one-time (${price.id})`);
      console.log(`\nSet this in Replit Secrets:\n  STRIPE_PRICE_ID=${price.id}`);
    }
    return;
  }

  console.log(`Creating ${productName} product...`);

  const product = await stripe.products.create({
    name: productName,
    description: 'Unlock the full PDF solar design report, complete equipment BOM, and unlimited project saves.',
    metadata: {
      app: 'offgrid-solar-builder',
      type: 'one-time-report',
    },
  });
  console.log(`Created product: ${product.name} (${product.id})`);

  // One-time price: $49.00
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 4900, // $49.00 USD
    currency: 'usd',
    // No recurring field = one-time payment
  });
  console.log(`Created price: $49.00 one-time (${price.id})`);

  console.log(`\n✓ Done! Set this in Replit Secrets:`);
  console.log(`  STRIPE_PRICE_ID=${price.id}`);
}

seedStripeProduct().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
