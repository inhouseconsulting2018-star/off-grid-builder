---
name: OffGrid Solar admin token
description: How admin authentication works in the frontend and how to pass it to orval hooks
---

Admin routes (`GET /projects`, `GET /projects/stats/summary`, `GET /settings`, `PATCH /settings`) require `x-admin-token` header matching the `ADMIN_TOKEN` env var on the server.

**Frontend pattern:**
- `src/hooks/useAdminToken.ts` exports `getAdminToken()`, `saveAdminToken(token)`, and `adminRequestOpts(token)` which returns `{ headers: { "x-admin-token": token } }` or `undefined`
- Token stored in `localStorage` under key `"offgrid-admin-token"`
- Pages initialize state with `useState<string>(getAdminToken)` and render an unlock card when the token is absent
- Orval hooks receive the admin token via: `useListProjects({ request: adminRequestOpts(adminToken) })`

**Why:** The app has no user login system. The owner is the only admin. Entering the token once in the browser is sufficient — it persists in localStorage across sessions. No env var exposure needed.

**How to apply:** Any new page that calls an admin-only endpoint must: import `getAdminToken/saveAdminToken/adminRequestOpts`, initialize state from `getAdminToken`, pass `{ request: adminRequestOpts(adminToken) }` to the hook, and show the unlock card when `!adminToken`.
