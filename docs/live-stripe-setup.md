# Live Stripe Setup

Use this checklist only after the app is deployed, the database migration is applied, and test-mode checkout has passed.

## Products and Prices

The launch pricing model uses four Stripe prices:

- `Homeowner Full Report`: `$19.00`, one-time, `STRIPE_HOMEOWNER_REPORT_PRICE_ID`
- `Property Pack`: `$39.00`, one-time, `STRIPE_PROPERTY_PACK_PRICE_ID`
- `Contractor Annual Access`: `$149.00/year`, yearly subscription, `STRIPE_CONTRACTOR_ANNUAL_PRICE_ID`
- `Contractor Lifetime Beta`: `$199.00`, one-time, `STRIPE_CONTRACTOR_LIFETIME_PRICE_ID`

The legacy `STRIPE_PRICE_ID` remains supported as a fallback for the homeowner full report only.

Test mode remains the default seed behavior:

```sh
pnpm --filter @workspace/scripts run seed-stripe
```

Live mode must be explicit:

```sh
STRIPE_MODE=live pnpm --filter @workspace/scripts run seed-stripe
```

Only run the live command when the Replit Stripe integration is switched to live mode or when a live `STRIPE_SECRET_KEY` or restricted `rk_live_...` key is available in the environment. Copy each printed live `price_...` value into the matching Replit Secret.

## Replit Secrets

Production requires:

```text
DATABASE_URL
ADMIN_TOKEN
STRIPE_HOMEOWNER_REPORT_PRICE_ID
STRIPE_PROPERTY_PACK_PRICE_ID
STRIPE_CONTRACTOR_ANNUAL_PRICE_ID
STRIPE_CONTRACTOR_LIFETIME_PRICE_ID
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
- Confirm Stripe Checkout opens in live mode with the selected launch price.
- Confirm success and cancel URLs use the production domain.
- Confirm webhook records `selectedPlan`, `stripePriceId`, `paidAmount`, `paidAt`, and `stripeSessionId`.
- Confirm full report and PDF unlock only after entitlement is set.
- Confirm no live Stripe keys are committed or exposed to frontend code.
