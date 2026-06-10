# Production Setup Guide

This document covers everything needed to go live with OffGrid Solar Builder beyond the development defaults.

---

## Required Environment Variables

Set all of these in the **Replit Secrets** tab (not `.env` files — those are for local development only).

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string (Neon or other provider) |
| `SESSION_SECRET` | ✅ | Random secret for signing sessions — generate with `openssl rand -hex 32` |
| `ADMIN_TOKEN` | ✅ | Bearer token for admin-only endpoints — generate with `openssl rand -hex 32` |
| `STRIPE_SECRET_KEY` | ✅ | Stripe secret key (`sk_live_...` for production, `sk_test_...` for testing) |
| `STRIPE_PUBLISHABLE_KEY` | ✅ | Stripe publishable key (`pk_live_...` or `pk_test_...`) |
| `STRIPE_PRICE_ID` | ✅ | Legacy fallback price ID for the $19 homeowner full report (see Stripe Setup below) |
| `STRIPE_WEBHOOK_SECRET` | ✅ | Webhook signing secret — required in production to verify payment events |
| `REPORT_EMAIL_WEBHOOK_URL` | Recommended | HTTPS email-provider automation endpoint. Receives the customer email, subject/body, secure report link, and secure PDF link after payment. Without it, entitlement still unlocks but delivery remains queued. |
| `PVWATTS_API_KEY` | Optional | NREL PVWatts v8 API key for real solar production data. Without it, calculations fall back to state-based estimates. Free key at [developer.nrel.gov](https://developer.nrel.gov/signup/) |

---

## Stripe Setup (Live Mode)

### Step 1 — Switch to live Stripe keys

In the Replit Secrets tab, update:
- `STRIPE_SECRET_KEY` → `sk_live_...` (from Stripe Dashboard → Developers → API keys)
- `STRIPE_PUBLISHABLE_KEY` → `pk_live_...`

### Step 2 — Create the product and price

Run the live seed script (with live keys already set):

```bash
pnpm --filter @workspace/scripts run seed-stripe-live
```

Copy the printed `price_xxx...` ID and set it as `STRIPE_PRICE_ID`.

### Step 3 — Register the webhook

1. Go to **Stripe Dashboard → Developers → Webhooks → Add endpoint**
2. Set the endpoint URL to: `https://offgridsolarbuilder.com/api/stripe/webhook`
3. Select `checkout.session.completed`, `payment_intent.payment_failed`, and the subscription lifecycle events if contractor subscriptions are enabled
4. Copy the **Signing secret** (`whsec_...`) and set it as `STRIPE_WEBHOOK_SECRET`

### Step 4 — Verify

After setting all secrets and redeploying, create a test project and confirm:
- The paywall card appears on the results page for unpaid projects
- Clicking "Unlock Full Report" redirects to a real Stripe Checkout page
- After a real payment, `paidAt` is set and the full report is accessible

---

## Admin API

Admin endpoints require the `X-Admin-Token` header matching `ADMIN_TOKEN`:

```bash
# List all projects
curl https://offgridsolarbuilder.replit.app/api/projects \
  -H "X-Admin-Token: your-token-here"

# Project stats
curl https://offgridsolarbuilder.replit.app/api/projects/stats/summary \
  -H "X-Admin-Token: your-token-here"
```

---

## Deployment Checklist

Before going live, verify:

- [ ] All required secrets are set in Replit Secrets
- [ ] `STRIPE_SECRET_KEY` is a live key (`sk_live_...`), not test (`sk_test_...`)
- [ ] `STRIPE_PRICE_ID` was created by the `seed-stripe-live` script against live keys
- [ ] Stripe webhook endpoint is registered and `STRIPE_WEBHOOK_SECRET` is set
- [ ] `REPORT_EMAIL_WEBHOOK_URL` is set and a test payload reaches the configured email provider
- [ ] `PVWATTS_API_KEY` is set (or you accept the state-estimate fallback)
- [ ] The app is deployed via Replit autoscale (not just the development server)
- [ ] A test purchase completes end-to-end on the live app

---

## Local Development

For local development, copy `.env.example` to `.env` and fill in the values.
Use Stripe test keys (`sk_test_...`, `pk_test_...`) locally.

To create a test Stripe product for local/staging use:

```bash
pnpm --filter @workspace/scripts run seed-stripe
```
