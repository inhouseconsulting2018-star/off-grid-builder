# Analytics Setup

The frontend emits these events through both `window.dataLayer` and the
`offgrid:analytics` browser event:

- `start_estimate`
- `preview_generated`
- `pricing_viewed`
- `checkout_clicked`
- `purchase_completed`
- `pdf_downloaded`
- `contractor_beta_clicked`

No analytics provider or customer identifier is hardcoded in the repository.

To connect Google Tag Manager:

1. Add the GTM container script using a Replit production environment variable.
2. Configure GTM custom-event triggers matching the event names above.
3. Forward those triggers to GA4 events with the same names.
4. Do not send project access tokens, addresses, email addresses, or Stripe IDs.
5. Verify events in GTM Preview and GA4 DebugView before enabling production tracking.

The existing event payloads contain only plan names, page paths, and numeric project IDs.
