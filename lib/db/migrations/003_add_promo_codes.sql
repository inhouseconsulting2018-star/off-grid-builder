-- Migration 003: promo / trial code system + 440W panel default backfill
-- Safe to run multiple times (IF NOT EXISTS / ON CONFLICT / guarded UPDATE).
-- Run against dev and prod before deploying the hard-launch build.
--
-- A redeemed promo code grants a project the same entitlement a Stripe purchase
-- would, so the existing report.pdf gate, paid results view, and email delivery
-- all keep working unchanged. The app also re-seeds SOLARTRIAL at startup
-- (seedDefaultPromoCode), so this seed is belt-and-suspenders.

-- ─── promo_codes ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS promo_codes (
  id               serial PRIMARY KEY,
  code             text        NOT NULL,
  description      text        NOT NULL DEFAULT '',
  entitlement_type text        NOT NULL DEFAULT 'promo_trial',
  granted_plan     text        NOT NULL DEFAULT 'homeowner_report',
  max_redemptions  integer,                       -- null = unlimited
  redemption_count integer     NOT NULL DEFAULT 0,
  expires_at       timestamptz,                   -- null = never expires
  active           boolean     NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_code_unique
  ON promo_codes (code);

-- ─── promo_redemptions ──────────────────────────────────────────────────────
-- Unique indexes provide race-proof abuse prevention: one redemption per
-- (code, email) and one per (code, project).
CREATE TABLE IF NOT EXISTS promo_redemptions (
  id            serial PRIMARY KEY,
  promo_code_id integer     NOT NULL REFERENCES promo_codes (id),
  project_id    integer     NOT NULL REFERENCES projects (id),
  email         text        NOT NULL,            -- stored lowercase
  ip_hash       text,
  redeemed_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS promo_redemptions_code_email_unique
  ON promo_redemptions (promo_code_id, email);
CREATE UNIQUE INDEX IF NOT EXISTS promo_redemptions_code_project_unique
  ON promo_redemptions (promo_code_id, project_id);

-- ─── Seed the default trial code (idempotent) ───────────────────────────────
INSERT INTO promo_codes (code, description, entitlement_type, granted_plan, active)
VALUES ('SOLARTRIAL', 'Default free trial code', 'promo_trial', 'homeowner_report', true)
ON CONFLICT (code) DO NOTHING;

-- ─── Panel wattage default 400 -> 440 backfill ──────────────────────────────
-- The new rule-of-thumb formula uses a 440W panel default. Existing settings
-- rows created under the old 400W default are bumped; admin-customized values
-- other than 400 are left untouched.
UPDATE settings SET panel_wattage = 440 WHERE panel_wattage = 400;
