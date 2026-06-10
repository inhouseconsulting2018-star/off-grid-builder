#!/usr/bin/env bash
set -euo pipefail

# Creates Stripe TEST-mode products/prices for OffGrid Solar Builder and prints
# the exact environment variables to paste into Replit/hosting secrets.
#
# Requirements:
#   1. Install Stripe CLI: https://stripe.com/docs/stripe-cli
#   2. Run: stripe login
#   3. From repo root: bash scripts/setup-stripe-test.sh
#
# Optional:
#   PUBLIC_BASE_URL=https://offgridsolarbuilder.com bash scripts/setup-stripe-test.sh

APP_NAME="offgrid-solar-builder"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://offgridsolarbuilder.com}"

if ! command -v stripe >/dev/null 2>&1; then
  echo "Stripe CLI is not installed."
  echo "Install it from: https://stripe.com/docs/stripe-cli"
  exit 1
fi

if ! stripe config --list >/dev/null 2>&1; then
  echo "Stripe CLI is not logged in."
  echo "Run: stripe login"
  exit 1
fi

json_get() {
  python3 - "$1" <<'PY'
import json
import sys

key = sys.argv[1]
data = json.load(sys.stdin)
value = data
for part in key.split("."):
    if isinstance(value, list):
        value = value[int(part)]
    else:
        value = value.get(part)
print("" if value is None else value)
PY
}

create_product() {
  local name="$1"
  local description="$2"
  local type="$3"

  stripe products create \
    --name "$name" \
    --description "$description" \
    -d "metadata[app]=$APP_NAME" \
    -d "metadata[type]=$type" \
    --format json | json_get id
}

create_price() {
  local product_id="$1"
  local cents="$2"
  local type="$3"
  local interval="${4:-}"

  if [[ -n "$interval" ]]; then
    stripe prices create \
      --currency usd \
      --unit-amount "$cents" \
      --product "$product_id" \
      -d "recurring[interval]=$interval" \
      -d "metadata[app]=$APP_NAME" \
      -d "metadata[type]=$type" \
      --format json | json_get id
  else
    stripe prices create \
      --currency usd \
      --unit-amount "$cents" \
      --product "$product_id" \
      -d "metadata[app]=$APP_NAME" \
      -d "metadata[type]=$type" \
      --format json | json_get id
  fi
}

echo "Creating Stripe TEST-mode products and prices..."
echo

homeowner_product=$(create_product "Homeowner Full Report" "One full OffGrid Solar Builder report and branded PDF for one project." "homeowner_report")
homeowner_price=$(create_price "$homeowner_product" 1900 "homeowner_report")

property_product=$(create_product "Property Pack" "Three full report credits for guest homeowner projects." "property_pack")
property_price=$(create_price "$property_product" 3900 "property_pack")

annual_product=$(create_product "Contractor Annual Access" "Annual contractor access with 50 full report credits." "contractor_annual")
annual_price=$(create_price "$annual_product" 14900 "contractor_annual" "year")

lifetime_product=$(create_product "Contractor Lifetime Beta" "Founding contractor beta plan with 100 full report credits and core calculator access." "contractor_lifetime_beta")
lifetime_price=$(create_price "$lifetime_product" 19900 "contractor_lifetime_beta")

echo "Creating webhook endpoint for:"
echo "  ${PUBLIC_BASE_URL}/api/stripe/webhook"
echo

webhook_json=$(stripe webhook_endpoints create \
  --url "${PUBLIC_BASE_URL}/api/stripe/webhook" \
  --enabled-events checkout.session.completed \
  --format json)
webhook_secret=$(printf '%s' "$webhook_json" | json_get secret)

cat <<EOF

Done. Paste these into Replit Secrets / deployment env vars:

STRIPE_HOMEOWNER_REPORT_PRICE_ID=$homeowner_price
STRIPE_PROPERTY_PACK_PRICE_ID=$property_price
STRIPE_CONTRACTOR_ANNUAL_PRICE_ID=$annual_price
STRIPE_CONTRACTOR_LIFETIME_PRICE_ID=$lifetime_price
STRIPE_PRICE_ID=$homeowner_price
STRIPE_WEBHOOK_SECRET=$webhook_secret

You still need to set these separately:

DATABASE_URL=your-postgres-connection-string
ADMIN_TOKEN=your-random-admin-token
STRIPE_SECRET_KEY=your-test-mode-stripe-secret-key
NREL_API_KEY=your-nrel-api-key

Test card:
4242 4242 4242 4242
Any future expiry, any CVC, any ZIP.

Important:
- This script uses the Stripe CLI account/mode you are logged into.
- Keep the Stripe Dashboard in TEST mode until checkout and webhook unlocks work.
- Do not commit any of the values printed above.
EOF
