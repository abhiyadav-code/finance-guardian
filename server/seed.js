// Seed data for first-run hydration. Ported from the prototype's
// src/lib/finance-data.ts and src/lib/cashflow-data.ts, but with concrete
// dates computed once at insert time so the data persists meaningfully.
//
// Offsets are days relative to "now": negative-style `daysAgo` for past
// transactions, `daysAhead` for upcoming recurring streams.

const dayMs = 24 * 60 * 60 * 1000;
const isoDaysAgo = (n) => new Date(Date.now() - n * dayMs).toISOString();
const isoDaysAhead = (n) => new Date(Date.now() + n * dayMs).toISOString();

// Liability fields are null/undefined for non-debt accounts and carried on
// credit/loan accounts. `debtClass` splits revolving credit (Liabilities page)
// from installment loans (Loans page). Buckets on the Liabilities page are
// auto-derived from balance + promo status, so `liabilityGroup` is not seeded.
// `promoAprUntil` (ISO date) marks a 0%-APR promo; while active the effective
// APR is 0 and the card sits in the "deferred" bucket. `isFunding` marks the
// checking account payments are drawn from.
export const seedAccounts = [
  { id: "chk", name: "Chase Checking",     balance:   18420.55, type: "checking",   mask: "··4421", institution: "Seed", isFunding: true },
  { id: "sav", name: "Marcus Savings",     balance:   62300.10, type: "savings",    mask: "··0918", institution: "Seed" },
  { id: "brk", name: "Fidelity Brokerage", balance:  184500.00, type: "investment", mask: "··7733", institution: "Seed" },

  // ----- Revolving credit (Liabilities page) -----
  { id: "cc",  name: "Amex Platinum",      balance:  -3140.22, type: "credit", mask: "··1004", institution: "Seed", debtClass: "revolving",
    owner: "You",     apr: 0.2074, creditLimit: 25000, statementBalance: 3140.22, minDue: 40,  dueDay: 15, autopay: true,  payment: 3140.22, payStatus: "scheduled", notes: "Pay in full — points card" },
  { id: "cc2", name: "Chase Sapphire",     balance:  -1840.55, type: "credit", mask: "··7621", institution: "Seed", debtClass: "revolving",
    owner: "You",     apr: 0.2199, creditLimit: 20000, statementBalance: 1840.55, minDue: 40,  dueDay: 18, autopay: true,  payment: 600,     payStatus: "unpaid",    notes: "Travel spend" },
  { id: "cc3", name: "Apple Card",         balance:   -960.10, type: "credit", mask: "··3311", institution: "Seed", debtClass: "revolving",
    owner: "Partner", apr: 0.1974, creditLimit: 12000, statementBalance: 960.10,  minDue: 30,  dueDay: 30, autopay: true,  payment: 960.10,  payStatus: "paid",      notes: "Daily driver" },

  // 0%-APR promo balances carried intentionally (auto-bucket to "deferred" while
  // the promo is live; payment auto-fills to the minimum due — payment left null).
  { id: "cc4", name: "Citi Balance Transfer", balance: -8200.00, type: "credit", mask: "··2569", institution: "Seed", debtClass: "revolving",
    owner: "You",     apr: 0.2099, creditLimit: 15000, statementBalance: 8200, minDue: 125, dueDay: 20, autopay: true,
    promoKind: "balance_transfer", balanceTransferDate: "2025-07-15", promoAprUntil: "2027-01-15", payStatus: "paid", notes: "0% balance transfer" },
  { id: "cc5", name: "BofA Visa",          balance: -12500.00, type: "credit", mask: "··1529", institution: "Seed", debtClass: "revolving",
    owner: "You",     apr: 0.2174, creditLimit: 22000, statementBalance: 12500, minDue: 150, dueDay: 5,  autopay: true,
    promoKind: "balance_transfer", balanceTransferDate: "2025-10-10", promoAprUntil: "2027-04-15", payStatus: "unpaid", notes: "Atmos Rewards — 0% BT" },

  // Zero balance: open, nothing owed.
  { id: "cc6", name: "Discover it",        balance:      0.00, type: "credit", mask: "··0557", institution: "Seed", debtClass: "revolving",
    owner: "Partner", apr: 0.1899, creditLimit: 10000, statementBalance: 0,       minDue: 0,   dueDay: 10, autopay: false, payStatus: "unpaid", notes: "" },

  // ----- Installment loans (Loans page) -----
  { id: "ln1", name: "Tesla Auto Loan",    balance: -28500.00, type: "loan", mask: "··8842", institution: "Seed", debtClass: "installment",
    owner: "You",     apr: 0.0489, statementBalance: 680, minDue: 680, dueDay: 15, autopay: true,  payment: 680, notes: "72-mo term" },
  { id: "ln2", name: "SoFi Student Loan",  balance: -18200.00, type: "loan", mask: "··3390", institution: "Seed", debtClass: "installment",
    owner: "Partner", apr: 0.0650, statementBalance: 240, minDue: 240, dueDay: 1,  autopay: true,  payment: 240, notes: "" },
];

const tx = (id, daysAgo, merchant, amount, category, account, confidence, essential, flagged = null) => ({
  id, date: isoDaysAgo(daysAgo), merchant, amount, category, account, confidence, essential, flagged, userOverride: false,
});

export const seedTransactions = [
  tx("t01",  0, "Whole Foods Market",  -184.22, "Groceries",     "cc",  0.99, true),
  tx("t02",  0, "Blue Bottle Coffee",    -7.50, "Dining",        "cc",  0.97, false),
  tx("t03",  1, "Uber",                 -32.10, "Transport",     "cc",  0.99, false),
  tx("t04",  1, "Notion Labs",          -16.00, "Subscriptions", "cc",  0.94, false, "shadow_subscription"),
  tx("t05",  2, "PG&E",                -312.40, "Utilities",     "chk", 0.99, true),
  tx("t06",  2, "Acme Childcare Co.",  -2150.00, "Childcare",    "chk", 0.98, true),
  tx("t07",  3, "Anomaly Tech LLC",    -489.99, "Shopping",      "cc",  0.62, false, "anomaly"),
  tx("t08",  3, "Amazon",               -64.18, "Shopping",      "cc",  0.96, false),
  tx("t09",  4, "Tartine Bakery",       -28.40, "Dining",        "cc",  0.97, false),
  tx("t10",  5, "Stripe Payroll",      8420.00, "Income",        "chk", 1.00, false),
  tx("t11",  5, "Wells Fargo Mortgage", -4210.00, "Housing",     "chk", 1.00, true),
  tx("t12",  6, "Spotify",              -16.99, "Subscriptions", "cc",  0.99, false),
  tx("t13",  7, "Netflix",              -22.99, "Subscriptions", "cc",  0.99, false),
  tx("t14",  7, "Costco",              -312.66, "Groceries",     "cc",  0.98, true),
  tx("t15",  8, "Shell Gas",            -78.20, "Transport",     "cc",  0.99, true),
  tx("t16",  9, "Equinox",             -290.00, "Health",        "cc",  0.99, false),
  tx("t17", 10, "Delta Airlines",      -812.40, "Travel",        "cc",  0.99, false),
  tx("t18", 10, "Apple iCloud",          -2.99, "Subscriptions", "cc",  0.99, false),
  tx("t19", 11, "OpenAI",               -20.00, "Subscriptions", "cc",  0.93, false, "shadow_subscription"),
  tx("t20", 12, "Trader Joe's",         -98.14, "Groceries",     "cc",  0.99, true),
  tx("t21", 13, "Comcast Internet",    -110.00, "Utilities",     "chk", 0.99, true),
  tx("t22", 14, "Lyft",                 -18.20, "Transport",     "cc",  0.99, false),
  tx("t23", 15, "Anomaly Tech LLC",    -489.99, "Shopping",      "cc",  0.55, false, "duplicate"),
  tx("t24", 16, "DoorDash",             -52.30, "Dining",        "cc",  0.99, false),
];

export const seedIncome = [
  { id: "in-1", source: "Stripe Payroll",        amount: 8420, cadence: "biweekly",  nextDate: isoDaysAhead(9),  kind: "paycheck",  active: true },
  { id: "in-2", source: "Spouse Payroll",        amount: 6150, cadence: "biweekly",  nextDate: isoDaysAhead(2),  kind: "paycheck",  active: true },
  { id: "in-3", source: "Consulting — Acme Co.",  amount: 1800, cadence: "monthly",   nextDate: isoDaysAhead(14), kind: "freelance", active: true },
  { id: "in-4", source: "VTI Dividend",          amount:  340, cadence: "quarterly", nextDate: isoDaysAhead(38), kind: "dividend",  active: true },
];

export const seedOutflows = [
  { id: "ou-1", name: "Wells Fargo Mortgage",   amount: 4210, cadence: "monthly", nextDate: isoDaysAhead(7),  category: "Housing",       kind: "rent" },
  { id: "ou-2", name: "Amex Statement Balance",  amount: 3140, cadence: "monthly", nextDate: isoDaysAhead(11), category: "Subscriptions", kind: "credit_card" },
  { id: "ou-3", name: "Chase Sapphire Payment",  amount: 1840, cadence: "monthly", nextDate: isoDaysAhead(18), category: "Subscriptions", kind: "credit_card" },
  { id: "ou-4", name: "Acme Childcare Co.",      amount: 2150, cadence: "monthly", nextDate: isoDaysAhead(2),  category: "Childcare",     kind: "other" },
  { id: "ou-5", name: "PG&E",                    amount:  312, cadence: "monthly", nextDate: isoDaysAhead(20), category: "Utilities",     kind: "utility" },
  { id: "ou-6", name: "Comcast Internet",        amount:  110, cadence: "monthly", nextDate: isoDaysAhead(23), category: "Utilities",     kind: "utility" },
  { id: "ou-7", name: "Tesla Auto Loan",         amount:  680, cadence: "monthly", nextDate: isoDaysAhead(15), category: "Transport",     kind: "loan" },
];

export const seedBudgets = [
  { category: "Groceries",     amount: 1200 },
  { category: "Dining",        amount:  450 },
  { category: "Transport",     amount:  300 },
  { category: "Shopping",      amount:  400 },
  { category: "Entertainment", amount:  180 },
  { category: "Health",        amount:  350 },
  { category: "Travel",        amount:  600 },
];
