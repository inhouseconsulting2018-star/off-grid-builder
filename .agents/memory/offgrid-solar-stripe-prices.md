---
name: OffGrid Solar Stripe price IDs
description: Tier → price ID mapping and env var names
---

Four pricing tiers, all managed in `artifacts/api-server/src/routes/projects.ts`:

| Tier                 | Credits | Price   | Env var                              |
|----------------------|---------|---------|--------------------------------------|
| homeowner            | 1       | $19     | STRIPE_HOMEOWNER_REPORT_PRICE_ID     |
| property_pack        | 3       | $39     | STRIPE_PROPERTY_PACK_PRICE_ID        |
| contractor_annual    | 50      | $149/yr | STRIPE_CONTRACTOR_ANNUAL_PRICE_ID    |
| contractor_lifetime  | 100     | $199    | STRIPE_CONTRACTOR_LIFETIME_PRICE_ID  |

`env.ts` exports each of these. The webhook handler reads `metadata.selectedPlan` and `metadata.creditAmount` to set all entitlement columns on payment completion.

**Why:** Tiers drive both checkout and DB entitlement — any new plan needs both a price ID env var and a webhook case.
