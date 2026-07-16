// Shared store for transactions + accounts so the user can override
// AI categories and see new accounts after the connect flow completes.
//
// Source of truth is the local backend (server/). On load we hydrate from
// GET /api/state; every mutation updates the UI optimistically and persists
// to the backend so nothing is lost on refresh.
import { create } from "zustand";
import {
  transactions as seedTx,
  accounts as seedAccounts,
  DEFAULT_CATEGORIES,
  type Transaction,
  type Category,
  type Account,
} from "./finance-data";
import {
  seedIncome, seedOutflows, seedBudgets,
  type IncomeStream, type OutflowStream,
} from "./cashflow-data";
import { api } from "./api";
import { toast } from "sonner";

export type { Account } from "./finance-data";

/** Editable liability fields (subset of Account) the Liabilities page can patch. */
export type LiabilityPatch = Partial<
  Pick<
    Account,
    | "owner" | "apr" | "creditLimit" | "statementBalance" | "balance"
    | "minDue" | "dueDay" | "autopay" | "liabilityGroup" | "notes"
    | "payment" | "payStatus"
  >
>;

type State = {
  transactions: Transaction[];
  accounts: Account[];
  income: IncomeStream[];
  outflows: OutflowStream[];
  /** monthly discretionary spend ceiling per category */
  budgets: Record<Category, number>;
  /** all selectable categories (built-in + user-added custom ones) */
  categories: Category[];
  /** frozen checking balance the payment allocation draws from (null = use live) */
  fundingSnapshot: number | null;
  hydrated: boolean;

  hydrate: () => Promise<void>;
  sync: () => Promise<void>;
  recategorize: (id: string, category: Category) => void;
  /** add a custom category; returns the canonical name to use */
  addCategory: (name: string) => Category;
  addInstitution: (institutionName: string, newAccounts: Account[], newTx: Transaction[]) => void;
  setBudget: (category: Category, amount: number) => void;
  toggleIncome: (id: string) => void;
  setIncomeAmount: (id: string, amount: number) => void;
  /** patch liability fields on an account (Liabilities page) */
  updateLiability: (id: string, patch: LiabilityPatch) => void;
  /** freeze the checking snapshot; omit value to capture the live balance */
  setFundingSnapshot: (value?: number) => void;
};

const initialBudgets = Object.fromEntries(
  seedBudgets.map((b) => [b.category, b.baseline])
) as Record<Category, number>;

// Fire-and-forget persistence: keep the optimistic UI, surface failures.
function persist(p: Promise<unknown>, label: string) {
  p.catch((e) => {
    console.error(`[finance-store] failed to persist ${label}:`, e);
    toast.error("Couldn't save change", { description: "The backend may be offline." });
  });
}

export const useFinanceStore = create<State>((set, get) => ({
  // Seed values render instantly; hydrate() replaces them with the DB's copy.
  transactions: seedTx,
  accounts: seedAccounts,
  income: seedIncome,
  outflows: seedOutflows,
  budgets: initialBudgets,
  categories: [...DEFAULT_CATEGORIES],
  fundingSnapshot: seedAccounts.find((a) => a.isFunding)?.balance ?? null,
  hydrated: false,

  hydrate: async () => {
    try {
      const state = await api.getState();
      set({
        transactions: state.transactions,
        accounts: state.accounts as Account[],
        income: state.income,
        outflows: state.outflows,
        budgets: state.budgets,
        categories: state.categories?.length ? state.categories : [...DEFAULT_CATEGORIES],
        fundingSnapshot: state.fundingSnapshot ?? null,
        hydrated: true,
      });
    } catch (e) {
      console.error("[finance-store] hydrate failed, using seed data:", e);
      toast.error("Backend offline", { description: "Showing sample data; changes won't be saved." });
    }
  },

  sync: async () => {
    await api.plaidSync();
    await get().hydrate();
  },

  recategorize: (id, category) => {
    set((s) => ({
      transactions: s.transactions.map((t) =>
        t.id === id ? { ...t, category, confidence: 1, userOverride: true } as Transaction : t
      ),
    }));
    persist(api.recategorize(id, category), "recategorize");
  },
  addCategory: (name) => {
    const clean = name.trim();
    if (!clean) return clean;
    const existing = get().categories.find((c) => c.toLowerCase() === clean.toLowerCase());
    if (existing) return existing;
    set((s) => ({ categories: [...s.categories, clean] }));
    persist(api.addCategory(clean), "addCategory");
    return clean;
  },
  addInstitution: (institutionName, newAccounts, newTx) => {
    set((s) => ({
      accounts: [...s.accounts, ...newAccounts],
      transactions: [...newTx, ...s.transactions],
    }));
    persist(api.addInstitution(institutionName, newAccounts, newTx), "addInstitution");
  },
  setBudget: (category, amount) => {
    const amt = Math.max(0, Math.round(amount));
    set((s) => ({ budgets: { ...s.budgets, [category]: amt } }));
    persist(api.setBudget(category, amt), "setBudget");
  },
  toggleIncome: (id) => {
    set((s) => ({ income: s.income.map((i) => (i.id === id ? { ...i, active: !i.active } : i)) }));
    persist(api.toggleIncome(id), "toggleIncome");
  },
  setIncomeAmount: (id, amount) => {
    const amt = Math.max(0, Math.round(amount));
    set((s) => ({ income: s.income.map((i) => (i.id === id ? { ...i, amount: amt } : i)) }));
    persist(api.setIncomeAmount(id, amt), "setIncomeAmount");
  },
  updateLiability: (id, patch) => {
    set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)) }));
    persist(api.updateLiability(id, patch), "updateLiability");
  },
  setFundingSnapshot: (value) => {
    set((s) => {
      const funding =
        s.accounts.find((a) => a.isFunding) ??
        s.accounts.filter((a) => a.type === "checking").sort((a, b) => b.balance - a.balance)[0];
      const next = value !== undefined ? value : funding?.balance ?? s.fundingSnapshot ?? 0;
      return { fundingSnapshot: next };
    });
    persist(api.setFundingSnapshot(value), "setFundingSnapshot");
  },
}));

// Built-in fallback list. Live category list comes from the store (`categories`).
export const ALL_CATEGORIES: Category[] = [...DEFAULT_CATEGORIES];
