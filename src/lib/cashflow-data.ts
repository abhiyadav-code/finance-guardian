// Cash flow model — recurring streams + per-category budget overrides
// drive a daily projection of cash on hand.
import type { Category } from "./finance-data";

export type Cadence = "weekly" | "biweekly" | "semimonthly" | "monthly" | "quarterly" | "annually";

export type IncomeStream = {
  id: string;
  source: string;
  amount: number;          // per occurrence (gross of tax already netted out)
  cadence: Cadence;
  nextDate: string;        // ISO of next pay
  kind: "paycheck" | "unemployment" | "freelance" | "dividend" | "other";
  active: boolean;
};

export type OutflowStream = {
  id: string;
  name: string;
  amount: number;
  cadence: Cadence;
  nextDate: string;
  category: Category;
  kind: "credit_card" | "rent" | "loan" | "subscription" | "utility" | "other";
};

const today = new Date();
const future = (days: number) => {
  const d = new Date(today);
  d.setDate(d.getDate() + days);
  return d.toISOString();
};

export const seedIncome: IncomeStream[] = [
  { id: "in-1", source: "Stripe Payroll",       amount: 8420,  cadence: "biweekly", nextDate: future(9),  kind: "paycheck",     active: true },
  { id: "in-2", source: "Spouse Payroll",       amount: 6150,  cadence: "biweekly", nextDate: future(2),  kind: "paycheck",     active: true },
  { id: "in-3", source: "Consulting — Acme Co.",amount: 1800,  cadence: "monthly",  nextDate: future(14), kind: "freelance",    active: true },
  { id: "in-4", source: "VTI Dividend",         amount:  340,  cadence: "quarterly",nextDate: future(38), kind: "dividend",     active: true },
];

export const seedOutflows: OutflowStream[] = [
  { id: "ou-1",  name: "Wells Fargo Mortgage",  amount: 4210, cadence: "monthly",  nextDate: future(7),  category: "Housing",       kind: "rent" },
  { id: "ou-2",  name: "Amex Statement Balance",amount: 3140, cadence: "monthly",  nextDate: future(11), category: "Subscriptions", kind: "credit_card" },
  { id: "ou-3",  name: "Chase Sapphire Payment",amount: 1840, cadence: "monthly",  nextDate: future(18), category: "Subscriptions", kind: "credit_card" },
  { id: "ou-4",  name: "Acme Childcare Co.",    amount: 2150, cadence: "monthly",  nextDate: future(2),  category: "Childcare",     kind: "other" },
  { id: "ou-5",  name: "PG&E",                  amount:  312, cadence: "monthly",  nextDate: future(20), category: "Utilities",     kind: "utility" },
  { id: "ou-6",  name: "Comcast Internet",      amount:  110, cadence: "monthly",  nextDate: future(23), category: "Utilities",     kind: "utility" },
  { id: "ou-7",  name: "Tesla Auto Loan",       amount:  680, cadence: "monthly",  nextDate: future(15), category: "Transport",     kind: "loan" },
];

// Discretionary monthly spend baselines (the user can override these to project forward)
export const seedBudgets: { category: Category; baseline: number }[] = [
  { category: "Groceries",     baseline: 1200 },
  { category: "Dining",        baseline:  450 },
  { category: "Transport",     baseline:  300 }, // gas, rideshare on top of loan
  { category: "Shopping",      baseline:  400 },
  { category: "Entertainment", baseline:  180 },
  { category: "Health",        baseline:  350 },
  { category: "Travel",        baseline:  600 },
];

// ----- Projection helpers -----

const cadenceDays: Record<Cadence, number> = {
  weekly: 7, biweekly: 14, semimonthly: 15, monthly: 30, quarterly: 91, annually: 365,
};

/** Convert a per-occurrence amount at a given cadence into a monthly figure. */
export function monthlyEquivalent(amount: number, cadence: Cadence): number {
  switch (cadence) {
    case "weekly":      return amount * 4.33;
    case "biweekly":    return amount * 2.17;
    case "semimonthly": return amount * 2;
    case "monthly":     return amount;
    case "quarterly":   return amount / 3;
    case "annually":    return amount / 12;
  }
}

/** A forward-looking, one-off or seasonal cash-flow adjustment. */
export type PlannedItem = {
  id: string;
  name: string;
  kind: "income" | "expense";
  amount: number;       // per month, positive
  category?: string | null;
  startMonth: string;   // YYYY-MM
  endMonth: string;     // YYYY-MM (inclusive; == start for a one-off)
};

/** Generate all occurrences of a stream within [from, to]. */
function occurrencesBetween(start: string, cadence: Cadence, from: Date, to: Date) {
  const stepDays = cadenceDays[cadence];
  const out: Date[] = [];
  let cursor = new Date(start);
  // Wind back to before `from` if needed
  while (cursor > from) cursor.setDate(cursor.getDate() - stepDays);
  // Step forward
  while (cursor <= to) {
    if (cursor >= from) out.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + stepDays);
  }
  return out;
}

export type ProjectionPoint = {
  date: string;       // ISO day
  label: string;      // short label
  cashOnHand: number;
  cumulativeIn: number;
  cumulativeOut: number;
  inToday: number;
  outToday: number;
  events: { name: string; amount: number; kind: "in" | "out" }[];
};

export type ProjectionInput = {
  startingCash: number;
  income: IncomeStream[];
  outflows: OutflowStream[];
  /** Monthly discretionary spend per category, distributed evenly across days */
  discretionaryByCategory: Record<string, number>;
  days: number;
  /** forward one-off / seasonal adjustments (applied on the 1st of each month in range) */
  planned?: PlannedItem[];
};

export function buildProjection({
  startingCash, income, outflows, discretionaryByCategory, days, planned = [],
}: ProjectionInput): ProjectionPoint[] {
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  const to = new Date(from);
  to.setDate(to.getDate() + days);

  // Daily discretionary burn (sum across all category budgets / 30)
  const dailyDiscretionary =
    Object.values(discretionaryByCategory).reduce((s, n) => s + n, 0) / 30;

  // Pre-compute event maps keyed by yyyy-mm-dd
  type Hit = { amount: number; name: string; kind: "in" | "out" };
  const events = new Map<string, Hit[]>();

  for (const s of income.filter((s) => s.active)) {
    for (const d of occurrencesBetween(s.nextDate, s.cadence, from, to)) {
      const k = d.toISOString().slice(0, 10);
      const arr = events.get(k) ?? [];
      arr.push({ amount: s.amount, name: s.source, kind: "in" });
      events.set(k, arr);
    }
  }
  for (const o of outflows) {
    for (const d of occurrencesBetween(o.nextDate, o.cadence, from, to)) {
      const k = d.toISOString().slice(0, 10);
      const arr = events.get(k) ?? [];
      arr.push({ amount: o.amount, name: o.name, kind: "out" });
      events.set(k, arr);
    }
  }
  // Planned adjustments: hit on the 1st of each month within [startMonth, endMonth]
  // that falls inside the projection window (so what-ifs show up here too).
  for (const p of planned) {
    let [y, m] = p.startMonth.split("-").map(Number);
    const [ey, em] = p.endMonth.split("-").map(Number);
    while (y < ey || (y === ey && m <= em)) {
      const d = new Date(y, m - 1, 1);
      if (d >= from && d <= to) {
        const k = d.toISOString().slice(0, 10);
        const arr = events.get(k) ?? [];
        arr.push({ amount: p.amount, name: p.name, kind: p.kind === "income" ? "in" : "out" });
        events.set(k, arr);
      }
      m++; if (m > 12) { m = 1; y++; }
    }
  }

  const points: ProjectionPoint[] = [];
  let cash = startingCash;
  let cumIn = 0;
  let cumOut = 0;

  for (let i = 0; i <= days; i++) {
    const d = new Date(from);
    d.setDate(d.getDate() + i);
    const k = d.toISOString().slice(0, 10);
    const todays = events.get(k) ?? [];

    let inToday = 0;
    let outToday = dailyDiscretionary;
    for (const ev of todays) {
      if (ev.kind === "in") inToday += ev.amount;
      else outToday += ev.amount;
    }
    cash += inToday - outToday;
    cumIn += inToday;
    cumOut += outToday;

    points.push({
      date: d.toISOString(),
      label: d.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
      cashOnHand: Math.round(cash),
      cumulativeIn: Math.round(cumIn),
      cumulativeOut: Math.round(cumOut),
      inToday: Math.round(inToday),
      outToday: Math.round(outToday),
      events: todays,
    });
  }
  return points;
}
