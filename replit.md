# OffGrid Solar Builder

A professional mobile-friendly SaaS web app for designing solar systems (off-grid, grid-tied, hybrid).

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string

## Backing up a version to GitHub

Every major working version should be backed up to GitHub (repo: `inhouseconsulting2018-star/off-grid-builder`). The flow is **backup branch → pull request → merge into `main`**, which keeps `main` protected.

Do this from Replit's **Git pane** (left sidebar, the branch icon) — no terminal needed:

1. **Connect GitHub once.** In the Git pane, make sure your GitHub account is connected (Replit handles the push credentials for you — no tokens or passwords to paste). If you see a "Connect to GitHub" prompt, click it and authorize.
2. **Create a backup branch.** Click the current branch name at the top of the Git pane and choose **Create branch**. Name it something like `backup/2026-06-12-working` (use today's date or a version label).
3. **Commit your changes.** Type a short message (e.g. "Working version: <what's new>") and click **Commit all & push**. This pushes the backup branch to GitHub.
4. **Open a pull request.** Go to the repo on GitHub — it will offer a "Compare & pull request" button for the branch you just pushed. Open the PR against `main`.
5. **Merge the PR.** Review and click **Merge pull request**. Your backed-up version is now safely in `main`, and the backup branch remains as a snapshot.

For a quick recoverable snapshot you can stop after step 3 — the branch on GitHub already has your code. Steps 4–5 are what land it in `main`.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5 (port 8080, proxied at `/api`)
- DB: PostgreSQL + Drizzle ORM
- Frontend: React + Vite (proxied at `/`)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)
- Charts: Recharts

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for API contract)
- `lib/db/src/schema/projects.ts` — Drizzle ORM schema
- `artifacts/api-server/src/lib/solar-calculator.ts` — core solar sizing engine
- `artifacts/api-server/src/lib/pvwatts.ts` — NREL PVWatts v8 API client
- `artifacts/api-server/src/routes/projects.ts` — API routes
- `artifacts/offgrid-solar/src/pages/results.tsx` — full solar design report page
- `artifacts/offgrid-solar/src/pages/wizard.tsx` — 5-step new project wizard
- `artifacts/offgrid-solar/src/pages/edit-project.tsx` — project edit form
- `lib/api-client-react/` — generated React Query hooks (do not edit directly)
- `lib/api-zod/` — generated Zod schemas (do not edit directly)

## Architecture decisions

- **Contract-first API**: OpenAPI spec drives everything. Edit `openapi.yaml`, run codegen, get typed hooks and Zod schemas automatically.
- **JSONB calc result**: `calculationResult` stored as JSONB so we can add PVWatts fields without schema migrations.
- **PVWatts fallback**: If `PVWATTS_API_KEY` is absent or the API call fails, calculations fall back gracefully to state-based peak sun hour estimates. The `pvwattsSource` field indicates which was used (`"pvwatts"` | `"fallback"`).
- **Single calculate endpoint**: `POST /api/projects/:id/calculate` runs both the local calculator and PVWatts enrichment, persists the merged result, returns it.

## Product

Users design solar systems by entering their location, energy usage, budget, and backup needs through a 5-step wizard. The app produces a professional solar design report including: system sizing (kW, panels, inverter, battery), real NREL PVWatts production estimates with monthly charts, cost estimates (DIY vs installed), system loss breakdown, battery system guide, equipment BOM, and design notes. Reports can be downloaded as PDF.

## NREL PVWatts API Setup

The app integrates with NREL PVWatts v8 for real solar production estimates (monthly kWh, irradiance, capacity factor). Without the key it falls back to state-based estimates automatically.

**To enable PVWatts:**
1. Get a free API key at: https://developer.nrel.gov/signup/
2. In the Replit Secrets tab, add: `PVWATTS_API_KEY` = `<your key>`
3. Recalculate any project by visiting its report page and clicking "Edit" → save (or call `POST /api/projects/:id/calculate`)
4. The report will then show the green "Real NREL PVWatts Data" badge and a monthly production chart.

**DEMO_KEY:** NREL offers a `DEMO_KEY` (limited to ~50 req/day, IP-restricted) if you want to test before getting a full key. Set `PVWATTS_API_KEY=DEMO_KEY`.

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Do not change `info.title` in `openapi.yaml` — it controls generated filenames.
- After editing `openapi.yaml`, always run `pnpm --filter @workspace/api-spec run codegen`.
- The `roofPitch` field stores mixed formats: degrees ("20"), fractions ("4/12"), or named values ("fixed", "single-axis"). The PVWatts client handles all formats.
- `backupHours === -1` is the sentinel for "custom" — only use `customBackupHours` in that case.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
