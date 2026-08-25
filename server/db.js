// SQLite persistence layer using Node's built-in node:sqlite (no native deps).
// A single file DB lives at server/data/finance.db — back it up by copying that file.
import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  seedAccounts, seedTransactions, seedIncome, seedOutflows, seedBudgets,
} from "./seed.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.FG_DB_PATH || join(__dirname, "data", "finance.db");

mkdirSync(dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA foreign_keys = ON;");

db.exec(`
  CREATE TABLE IF NOT EXISTS accounts (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    balance     REAL NOT NULL,
    type        TEXT NOT NULL,
    mask        TEXT,
    institution TEXT
  );
  CREATE TABLE IF NOT EXISTS transactions (
    id            TEXT PRIMARY KEY,
    date          TEXT NOT NULL,
    merchant      TEXT NOT NULL,
    amount        REAL NOT NULL,
    category      TEXT NOT NULL,
    account       TEXT NOT NULL,
    flagged       TEXT,
    confidence    REAL NOT NULL,
    essential     INTEGER NOT NULL DEFAULT 0,
    user_override INTEGER NOT NULL DEFAULT 0
  );
  CREATE TABLE IF NOT EXISTS income_streams (
    id        TEXT PRIMARY KEY,
    source    TEXT NOT NULL,
    amount    REAL NOT NULL,
    cadence   TEXT NOT NULL,
    next_date TEXT NOT NULL,
    kind      TEXT NOT NULL,
    active    INTEGER NOT NULL DEFAULT 1
  );
  CREATE TABLE IF NOT EXISTS outflow_streams (
    id        TEXT PRIMARY KEY,
    name      TEXT NOT NULL,
    amount    REAL NOT NULL,
    cadence   TEXT NOT NULL,
    next_date TEXT NOT NULL,
    category  TEXT NOT NULL,
    kind      TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS budgets (
    category TEXT PRIMARY KEY,
    amount   REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS categories (
    name     TEXT PRIMARY KEY,
    builtin  INTEGER NOT NULL DEFAULT 0,
    position INTEGER
  );
  CREATE TABLE IF NOT EXISTS meta (
    key   TEXT PRIMARY KEY,
    value TEXT
  );
  CREATE TABLE IF NOT EXISTS plaid_items (
    item_id          TEXT PRIMARY KEY,
    access_token_enc TEXT NOT NULL,
    institution_id   TEXT,
    institution_name TEXT,
    cursor           TEXT,
    created_at       TEXT NOT NULL,
    last_synced_at   TEXT
  );
  CREATE TABLE IF NOT EXISTS holdings (
    id          TEXT PRIMARY KEY,
    account     TEXT NOT NULL,
    item_id     TEXT,
    security_id TEXT,
    ticker      TEXT,
    name        TEXT,
    quantity    REAL,
    price       REAL,
    value       REAL,
    updated_at  TEXT
  );
`);

// Lightweight migration: add Plaid-link columns to existing tables if missing.
function addColumnIfMissing(table, column, ddl) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  if (!cols.some((c) => c.name === column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
}
addColumnIfMissing("accounts", "item_id", "item_id TEXT");
addColumnIfMissing("transactions", "item_id", "item_id TEXT");
addColumnIfMissing("transactions", "pending", "pending INTEGER NOT NULL DEFAULT 0");

// Liability / debt-management columns on accounts (power the Liabilities page).
// All nullable so non-debt accounts are unaffected.
addColumnIfMissing("accounts", "owner", "owner TEXT");
addColumnIfMissing("accounts", "apr", "apr REAL");
addColumnIfMissing("accounts", "credit_limit", "credit_limit REAL");
addColumnIfMissing("accounts", "statement_balance", "statement_balance REAL");
addColumnIfMissing("accounts", "min_due", "min_due REAL");
addColumnIfMissing("accounts", "due_day", "due_day INTEGER");
addColumnIfMissing("accounts", "autopay", "autopay INTEGER");
addColumnIfMissing("accounts", "liability_group", "liability_group TEXT");
addColumnIfMissing("accounts", "notes", "notes TEXT");
addColumnIfMissing("accounts", "payment", "payment REAL");
addColumnIfMissing("accounts", "pay_status", "pay_status TEXT");
addColumnIfMissing("accounts", "is_funding", "is_funding INTEGER NOT NULL DEFAULT 0");
// revolving (credit cards → Liabilities page) vs installment (loans → Loans page)
addColumnIfMissing("accounts", "debt_class", "debt_class TEXT");
// 0%-APR promo tracking
addColumnIfMissing("accounts", "promo_kind", "promo_kind TEXT");            // 'purchase' | 'balance_transfer'
addColumnIfMissing("accounts", "promo_apr_until", "promo_apr_until TEXT");  // ISO date the 0% ends
addColumnIfMissing("accounts", "balance_transfer_date", "balance_transfer_date TEXT");
// comma-separated list of liability fields the user has set by hand (Plaid won't clobber these)
addColumnIfMissing("accounts", "liability_overrides", "liability_overrides TEXT");
// raw Plaid subtype (mortgage, auto, money market, cd, …) — kept for correct
// classification and transparency about why an account is typed the way it is.
addColumnIfMissing("accounts", "subtype", "subtype TEXT");
// set when the user manually reclassifies an account's type (e.g. a brokerage
// CMA that Plaid reports as depository). Locks the type against Plaid syncs.
addColumnIfMissing("accounts", "type_override", "type_override INTEGER NOT NULL DEFAULT 0");
// user-facing nickname (Plaid `name` is preserved); manual (non-Plaid) accounts.
addColumnIfMissing("accounts", "nickname", "nickname TEXT");
addColumnIfMissing("accounts", "is_manual", "is_manual INTEGER NOT NULL DEFAULT 0");
addColumnIfMissing("accounts", "balance_asof", "balance_asof TEXT");

// planned payment date (when a scheduled payment is due to go out)
addColumnIfMissing("accounts", "payment_date", "payment_date TEXT");

// Balance history so accounts can be tracked over time; payments ledger records
// each credit-card payment made (for the monthly progress chart).
db.exec(`
  CREATE TABLE IF NOT EXISTS account_balance_history (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    account TEXT NOT NULL,
    balance REAL NOT NULL,
    at      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_abh_account ON account_balance_history (account, at);

  CREATE TABLE IF NOT EXISTS payments (
    id      INTEGER PRIMARY KEY AUTOINCREMENT,
    account TEXT NOT NULL,
    amount  REAL NOT NULL,
    month   TEXT NOT NULL,   -- YYYY-MM (one payment per account per month)
    at      TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_pay_month ON payments (month);

  -- Forward-looking cash-flow adjustments (a bonus, seasonal camp, a stock sale…).
  -- Applied to every month in [start_month, end_month] inclusive.
  CREATE TABLE IF NOT EXISTS planned_items (
    id          TEXT PRIMARY KEY,
    name        TEXT NOT NULL,
    kind        TEXT NOT NULL,          -- 'income' | 'expense'
    amount      REAL NOT NULL,          -- per month, positive
    category    TEXT,
    start_month TEXT NOT NULL,          -- YYYY-MM
    end_month   TEXT NOT NULL,          -- YYYY-MM (== start for a one-off)
    created_at  TEXT NOT NULL
  );
`);

// ----- Seed the built-in category taxonomy (always, all instances) -----
// Categories are app config, not sample financial data, so this runs regardless
// of FG_SEED. Idempotent via INSERT OR IGNORE.
const BUILTIN_CATEGORIES = [
  "Groceries", "Dining", "Transport", "Housing", "Utilities",
  "Subscriptions", "Entertainment", "Shopping", "Health", "Childcare",
  "Travel", "Income", "Transfer",
];
{
  const ins = db.prepare("INSERT OR IGNORE INTO categories (name, builtin, position) VALUES (?, 1, ?)");
  BUILTIN_CATEGORIES.forEach((name, i) => ins.run(name, i));
}

// ----- First-run seeding (idempotent, opt-in) -----
// Only the demo instance seeds sample data (FG_SEED=1). The production instance
// starts empty and only ever holds real connected data.
const SHOULD_SEED = process.env.FG_SEED === "1" || process.env.FG_SEED === "true";
function seedIfEmpty() {
  if (!SHOULD_SEED) return;
  const seeded = db.prepare("SELECT value FROM meta WHERE key = 'seeded'").get();
  if (seeded) return;

  const insAccount = db.prepare(
    `INSERT INTO accounts
       (id, name, balance, type, mask, institution, is_funding,
        owner, apr, credit_limit, statement_balance, min_due, due_day, autopay, notes, payment, pay_status,
        debt_class, promo_kind, promo_apr_until, balance_transfer_date)
     VALUES (?, ?, ?, ?, ?, ?, ?,  ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,  ?, ?, ?, ?)`
  );
  const insTx = db.prepare(
    `INSERT INTO transactions (id, date, merchant, amount, category, account, flagged, confidence, essential, user_override)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insIncome = db.prepare(
    "INSERT INTO income_streams (id, source, amount, cadence, next_date, kind, active) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const insOutflow = db.prepare(
    "INSERT INTO outflow_streams (id, name, amount, cadence, next_date, category, kind) VALUES (?, ?, ?, ?, ?, ?, ?)"
  );
  const insBudget = db.prepare("INSERT INTO budgets (category, amount) VALUES (?, ?)");

  db.exec("BEGIN");
  try {
    for (const a of seedAccounts)
      insAccount.run(
        a.id, a.name, a.balance, a.type, a.mask, a.institution, a.isFunding ? 1 : 0,
        a.owner ?? null, a.apr ?? null, a.creditLimit ?? null, a.statementBalance ?? null,
        a.minDue ?? null, a.dueDay ?? null,
        a.autopay === undefined ? null : (a.autopay ? 1 : 0),
        a.notes ?? null, a.payment ?? null, a.payStatus ?? null,
        a.debtClass ?? null, a.promoKind ?? null, a.promoAprUntil ?? null, a.balanceTransferDate ?? null
      );
    // Freeze the starting funding-account balance for the payment cycle.
    const funding = seedAccounts.find((a) => a.isFunding);
    if (funding)
      db.prepare("INSERT OR IGNORE INTO meta (key, value) VALUES ('funding_snapshot', ?)").run(String(funding.balance));
    for (const t of seedTransactions)
      insTx.run(t.id, t.date, t.merchant, t.amount, t.category, t.account, t.flagged, t.confidence, t.essential ? 1 : 0, t.userOverride ? 1 : 0);
    for (const i of seedIncome) insIncome.run(i.id, i.source, i.amount, i.cadence, i.nextDate, i.kind, i.active ? 1 : 0);
    for (const o of seedOutflows) insOutflow.run(o.id, o.name, o.amount, o.cadence, o.nextDate, o.category, o.kind);
    for (const b of seedBudgets) insBudget.run(b.category, b.amount);
    db.prepare("INSERT INTO meta (key, value) VALUES ('seeded', ?)").run(new Date().toISOString());
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
seedIfEmpty();

// ----- Row -> API shape mappers (match the frontend's Zustand store types) -----
const toAccount = (r) => ({
  id: r.id, name: r.name, balance: r.balance, type: r.type, mask: r.mask,
  nickname: r.nickname ?? null,
  isManual: !!r.is_manual,
  balanceAsof: r.balance_asof ?? null,
  subtype: r.subtype ?? null,
  institution: r.institution ?? null,
  isFunding: !!r.is_funding,
  owner: r.owner ?? null,
  apr: r.apr ?? null,
  creditLimit: r.credit_limit ?? null,
  statementBalance: r.statement_balance ?? null,
  minDue: r.min_due ?? null,
  dueDay: r.due_day ?? null,
  autopay: r.autopay === null || r.autopay === undefined ? null : !!r.autopay,
  liabilityGroup: r.liability_group ?? null,
  notes: r.notes ?? null,
  payment: r.payment ?? null,
  paymentDate: r.payment_date ?? null,
  payStatus: r.pay_status ?? null,
  debtClass: r.debt_class ?? null,
  promoKind: r.promo_kind ?? null,
  promoAprUntil: r.promo_apr_until ?? null,
  balanceTransferDate: r.balance_transfer_date ?? null,
});
const toTransaction = (r) => ({
  id: r.id, date: r.date, merchant: r.merchant, amount: r.amount, category: r.category,
  account: r.account, flagged: r.flagged ?? null, confidence: r.confidence,
  essential: !!r.essential, userOverride: !!r.user_override,
});
const toIncome = (r) => ({
  id: r.id, source: r.source, amount: r.amount, cadence: r.cadence,
  nextDate: r.next_date, kind: r.kind, active: !!r.active,
});
const toOutflow = (r) => ({
  id: r.id, name: r.name, amount: r.amount, cadence: r.cadence,
  nextDate: r.next_date, category: r.category, kind: r.kind,
});

// ----- Read: full app state -----
export function getState() {
  const accounts = db.prepare("SELECT * FROM accounts").all().map(toAccount);
  const transactions = db.prepare("SELECT * FROM transactions ORDER BY date DESC").all().map(toTransaction);
  const income = db.prepare("SELECT * FROM income_streams").all().map(toIncome);
  const outflows = db.prepare("SELECT * FROM outflow_streams").all().map(toOutflow);
  const budgetRows = db.prepare("SELECT * FROM budgets").all();
  const budgets = Object.fromEntries(budgetRows.map((b) => [b.category, b.amount]));
  const categories = db
    .prepare("SELECT name FROM categories ORDER BY builtin DESC, (position IS NULL), position ASC, name ASC")
    .all()
    .map((r) => r.name);
  const snapRow = db.prepare("SELECT value FROM meta WHERE key = 'funding_snapshot'").get();
  const fundingSnapshot = snapRow ? Number(snapRow.value) : null;
  const plannedItems = getPlannedItems();
  return { accounts, transactions, income, outflows, budgets, categories, fundingSnapshot, plannedItems };
}

// ----- Planned cash-flow adjustments -----
const toPlanned = (r) => ({
  id: r.id, name: r.name, kind: r.kind, amount: r.amount,
  category: r.category ?? null, startMonth: r.start_month, endMonth: r.end_month,
});
export function getPlannedItems() {
  return db.prepare("SELECT * FROM planned_items ORDER BY start_month ASC, name ASC").all().map(toPlanned);
}
export function addPlannedItem({ name, kind, amount, category, startMonth, endMonth }) {
  if (kind !== "income" && kind !== "expense") throw new Error("kind must be income or expense");
  const id = `plan_${randomUUID()}`;
  const start = String(startMonth).slice(0, 7);
  const end = String(endMonth || startMonth).slice(0, 7);
  db.prepare(
    `INSERT INTO planned_items (id, name, kind, amount, category, start_month, end_month, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(id, String(name || "Adjustment"), kind, Math.abs(Number(amount) || 0), category ?? null,
        start, end < start ? start : end, new Date().toISOString());
  return id;
}
export function updatePlannedItem(id, patch = {}) {
  const cols = { name: "name", kind: "kind", amount: "amount", category: "category", startMonth: "start_month", endMonth: "end_month" };
  const sets = [], vals = [];
  for (const [k, col] of Object.entries(cols)) {
    if (!(k in patch)) continue;
    let v = patch[k];
    if (k === "amount") v = Math.abs(Number(v) || 0);
    if (k === "startMonth" || k === "endMonth") v = String(v).slice(0, 7);
    sets.push(`${col} = ?`); vals.push(v);
  }
  if (!sets.length) return false;
  vals.push(id);
  return db.prepare(`UPDATE planned_items SET ${sets.join(", ")} WHERE id = ?`).run(...vals).changes > 0;
}
export function deletePlannedItem(id) {
  return db.prepare("DELETE FROM planned_items WHERE id = ?").run(id).changes > 0;
}

// ----- Budget savings suggestions -----
// Trailing-90-day monthly spend per budgeted category (context for AI or heuristic).
export function computeCategoryStats() {
  const budgetRows = db.prepare("SELECT category, amount FROM budgets").all();
  const budgets = Object.fromEntries(budgetRows.map((b) => [b.category, b.amount]));
  const cutoff = Date.now() - 90 * 86_400_000;
  const spend = new Map();
  const merchants = new Map();
  for (const t of db.prepare("SELECT amount, category, merchant, date FROM transactions").all()) {
    if (t.amount >= 0) continue;
    if (!(t.category in budgets)) continue;
    if (new Date(t.date).getTime() < cutoff) continue;
    spend.set(t.category, (spend.get(t.category) ?? 0) + Math.abs(t.amount));
    if (!merchants.has(t.category)) merchants.set(t.category, new Set());
    merchants.get(t.category).add(t.merchant);
  }
  return Object.keys(budgets).map((category) => ({
    category,
    budget: budgets[category],
    monthlySpend: Math.round((spend.get(category) ?? 0) / 3),
    topMerchants: [...(merchants.get(category) ?? [])].slice(0, 4),
  }));
}

// Heuristic "where can I cut" — spend a smaller fraction of recent spend, by goal.
const GOAL_FACTOR = { aggressive_save: 0.75, balanced: 0.85, comfort: 0.92 };
export function heuristicBudgetSuggestions(goal = "balanced") {
  const factor = GOAL_FACTOR[goal] ?? GOAL_FACTOR.balanced;
  const round25 = (n) => Math.max(0, Math.round(n / 25) * 25);
  const stats = computeCategoryStats();
  const out = [];
  for (const s of stats) {
    // Base the cut on recent spend when it's a meaningful share of the budget
    // (real savings); otherwise trim the ceiling. Same base for suggestion and
    // saving so the numbers stay consistent.
    const spendDriven = s.monthlySpend > 0 && s.monthlySpend >= 0.4 * s.budget;
    const base = spendDriven ? s.monthlySpend : s.budget;
    if (base <= 0) continue;
    const suggested = round25(base * factor);
    const monthlySaving = Math.max(0, base - suggested);
    if (monthlySaving < 25) continue; // not worth surfacing
    out.push({
      category: s.category,
      current: s.budget,
      suggested,
      monthlySaving,
      rationale: spendDriven
        ? `You've averaged ${fmtUsd(s.monthlySpend)}/mo on ${s.category} (last 90 days). Trimming to ${fmtUsd(suggested)} would save about ${fmtUsd(monthlySaving)}/mo.`
        : `Your ${s.category} ceiling is ${fmtUsd(s.budget)}. Tightening it to ${fmtUsd(suggested)} frees ${fmtUsd(monthlySaving)}/mo of headroom.`,
    });
  }
  return out.sort((a, b) => b.monthlySaving - a.monthlySaving).slice(0, 6);
}
const fmtUsd = (n) => `$${Math.round(n).toLocaleString("en-US")}`;

// Add a custom category (idempotent, case-insensitive de-dup). Returns the
// canonical stored name.
export function addCategory(name) {
  const clean = String(name || "").trim();
  if (!clean) throw new Error("category name required");
  const existing = db.prepare("SELECT name FROM categories WHERE name = ? COLLATE NOCASE").get(clean);
  if (existing) return existing.name;
  db.prepare("INSERT INTO categories (name, builtin, position) VALUES (?, 0, NULL)").run(clean);
  return clean;
}

// ----- Mutations (mirror the store actions) -----
export function recategorize(id, category) {
  const r = db
    .prepare("UPDATE transactions SET category = ?, confidence = 1, user_override = 1 WHERE id = ?")
    .run(category, id);
  return r.changes > 0;
}

export function addInstitution(institutionName, newAccounts = [], newTx = []) {
  const insAccount = db.prepare(
    "INSERT OR REPLACE INTO accounts (id, name, balance, type, mask, institution) VALUES (?, ?, ?, ?, ?, ?)"
  );
  const insTx = db.prepare(
    `INSERT OR REPLACE INTO transactions (id, date, merchant, amount, category, account, flagged, confidence, essential, user_override)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  db.exec("BEGIN");
  try {
    for (const a of newAccounts) insAccount.run(a.id, a.name, a.balance, a.type, a.mask ?? null, institutionName);
    for (const t of newTx)
      insTx.run(t.id, t.date, t.merchant, t.amount, t.category, t.account, t.flagged ?? null, t.confidence ?? 1, t.essential ? 1 : 0, t.userOverride ? 1 : 0);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function setBudget(category, amount) {
  const amt = Math.max(0, Math.round(amount));
  db.prepare(
    "INSERT INTO budgets (category, amount) VALUES (?, ?) ON CONFLICT(category) DO UPDATE SET amount = excluded.amount"
  ).run(category, amt);
}

export function toggleIncome(id) {
  db.prepare("UPDATE income_streams SET active = CASE active WHEN 1 THEN 0 ELSE 1 END WHERE id = ?").run(id);
}

export function setIncomeAmount(id, amount) {
  db.prepare("UPDATE income_streams SET amount = ? WHERE id = ?").run(Math.max(0, Math.round(amount)), id);
}

// ----- Liabilities: per-account debt fields + payment cycle -----
// Whitelisted, editable liability fields keyed by API name -> column.
const LIABILITY_COLUMNS = {
  owner: "owner",
  apr: "apr",
  creditLimit: "credit_limit",
  statementBalance: "statement_balance",
  balance: "balance",
  minDue: "min_due",
  dueDay: "due_day",
  autopay: "autopay",
  liabilityGroup: "liability_group",
  notes: "notes",
  payment: "payment",
  paymentDate: "payment_date",
  payStatus: "pay_status",
  debtClass: "debt_class",
  promoKind: "promo_kind",
  promoAprUntil: "promo_apr_until",
  balanceTransferDate: "balance_transfer_date",
};

// Fields Plaid can supply — once the user edits one it's "locked" so a future
// Plaid sync won't overwrite their manual value.
const PLAID_TRACKED = new Set([
  "apr", "creditLimit", "statementBalance", "minDue", "dueDay",
]);

const readOverrides = (id) => {
  const r = db.prepare("SELECT liability_overrides FROM accounts WHERE id = ?").get(id);
  return new Set((r?.liability_overrides || "").split(",").filter(Boolean));
};

// Update one or more liability fields on an account (user edit). Booleans are
// coerced to 0/1; unknown keys ignored. Edited Plaid-sourced fields are recorded
// as overrides so syncs leave them alone.
export function updateLiability(id, patch = {}) {
  // Snapshot before the write so we can detect a transition into "paid".
  const before = db.prepare("SELECT type, payment, min_due, pay_status FROM accounts WHERE id = ?").get(id);
  const sets = [];
  const vals = [];
  const overrides = readOverrides(id);
  for (const [key, col] of Object.entries(LIABILITY_COLUMNS)) {
    if (!(key in patch)) continue;
    let v = patch[key];
    if (key === "autopay") v = v === null ? null : v ? 1 : 0;
    sets.push(`${col} = ?`);
    vals.push(v);
    if (PLAID_TRACKED.has(key)) overrides.add(key);
  }
  if (!sets.length) return false;
  sets.push("liability_overrides = ?");
  vals.push([...overrides].join(","));
  vals.push(id);
  const r = db.prepare(`UPDATE accounts SET ${sets.join(", ")} WHERE id = ?`).run(...vals);

  // When a credit card flips to "paid", record the payment for the progress chart.
  if (before && before.type === "credit" && patch.payStatus === "paid" && before.pay_status !== "paid") {
    const amount = Math.max(0, patch.payment ?? before.payment ?? before.min_due ?? 0);
    recordCcPayment(id, amount);
  }
  return r.changes > 0;
}

// One credit-card payment per account per month (re-marking updates the amount).
export function recordCcPayment(accountId, amount) {
  const now = new Date();
  const month = now.toISOString().slice(0, 7); // YYYY-MM
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM payments WHERE account = ? AND month = ?").run(accountId, month);
    db.prepare("INSERT INTO payments (account, amount, month, at) VALUES (?, ?, ?, ?)")
      .run(accountId, Number(amount) || 0, month, now.toISOString());
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// Record a balance point (used by manual edits and Plaid credit-card syncs).
export function recordAccountBalance(accountId, balance) {
  recordBalance(accountId, Number(balance) || 0, new Date().toISOString());
}

// ----- Reports -----
// Total credit-card payments per month (the "am I paying down cards" chart).
export function getCcPaymentsByMonth() {
  return db.prepare(
    "SELECT month, ROUND(SUM(amount), 2) AS total FROM payments GROUP BY month ORDER BY month ASC"
  ).all();
}

// Total credit-card balance owed per month, from balance history: for each month
// take each credit account's last-known balance and sum the amounts owed.
export function getCcBalanceByMonth() {
  const rows = db.prepare(
    `SELECT h.account AS account, substr(h.at, 1, 7) AS month, h.balance AS balance, h.at AS at
     FROM account_balance_history h
     JOIN accounts a ON a.id = h.account
     WHERE a.type = 'credit'
     ORDER BY h.at ASC`
  ).all();
  // last balance per (account, month)
  const lastByMonth = new Map(); // month -> Map(account -> balance)
  for (const r of rows) {
    if (!lastByMonth.has(r.month)) lastByMonth.set(r.month, new Map());
    lastByMonth.get(r.month).set(r.account, r.balance);
  }
  // carry forward each account's balance across months
  const months = [...lastByMonth.keys()].sort();
  const carry = new Map();
  const out = [];
  for (const m of months) {
    for (const [acct, bal] of lastByMonth.get(m)) carry.set(acct, bal);
    const owed = [...carry.values()].reduce((s, b) => s + Math.max(0, -b), 0);
    out.push({ month: m, owed: Math.round(owed * 100) / 100 });
  }
  return out;
}

// Populate liability fields FROM Plaid on sync. Only sets fields the user hasn't
// manually overridden, and only non-null incoming values. Also sets debt_class
// if not already set. Never touches payment/status/notes/promo (user-owned).
export function updateLiabilityFromPlaid(id, fields = {}) {
  const overrides = readOverrides(id);
  const sets = [];
  const vals = [];
  for (const [key, col] of Object.entries(LIABILITY_COLUMNS)) {
    if (!(key in fields)) continue;
    if (!PLAID_TRACKED.has(key) && key !== "debtClass") continue; // only Plaid-owned facts
    if (overrides.has(key)) continue;                             // user set it by hand
    const v = fields[key];
    if (v === null || v === undefined) continue;
    if (key === "debtClass") {
      // only set debt_class if not already classified
      sets.push("debt_class = COALESCE(debt_class, ?)");
    } else {
      sets.push(`${col} = ?`);
    }
    vals.push(v);
  }
  if (!sets.length) return false;
  vals.push(id);
  const r = db.prepare(`UPDATE accounts SET ${sets.join(", ")} WHERE id = ?`).run(...vals);
  return r.changes > 0;
}

// Choose which cash account payments are drawn from. Clears the flag elsewhere,
// sets it on `id`, and snapshots that account's balance.
export function setFundingAccount(id) {
  const acct = db.prepare("SELECT balance FROM accounts WHERE id = ?").get(id);
  if (!acct) return false;
  db.exec("BEGIN");
  try {
    db.prepare("UPDATE accounts SET is_funding = 0").run();
    db.prepare("UPDATE accounts SET is_funding = 1 WHERE id = ?").run(id);
    db.prepare(
      "INSERT INTO meta (key, value) VALUES ('funding_snapshot', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
    ).run(String(acct.balance));
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return true;
}

// Freeze (or refresh) the checking snapshot the payment allocation draws from.
// With no explicit value, capture the current funding account's balance.
export function setFundingSnapshot(value) {
  let v = value;
  if (v === undefined || v === null) {
    // Capture the flagged funding account, else the largest checking account.
    const f =
      db.prepare("SELECT balance FROM accounts WHERE is_funding = 1 LIMIT 1").get() ||
      db.prepare("SELECT balance FROM accounts WHERE type = 'checking' ORDER BY balance DESC LIMIT 1").get();
    v = f ? f.balance : 0;
  }
  db.prepare(
    "INSERT INTO meta (key, value) VALUES ('funding_snapshot', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value"
  ).run(String(v));
  return Number(v);
}

// ----- Plaid item + account/transaction sync persistence -----
export function savePlaidItem({ itemId, accessTokenEnc, institutionId, institutionName }) {
  db.prepare(
    `INSERT INTO plaid_items (item_id, access_token_enc, institution_id, institution_name, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       access_token_enc = excluded.access_token_enc,
       institution_id   = excluded.institution_id,
       institution_name = excluded.institution_name`
  ).run(itemId, accessTokenEnc, institutionId ?? null, institutionName ?? null, new Date().toISOString());
}

export function getPlaidItems() {
  return db.prepare("SELECT * FROM plaid_items").all();
}

export function setItemCursor(itemId, cursor) {
  db.prepare("UPDATE plaid_items SET cursor = ? WHERE item_id = ?").run(cursor, itemId);
}

export function setItemSynced(itemId) {
  db.prepare("UPDATE plaid_items SET last_synced_at = ? WHERE item_id = ?").run(new Date().toISOString(), itemId);
}

export function deletePlaidItem(itemId) {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM transactions WHERE item_id = ?").run(itemId);
    db.prepare("DELETE FROM holdings WHERE item_id = ?").run(itemId);
    db.prepare("DELETE FROM accounts WHERE item_id = ?").run(itemId);
    db.prepare("DELETE FROM plaid_items WHERE item_id = ?").run(itemId);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

export function upsertAccount(a) {
  db.prepare(
    `INSERT INTO accounts (id, name, balance, type, mask, institution, item_id, subtype)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, balance = excluded.balance,
       -- keep the user's manual type if they reclassified this account
       type = CASE WHEN accounts.type_override = 1 THEN accounts.type ELSE excluded.type END,
       mask = excluded.mask, institution = excluded.institution, item_id = excluded.item_id,
       subtype = excluded.subtype`
  ).run(a.id, a.name, a.balance, a.type, a.mask ?? null, a.institution ?? null, a.itemId ?? null, a.subtype ?? null);
}

const ACCOUNT_TYPES = new Set(["checking", "savings", "investment", "credit", "loan"]);
// Manually reclassify an account's type (locks it against Plaid syncs).
export function setAccountType(id, type) {
  if (!ACCOUNT_TYPES.has(type)) throw new Error(`invalid account type: ${type}`);
  const r = db.prepare("UPDATE accounts SET type = ?, type_override = 1 WHERE id = ?").run(type, id);
  return r.changes > 0;
}

// Set a display nickname (Plaid `name` is preserved). Empty clears it.
export function setAccountNickname(id, nickname) {
  const clean = String(nickname ?? "").trim() || null;
  const r = db.prepare("UPDATE accounts SET nickname = ? WHERE id = ?").run(clean, id);
  return r.changes > 0;
}

function recordBalance(account, balance, at) {
  db.prepare("INSERT INTO account_balance_history (account, balance, at) VALUES (?, ?, ?)").run(account, balance, at);
}

// Create a manual (non-Plaid) account, e.g. a 529 plan Plaid can't reach.
export function createManualAccount({ name, type, balance = 0, nickname = null }) {
  if (!ACCOUNT_TYPES.has(type)) throw new Error(`invalid account type: ${type}`);
  const id = `man_${randomUUID()}`;
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO accounts (id, name, balance, type, mask, institution, is_manual, nickname, balance_asof)
     VALUES (?, ?, ?, ?, NULL, 'Manual', 1, ?, ?)`
  ).run(id, String(name || "Account"), Number(balance) || 0, type, nickname ? String(nickname).trim() : null, now);
  recordBalance(id, Number(balance) || 0, now);
  return id;
}

// Update a manual account's balance and stamp/record it (for tracking over time).
export function setManualBalance(id, balance) {
  const row = db.prepare("SELECT is_manual FROM accounts WHERE id = ?").get(id);
  if (!row) return false;
  if (!row.is_manual) throw new Error("balance is only editable on manual accounts");
  const now = new Date().toISOString();
  db.prepare("UPDATE accounts SET balance = ?, balance_asof = ? WHERE id = ?").run(Number(balance) || 0, now, id);
  recordBalance(id, Number(balance) || 0, now);
  return true;
}

// Delete a manual account (never a Plaid-linked one) and its history.
export function deleteManualAccount(id) {
  const row = db.prepare("SELECT is_manual FROM accounts WHERE id = ?").get(id);
  if (!row) return false;
  if (!row.is_manual) throw new Error("only manual accounts can be deleted here");
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM account_balance_history WHERE account = ?").run(id);
    db.prepare("DELETE FROM accounts WHERE id = ?").run(id);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
  return true;
}

export function getAccountHistory(id) {
  return db.prepare("SELECT balance, at FROM account_balance_history WHERE account = ? ORDER BY at ASC").all(id);
}

// Remove a custom category (built-ins are protected). Case-insensitive.
export function deleteCategory(name) {
  const row = db.prepare("SELECT name, builtin FROM categories WHERE name = ? COLLATE NOCASE").get(String(name || ""));
  if (!row) return { deleted: false, reason: "not found" };
  if (row.builtin) return { deleted: false, reason: "built-in categories can't be removed" };
  db.prepare("DELETE FROM categories WHERE name = ? COLLATE NOCASE").run(row.name);
  return { deleted: true, name: row.name };
}

export function upsertTransaction(t) {
  db.prepare(
    `INSERT INTO transactions (id, date, merchant, amount, category, account, flagged, confidence, essential, user_override, item_id, pending)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       date = excluded.date, merchant = excluded.merchant, amount = excluded.amount,
       account = excluded.account, flagged = excluded.flagged, pending = excluded.pending,
       item_id = excluded.item_id,
       -- preserve a user's manual recategorization across syncs
       category   = CASE WHEN transactions.user_override = 1 THEN transactions.category   ELSE excluded.category   END,
       confidence = CASE WHEN transactions.user_override = 1 THEN transactions.confidence ELSE excluded.confidence END,
       essential  = CASE WHEN transactions.user_override = 1 THEN transactions.essential  ELSE excluded.essential  END`
  ).run(
    t.id, t.date, t.merchant, t.amount, t.category, t.account, t.flagged ?? null,
    t.confidence ?? 0.9, t.essential ? 1 : 0, 0, t.itemId ?? null, t.pending ? 1 : 0
  );
}

export function removeTransaction(id) {
  db.prepare("DELETE FROM transactions WHERE id = ?").run(id);
}

export function replaceHoldingsForItem(itemId, rows) {
  db.exec("BEGIN");
  try {
    db.prepare("DELETE FROM holdings WHERE item_id = ?").run(itemId);
    const ins = db.prepare(
      `INSERT INTO holdings (id, account, item_id, security_id, ticker, name, quantity, price, value, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    );
    const now = new Date().toISOString();
    for (const h of rows)
      ins.run(h.id, h.account, itemId, h.securityId ?? null, h.ticker ?? null, h.name ?? null, h.quantity ?? null, h.price ?? null, h.value ?? null, now);
    db.exec("COMMIT");
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}

// Upsert a recurring income stream from Plaid. Preserves the user's active
// toggle if the row already exists (so manual enable/disable survives re-sync).
export function upsertIncomeStream(s) {
  db.prepare(
    `INSERT INTO income_streams (id, source, amount, cadence, next_date, kind, active)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       source = excluded.source, amount = excluded.amount, cadence = excluded.cadence,
       next_date = excluded.next_date, kind = excluded.kind`
  ).run(s.id, s.source, s.amount, s.cadence, s.nextDate, s.kind, s.active ? 1 : 0);
}

export function upsertOutflowStream(s) {
  db.prepare(
    `INSERT INTO outflow_streams (id, name, amount, cadence, next_date, category, kind)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, amount = excluded.amount, cadence = excluded.cadence,
       next_date = excluded.next_date, category = excluded.category, kind = excluded.kind`
  ).run(s.id, s.name, s.amount, s.cadence, s.nextDate, s.category, s.kind);
}

// Set a budget only if the user hasn't already set one for this category.
export function seedBudgetIfAbsent(category, amount) {
  db.prepare(
    "INSERT INTO budgets (category, amount) VALUES (?, ?) ON CONFLICT(category) DO NOTHING"
  ).run(category, Math.max(0, Math.round(amount)));
}

export function runInTransaction(fn) {
  db.exec("BEGIN");
  try {
    const r = fn();
    db.exec("COMMIT");
    return r;
  } catch (e) {
    db.exec("ROLLBACK");
    throw e;
  }
}
