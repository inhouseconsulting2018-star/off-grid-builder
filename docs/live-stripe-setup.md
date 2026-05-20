# Live Stripe Setup

Use this checklist only after the app is deployed, the database migration is applied, and test-mode checkout has passed.

## Product and Price

The report unlock is a one-time Stripe Checkout payment:

- Product: `Full Solar Report`
- Price: `$49.00`
- Currency: `USD`
- Billing mode: one-time payment, not subscription

Test mode remains the default seed behavior:

```sh
pnpm --filter @workspace/scripts run seed-stripe
```

Live mode must be explicit:

```sh
STRIPE_MODE=live pnpm --filter @workspace/scripts run seed-stripe
```

Only run the live command when the Replit Stripe integration is switched to live mode or when a live `STRIPE_SECRET_KEY` is available in the environment. Copy the printed live `price_...` value into `STRIPE_PRICE_ID`.

## Replit Secrets

Production requires:

```text
DATABASE_URL
ADMIN_TOKEN
STRIPE_PRICE_ID
STRIPE_WEBHOOK_SECRET
NREL_API_KEY
```

Stripe credentials must come from one of these:

```text
STRIPE_SECRET_KEY
```

or the Replit Stripe live connector.

`STRIPE_PUBLISHABLE_KEY` is optional for the current server-side Checkout redirect flow.

## Webhook

Configure the Stripe webhook in the same mode as the price ID and secret key.

Endpoint:

```text
https://offgridsolarbuilder.com/api/stripe/webhook
```

Required events:

```text
checkout.session.completed
payment_intent.payment_failed
```

Set `STRIPE_WEBHOOK_SECRET` to the signing secret from this exact live webhook endpoint. Do not reuse a test-mode webhook secret for live payments.

## Safety Checks

Before accepting real payments:

- Confirm unpaid preview only shows rough system size, panel count, cost range, and basic savings.
- Confirm full report JSON returns `402` before payment.
- Confirm PDF endpoint returns `402` before payment.
- Confirm Stripe Checkout opens in live mode with `$49.00`.
- Confirm success and cancel URLs use the production domain.
- Confirm webhook marks the project paid after a successful checkout.
- Confirm full report and PDF unlock only after entitlement is set.
- Confirm no live Stripe keys are committed or exposed to frontend code.
