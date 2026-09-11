// Derive dashboard figures (net worth, runway, budgets, insights) from live
// store data instead of hardcoded sample values. With no data (a fresh
// production instance) everything resolves to zero / empty states.
import type { Transaction, Category, LiabilityGroup } from "./finance-data";
import type { Account } from "./finance-store";
import {
  monthlyEquivalent, type IncomeStream, type OutflowStream, type PlannedItem,
} from "./cashflow-data";

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
    const rows = liabilities.filter((a) => groupOf(a) === group).map(toRow).sort((a, b) => b.owed - a.owed);
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

// ----- 13-month cash-flow forecast (actuals + projection) -----

export type ForecastMonth = {
  key: string;          // YYYY-MM
  label: string;        // "Jan 26"
  actual: boolean;      // true = reconstructed from real transactions
  income: number;
  expenses: number;
  net: number;
  cashOnHand: number | null;  // forward months only (end-of-month projected cash)
  plannedIncome: number;
  plannedExpense: number;
};

export type Forecast = {
  months: ForecastMonth[];
  totalIncome: number;
  totalExpenses: number;
  expenseToIncome: number;      // ratio over the window
  startCash: number;            // liquid now
  liquidatable: number;         // investment assets that could be sold
  lowest: { label: string; value: number } | null; // min forward cash
  dipsBelowZero: boolean;
  firstDipLabel: string | null;
};

const incomeOf = (t: Transaction) => (t.amount > 0 && t.category !== "Transfer" ? t.amount : 0);

/**
 * A calendar-year (Jan→Jan, 13 months) cash-flow forecast. Past months are
 * reconstructed from transactions; the current and future months are projected
 * from recurring income/bills + category budgets + planned adjustments. A
 * forward running-cash line shows when cash would dip (time to liquidate).
 */
export function deriveMonthlyForecast(
  accountsRaw: Account[],
  transactions: Transaction[],
  income: IncomeStream[],
  outflows: OutflowStream[],
  budgets: Record<string, number>,
  plannedItems: PlannedItem[],
  now = new Date()
): Forecast {
  const accounts = dedupeAccounts(accountsRaw);
  const year = now.getFullYear();
  const currentKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const firstOfCurrent = new Date(now.getFullYear(), now.getMonth(), 1);

  // Recurring monthly baselines for projected months.
  const monthlyIncome = income.filter((s) => s.active).reduce((s, i) => s + monthlyEquivalent(i.amount, i.cadence), 0);
  const monthlyBills = outflows.reduce((s, o) => s + monthlyEquivalent(o.amount, o.cadence), 0);
  const monthlyDiscretionary = Object.values(budgets).reduce((s, n) => s + n, 0);
  const projectedExpenseBase = monthlyBills + monthlyDiscretionary;

  // Actuals per month from transactions.
  const actualByMonth = new Map<string, { income: number; expenses: number; count: number }>();
  for (const t of transactions) {
    const d = new Date(t.date);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const cur = actualByMonth.get(key) ?? { income: 0, expenses: 0, count: 0 };
    cur.income += incomeOf(t);
    if (isSpend(t)) cur.expenses += Math.abs(t.amount);
    cur.count += 1;
    actualByMonth.set(key, cur);
  }

  const plannedFor = (key: string) => {
    let inc = 0, exp = 0;
    for (const p of plannedItems) {
      if (key >= p.startMonth && key <= p.endMonth) {
        if (p.kind === "income") inc += p.amount; else exp += p.amount;
      }
    }
    return { inc, exp };
  };

  const startCash = accounts.filter((a) => LIQUID_TYPES.has(a.type)).reduce((s, a) => s + a.balance, 0);
  const liquidatable = accounts.filter((a) => a.type === "investment").reduce((s, a) => s + a.balance, 0);

  const months: ForecastMonth[] = [];
  let running = startCash;
  let lowest: { label: string; value: number } | null = null;
  let firstDipLabel: string | null = null;

  for (let i = 0; i < 13; i++) {
    const d = new Date(year, i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
    const isPast = monthStart < firstOfCurrent;
    const act = actualByMonth.get(key);
    const useActual = isPast && !!act && act.count > 0;
    const planned = plannedFor(key);

    let inc: number, exp: number;
    if (useActual) {
      inc = Math.round(act!.income);
      exp = Math.round(act!.expenses);
    } else {
      inc = Math.round(monthlyIncome + planned.inc);
      exp = Math.round(projectedExpenseBase + planned.exp);
    }
    const net = inc - exp;

    // Forward cash line: end-of-month projected cash, from the current month on.
    let cashOnHand: number | null = null;
    if (key >= currentKey) {
      running += net;
      cashOnHand = Math.round(running);
      if (lowest === null || cashOnHand < lowest.value) lowest = { label, value: cashOnHand };
      if (cashOnHand < 0 && firstDipLabel === null) firstDipLabel = label;
    }

    months.push({
      key, label, actual: useActual, income: inc, expenses: exp, net,
      cashOnHand, plannedIncome: Math.round(planned.inc), plannedExpense: Math.round(planned.exp),
    });
  }

  const totalIncome = months.reduce((s, m) => s + m.income, 0);
  const totalExpenses = months.reduce((s, m) => s + m.expenses, 0);
  return {
    months,
    totalIncome,
    totalExpenses,
    expenseToIncome: totalIncome > 0 ? totalExpenses / totalIncome : 0,
    startCash: Math.round(startCash),
    liquidatable: Math.round(liquidatable),
    lowest,
    dipsBelowZero: !!lowest && lowest.value < 0,
    firstDipLabel,
  };
}

// ----- Month drill-down: what's behind a forecast bar -----

export type BreakdownItem = {
  name: string; amount: number; date?: string; tag?: string;
  refType?: "income" | "outflow" | "transaction" | "budget" | "planned";
  refId?: string;
  category?: string;
};
export type BreakdownGroup = { category: string; amount: number; items: BreakdownItem[] };
export type MonthBreakdown = { income: BreakdownGroup[]; expenses: BreakdownGroup[] };

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * The line items behind a single forecast month, grouped by category. For a
 * past (actual) month these are the real transactions; for a projected month
 * they're the recurring income/bills + budget ceilings + planned adjustments —
 * so the totals reconcile with the chart and you can see exactly what's counted.
 */
export function monthBreakdown(
  monthKey: string,
  actual: boolean,
  transactions: Transaction[],
  income: IncomeStream[],
  outflows: OutflowStream[],
  budgets: Record<string, number>,
  plannedItems: PlannedItem[]
): MonthBreakdown {
  const inc = new Map<string, BreakdownItem[]>();
  const exp = new Map<string, BreakdownItem[]>();
  const push = (m: Map<string, BreakdownItem[]>, cat: string, it: BreakdownItem) => {
    if (!m.has(cat)) m.set(cat, []);
    m.get(cat)!.push(it);
  };
  const toArr = (m: Map<string, BreakdownItem[]>): BreakdownGroup[] =>
    [...m.entries()]
      .map(([category, items]) => ({ category, amount: items.reduce((s, i) => s + i.amount, 0), items: items.sort((a, b) => b.amount - a.amount) }))
      .sort((a, b) => b.amount - a.amount);

  if (actual) {
    for (const t of transactions) {
      const d = new Date(t.date);
      const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      if (k !== monthKey) continue;
      if (t.amount > 0 && t.category !== "Transfer") push(inc, t.category || "Income", { name: t.merchant, amount: t.amount, date: t.date, refType: "transaction", refId: t.id, category: t.category });
      else if (isSpend(t)) push(exp, t.category || "Other", { name: t.merchant, amount: Math.abs(t.amount), date: t.date, refType: "transaction", refId: t.id, category: t.category });
    }
  } else {
    for (const s of income.filter((s) => s.active))
      push(inc, `${cap((s.kind || "income").replace("_", " "))} (recurring)`, { name: s.source, amount: Math.round(monthlyEquivalent(s.amount, s.cadence)), tag: "recurring", refType: "income", refId: s.id });
    for (const o of outflows)
      push(exp, o.category || "Bills", { name: o.name, amount: Math.round(monthlyEquivalent(o.amount, o.cadence)), tag: "bill", refType: "outflow", refId: o.id, category: o.category });
    for (const [cat, amt] of Object.entries(budgets)) if (amt > 0) push(exp, cat, { name: "Budget ceiling", amount: amt, tag: "budget", refType: "budget" });
  }
  // Planned adjustments apply to both actual and projected months.
  for (const p of plannedItems) {
    if (monthKey < p.startMonth || monthKey > p.endMonth) continue;
    push(p.kind === "income" ? inc : exp, p.category || "Planned", { name: p.name, amount: p.amount, tag: "planned", refType: "planned", refId: p.id });
  }
  return { income: toArr(inc), expenses: toArr(exp) };
}

// ----- Bill due dates: what's overdue / due soon (priority pager) -----

const DAY_MS = 86_400_000;
const DUE_SOON_DAYS = 14;
const lastDayOfMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();

export type DueItem = {
  account: Account;
  dueDate: Date;
  daysUntilDue: number;   // negative = overdue
  overdue: boolean;
  overdueByDays: number;
  amountDue: number;      // statement if present, else owed
  minimumDue: number;
  autopay: boolean;
  paid: boolean;
};

export type DueSchedule = {
  overdue: DueItem[];
  dueSoon: DueItem[];
  later: DueItem[];
  overdueMinDue: number;
  dueSoonMinDue: number;
  nextDue: DueItem | null;
  hasAny: boolean;
};

export function deriveDueSchedule(accountsRaw: Account[], now = new Date()): DueSchedule {
  const accounts = dedupeAccounts(accountsRaw);
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const items: DueItem[] = [];
  for (const a of accounts) {
    if (!isLiability(a)) continue;
    const owed = owedOf(a);
    const statement = a.statementBalance ?? 0;
    if (owed <= 0 && statement <= 0) continue;
    if (!a.dueDay) continue;
    const paid = a.payStatus === "paid";
    const y = now.getFullYear(), m = now.getMonth();
    const dueDate = new Date(y, m, Math.min(a.dueDay, lastDayOfMonth(y, m)));
    const daysUntilDue = Math.round((dueDate.getTime() - startOfToday.getTime()) / DAY_MS);
    const overdue = !paid && daysUntilDue < 0;
    items.push({
      account: a, dueDate, daysUntilDue, overdue,
      overdueByDays: overdue ? -daysUntilDue : 0,
      amountDue: statement > 0 ? statement : owed,
      minimumDue: a.minDue ?? 0,
      autopay: !!a.autopay, paid,
    });
  }
  const unpaid = items.filter((i) => !i.paid);
  const overdue = unpaid.filter((i) => i.overdue).sort((a, b) => b.overdueByDays - a.overdueByDays);
  const dueSoon = unpaid
    .filter((i) => !i.overdue && i.daysUntilDue <= DUE_SOON_DAYS)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  const later = unpaid
    .filter((i) => !i.overdue && i.daysUntilDue > DUE_SOON_DAYS)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  const sumMin = (arr: DueItem[]) => arr.reduce((s, i) => s + i.minimumDue, 0);
  return {
    overdue, dueSoon, later,
    overdueMinDue: sumMin(overdue),
    dueSoonMinDue: sumMin(dueSoon),
    nextDue: overdue[0] ?? dueSoon[0] ?? later[0] ?? null,
    hasAny: items.length > 0,
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
