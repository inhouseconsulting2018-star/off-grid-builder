# OffGrid Solar Builder

A professional mobile-friendly SaaS web app for designing off-grid, grid-tied, and hybrid solar systems. Users enter their location, energy usage, budget, and backup needs through a guided wizard. The app produces a full solar design report including system sizing, real NREL PVWatts production estimates, cost estimates (DIY vs installed), battery system guidance, equipment BOM, and PDF download.

---

## Quick Start

### Prerequisites

- [Node.js 20+](https://nodejs.org/)
- [pnpm 9+](https://pnpm.io/installation): `npm install -g pnpm`
- PostgreSQL 15+ (local or managed, e.g. Neon, Supabase, Railway)

### 1. Install dependencies

```bash
pnpm install
```

### 2. Set environment variables

Copy and fill in:

```bash
cp .env.example .env
```

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | Postgres connection string, e.g. `postgres://user:pass@host:5432/dbname` |
| `SESSION_SECRET` | Yes | Random secret for session signing (use `openssl rand -hex 32`) |
| `PVWATTS_API_KEY` | Optional | NREL PVWatts v8 API key — falls back to state-based estimates without it. Get a free key at [developer.nrel.gov](https://developer.nrel.gov/signup/) |
| `STRIPE_PRICE_ID` | Optional | Stripe Price ID for the report unlock payment. Leave unset to disable payments. |

### 3. Push the database schema

```bash
pnpm --filter @workspace/db run push
```

### 4. Start the development servers

Two servers run in parallel — start each in its own terminal:

```bash
# Terminal 1: API server (port 8080, proxied at /api)
pnpm --filter @workspace/api-server run dev

# Terminal 2: React frontend (proxied at /)
pnpm --filter @workspace/offgrid-solar run dev
```

Then open: **http://localhost:80**

---

## Project Structure

```
offgrid-solar-builder/
├── artifacts/
│   ├── api-server/          # Express 5 API server
│   │   └── src/
│   │       ├── lib/
│   │       │   ├── solar-calculator.ts   # Core sizing engine
│   │       │   ├── pvwatts.ts            # NREL PVWatts v8 client
│   │       │   └── geocode.ts            # Shared geocoding helper
│   │       └── routes/
│   │           ├── projects.ts           # CRUD + calculate + regeocode
│   │           ├── geocode.ts            # Address autocomplete + coords
│   │           ├── settings.ts           # Admin calc settings
│   │           └── payments.ts           # Stripe Checkout
│   └── offgrid-solar/       # React + Vite frontend
│       └── src/
│           ├── pages/
│           │   ├── wizard.tsx            # 5-step new project wizard
│           │   ├── edit-project.tsx      # Project edit form
│           │   ├── results.tsx           # Full solar design report
│           │   └── settings.tsx          # Admin settings UI
│           └── components/
│               └── DashboardMap.tsx      # Leaflet map with project pins
├── lib/
│   ├── api-spec/
│   │   └── openapi.yaml     # OpenAPI spec (source of truth for the API)
│   ├── api-client-react/    # Generated React Query hooks — DO NOT EDIT
│   ├── api-zod/             # Generated Zod schemas — DO NOT EDIT
│   └── db/
│       └── src/schema/      # Drizzle ORM schema
└── scripts/                 # Utility scripts
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Language | TypeScript 5.9, Node.js 24 |
| Monorepo | pnpm workspaces |
| API | Express 5 |
| Database | PostgreSQL + Drizzle ORM |
| Frontend | React 19 + Vite 7 |
| UI Components | shadcn/ui + Tailwind CSS |
| Charts | Recharts |
| Maps | Leaflet (react-leaflet) |
| Forms | React Hook Form + Zod |
| Data fetching | TanStack Query (React Query) |
| API codegen | Orval (from OpenAPI spec) |
| Build | esbuild (API), Vite (frontend) |
| Payments | Stripe Checkout |
| Solar data | NREL PVWatts v8 API |
| Geocoding | Nominatim (OpenStreetMap) |

---

## Development Workflow

### Regenerate API types after changing the OpenAPI spec

Always edit `lib/api-spec/openapi.yaml` first (contract-first), then regenerate:

```bash
pnpm --filter @workspace/api-spec run codegen
```

This regenerates `lib/api-client-react/` and `lib/api-zod/` — never edit those files directly.

### Full typecheck

```bash
pnpm run typecheck
```

### Apply database schema changes

```bash
pnpm --filter @workspace/db run push
```

---

## Architecture Notes

- **Contract-first API**: The OpenAPI spec (`lib/api-spec/openapi.yaml`) is the single source of truth. Editing it and running codegen automatically produces typed React Query hooks and Zod validation schemas.
- **JSONB calculation result**: `calculationResult` is stored as JSONB, so new PVWatts fields can be added without schema migrations.
- **PVWatts fallback**: If `PVWATTS_API_KEY` is absent or the API call fails, calculations fall back to state-based peak sun hour estimates. The `pvwattsSource` field indicates which path was used (`"pvwatts"` | `"fallback"`).
- **Geocoding strategy**: Address → structured Nominatim query → free-form query → ZIP centroid → city centroid, each labeled with an accuracy level (`exact` / `zip` / `city`). Results are saved to the project so the dashboard map never re-geocodes unless you click Re-geocode.
- **Reverse proxy routing**: A shared proxy routes `/api` to the Express server and `/` to the Vite dev server. All services bind to the `PORT` environment variable.

---

## Using with Codex

This project is structured for clean AI-assisted development:

- **Edit the OpenAPI spec first**, then run codegen — Codex should follow this pattern.
- **Never edit** `lib/api-client-react/` or `lib/api-zod/` directly.
- The solar calculator (`artifacts/api-server/src/lib/solar-calculator.ts`) is the core engine — all sizing logic lives there.
- Settings (panel wattage, loss percentages, cost tiers) are stored in the database and loaded at calc time — no hardcoded constants in routes.
- TypeScript is strict throughout. Run `pnpm run typecheck` before committing.

---

## Environment Setup Example

Create a `.env` file in the project root:

```env
DATABASE_URL=postgres://postgres:password@localhost:5432/offgrid_solar
SESSION_SECRET=your-random-secret-here
PVWATTS_API_KEY=your-nrel-key-here
STRIPE_PRICE_ID=price_xxxxxxxxxxxx
```

---

## License

MIT
