-- Migration 003: database-backed trial and promo report entitlements.
-- Safe to run repeatedly through Drizzle push; this file also documents the
-- production schema for manual recovery.

CREATE TABLE IF NOT EXISTS promo_codes (
  id serial PRIMARY KEY,
  code text NOT NULL,
  purpose text NOT NULL DEFAULT 'Free professional solar report',
  active boolean NOT NULL DEFAULT true,
  max_redemptions integer,
  max_redemptions_per_email integer NOT NULL DEFAULT 1,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS promo_codes_code_unique ON promo_codes(code);

CREATE TABLE IF NOT EXISTS promo_redemptions (
  id serial PRIMARY KEY,
  promo_code_id integer NOT NULL REFERENCES promo_codes(id),
  project_id integer NOT NULL REFERENCES projects(id),
  email text NOT NULL,
  redeemed_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS promo_redemptions_code_project_unique
  ON promo_redemptions(promo_code_id, project_id);
