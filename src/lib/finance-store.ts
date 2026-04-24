// Shared in-memory store for transactions + accounts so the user can override
// AI categories and see new accounts after the Plaid mock flow completes.
import { create } from "zustand";
import {
  transactions as seedTx,
  accounts as seedAccounts,
  type Transaction,
  type Category,
} from "./finance-data";

export type Account = (typeof seedAccounts)[number];

type State = {
  transactions: Transaction[];
  accounts: Account[];
  recategorize: (id: string, category: Category) => void;
  addInstitution: (institutionName: string, newAccounts: Account[], newTx: Transaction[]) => void;
};

export const useFinanceStore = create<State>((set) => ({
  transactions: seedTx,
  accounts: seedAccounts,
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
}));

export const ALL_CATEGORIES: Category[] = [
  "Groceries", "Dining", "Transport", "Housing", "Utilities",
  "Subscriptions", "Entertainment", "Shopping", "Health", "Childcare",
  "Travel", "Income", "Transfer",
];
