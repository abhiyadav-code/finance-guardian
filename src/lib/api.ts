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
  plannedItems: import("./cashflow-data").PlannedItem[];
};

export type BudgetSuggestion = { category: string; current: number; suggested: number; monthlySaving: number; rationale: string };

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
  createAccount: (a: { name: string; type: Account["type"]; balance: number; nickname?: string }) => Promise<{ id: string }>;
  setNickname: (id: string, nickname: string) => Promise<unknown>;
  setManualBalance: (id: string, balance: number) => Promise<unknown>;
  deleteAccount: (id: string) => Promise<unknown>;
  accountHistory: (id: string) => Promise<{ history: { balance: number; at: string }[] }>;
  deleteCategory: (name: string) => Promise<unknown>;
  ccPaymentsReport: () => Promise<{
    payments: { month: string; total: number }[];
    balances: { month: string; owed: number }[];
  }>;
  createPlanned: (p: Omit<import("./cashflow-data").PlannedItem, "id">) => Promise<{ id: string }>;
  updatePlanned: (id: string, patch: Partial<import("./cashflow-data").PlannedItem>) => Promise<unknown>;
  deletePlanned: (id: string) => Promise<unknown>;
  budgetSuggest: (goal: string) => Promise<{ source: "ai" | "heuristic"; suggestions: BudgetSuggestion[] }>;
  config: () => Promise<{ instance: string; plaid: { configured: boolean; env: string }; ai?: { configured: boolean } }>;
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
  createAccount: (a) => req("POST", "/accounts", a),
  setNickname: (id, nickname) => req("PATCH", `/accounts/${id}/nickname`, { nickname }),
  setManualBalance: (id, balance) => req("PATCH", `/accounts/${id}/balance`, { balance }),
  deleteAccount: (id) => req("DELETE", `/accounts/${id}`),
  accountHistory: (id) => req("GET", `/accounts/${id}/history`),
  deleteCategory: (name) => req("DELETE", `/categories/${encodeURIComponent(name)}`),
  ccPaymentsReport: () => req("GET", "/reports/cc-payments"),
  createPlanned: (p) => req("POST", "/planned", p),
  updatePlanned: (id, patch) => req("PATCH", `/planned/${id}`, patch),
  deletePlanned: (id) => req("DELETE", `/planned/${id}`),
  budgetSuggest: (goal) => req("POST", "/budget/suggest", { goal }),

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
    plannedItems: demoPlannedItems(),
  };
}

function ym(offsetMonths: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() + offsetMonths);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
function demoPlannedItems() {
  return [
    { id: "plan_demo1", name: "Q1 bonus", kind: "income" as const, amount: 18000, category: "Income", startMonth: ym(2), endMonth: ym(2) },
    { id: "plan_demo2", name: "Sasha summer camp", kind: "expense" as const, amount: 3200, category: "Childcare", startMonth: ym(3), endMonth: ym(5) },
    { id: "plan_demo3", name: "Property tax", kind: "expense" as const, amount: 6800, category: "Housing", startMonth: ym(4), endMonth: ym(4) },
  ];
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
  createAccount: async () => ({ id: `man_demo_${demoAccounts.length + 1}` }),
  setNickname: async () => ({ ok: true }),
  setManualBalance: async () => ({ ok: true }),
  deleteAccount: async () => ({ ok: true }),
  accountHistory: async () => ({ history: [] }),
  deleteCategory: async () => ({ ok: true }),
  createPlanned: async () => ({ id: `plan_demo_${Date.now()}` }),
  updatePlanned: async () => ({ ok: true }),
  deletePlanned: async () => ({ ok: true }),
  budgetSuggest: async (goal) => {
    const cut = goal === "aggressive_save" ? 0.75 : goal === "comfort" ? 0.92 : 0.85;
    const src = [
      { category: "Dining", current: 450, spend: 520 },
      { category: "Shopping", current: 400, spend: 560 },
      { category: "Travel", current: 600, spend: 810 },
      { category: "Subscriptions", current: 120, spend: 180 },
    ];
    const round25 = (n: number) => Math.max(0, Math.round((n * cut) / 25) * 25);
    return {
      source: "heuristic" as const,
      suggestions: src.map((s) => {
        const suggested = round25(s.spend);
        return {
          category: s.category, current: s.current, suggested,
          monthlySaving: Math.max(0, Math.max(s.current, s.spend) - suggested),
          rationale: `You've averaged $${s.spend}/mo on ${s.category}. Trimming to $${suggested} frees $${Math.max(0, Math.max(s.current, s.spend) - suggested)}/mo.`,
        };
      }).filter((s) => s.suggested < s.current || s.monthlySaving > 0),
    };
  },
  ccPaymentsReport: async () => {
    // Six months of illustrative progress: balances trending down, steady payments.
    const months: { month: string; total: number }[] = [];
    const balances: { month: string; owed: number }[] = [];
    const now = new Date();
    const owedSeries = [34200, 32050, 30400, 29100, 27850, 26641];
    const paySeries = [3900, 4250, 4600, 4400, 5050, 4975];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ month: key, total: paySeries[5 - i] });
      balances.push({ month: key, owed: owedSeries[5 - i] });
    }
    return { payments: months, balances };
  },
  config: async () => ({ instance: "demo", plaid: { configured: false, env: "sandbox" } }),
  plaidStatus: async () => ({ configured: false, env: "sandbox" }),
  plaidLinkToken: async () => ({ link_token: "" }),
  plaidExchange: async () => ({ itemId: "", institutionName: null, accounts: 0, transactionsAdded: 0, holdings: 0 }),
  plaidSync: async () => ({ items: 0 }),
};

export const api: Api = STATIC_DEMO ? demoApi : liveApi;
