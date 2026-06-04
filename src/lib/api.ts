// Thin REST client for the local Finance Guardian backend.
// In dev, requests to /api are proxied to the Node server by Vite (see vite.config.ts).
// In production (single process), they're same-origin.
import type { Transaction, Category } from "./finance-data";
import type { Account } from "./finance-store";

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
};

export const api = {
  getState: () => req<AppState>("GET", "/state"),
  recategorize: (id: string, category: Category) =>
    req("POST", `/transactions/${id}/recategorize`, { category }),
  addInstitution: (institutionName: string, accounts: Account[], transactions: Transaction[]) =>
    req("POST", "/institutions", { institutionName, accounts, transactions }),
  setBudget: (category: Category, amount: number) =>
    req("POST", "/budgets", { category, amount }),
  addCategory: (name: string) => req("POST", "/categories", { name }),
  toggleIncome: (id: string) => req("POST", `/income/${id}/toggle`),
  setIncomeAmount: (id: string, amount: number) =>
    req("POST", `/income/${id}/amount`, { amount }),

  config: () => req<{ instance: string; plaid: { configured: boolean; env: string } }>("GET", "/config"),

  // Plaid
  plaidStatus: () => req<{ configured: boolean; env: string }>("GET", "/plaid/status"),
  plaidLinkToken: () => req<{ link_token: string }>("POST", "/plaid/link-token"),
  plaidExchange: (public_token: string, institution?: { name?: string; institution_id?: string }) =>
    req<{ itemId: string; institutionName: string | null; accounts: number; transactionsAdded: number; holdings: number }>(
      "POST", "/plaid/exchange", { public_token, institution }
    ),
  plaidSync: () => req<{ items: number }>("POST", "/plaid/sync"),
};
