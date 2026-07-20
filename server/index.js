// Finance Guardian local backend.
// - Serves the REST API at {BASE_PATH}/api/*
// - In production, also serves the built frontend from /dist under {BASE_PATH}
// Mounted under a base path (default /finance-guardian) so multiple local apps
// can share a host. Keep BASE_PATH in sync with vite.config.ts.
// Run: npm run server   (dev)  or  npm start  (build + serve on one port)
import express from "express";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as store from "./db.js";
import * as plaid from "./plaid.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 8787;
const BASE_PATH = process.env.BASE_PATH || "/finance-guardian";
const INSTANCE = process.env.FG_INSTANCE || "local";

const app = express();
app.use(express.json({ limit: "1mb" }));

// Permissive CORS so the Vite dev server (different port) can talk to us.
// In single-process production mode this is same-origin and a no-op.
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "*");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  res.header("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

const ok = (res, data = { ok: true }) => res.json(data);
const wrap = (fn) => (req, res) => {
  try {
    return fn(req, res);
  } catch (e) {
    console.error(`[api] ${req.method} ${req.path}`, e);
    res.status(500).json({ error: e instanceof Error ? e.message : "Unknown error" });
  }
};

// ----- API router, mounted at {BASE_PATH}/api -----
const api = express.Router();

api.get("/health", (_req, res) => ok(res, { ok: true, ts: new Date().toISOString() }));

// Which instance is this + Plaid env — drives the DEMO/LIVE badge in the UI.
api.get("/config", (_req, res) => res.json({ instance: INSTANCE, plaid: plaid.plaidStatus() }));

// Full app state for store hydration
api.get("/state", wrap((_req, res) => res.json(store.getState())));

// Mutations — mirror the Zustand store actions
api.post("/transactions/:id/recategorize", wrap((req, res) => {
  const { category } = req.body ?? {};
  if (!category) return res.status(400).json({ error: "category required" });
  const found = store.recategorize(req.params.id, category);
  if (!found) return res.status(404).json({ error: "transaction not found" });
  ok(res);
}));

api.post("/institutions", wrap((req, res) => {
  const { institutionName, accounts = [], transactions = [] } = req.body ?? {};
  if (!institutionName) return res.status(400).json({ error: "institutionName required" });
  store.addInstitution(institutionName, accounts, transactions);
  ok(res);
}));

api.post("/budgets", wrap((req, res) => {
  const { category, amount } = req.body ?? {};
  if (!category || typeof amount !== "number") return res.status(400).json({ error: "category and numeric amount required" });
  store.setBudget(category, amount);
  ok(res);
}));

// Auto-generate budget baselines from local transaction history (no Plaid call).
api.post("/budgets/generate", wrap((_req, res) => res.json({ created: plaid.generateBudgets() })));

api.post("/categories", wrap((req, res) => {
  const { name } = req.body ?? {};
  if (!name || !String(name).trim()) return res.status(400).json({ error: "name required" });
  res.json({ name: store.addCategory(name) });
}));

api.post("/income/:id/toggle", wrap((req, res) => {
  store.toggleIncome(req.params.id);
  ok(res);
}));

api.post("/income/:id/amount", wrap((req, res) => {
  const { amount } = req.body ?? {};
  if (typeof amount !== "number") return res.status(400).json({ error: "numeric amount required" });
  store.setIncomeAmount(req.params.id, amount);
  ok(res);
}));

// ----- Liabilities -----
api.patch("/accounts/:id/liability", wrap((req, res) => {
  const patch = req.body ?? {};
  const found = store.updateLiability(req.params.id, patch);
  if (!found) return res.status(404).json({ error: "account not found" });
  ok(res);
}));

// Freeze / refresh the checking snapshot used for payment allocation.
api.post("/liabilities/snapshot", wrap((req, res) => {
  const { value } = req.body ?? {};
  res.json({ fundingSnapshot: store.setFundingSnapshot(typeof value === "number" ? value : undefined) });
}));

// Manually reclassify an account's type (e.g. a brokerage CMA Plaid calls cash).
api.post("/accounts/:id/type", wrap((req, res) => {
  const { type } = req.body ?? {};
  if (!type) return res.status(400).json({ error: "type required" });
  try {
    if (!store.setAccountType(req.params.id, type)) return res.status(404).json({ error: "account not found" });
  } catch (e) {
    return res.status(400).json({ error: e instanceof Error ? e.message : "invalid type" });
  }
  ok(res);
}));

// Choose which cash account funds the payments.
api.post("/liabilities/funding", wrap((req, res) => {
  const { accountId } = req.body ?? {};
  if (!accountId) return res.status(400).json({ error: "accountId required" });
  if (!store.setFundingAccount(accountId)) return res.status(404).json({ error: "account not found" });
  ok(res);
}));

// ----- Plaid -----
const asyncWrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (e) {
    const pd = e?.response?.data;
    if (pd) console.error("[plaid]", req.path, pd);
    else console.error("[plaid]", req.path, e);
    res.status(502).json({ error: pd?.error_message || (e instanceof Error ? e.message : "Plaid error"), plaid: pd });
  }
};

api.get("/plaid/status", (_req, res) => res.json(plaid.plaidStatus()));

api.post("/plaid/link-token", asyncWrap(async (_req, res) => {
  if (!plaid.isConfigured()) return res.status(400).json({ error: "Plaid not configured" });
  const linkToken = await plaid.createLinkToken();
  res.json({ link_token: linkToken });
}));

api.post("/plaid/exchange", asyncWrap(async (req, res) => {
  const { public_token, institution } = req.body ?? {};
  if (!public_token) return res.status(400).json({ error: "public_token required" });
  const result = await plaid.exchangePublicToken(public_token, institution);
  res.json(result);
}));

api.post("/plaid/sync", asyncWrap(async (_req, res) => {
  const result = await plaid.syncAll();
  res.json(result);
}));

// Dev/sandbox smoke test: add a fake sandbox bank end-to-end, no browser needed.
api.post("/plaid/sandbox/quick-add", asyncWrap(async (req, res) => {
  if (!plaid.isConfigured()) return res.status(400).json({ error: "Plaid not configured" });
  const result = await plaid.sandboxQuickAdd(req.body?.institution_id);
  res.json(result);
}));

// Unknown API routes return JSON 404 (never fall through to the SPA shell)
api.use((_req, res) => res.status(404).json({ error: "not found" }));

app.use(`${BASE_PATH}/api`, api);

// ----- Serve built frontend in production (single process) -----
const distDir = join(__dirname, "..", "dist");
if (existsSync(distDir)) {
  app.use(BASE_PATH, express.static(distDir));
  // SPA fallback: any non-API path under BASE_PATH returns index.html
  app.get(`${BASE_PATH}/*`, (_req, res) => res.sendFile(join(distDir, "index.html")));
}

// Convenience: bare root redirects to the app's base path
app.get("/", (_req, res) => res.redirect(`${BASE_PATH}/`));

app.listen(PORT, () => {
  console.log(`Finance Guardian [${INSTANCE}] · Plaid ${plaid.plaidStatus().env}${plaid.isConfigured() ? "" : " (not configured)"}`);
  console.log(`  API   http://localhost:${PORT}${BASE_PATH}/api`);
  if (existsSync(distDir)) console.log(`  App   http://localhost:${PORT}${BASE_PATH}/`);
});
