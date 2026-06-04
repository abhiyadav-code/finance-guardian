// SQLite persistence layer using Node's built-in node:sqlite (no native deps).
// A single file DB lives at server/data/finance.db — back it up by copying that file.
import { DatabaseSync } from "node:sqlite";
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
    "INSERT INTO accounts (id, name, balance, type, mask, institution) VALUES (?, ?, ?, ?, ?, ?)"
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
    for (const a of seedAccounts) insAccount.run(a.id, a.name, a.balance, a.type, a.mask, a.institution);
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
const toAccount = (r) => ({ id: r.id, name: r.name, balance: r.balance, type: r.type, mask: r.mask });
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
  return { accounts, transactions, income, outflows, budgets, categories };
}

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
    `INSERT INTO accounts (id, name, balance, type, mask, institution, item_id)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       name = excluded.name, balance = excluded.balance, type = excluded.type,
       mask = excluded.mask, institution = excluded.institution, item_id = excluded.item_id`
  ).run(a.id, a.name, a.balance, a.type, a.mask ?? null, a.institution ?? null, a.itemId ?? null);
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
