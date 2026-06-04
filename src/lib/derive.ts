// Derive dashboard figures (net worth, runway, budgets, insights) from live
// store data instead of hardcoded sample values. With no data (a fresh
// production instance) everything resolves to zero / empty states.
import type { Transaction, Category } from "./finance-data";
import type { Account } from "./finance-store";

const LIQUID_TYPES = new Set(["checking", "savings"]);
const NON_SPEND = new Set<Category>(["Income", "Transfer"]);

const isSpend = (t: Transaction) => t.amount < 0 && !NON_SPEND.has(t.category);
const daysAgo = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86_400_000;

export type Summary = {
  netWorth: number;
  liquidAssets: number;
  monthlyEssential: number;
  monthlyLifestyle: number;
  burn: number;
  runwayMonths: number; // Infinity when there is no burn
  accountsCount: number;
  txCount: number;
  flaggedCount: number;
  hasData: boolean;
};

export function deriveSummary(accounts: Account[], transactions: Transaction[]): Summary {
  const netWorth = accounts.reduce((s, a) => s + a.balance, 0);
  const liquidAssets = accounts
    .filter((a) => LIQUID_TYPES.has(a.type))
    .reduce((s, a) => s + a.balance, 0);

  // Trailing 90 days of spend, normalized to a monthly figure.
  const recent = transactions.filter((t) => isSpend(t) && daysAgo(t.date) <= 90);
  const sum = (arr: Transaction[]) => arr.reduce((s, t) => s + Math.abs(t.amount), 0);
  const monthlyEssential = sum(recent.filter((t) => t.essential)) / 3;
  const monthlyLifestyle = sum(recent.filter((t) => !t.essential)) / 3;
  const burn = monthlyEssential + monthlyLifestyle;

  return {
    netWorth,
    liquidAssets,
    monthlyEssential,
    monthlyLifestyle,
    burn,
    runwayMonths: burn > 0 ? liquidAssets / burn : Infinity,
    accountsCount: accounts.length,
    txCount: transactions.length,
    flaggedCount: transactions.filter((t) => t.flagged).length,
    hasData: accounts.length > 0 || transactions.length > 0,
  };
}

export type DerivedInsight = {
  id: string;
  severity: "alert" | "watch" | "info";
  title: string;
  detail: string;
  when: string;
};

const fmtMoney = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Math.abs(n));

function relTime(iso: string) {
  const d = Math.floor(daysAgo(iso));
  if (d <= 0) return "Today";
  if (d === 1) return "Yesterday";
  if (d < 7) return `${d}d ago`;
  if (d < 30) return `${Math.floor(d / 7)}w ago`;
  return `${Math.floor(d / 30)}mo ago`;
}

export function deriveInsights(transactions: Transaction[]): DerivedInsight[] {
  return transactions
    .filter((t) => t.flagged)
    .sort((a, b) => +new Date(b.date) - +new Date(a.date))
    .slice(0, 8)
    .map((t) => {
      if (t.flagged === "anomaly")
        return {
          id: t.id, severity: "alert" as const,
          title: `Unusual charge from ${t.merchant}`,
          detail: `${fmtMoney(t.amount)} looks abnormal for your ${t.category} spend.`,
          when: relTime(t.date),
        };
      if (t.flagged === "shadow_subscription")
        return {
          id: t.id, severity: "watch" as const,
          title: `New recurring charge: ${t.merchant}`,
          detail: `${fmtMoney(t.amount)} recurring charge that isn't in your known stack.`,
          when: relTime(t.date),
        };
      return {
        id: t.id, severity: "watch" as const,
        title: `Possible duplicate: ${t.merchant}`,
        detail: `${fmtMoney(t.amount)} — same merchant and amount seen twice. Worth a glance.`,
        when: relTime(t.date),
      };
    });
}

export type BudgetRow = { category: Category; baseline: number; spent: number };

export function deriveBudgetRows(
  transactions: Transaction[],
  budgets: Record<Category, number>
): BudgetRow[] {
  const now = new Date();
  const inThisMonth = (iso: string) => {
    const d = new Date(iso);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };
  const spentByCat = new Map<string, number>();
  for (const t of transactions) {
    if (!isSpend(t) || !inThisMonth(t.date)) continue;
    spentByCat.set(t.category, (spentByCat.get(t.category) ?? 0) + Math.abs(t.amount));
  }
  return (Object.entries(budgets) as [Category, number][])
    .map(([category, baseline]) => ({ category, baseline, spent: Math.round(spentByCat.get(category) ?? 0) }))
    .sort((a, b) => (b.spent / (b.baseline || 1)) - (a.spent / (a.baseline || 1)));
}
