// Derive dashboard figures (net worth, runway, budgets, insights) from live
// store data instead of hardcoded sample values. With no data (a fresh
// production instance) everything resolves to zero / empty states.
import type { Transaction, Category, LiabilityGroup } from "./finance-data";
import type { Account } from "./finance-store";

const LIQUID_TYPES = new Set(["checking", "savings"]);
const NON_SPEND = new Set<Category>(["Income", "Transfer"]);

const isSpend = (t: Transaction) => t.amount < 0 && !NON_SPEND.has(t.category);
const daysAgo = (iso: string) => (Date.now() - new Date(iso).getTime()) / 86_400_000;

// Collapse accounts to one row per id. A single account must never be summed
// twice (e.g. if hydrate + an optimistic insert both added it, or a bad merge
// produced a repeat), so every money total starts from a de-duplicated list.
export function dedupeAccounts(accounts: Account[]): Account[] {
  const byId = new Map<string, Account>();
  for (const a of accounts) byId.set(a.id, a);
  return [...byId.values()];
}

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

export function deriveSummary(accountsRaw: Account[], transactions: Transaction[]): Summary {
  const accounts = dedupeAccounts(accountsRaw);
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

// ----- Liabilities (debt management) -----

export const LIABILITY_TYPES = new Set(["credit", "loan"]);

export const LIABILITY_GROUP_ORDER: LiabilityGroup[] = ["monthly", "deferred", "zero"];
export const LIABILITY_GROUP_LABEL: Record<LiabilityGroup, string> = {
  monthly: "Monthly · standard APR",
  deferred: "Deferred · 0% promo",
  zero: "Zero balance",
};

export const isLiability = (a: Account) => LIABILITY_TYPES.has(a.type);

/** revolving (credit cards → Liabilities) vs installment (loans → Loans page) */
export const debtClassOf = (a: Account) =>
  a.debtClass ?? (a.type === "loan" ? "installment" : "revolving");

export const isRevolving = (a: Account) => isLiability(a) && debtClassOf(a) === "revolving";
export const isInstallment = (a: Account) => isLiability(a) && debtClassOf(a) === "installment";

/** Amount currently owed on an account (credit/loan balances are stored negative). */
export const owedOf = (a: Account) => Math.max(0, -a.balance);

/** A 0%-APR promo that hasn't expired yet. */
export const isPromoActive = (a: Account) =>
  !!a.promoAprUntil && new Date(a.promoAprUntil).getTime() > Date.now();

/** Effective APR right now (0 while a promo is live, else the go-to rate). */
export const effectiveApr = (a: Account) => (isPromoActive(a) ? 0 : a.apr ?? 0);

export type LiabilityRow = {
  account: Account;
  owed: number;
  payment: number;
  paymentAuto: boolean;         // payment was auto-filled to the minimum (0% promo)
  nextMonthOwed: number;
  statement: number;
  minDue: number;
  utilization: number | null;   // owed / limit
  effectiveApr: number;
  promoActive: boolean;
  estInterest: number;          // owed * effectiveApr / 12
};

export type LiabilityGroupView = {
  group: LiabilityGroup;
  label: string;
  rows: LiabilityRow[];
  owed: number;
  nextMonthOwed: number;
  payment: number;
  minDue: number;
  statement: number;
};

export type LiabilitiesView = {
  groups: LiabilityGroupView[];
  // grand totals
  totalOwed: number;
  totalNextMonthOwed: number;
  totalPayment: number;
  totalMinDue: number;
  totalStatement: number;
  hasLiabilities: boolean;
  // funding / allocation
  fundingAccount: Account | null;
  snapshot: number;
  allocated: number;      // = totalPayment
  remaining: number;      // snapshot - allocated
  pctAllocated: number;   // allocated / snapshot (0-1+, can exceed 1)
  overAllocated: boolean;
};

// Bucket is auto-derived: nothing owed → zero; live 0% promo → deferred;
// otherwise a standard-APR balance we pay down → monthly.
function groupOf(a: Account): LiabilityGroup {
  if (owedOf(a) <= 0) return "zero";
  if (isPromoActive(a)) return "deferred";
  return "monthly";
}

export function deriveLiabilities(
  accountsRaw: Account[],
  fundingSnapshot: number | null
): LiabilitiesView {
  const accounts = dedupeAccounts(accountsRaw);
  const liabilities = accounts.filter(isRevolving);

  const toRow = (a: Account): LiabilityRow => {
    const owed = owedOf(a);
    const minDue = a.minDue ?? 0;
    const promoActive = isPromoActive(a);
    // Auto-fill the minimum on 0% promo cards when no payment is set.
    const paymentAuto = a.payment == null && promoActive && minDue > 0;
    const payment = paymentAuto ? minDue : Math.max(0, a.payment ?? 0);
    const eApr = effectiveApr(a);
    return {
      account: a,
      owed,
      payment,
      paymentAuto,
      nextMonthOwed: Math.max(0, owed - payment),
      statement: a.statementBalance ?? 0,
      minDue,
      utilization: a.creditLimit && a.creditLimit > 0 ? owed / a.creditLimit : null,
      effectiveApr: eApr,
      promoActive,
      estInterest: eApr > 0 ? (owed * eApr) / 12 : 0,
    };
  };

  const groups: LiabilityGroupView[] = LIABILITY_GROUP_ORDER.map((group) => {
    const rows = liabilities.filter((a) => groupOf(a) === group).map(toRow);
    const sum = (pick: (r: LiabilityRow) => number) => rows.reduce((s, r) => s + pick(r), 0);
    return {
      group,
      label: LIABILITY_GROUP_LABEL[group],
      rows,
      owed: sum((r) => r.owed),
      nextMonthOwed: sum((r) => r.nextMonthOwed),
      payment: sum((r) => r.payment),
      minDue: sum((r) => r.minDue),
      statement: sum((r) => r.statement),
    };
  }).filter((g) => g.rows.length > 0);

  const grand = <K extends keyof LiabilityGroupView>(key: K) =>
    groups.reduce((s, g) => s + (g[key] as number), 0);

  // Funding source: the flagged account, else the largest checking account.
  const fundingAccount =
    accounts.find((a) => a.isFunding) ??
    accounts.filter((a) => a.type === "checking").sort((a, b) => b.balance - a.balance)[0] ??
    null;
  const snapshot = fundingSnapshot ?? fundingAccount?.balance ?? 0;
  const allocated = grand("payment");
  const remaining = snapshot - allocated;

  return {
    groups,
    totalOwed: grand("owed"),
    totalNextMonthOwed: grand("nextMonthOwed"),
    totalPayment: allocated,
    totalMinDue: grand("minDue"),
    totalStatement: grand("statement"),
    hasLiabilities: liabilities.length > 0,
    fundingAccount,
    snapshot,
    allocated,
    remaining,
    pctAllocated: snapshot > 0 ? allocated / snapshot : 0,
    overAllocated: allocated > snapshot,
  };
}

// ----- Installment loans (mortgage / auto / student) — the Loans page -----

export type LoanRow = {
  account: Account;
  balance: number;       // outstanding principal owed
  apr: number;
  monthlyPayment: number;
  payoffMonths: number | null; // rough months to payoff at current payment
};

export type LoansView = {
  loans: LoanRow[];
  totalBalance: number;
  totalMonthly: number;
  hasLoans: boolean;
};

// Rough amortization: months to pay off `balance` at fixed `payment` and monthly
// rate r. Null when the payment can't cover interest (never pays off).
function payoffMonths(balance: number, apr: number, payment: number): number | null {
  if (balance <= 0) return 0;
  if (payment <= 0) return null;
  const r = apr / 12;
  if (r <= 0) return Math.ceil(balance / payment);
  if (payment <= balance * r) return null; // payment doesn't cover interest
  const n = -Math.log(1 - (r * balance) / payment) / Math.log(1 + r);
  return Math.ceil(n);
}

export function deriveLoans(accountsRaw: Account[]): LoansView {
  const accounts = dedupeAccounts(accountsRaw);
  const loans: LoanRow[] = accounts.filter(isInstallment).map((a) => {
    const balance = owedOf(a);
    const apr = a.apr ?? 0;
    const monthlyPayment = Math.max(0, a.payment ?? a.minDue ?? 0);
    return { account: a, balance, apr, monthlyPayment, payoffMonths: payoffMonths(balance, apr, monthlyPayment) };
  });
  return {
    loans,
    totalBalance: loans.reduce((s, l) => s + l.balance, 0),
    totalMonthly: loans.reduce((s, l) => s + l.monthlyPayment, 0),
    hasLoans: loans.length > 0,
  };
}
