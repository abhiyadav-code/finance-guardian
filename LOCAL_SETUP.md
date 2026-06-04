# Finance Guardian — Local Setup

Self-hosted, single-user setup for running on your Mac Mini. No cloud, no login.

## Architecture

```
Frontend (Vite/React)  ──/finance-guardian/api──▶  Node backend (Express)  ──▶  SQLite file
   (served by each backend)                          prod :8080 / demo :8081     prod.db / demo.db
```

The app is mounted under a **base path** (`/finance-guardian`) so multiple local
apps can live on one host with separate URLs. The base path is set once in
`vite.config.ts` (`BASE_PATH`) and mirrored by the server's `BASE_PATH` env var;
the router basename and API client both derive from it automatically.

To run several apps behind a single port later, put a reverse proxy (Caddy/nginx)
in front that maps each path prefix to that app's server — ask and I'll set it up.

- **Frontend** — the existing React app. UI state lives in a Zustand store that
  hydrates from the backend on load and persists every change.
- **Backend** — `server/` — a small Express API over SQLite (Node's built-in
  `node:sqlite`, no native build step). Your data is one file: `server/data/finance.db`.

## Two instances: demo + production

One codebase and one frontend build serve two independent instances, each with its
own database, port, and Plaid config:

| | **Demo** | **Production** |
| --- | --- | --- |
| URL | http://localhost:8081/finance-guardian/ | http://localhost:8080/finance-guardian/ |
| Data | seeded sample data | **your real data only** (starts empty) |
| Database | `server/data/demo.db` | `server/data/prod.db` |
| Plaid | Sandbox | Production |
| Config file | `server/.env.demo` | `server/.env.prod` |

A **DEMO** badge shows in the top bar of the demo instance so you never mix them up.

## Running it

**Host both instances (the normal way):**
```bash
npm install
npm run host         # builds, then runs prod (:8080) + demo (:8081) together
```

Or one at a time: `npm run start:prod` / `npm run start:demo`.

**Development (hot reload, against the demo backend):**
```bash
npm run dev:all      # Vite (:8090) + demo API (:8081)
```
Open http://localhost:8090/finance-guardian/.

## Your data

- Lives entirely in `server/data/finance.db` (git-ignored).
- **Back it up** by copying that file. **Reset** to fresh sample data by deleting
  the `server/data/` folder — it re-seeds on next start.
- First run seeds the same sample data the prototype shipped with.

## API surface (current)

All paths are under the base path, e.g. `/finance-guardian/api/state`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET  | `/api/health` | liveness check |
| GET  | `/api/state` | full app state for hydration |
| POST | `/api/transactions/:id/recategorize` | override a transaction's category |
| POST | `/api/institutions` | add accounts + transactions (connect flow) |
| POST | `/api/budgets` | set a category's monthly ceiling |
| POST | `/api/income/:id/toggle` | enable/disable an income stream |
| POST | `/api/income/:id/amount` | edit an income stream amount |
| GET  | `/api/plaid/status` | is Plaid configured + which env |
| POST | `/api/plaid/link-token` | create a Plaid Link token |
| POST | `/api/plaid/exchange` | exchange public token, store item, initial sync |
| POST | `/api/plaid/sync` | re-sync all connected items |
| POST | `/api/plaid/sandbox/quick-add` | (sandbox) add a fake bank end-to-end, no browser |

## Plaid setup (Phase 2)

1. Sign up at [dashboard.plaid.com](https://dashboard.plaid.com) → copy your **Sandbox**
   Client ID + secret.
2. `cp server/.env.example server/.env` and fill in `PLAID_CLIENT_ID` / `PLAID_SECRET`
   (leave `PLAID_ENV=sandbox`).
3. Restart the backend (`npm run server` or `npm run dev:all`).
4. **Smoke-test without a browser** — confirms your keys + the whole sync pipeline:
   ```bash
   curl -X POST http://localhost:8787/finance-guardian/api/plaid/sandbox/quick-add
   curl http://localhost:8787/finance-guardian/api/state   # see imported accounts/transactions
   ```
5. **Or test the real UI flow:** open the app → "Connect account" → Plaid Link opens →
   pick any sandbox bank → login `user_good` / `pass_good`. Accounts + transactions
   import and persist.

Access tokens are encrypted at rest (AES-256-GCM). The encryption key comes from
`FG_ENCRYPTION_KEY`, or is auto-generated at `server/data/secret.key` on first use.

Moving to **real banks** later = swap `PLAID_ENV=production` + production keys (and,
for OAuth banks like Chase, register an HTTPS redirect URI — we'll wire that when you're ready).

## Not done yet (next phases)

- **Phase 3 — Claude budgets**: move the `suggest-budgets` function off Lovable's
  cloud onto the backend, calling the Anthropic API with your key.
- **Phase 4 — Guardian logic**: anomaly/subscription detection + runway on real data.

The old hosted-Supabase dependency is being retired; the `suggest-budgets` button
on the Cash Flow page still points at it until Phase 3.
