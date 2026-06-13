---
name: Drizzle unique-violation detection
description: How to detect Postgres unique-constraint (23505) errors when using drizzle-orm node-postgres
---

When a query fails inside drizzle-orm (node-postgres driver), drizzle wraps the
driver error in a `_DrizzleQueryError`. The original Postgres error — the one
whose `.code === "23505"` for a unique-constraint violation — is NOT on the top
object; it sits on `.cause` (and may be nested further).

**Rule:** To classify a duplicate/unique violation, walk the `.cause` chain and
check each level for `code === "23505"`. Checking only the top-level error's
`.code` will miss it and the error escapes to your generic 500 handler.

**Why:** The promo redemption flow reserves a row guarded by a unique
`(code,email)` index; a duplicate must be reported to the user as `used` (422),
not a 500. A top-level-only `.code` check returned 500 for legitimate re-use.

**How to apply:** Any catch block that needs to distinguish a unique violation
(idempotent reservations, upserts done as insert-then-catch) must unwrap the
cause chain, not just read `error.code`. Inside a `db.transaction`, catching the
violation and returning normally is fine — drizzle's COMMIT on an already-aborted
transaction is treated by Postgres as a rollback and does not throw.
