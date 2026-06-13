---
name: api-server node:test bundling
description: How to compile+run TypeScript node:test files in artifacts/api-server
---

The api-server has no test runner script; tests are TS files under
`src/__tests__`. To run one, bundle with esbuild then run with `node --test`.

Working recipe (run from `artifacts/api-server`):
- Output the bundle INSIDE the package dir (e.g. `.test-out/`) so runtime node
  module resolution finds the package's deps. `.test-out/` is gitignored.
- `npx esbuild <file>.ts --bundle --platform=node --format=esm ... --outfile=.test-out/x.mjs`
- `node --test .test-out/x.mjs`

Two gotchas:
- **CJS dynamic require** (e.g. `pg` does `require('events')`): an ESM bundle
  throws "Dynamic require of X is not supported" unless you inject a banner that
  defines a real require: `--banner:js="import {createRequire as cr} from 'node:module'; globalThis.require = cr(import.meta.url); ..."` (mirror `build.mjs`'s banner, which also sets __filename/__dirname).
- **Reaching the DB from a test**: api-server does NOT depend on `pg` directly,
  so `import pg from "pg"` fails to resolve. Import `{ pool }` (or `db`) from
  `@workspace/db` instead, and let esbuild bundle it (don't use
  `--packages=external`, or the package's extensionless relative .ts imports
  won't resolve at runtime). Externalize only native optional deps:
  `--external:pg-native --external:pg-cloudflare --external:cloudflare:sockets`.
- Integration tests hit the live dev server at `http://localhost:8080/api`
  (override with `API_BASE_URL`); PVWatts is DNS-blocked in dev so calc always
  takes the fallback path.
