// Thin REST client for the local Finance Guardian backend.
// In dev, requests to /api are proxied to the Node server by Vite (see vite.config.ts).
// In production (single process), they're same-origin.
//
// STATIC DEMO MODE: when built with VITE_STATIC_DEMO=1 (the public GitHub Pages
// demo), there is no backend at all. Every call resolves locally against the
// bundled sample data so the whole app runs as a self-contained static site —
// perfect for sharing an interactive, mobile-friendly prototype with stakeholders.
import {
  transactions as demoTransactions,
  accounts as demoAccounts,
  DEFAULT_CATEGORIES,
  type Transaction,
  type Category,
} from "./finance-data";
import {
  seedIncome as demoIncome,
  seedOutflows as demoOutflows,
  seedBudgets as demoBudgets,
} from "./cashflow-data";
import type { Account, LiabilityPatch } from "./finance-store";

/** True when this build is the standalone, backend-less public demo. */
export const STATIC_DEMO = import.meta.env.VITE_STATIC_DEMO === "1";

// BASE_URL is the Vite `base` (e.g. "/finance-guardian/"), so the API lives at
// "/finance-guardian/api" and the whole app can move under any path in one place.
const BASE = `${import.meta.env.BASE_URL.replace(/\/$/, "")}/api`;

async function req<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(BASE + path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const detail = await res.json().catch(() => ({}));
    throw new Error((detail as { error?: string }).error || `${method} ${path} failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export type AppState = {
  accounts: Account[];
  transactions: Transaction[];
  income: import("./cashflow-data").IncomeStream[];
  outflows: import("./cashflow-data").OutflowStream[];
  budgets: Record<Category, number>;
  categories: Category[];
  fundingSnapshot: number | null;
};

export type Api = {
  getState: () => Promise<AppState>;
  recategorize: (id: string, category: Category) => Promise<unknown>;
  addInstitution: (institutionName: string, accounts: Account[], transactions: Transaction[]) => Promise<unknown>;
  setBudget: (category: Category, amount: number) => Promise<unknown>;
  addCategory: (name: string) => Promise<unknown>;
  toggleIncome: (id: string) => Promise<unknown>;
  setIncomeAmount: (id: string, amount: number) => Promise<unknown>;
  updateLiability: (id: string, patch: LiabilityPatch) => Promise<unknown>;
  setFundingSnapshot: (value?: number) => Promise<{ fundingSnapshot: number }>;
  setFundingAccount: (accountId: string) => Promise<unknown>;
  setAccountType: (id: string, type: Account["type"]) => Promise<unknown>;
  config: () => Promise<{ instance: string; plaid: { configured: boolean; env: string } }>;
  plaidStatus: () => Promise<{ configured: boolean; env: string }>;
  plaidLinkToken: () => Promise<{ link_token: string }>;
  plaidExchange: (
    public_token: string,
    institution?: { name?: string; institution_id?: string }
  ) => Promise<{ itemId: string; institutionName: string | null; accounts: number; transactionsAdded: number; holdings: number }>;
  plaidSync: () => Promise<{ items: number }>;
};

const liveApi: Api = {
  getState: () => req<AppState>("GET", "/state"),
  recategorize: (id, category) =>
    req("POST", `/transactions/${id}/recategorize`, { category }),
  addInstitution: (institutionName, accounts, transactions) =>
    req("POST", "/institutions", { institutionName, accounts, transactions }),
  setBudget: (category, amount) =>
    req("POST", "/budgets", { category, amount }),
  addCategory: (name) => req("POST", "/categories", { name }),
  toggleIncome: (id) => req("POST", `/income/${id}/toggle`),
  setIncomeAmount: (id, amount) =>
    req("POST", `/income/${id}/amount`, { amount }),
  updateLiability: (id, patch) => req("PATCH", `/accounts/${id}/liability`, patch),
  setFundingSnapshot: (value) => req("POST", "/liabilities/snapshot", { value }),
  setFundingAccount: (accountId) => req("POST", "/liabilities/funding", { accountId }),
  setAccountType: (id, type) => req("POST", `/accounts/${id}/type`, { type }),

  config: () => req("GET", "/config"),

  // Plaid
  plaidStatus: () => req("GET", "/plaid/status"),
  plaidLinkToken: () => req("POST", "/plaid/link-token"),
  plaidExchange: (public_token, institution) =>
    req("POST", "/plaid/exchange", { public_token, institution }),
  plaidSync: () => req("POST", "/plaid/sync"),
};

// Backend-less demo: everything resolves locally against the sample data.
// Mutations are no-ops on the wire — the Zustand store still updates the UI
// optimistically, so the prototype feels fully interactive in-session.
function demoState(): AppState {
  return {
    accounts: demoAccounts as unknown as Account[],
    transactions: demoTransactions,
    income: demoIncome,
    outflows: demoOutflows,
    budgets: Object.fromEntries(
      demoBudgets.map((b) => [b.category, b.baseline])
    ) as Record<Category, number>,
    categories: [...DEFAULT_CATEGORIES],
    fundingSnapshot: demoAccounts.find((a) => a.isFunding)?.balance ?? null,
  };
}

const demoApi: Api = {
  getState: async () => demoState(),
  recategorize: async () => ({ ok: true }),
  addInstitution: async () => ({ ok: true }),
  setBudget: async () => ({ ok: true }),
  addCategory: async () => ({ ok: true }),
  toggleIncome: async () => ({ ok: true }),
  setIncomeAmount: async () => ({ ok: true }),
  updateLiability: async () => ({ ok: true }),
  setFundingSnapshot: async (value) => ({ fundingSnapshot: value ?? 0 }),
  setFundingAccount: async () => ({ ok: true }),
  setAccountType: async () => ({ ok: true }),
  config: async () => ({ instance: "demo", plaid: { configured: false, env: "sandbox" } }),
  plaidStatus: async () => ({ configured: false, env: "sandbox" }),
  plaidLinkToken: async () => ({ link_token: "" }),
  plaidExchange: async () => ({ itemId: "", institutionName: null, accounts: 0, transactionsAdded: 0, holdings: 0 }),
  plaidSync: async () => ({ items: 0 }),
};

export const api: Api = STATIC_DEMO ? demoApi : liveApi;
