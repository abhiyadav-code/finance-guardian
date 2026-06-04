// Mock data for the Finance Guardian prototype.
// All values are deterministic so the dashboard feels real.

// Categories are user-extensible, so the type is just a string. The built-in
// taxonomy below seeds the backend and acts as a fallback before hydration.
export type Category = string;

export const DEFAULT_CATEGORIES = [
  "Groceries", "Dining", "Transport", "Housing", "Utilities",
  "Subscriptions", "Entertainment", "Shopping", "Health", "Childcare",
  "Travel", "Income", "Transfer",
] as const;

export type Transaction = {
  id: string;
  date: string; // ISO
  merchant: string;
  amount: number; // negative = spend, positive = income
  category: Category;
  account: string;
  flagged?: "anomaly" | "shadow_subscription" | "duplicate" | null;
  confidence: number; // 0-1 categorization confidence
  essential: boolean;
  userOverride?: boolean;
};

export const accounts = [
  { id: "chk", name: "Chase Checking",      balance:   18420.55, type: "checking" as const, mask: "··4421" },
  { id: "sav", name: "Marcus Savings",      balance:   62300.10, type: "savings"  as const, mask: "··0918" },
  { id: "brk", name: "Fidelity Brokerage",  balance:  184500.00, type: "investment" as const, mask: "··7733" },
  { id: "cc",  name: "Amex Platinum",       balance:   -3140.22, type: "credit"   as const, mask: "··1004" },
];

const today = new Date();
const d = (offset: number) => {
  const x = new Date(today);
  x.setDate(x.getDate() - offset);
  return x.toISOString();
};

export const transactions: Transaction[] = [
  { id: "t01", date: d(0),  merchant: "Whole Foods Market",   amount: -184.22, category: "Groceries",     account: "cc",  confidence: 0.99, essential: true  },
  { id: "t02", date: d(0),  merchant: "Blue Bottle Coffee",    amount:   -7.50, category: "Dining",        account: "cc",  confidence: 0.97, essential: false },
  { id: "t03", date: d(1),  merchant: "Uber",                  amount:  -32.10, category: "Transport",     account: "cc",  confidence: 0.99, essential: false },
  { id: "t04", date: d(1),  merchant: "Notion Labs",           amount:  -16.00, category: "Subscriptions", account: "cc",  confidence: 0.94, essential: false, flagged: "shadow_subscription" },
  { id: "t05", date: d(2),  merchant: "PG&E",                  amount: -312.40, category: "Utilities",     account: "chk", confidence: 0.99, essential: true  },
  { id: "t06", date: d(2),  merchant: "Acme Childcare Co.",    amount:-2150.00, category: "Childcare",     account: "chk", confidence: 0.98, essential: true  },
  { id: "t07", date: d(3),  merchant: "Anomaly Tech LLC",      amount: -489.99, category: "Shopping",      account: "cc",  confidence: 0.62, essential: false, flagged: "anomaly" },
  { id: "t08", date: d(3),  merchant: "Amazon",                amount:  -64.18, category: "Shopping",      account: "cc",  confidence: 0.96, essential: false },
  { id: "t09", date: d(4),  merchant: "Tartine Bakery",        amount:  -28.40, category: "Dining",        account: "cc",  confidence: 0.97, essential: false },
  { id: "t10", date: d(5),  merchant: "Stripe Payroll",        amount:8420.00,  category: "Income",        account: "chk", confidence: 1.00, essential: false },
  { id: "t11", date: d(5),  merchant: "Wells Fargo Mortgage",  amount:-4210.00, category: "Housing",       account: "chk", confidence: 1.00, essential: true  },
  { id: "t12", date: d(6),  merchant: "Spotify",               amount:  -16.99, category: "Subscriptions", account: "cc",  confidence: 0.99, essential: false },
  { id: "t13", date: d(7),  merchant: "Netflix",               amount:  -22.99, category: "Subscriptions", account: "cc",  confidence: 0.99, essential: false },
  { id: "t14", date: d(7),  merchant: "Costco",                amount: -312.66, category: "Groceries",     account: "cc",  confidence: 0.98, essential: true  },
  { id: "t15", date: d(8),  merchant: "Shell Gas",             amount:  -78.20, category: "Transport",     account: "cc",  confidence: 0.99, essential: true  },
  { id: "t16", date: d(9),  merchant: "Equinox",               amount: -290.00, category: "Health",        account: "cc",  confidence: 0.99, essential: false },
  { id: "t17", date: d(10), merchant: "Delta Airlines",        amount: -812.40, category: "Travel",        account: "cc",  confidence: 0.99, essential: false },
  { id: "t18", date: d(10), merchant: "Apple iCloud",          amount:   -2.99, category: "Subscriptions", account: "cc",  confidence: 0.99, essential: false },
  { id: "t19", date: d(11), merchant: "OpenAI",                amount:  -20.00, category: "Subscriptions", account: "cc",  confidence: 0.93, essential: false, flagged: "shadow_subscription" },
  { id: "t20", date: d(12), merchant: "Trader Joe's",          amount:  -98.14, category: "Groceries",     account: "cc",  confidence: 0.99, essential: true  },
  { id: "t21", date: d(13), merchant: "Comcast Internet",      amount: -110.00, category: "Utilities",     account: "chk", confidence: 0.99, essential: true  },
  { id: "t22", date: d(14), merchant: "Lyft",                  amount:  -18.20, category: "Transport",     account: "cc",  confidence: 0.99, essential: false },
  { id: "t23", date: d(15), merchant: "Anomaly Tech LLC",      amount: -489.99, category: "Shopping",      account: "cc",  confidence: 0.55, essential: false, flagged: "duplicate" },
  { id: "t24", date: d(16), merchant: "DoorDash",              amount:  -52.30, category: "Dining",        account: "cc",  confidence: 0.99, essential: false },
];

export const categoryBudgets: { category: Category; baseline: number; spent: number }[] = [
  { category: "Groceries",     baseline: 1200, spent:  595 },
  { category: "Dining",        baseline:  450, spent:  108 },
  { category: "Transport",     baseline:  300, spent:  128 },
  { category: "Housing",       baseline: 4210, spent: 4210 },
  { category: "Utilities",     baseline:  500, spent:  422 },
  { category: "Subscriptions", baseline:  120, spent:   79 },
  { category: "Childcare",     baseline: 2200, spent: 2150 },
  { category: "Health",        baseline:  350, spent:  290 },
  { category: "Shopping",      baseline:  400, spent:  554 },
  { category: "Travel",        baseline:  600, spent:  812 },
];

// Trailing 6-month spend (for sparkline-ish chart)
export const monthlySpend = [
  { month: "Nov", essential: 7100, lifestyle: 2980 },
  { month: "Dec", essential: 7320, lifestyle: 3680 },
  { month: "Jan", essential: 7050, lifestyle: 2510 },
  { month: "Feb", essential: 7240, lifestyle: 2840 },
  { month: "Mar", essential: 7180, lifestyle: 3210 },
  { month: "Apr", essential: 7382, lifestyle: 2941 },
];

export const insights = [
  {
    id: "i1",
    severity: "alert" as const,
    title: "Unusual charge from Anomaly Tech LLC",
    detail: "$489.99 is 6.2σ above your typical Shopping spend. Confidence 91%.",
    when: "2h ago",
  },
  {
    id: "i2",
    severity: "watch" as const,
    title: "New shadow subscription detected: OpenAI",
    detail: "$20/mo recurring charge started 11 days ago. Not in your known stack.",
    when: "Yesterday",
  },
  {
    id: "i3",
    severity: "watch" as const,
    title: "Possible duplicate: Anomaly Tech LLC",
    detail: "Same merchant, same amount, 12 days apart. Worth a glance.",
    when: "2d ago",
  },
  {
    id: "i4",
    severity: "info" as const,
    title: "Travel spend +35% vs 3-mo median",
    detail: "Delta Airlines $812.40 pushed you over baseline.",
    when: "3d ago",
  },
];

// Runway model — pure deterministic math, mirrors PRD §4.4
export const runway = {
  liquidAssets: 80720.65,        // checking + savings
  monthlyEssential: 7382,        // housing + utilities + groceries + childcare + transport (essentials)
  monthlyLifestyle: 2941,        // dining, shopping, travel, subscriptions, entertainment
};

export function fmt(n: number, opts: Intl.NumberFormatOptions = {}) {
  return new Intl.NumberFormat("en-US", {
    style: "currency", currency: "USD", maximumFractionDigits: 0, ...opts,
  }).format(n);
}
export function fmtCents(n: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);
}
