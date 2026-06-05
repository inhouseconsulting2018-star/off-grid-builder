# Paid Launch Migration Notes

Before deploying paid report unlocks, apply the project access columns:

```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS access_token text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_user_id text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_guest_project boolean NOT NULL DEFAULT true;

UPDATE projects
SET access_token = encode(gen_random_bytes(32), 'base64')
WHERE access_token IS NULL OR access_token = '';

ALTER TABLE projects ALTER COLUMN access_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS projects_access_token_unique ON projects(access_token);
```

The `gen_random_bytes` function requires PostgreSQL `pgcrypto`:

```sql
CREATE EXTENSION IF NOT EXISTS pgcrypto;
```

Confirm these existing paid-report columns also exist before enabling Stripe webhooks:

```sql
ALTER TABLE projects ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS stripe_session_id text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS stripe_price_id text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS entitlement_type text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS selected_plan text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS paid_amount integer;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS report_credits integer NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS credits_used integer NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS payment_status text NOT NULL DEFAULT 'unpaid';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contractor_status boolean NOT NULL DEFAULT false;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS contractor_plan text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS purchaser_email text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS report_delivery_status text NOT NULL DEFAULT 'not_sent';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS report_delivered_at timestamptz;
```

Launch plan credit behavior:

- `homeowner_report`: marks the current project paid and records 1 included report credit.
- `property_pack`: marks the current project paid and records 3 report credits tied to the guest project access token for now.
- `contractor_annual`: marks contractor status and records 50 annual report credits.
- `contractor_lifetime_beta`: marks contractor beta status and records 100 included report credits.

The checked-in migration files are:

```bash
psql "$DATABASE_URL" -f lib/db/migrations/001_add_access_token.sql
psql "$DATABASE_URL" -f lib/db/migrations/002_add_payment_entitlement.sql
```

I did not apply these migrations from this local workspace because no production
database connection was available here.
