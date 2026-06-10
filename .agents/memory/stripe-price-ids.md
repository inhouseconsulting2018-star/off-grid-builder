---
name: Stripe live price IDs
description: Correct live Stripe price IDs for all 4 plans, confirmed via MCP search June 2026
---

The old price IDs (price_1TfQTB...) were stale/deleted. Correct live values:

- STRIPE_PRICE_ID = price_1TZPDcPtpEeLlAYiXtAifKb4 (Homeowner Full Report $19)
- STRIPE_HOMEOWNER_REPORT_PRICE_ID = price_1TZPDcPtpEeLlAYiXtAifKb4
- STRIPE_PROPERTY_PACK_PRICE_ID = price_1TZQxRPtpEeLlAYiBfvfWkGK ($39)
- STRIPE_CONTRACTOR_ANNUAL_PRICE_ID = price_1TZRKDPtpEeLlAYiWXhoyQHz ($149/yr)
- STRIPE_CONTRACTOR_LIFETIME_PRICE_ID = price_1TeqMFPtpEeLlAYi2Pg4JA7Q ($199)

Products: prod_UW1g1NaOk5rvWq (homeowner), prod_UYY3uaKDNPLdAV (property pack),
prod_UYYP6CjrWMfnHL (contractor annual), prod_UYkM9Bt1t3q6kp (contractor lifetime)

**Why:** These are stored as Replit secrets (not env vars). Secrets panel must be updated manually.
**How to apply:** Use MCP mcpStripe_searchStripeResources with query "prices:product:\"prod_XXX\" active:\"true\"" to re-confirm if ever in doubt.
