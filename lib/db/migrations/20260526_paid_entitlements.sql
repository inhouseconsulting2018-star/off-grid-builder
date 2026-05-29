CREATE EXTENSION IF NOT EXISTS pgcrypto;

ALTER TABLE projects ADD COLUMN IF NOT EXISTS access_token text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_user_id text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_guest_project boolean NOT NULL DEFAULT true;

UPDATE projects
SET access_token = encode(gen_random_bytes(32), 'base64')
WHERE access_token IS NULL OR access_token = '';

ALTER TABLE projects ALTER COLUMN access_token SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS projects_access_token_unique ON projects(access_token);

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

ALTER TABLE projects ADD COLUMN IF NOT EXISTS lat real;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS lon real;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS location_accuracy text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS use_manual_coords boolean NOT NULL DEFAULT false;
