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
