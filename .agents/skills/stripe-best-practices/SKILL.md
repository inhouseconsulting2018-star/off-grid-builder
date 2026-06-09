---
name: stripe-best-practices
description: Project-specific Stripe best practices for OffGrid Solar Builder. Covers checkout session creation, webhook handling, entitlement enforcement, price ID management, env vars, metadata conventions, and add-a-new-tier checklist. Use whenever touching payments, checkout, webhooks, or entitlement in this project.
---

# Stripe Best Practices — OffGrid Solar Builder

This skill captures every Stripe convention used in this project. Read it before touching
`routes/projects.ts`, `app.ts`, `stripeClient.ts`, `webhookHandlers.ts`, or `env.ts`.

---

## Architecture at a Glance

```
Frontend (React)
  └─ POST /api/projects/:id/create-checkout-session
       → Stripe Checkout (hosted page)
         → POST /api/stripe/webhook  (checkout.session.completed)
              → DB: paidAt, entitlementType, selectedPlan, reportCredits, stripeSessionId
         → /payment-success?projectId=&session_id=&accessToken=
```

Two flows run inside the webhook:
1. **Entitlement** — custom logic that marks the project as paid in the `projects` table.
2. **Data sync** — `WebhookHandlers.processWebhook(payload, sig)` from `stripe-replit-sync` keeps
   Stripe data (customers, products, prices) in the local `stripe` schema.

---

## Price Tiers

| `productType`        | Credits | Price    | Mode         | Env var                               |
|----------------------|---------|----------|--------------|---------------------------------------|
| `homeowner`          | 1       | $19      | `payment`    | `STRIPE_HOMEOWNER_REPORT_PRICE_ID`    |
| `property_pack`      | 3       | $39      | `payment`    | `STRIPE_PROPERTY_PACK_PRICE_ID`       |
| `contractor_annual`  | 50      | $149/yr  | `subscription` | `STRIPE_CONTRACTOR_ANNUAL_PRICE_ID` |
| `contractor_lifetime`| 100     | $199     | `payment`    | `STRIPE_CONTRACTOR_LIFETIME_PRICE_ID` |

`STRIPE_PRICE_ID` is the legacy fallback for `homeowner` — `STRIPE_HOMEOWNER_REPORT_PRICE_ID`
takes precedence via `env.ts`:
```ts
stripePriceId: process.env.STRIPE_HOMEOWNER_REPORT_PRICE_ID ?? process.env.STRIPE_PRICE_ID
```

**`contractor_annual` is the only subscription mode.** All other tiers use `"payment"` mode.
The `isSubscription` check in the checkout route is the single source of truth for this.

---

## Checkout Session — Required Conventions

Always include all five metadata fields. The webhook depends on them.

```ts
metadata: {
  projectId:    String(id),          // webhook reads this to find the DB row
  productType,                        // e.g. "homeowner"
  selectedPlan: productType,          // duplicate — used for display in admin UI
  creditAmount: String(creditAmount), // e.g. "3" — webhook writes this to reportCredits
  accessToken:  String(accessToken),  // echoed back in success URL via {CHECKOUT_SESSION_ID}
}
```

**Never use `price_data` in line_items.** Always use a real Stripe Price ID:
```ts
// CORRECT
line_items: [{ price: priceId, quantity: 1 }]

// WRONG — bypasses Stripe Dashboard tracking, breaks stripe-replit-sync
line_items: [{ price_data: { unit_amount: 1900, ... } }]
```

**Success/cancel URL construction** — always use `env.frontendUrl` first so production
redirects land on the right domain even when the API and frontend are on separate origins:
```ts
const baseOrigin = env.frontendUrl?.replace(/\/$/, "")
  ?? `${req.protocol}://${req.get("x-forwarded-host") ?? req.get("host") ?? "localhost"}`;
```

The success URL embeds the Stripe template literal `{CHECKOUT_SESSION_ID}` so the
payment-success page can display the session:
```ts
const successUrl = `${baseOrigin}/payment-success?projectId=${id}&session_id={CHECKOUT_SESSION_ID}&accessToken=${accessToken}`;
```

---

## Webhook Handler — Rules

**Location:** `artifacts/api-server/src/app.ts`, registered BEFORE `express.json()`.

```ts
// CORRECT order in app.ts
app.post("/api/stripe/webhook", express.raw({ type: "application/json" }), handler);
app.use(express.json());   // all other routes after this
```

Webhook flow on `checkout.session.completed`:
```ts
if (event.type === "checkout.session.completed") {
  const session = event.data.object;
  const projectId = parseInt(session.metadata?.projectId ?? "", 10);
  const productType = session.metadata?.productType ?? "homeowner";

  if (!isNaN(projectId) && session.payment_status === "paid") {
    const reportCredits = parseInt(session.metadata?.creditAmount ?? "1", 10);
    await db.update(projectsTable).set({
      paidAt:          new Date(),
      stripeSessionId: session.id,
      paymentStatus:   "paid",
      selectedPlan:    productType,
      entitlementType: productType,
      reportCredits,
      paidAmount:      session.amount_total ?? null,
    }).where(eq(projectsTable.id, projectId));
  }
}
// Always also call stripe-replit-sync
await WebhookHandlers.processWebhook(payload, sig);
```

**Never** add business logic after `WebhookHandlers.processWebhook` — it throws on bad
signatures and that would silently skip your logic.

---

## Entitlement Enforcement

The single source of truth is `project.paidAt` in the DB.

| Endpoint                        | Unpaid behavior                     |
|---------------------------------|-------------------------------------|
| `GET /projects/:id`             | Returns `previewProject()` — strips cost, BOM, savings, payback data |
| `GET /projects/:id/report`      | 402 Payment Required                |
| `POST /projects/:id/calculate`  | Returns preview fields only (sizing, no costs) |
| `POST /projects/:id/create-checkout-session` | 400 if already paid (`project.paidAt` is set) |

`previewProject()` (in `middlewares/auth.ts`) strips `estimatedYearlySavings`,
`paybackYears`, `totalSystemCost`, and the full BOM.  
`sanitizeProject()` strips only `accessToken` — safe to call for paid projects.

---

## Environment Variables

All live in `artifacts/api-server/src/config/env.ts`. Set secrets via Replit Secrets panel,
never in `.env` files or committed code.

| Env var                               | Purpose                                   |
|---------------------------------------|-------------------------------------------|
| `STRIPE_SECRET_KEY`                   | API secret (via Replit Stripe connector)  |
| `STRIPE_PUBLISHABLE_KEY`              | Public key for frontend                   |
| `STRIPE_WEBHOOK_SECRET`               | Signature verification                    |
| `STRIPE_HOMEOWNER_REPORT_PRICE_ID`    | Homeowner tier price ID                   |
| `STRIPE_PRICE_ID`                     | Legacy fallback for homeowner             |
| `STRIPE_PROPERTY_PACK_PRICE_ID`       | Property Pack price ID                    |
| `STRIPE_CONTRACTOR_ANNUAL_PRICE_ID`   | Contractor Annual price ID                |
| `STRIPE_CONTRACTOR_LIFETIME_PRICE_ID` | Contractor Lifetime price ID              |
| `FRONTEND_URL`                        | Production frontend origin for redirects  |

---

## Adding a New Pricing Tier — Checklist

When adding a new tier, you must update **all** of these in one go:

- [ ] Create the Price in Stripe Dashboard (use a real Price ID, not `price_data`)
- [ ] Add the env var to `artifacts/api-server/src/config/env.ts` (`env` object)
- [ ] Add the env var to Replit Secrets (dev + production)
- [ ] Add the entry to `priceMap` in `routes/projects.ts` (`create-checkout-session` route)
- [ ] Add the entry to `creditsMap` in the same route
- [ ] Add `isSubscription` logic if the new tier is recurring
- [ ] Mirror the credit count in the webhook handler (reads from `metadata.creditAmount` — already handles arbitrary values, just verify)
- [ ] Update `purchases.tsx` and any admin UI that displays plan names
- [ ] Update paywall tests in `src/__tests__/paywall.test.ts`

---

## Common Mistakes to Avoid

**Missing metadata fields on checkout session** — the webhook will silently skip entitlement
if `projectId` or `creditAmount` is missing from `session.metadata`.

**Calling `constructStripeEvent` with a pre-parsed body** — the signature check requires the
raw buffer, not a parsed JS object. The webhook route must use `express.raw()` not `express.json()`.

**Checking `session.status === "complete"` instead of `session.payment_status === "paid"`** —
`payment_status` is the correct field for one-time payments. `status` covers subscription lifecycle.

**Hardcoding the success URL origin** — always use `env.frontendUrl` in production or
the access token will redirect to the wrong domain.

**Granting entitlement in the checkout route instead of the webhook** — the user can close
the browser before hitting the success URL. Only the webhook is reliable.

---

## Testing

Run the 9-test paywall suite against the live dev server:
```bash
API_BASE_URL=http://localhost:8080/api ADMIN_TOKEN=<token> \
  node --test artifacts/api-server/src/__tests__/paywall.test.ts
```

Tests cover: no-token → 404, wrong token → 404, unpaid preview enforcement,
402 on report, admin bypass, checkout auth, calculate preview, and purchases auth.

To test the full checkout flow end-to-end in dev, use Stripe CLI to forward webhooks:
```bash
stripe listen --forward-to localhost:8080/api/stripe/webhook
```
Then use a Stripe test card (e.g. `4242 4242 4242 4242`, any future date, any CVC).
