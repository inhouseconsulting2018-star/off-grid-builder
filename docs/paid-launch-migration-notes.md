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
ALTER TABLE projects ADD COLUMN IF NOT EXISTS purchaser_email text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS report_delivery_status text NOT NULL DEFAULT 'not_sent';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS report_delivered_at timestamptz;
```

