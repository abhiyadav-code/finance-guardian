// Shared in-memory store for transactions + accounts so the user can override
// AI categories and see new accounts after the Plaid mock flow completes.
import { create } from "zustand";
import {
  transactions as seedTx,
  accounts as seedAccounts,
  type Transaction,
  type Category,
} from "./finance-data";
import {
  seedIncome, seedOutflows, seedBudgets,
  type IncomeStream, type OutflowStream,
} from "./cashflow-data";

export type Account = (typeof seedAccounts)[number];

type State = {
  transactions: Transaction[];
  accounts: Account[];
  income: IncomeStream[];
  outflows: OutflowStream[];
  /** monthly discretionary spend ceiling per category */
  budgets: Record<Category, number>;

  recategorize: (id: string, category: Category) => void;
  addInstitution: (institutionName: string, newAccounts: Account[], newTx: Transaction[]) => void;
  setBudget: (category: Category, amount: number) => void;
  toggleIncome: (id: string) => void;
  setIncomeAmount: (id: string, amount: number) => void;
};

const initialBudgets = Object.fromEntries(
  seedBudgets.map((b) => [b.category, b.baseline])
) as Record<Category, number>;

export const useFinanceStore = create<State>((set) => ({
  transactions: seedTx,
  accounts: seedAccounts,
  income: seedIncome,
  outflows: seedOutflows,
  budgets: initialBudgets,

  recategorize: (id, category) =>
    set((s) => ({
      transactions: s.transactions.map((t) =>
        t.id === id ? { ...t, category, confidence: 1, userOverride: true } as Transaction : t
      ),
    })),
  addInstitution: (_institutionName, newAccounts, newTx) =>
    set((s) => ({
      accounts: [...s.accounts, ...newAccounts],
      transactions: [...newTx, ...s.transactions],
    })),
  setBudget: (category, amount) =>
    set((s) => ({ budgets: { ...s.budgets, [category]: Math.max(0, Math.round(amount)) } })),
  toggleIncome: (id) =>
    set((s) => ({ income: s.income.map((i) => (i.id === id ? { ...i, active: !i.active } : i)) })),
  setIncomeAmount: (id, amount) =>
    set((s) => ({ income: s.income.map((i) => (i.id === id ? { ...i, amount: Math.max(0, Math.round(amount)) } : i)) })),
}));

export const ALL_CATEGORIES: Category[] = [
  "Groceries", "Dining", "Transport", "Housing", "Utilities",
  "Subscriptions", "Entertainment", "Shopping", "Health", "Childcare",
  "Travel", "Income", "Transfer",
];
