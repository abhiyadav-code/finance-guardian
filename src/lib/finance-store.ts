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
    | "payment" | "payStatus" | "debtClass"
    | "promoKind" | "promoAprUntil" | "balanceTransferDate"
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
  /** choose which cash account funds the payments (snapshots its balance) */
  setFundingAccount: (accountId: string) => void;
  /** manually reclassify an account's type (persists across syncs) */
  setAccountType: (id: string, type: Account["type"]) => void;
  /** create a manual (non-Plaid) account; resolves with its id */
  addManualAccount: (input: { name: string; type: Account["type"]; balance: number; nickname?: string }) => Promise<string | null>;
  /** rename an account (nickname only; Plaid name preserved) */
  setNickname: (id: string, nickname: string) => void;
  /** update a manual account's balance (stamped, tracked over time) */
  setManualBalance: (id: string, balance: number) => void;
  /** delete a manual account */
  removeAccount: (id: string) => void;
  /** remove a custom category from the picklist */
  removeCategory: (name: string) => void;
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
  setFundingAccount: (accountId) => {
    set((s) => {
      const chosen = s.accounts.find((a) => a.id === accountId);
      if (!chosen) return {};
      return {
        accounts: s.accounts.map((a) => ({ ...a, isFunding: a.id === accountId })),
        fundingSnapshot: chosen.balance,
      };
    });
    persist(api.setFundingAccount(accountId), "setFundingAccount");
  },
  setAccountType: (id, type) => {
    set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, type } : a)) }));
    persist(api.setAccountType(id, type), "setAccountType");
  },
  addManualAccount: async (input) => {
    try {
      const { id } = await api.createAccount(input);
      const acct: Account = {
        id, name: input.name, nickname: input.nickname?.trim() || null,
        balance: input.balance, type: input.type, mask: "",
        isManual: true, institution: "Manual", balanceAsof: new Date().toISOString(),
      };
      set((s) => ({ accounts: [...s.accounts, acct] }));
      return id;
    } catch (e) {
      console.error("[finance-store] addManualAccount failed:", e);
      toast.error("Couldn't add account", { description: "The backend may be offline." });
      return null;
    }
  },
  setNickname: (id, nickname) => {
    const clean = nickname.trim() || null;
    set((s) => ({ accounts: s.accounts.map((a) => (a.id === id ? { ...a, nickname: clean } : a)) }));
    persist(api.setNickname(id, nickname), "setNickname");
  },
  setManualBalance: (id, balance) => {
    const amt = Number(balance) || 0;
    set((s) => ({
      accounts: s.accounts.map((a) => (a.id === id ? { ...a, balance: amt, balanceAsof: new Date().toISOString() } : a)),
    }));
    persist(api.setManualBalance(id, amt), "setManualBalance");
  },
  removeAccount: (id) => {
    set((s) => ({ accounts: s.accounts.filter((a) => a.id !== id) }));
    persist(api.deleteAccount(id), "removeAccount");
  },
  removeCategory: (name) => {
    set((s) => ({ categories: s.categories.filter((c) => c.toLowerCase() !== name.toLowerCase()) }));
    persist(api.deleteCategory(name), "removeCategory");
  },
}));

// Built-in fallback list. Live category list comes from the store (`categories`).
export const ALL_CATEGORIES: Category[] = [...DEFAULT_CATEGORIES];
