---
name: OffGrid prod schema/data deploy mechanism
description: How schema and data changes reach the live production DB; why lib/db/migrations/*.sql are NOT the mechanism.
---

# Production schema changes go through Replit Publish, not SQL files

This is a Drizzle + Replit managed-Postgres project. The production database
schema is updated **only** by the Replit Publish flow, which diffs the dev
schema against prod and applies the difference on deploy. The dev database is
updated by `pnpm --filter @workspace/db run push` (and the post-merge script).

**Why it matters:** the `lib/db/migrations/*.sql` files (001, 002, …) are
hand-written and are NOT applied by `db push`, by deploy, or by anything
automatic — they are legacy/manual artifacts. Treating them as the prod path is
the documented anti-pattern: never run DDL against prod by hand, never add a
deploy-build `db:push`, never add startup-time DDL. `executeSql({environment:
"production"})` is read-only and cannot run DDL anyway.

**How to apply:**
- Schema change → edit the Drizzle schema (source of truth), push to dev, verify,
  then tell the user to **re-publish**. Additive changes (new tables/columns) are
  safe; renames/drops trigger a confirmation prompt in the Publish UI.
- **Data** changes are NOT carried by the schema diff. A column-default change
  (e.g. settings.panel_wattage default 400→440) only affects NEW rows; existing
  prod rows keep their old value. Backfilling existing prod data is a manual
  post-publish action (e.g. set panel wattage in the prod admin Settings page) —
  do NOT use Publish's "overwrite data" option, which would wipe real prod data
  (projects, payments).
