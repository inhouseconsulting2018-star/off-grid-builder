-- Migration: add access control, payment, and report delivery columns to projects
-- Run once against your database before deploying paid launch.
-- Safe to run multiple times (IF NOT EXISTS / DEFAULT guards).

-- Required for pgcrypto-based token generation
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Access control columns
ALTER TABLE projects ADD COLUMN IF NOT EXISTS access_token text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_user_id text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_guest_project boolean NOT NULL DEFAULT true;

-- Backfill access tokens for any pre-launch rows that have none
UPDATE projects
SET access_token = encode(gen_random_bytes(32), 'base64')
WHERE access_token IS NULL OR access_token = '';

-- Enforce uniqueness (idempotent)
CREATE UNIQUE INDEX IF NOT EXISTS projects_access_token_unique ON projects(access_token);

-- Stripe payment fields
ALTER TABLE projects ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS stripe_session_id text;

-- Report delivery fields (added in paid-launch v2)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS purchaser_email text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS report_delivery_status text NOT NULL DEFAULT 'not_sent';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS report_delivered_at timestamptz;
