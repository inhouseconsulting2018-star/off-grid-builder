-- Migration 002: add entitlement, credits, and payment-detail columns to projects
-- Safe to run multiple times (IF NOT EXISTS / DEFAULT guards).
-- Run against dev and prod before deploying the paid-launch v2 build.

-- Entitlement type: which plan the user purchased
ALTER TABLE projects ADD COLUMN IF NOT EXISTS entitlement_type text;

-- Report credit tracking
ALTER TABLE projects ADD COLUMN IF NOT EXISTS report_credits   integer NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS credits_used     integer NOT NULL DEFAULT 0;

-- Plan + payment detail snapshot
ALTER TABLE projects ADD COLUMN IF NOT EXISTS selected_plan    text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS paid_amount      integer;          -- in cents (USD)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS stripe_price_id  text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS payment_status   text NOT NULL DEFAULT 'unpaid';

-- Backfill payment_status for rows already paid via old flow (paidAt set, no payment_status)
UPDATE projects SET payment_status = 'paid' WHERE paid_at IS NOT NULL AND payment_status = 'unpaid';

-- Guest / owner identity (future auth integration, nullable now)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS owner_user_id    text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS is_guest_project boolean NOT NULL DEFAULT true;

-- Purchaser contact + report delivery (extended from migration 001)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS purchaser_email         text;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS report_delivery_status  text NOT NULL DEFAULT 'not_sent';
ALTER TABLE projects ADD COLUMN IF NOT EXISTS report_delivered_at     timestamptz;
