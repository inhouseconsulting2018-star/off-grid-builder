---
name: Production deployment
description: Live production domain, Stripe webhook, and deployment state for OffGrid Solar Builder
---

# Production Deployment

**Live domain:** `https://offgridsolarbuilder.com` (no 's') — verified working
**Replit fallback:** `https://off-grid-builder-1.replit.app`
**offgridsolarbuilders.com (with s):** NOT connected — user does not own this domain

**Stripe webhook:** `we_1Tf6yjPtpEeLlAYiDBAuxu3m`
- URL: `https://offgridsolarbuilder.com/api/stripe/webhook`
- Events: checkout.session.completed, payment_intent.payment_failed, customer.subscription.created, customer.subscription.updated, customer.subscription.deleted
- livemode: true

**FRONTEND_URL secret:** set to `https://offgridsolarbuilder.com`

**Why:** Checkout success/cancel URLs use FRONTEND_URL first, then code fallback (`offgridsolarbuilder.com`). Domain with-s was never owned by user — was a typo/confusion throughout setup.

**Deployment:** isDeployed=true, hasSuccessfulBuild=true, live payments accepted as of 2026-06-08.

## Stripe mode verification (durable technique)
Secret VALUES can't be read (env-secrets skill only reports existence). To confirm Stripe live-vs-test mode non-destructively: create a checkout session via the app's own endpoint (`POST /api/projects/:id/create-checkout-session` with token + `{selectedPlan}`) and inspect the returned `url` — `cs_live_` ⇒ LIVE key, `cs_test_` ⇒ TEST key. No charge is made. Confirmed LIVE this way.
**Don't conflate dev vs prod payment records:** the real `cs_live_` $19 paid row is in the DEV db (project id=1); prod had 0 paid / 0 sessions (only free-preview projects) as of pre-publish verification. STRIPE_SECRET_KEY is a global secret (shared dev+prod).

## Publish-time schema migration (durable)
Replit's Publish flow auto-diffs the DEV schema against PROD and applies the DDL diff (rename prompts in the Publish UI). Agent must NOT write prod migration scripts / deploy hooks / startup DDL. So additive tables present in dev but missing in prod (e.g. promo_codes, promo_redemptions) are created automatically on the next publish; `seedDefaultPromoCode()` (index.ts startup) then seeds SOLARTRIAL idempotently.
**Caveat — DATA is NOT migrated, only schema:** an existing prod row keeps its old value even when the dev default changed. Prod `settings.panel_wattage` stays 400 (dev=440) after publish; must be set to 440 via the LIVE Admin → Settings page post-publish. Until then prod calcs size with 400W panels.
