# Manual Paid Report QA Checklist

Run this in Stripe test mode only. Use test-mode Price IDs and the test webhook signing secret.

1. Create a new project at `/wizard` using `2365 Myers Dr, Santa Rosa, CA 95403`.
2. Confirm the results page shows only the free preview ranges: system size range, panel count range, production range, cost range, and basic recommendation.
3. Confirm the full report sections are locked and no equipment BOM, exact monthly production, losses breakdown, or printable report appears before payment.
4. Click `Unlock Full Report - $19` or select the desired paid plan.
5. Confirm Stripe Checkout opens and the selected plan/price is correct.
6. Pay with Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC, and any ZIP.
7. Confirm the browser returns to `/payment-success` and the project access token is preserved in the URL.
8. Open the full report from the success page and confirm the report is unlocked after refresh.
9. Confirm the full BOM/equipment list, monthly production, losses breakdown, and PDF download button are visible.
10. Click the PDF download button and confirm a PDF downloads.
11. Open the same project URL without `accessToken`; confirm the API/UI denies access.
12. Open another project ID with the wrong token; confirm it cannot be read, updated, calculated, reported, or downloaded.
13. Open `/admin/purchases` without a token; confirm it asks for `ADMIN_TOKEN`.
14. Enter the configured `ADMIN_TOKEN`; confirm purchases load and show selected plan, credits, payment status, Stripe session, and delivery status.
15. In Stripe Dashboard, confirm a `checkout.session.completed` webhook was delivered to `/api/stripe/webhook`.
