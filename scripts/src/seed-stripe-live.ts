import { getUncachableStripeClient } from './stripeClient';

/**
 * Creates the "Solar Report Unlock" one-time product + $19 price in Stripe LIVE mode.
 *
 * IMPORTANT: This script targets your LIVE Stripe account.
 * Before running, ensure your Replit Secrets are set to live-mode keys:
 *   STRIPE_SECRET_KEY=sk_live_...
 *   STRIPE_PUBLISHABLE_KEY=pk_live_...
 *
 * Run with:
 *   pnpm --filter @workspace/scripts run seed-stripe-live
 *
 * After running:
 *   1. Copy the printed price ID (price_xxx...)
 *   2. Set STRIPE_PRICE_ID=price_xxx... in the Replit Secrets tab
 *   3. Set STRIPE_WEBHOOK_SECRET to your live webhook signing secret
 *      (Stripe Dashboard → Developers → Webhooks → your endpoint → Signing secret)
 *
 * This script is idempotent — safe to run multiple times.
 * It skips creation if the product already exists.
 */
async function seedStripeLiveProduct() {
  const stripe = await getUncachableStripeClient();

  // Safety check: warn if running against test mode keys
  const account = await stripe.accounts.retrieve();
  const isLive = !account.id.startsWith('acct_') || (account as { charges_enabled?: boolean }).charges_enabled;
  console.log(`Connected to Stripe account: ${account.id}`);
  console.log(`Charges enabled: ${(account as { charges_enabled?: boolean }).charges_enabled}`);

  console.log('\nChecking for existing Solar Report product...');

  const existing = await stripe.products.search({
    query: "name:'Solar Report Unlock' AND active:'true'",
  });

  if (existing.data.length > 0) {
    const product = existing.data[0];
    console.log(`Product already exists: ${product.name} (${product.id})`);

    const prices = await stripe.prices.list({ product: product.id, active: true });
    const oneTime = prices.data.find(p => !p.recurring);
    if (oneTime) {
      console.log(`\n✓ Price already exists: $${(oneTime.unit_amount ?? 0) / 100} one-time (${oneTime.id})`);
      console.log(`\nSet these in Replit Secrets:`);
      console.log(`  STRIPE_PRICE_ID=${oneTime.id}`);
    } else {
      console.log('No one-time price found. Creating one...');
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: 1900,
        currency: 'usd',
      });
      console.log(`\n✓ Created price: $19.00 one-time (${price.id})`);
      console.log(`\nSet these in Replit Secrets:`);
      console.log(`  STRIPE_PRICE_ID=${price.id}`);
    }
    return;
  }

  console.log('Creating Solar Report Unlock product...');

  const product = await stripe.products.create({
    name: 'Solar Report Unlock',
    description: 'Unlock the full PDF solar design report, complete equipment BOM with real model numbers and pricing, and all engineering design notes.',
    metadata: {
      app: 'offgrid-solar-builder',
      type: 'one-time-report',
      mode: 'live',
    },
  });
  console.log(`Created product: ${product.name} (${product.id})`);

  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 1900,
    currency: 'usd',
  });
  console.log(`Created price: $19.00 one-time (${price.id})`);

  console.log(`\n✓ Done! Set these in Replit Secrets:`);
  console.log(`  STRIPE_PRICE_ID=${price.id}`);
  console.log(`\nAlso ensure these live-mode keys are set:`);
  console.log(`  STRIPE_SECRET_KEY=sk_live_...`);
  console.log(`  STRIPE_PUBLISHABLE_KEY=pk_live_...`);
  console.log(`  STRIPE_WEBHOOK_SECRET=whsec_...  (from Stripe Dashboard → Webhooks)`);
}

seedStripeLiveProduct().catch((err) => {
  console.error('Error:', err.message);
  process.exit(1);
});
