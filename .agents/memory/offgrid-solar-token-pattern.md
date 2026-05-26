---
name: OffGrid Solar token pattern
description: How the accessToken flows from project creation through the frontend
---

On project creation (`POST /projects`), the API returns `{ id, accessToken }`.
The frontend stores it in `sessionStorage` as `project-token-${id}`.
All subsequent API requests for that project include the header `x-access-token: <token>`.
The server middleware checks the token before returning project data.

Pages that read/persist the token: `results.tsx`, `edit-project.tsx`, `payment-success.tsx`.
`payment-success.tsx` also reads the token from URL search params (`?accessToken=...`) as fallback.

**Why:** Projects are anonymous (no user auth) — the accessToken is the only proof of ownership.
