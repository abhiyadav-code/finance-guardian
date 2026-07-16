// Plaid integration for the local Finance Guardian backend.
// Holds the Plaid client, encrypts access tokens at rest, maps Plaid data into
// the app's shapes, and drives link-token / exchange / sync.
import { Configuration, PlaidApi, PlaidEnvironments, Products } from "plaid";
import crypto from "node:crypto";
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as store from "./db.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENV = process.env.PLAID_ENV || "sandbox"; // sandbox | production
// Single-user app: one stable user id is fine.
const CLIENT_USER_ID = process.env.PLAID_USER_ID || "local-user";

export function isConfigured() {
  return Boolean(PLAID_CLIENT_ID && PLAID_SECRET);
}

export function plaidStatus() {
  return { configured: isConfigured(), env: PLAID_ENV };
}

let _client = null;
function client() {
  if (!isConfigured()) throw new Error("Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET.");
  if (_client) return _client;
  const config = new Configuration({
    basePath: PlaidEnvironments[PLAID_ENV],
    baseOptions: {
      headers: { "PLAID-CLIENT-ID": PLAID_CLIENT_ID, "PLAID-SECRET": PLAID_SECRET },
    },
  });
  _client = new PlaidApi(config);
  return _client;
}

// ----- Access-token encryption at rest (AES-256-GCM) -----
function encryptionKey() {
  if (process.env.FG_ENCRYPTION_KEY) {
    const k = Buffer.from(process.env.FG_ENCRYPTION_KEY, "hex");
    if (k.length !== 32) throw new Error("FG_ENCRYPTION_KEY must be 64 hex chars (32 bytes).");
    return k;
  }
  // Fall back to a generated key file next to the DB (gitignored).
  const keyPath = process.env.FG_KEY_PATH || join(__dirname, "data", "secret.key");
  if (existsSync(keyPath)) return Buffer.from(readFileSync(keyPath, "utf8").trim(), "hex");
  mkdirSync(dirname(keyPath), { recursive: true });
  const key = crypto.randomBytes(32);
  writeFileSync(keyPath, key.toString("hex"), { mode: 0o600 });
  console.warn(`[plaid] generated encryption key at ${keyPath} (set FG_ENCRYPTION_KEY to manage it yourself)`);
  return key;
}

function encrypt(plaintext) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv.toString("hex"), tag.toString("hex"), enc.toString("hex")].join(":");
}

function decrypt(blob) {
  const [ivHex, tagHex, dataHex] = blob.split(":");
  const decipher = crypto.createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(dataHex, "hex")), decipher.final()]).toString("utf8");
}

// ----- Mapping Plaid -> app shapes -----
const ESSENTIAL = new Set(["Groceries", "Housing", "Utilities", "Health", "Childcare", "Transport"]);

function mapCategory(pfc) {
  const primary = pfc?.primary || "";
  const detailed = pfc?.detailed || "";
  switch (primary) {
    case "INCOME": return "Income";
    case "TRANSFER_IN":
    case "TRANSFER_OUT":
    case "BANK_FEES":
    case "GOVERNMENT_AND_NON_PROFIT": return "Transfer";
    case "LOAN_PAYMENTS": return detailed.includes("MORTGAGE") ? "Housing" : "Transfer";
    case "FOOD_AND_DRINK": return detailed.includes("GROCERIES") ? "Groceries" : "Dining";
    case "GENERAL_MERCHANDISE": return "Shopping";
    case "HOME_IMPROVEMENT": return "Shopping";
    case "TRANSPORTATION": return "Transport";
    case "TRAVEL": return "Travel";
    case "RENT_AND_UTILITIES":
      return detailed.includes("RENT") || detailed.includes("MORTGAGE") ? "Housing" : "Utilities";
    case "MEDICAL":
    case "PERSONAL_CARE": return "Health";
    case "ENTERTAINMENT": return "Entertainment";
    case "GENERAL_SERVICES": return "Subscriptions";
    default: return "Shopping";
  }
}

function mapConfidence(level) {
  switch (level) {
    case "VERY_HIGH": return 0.99;
    case "HIGH": return 0.95;
    case "MEDIUM": return 0.8;
    case "LOW": return 0.6;
    default: return 0.85;
  }
}

function mapAccountType(a) {
  if (a.type === "credit") return "credit";
  if (a.type === "loan") return "loan"; // installment debt → Loans page
  if (a.type === "investment" || a.type === "brokerage") return "investment";
  if (a.type === "depository") {
    const s = (a.subtype || "").toLowerCase();
    return s === "savings" || s === "cd" || s === "money market" || s === "hsa" ? "savings" : "checking";
  }
  return "checking";
}

const isOwedType = (type) => type === "credit" || type === "loan";

function mapAccount(a, itemId, institutionName) {
  const type = mapAccountType(a);
  const current = a.balances?.current ?? a.balances?.available ?? 0;
  // App convention: credit/loan balances are stored negative (amount owed).
  const balance = isOwedType(type) ? -Math.abs(current) : current;
  return {
    id: a.account_id,
    name: a.name || a.official_name || "Account",
    balance,
    type,
    mask: a.mask ? `··${a.mask}` : null,
    institution: institutionName,
    itemId,
  };
}

function mapTransaction(t, itemId) {
  const category = mapCategory(t.personal_finance_category);
  return {
    id: t.transaction_id,
    date: new Date(t.authorized_date || t.date).toISOString(),
    merchant: t.merchant_name || t.name || "Transaction",
    amount: -1 * t.amount, // Plaid: +out/-in  ->  app: -spend/+income
    category,
    account: t.account_id,
    flagged: null,
    confidence: mapConfidence(t.personal_finance_category?.confidence_level),
    essential: ESSENTIAL.has(category),
    itemId,
    pending: !!t.pending,
  };
}

// ----- Recurring streams (income + bills) mapping -----
const dayMs = 86_400_000;

function mapFrequency(freq) {
  switch (freq) {
    case "WEEKLY": return "weekly";
    case "BIWEEKLY": return "biweekly";
    case "SEMI_MONTHLY": return "semimonthly";
    case "MONTHLY": return "monthly";
    case "ANNUALLY": return "annually";
    default: return "monthly";
  }
}
const cadenceDays = { weekly: 7, biweekly: 14, semimonthly: 15, monthly: 30, quarterly: 91, annually: 365 };

function nextDateFor(stream) {
  if (stream.predicted_next_date) return new Date(stream.predicted_next_date).toISOString();
  // Fall back to last_date + one cadence step, rolled forward to the future.
  const cadence = mapFrequency(stream.frequency);
  const step = cadenceDays[cadence];
  let d = new Date(stream.last_date || Date.now());
  while (d.getTime() <= Date.now()) d = new Date(d.getTime() + step * dayMs);
  return d.toISOString();
}

function mapIncomeKind(pfc) {
  const detailed = pfc?.detailed || "";
  if (detailed.includes("WAGES")) return "paycheck";
  if (detailed.includes("DIVIDENDS") || detailed.includes("INTEREST")) return "dividend";
  if (detailed.includes("UNEMPLOYMENT")) return "unemployment";
  if (detailed.includes("GIG") || detailed.includes("FREELANCE")) return "freelance";
  return "other";
}

function mapOutflowKind(category) {
  switch (category) {
    case "Housing": return "rent";
    case "Utilities": return "utility";
    case "Subscriptions": return "subscription";
    case "Transport": return "loan";
    default: return category === "Income" || category === "Transfer" ? "other" : "credit_card";
  }
}

const round25 = (n) => Math.max(0, Math.round(n / 25) * 25);

// ----- Public operations -----
export async function createLinkToken() {
  const resp = await client().linkTokenCreate({
    user: { client_user_id: CLIENT_USER_ID },
    client_name: "Finance Guardian",
    language: "en",
    country_codes: ["US"],
    products: [Products.Transactions],
    // Pull investments + liabilities too, but only where the institution supports
    // them (so linking never fails at banks that don't).
    required_if_supported_products: [Products.Investments, Products.Liabilities],
    ...(process.env.PLAID_WEBHOOK ? { webhook: process.env.PLAID_WEBHOOK } : {}),
  });
  return resp.data.link_token;
}

export async function exchangePublicToken(publicToken, institution) {
  const exchange = await client().itemPublicTokenExchange({ public_token: publicToken });
  const accessToken = exchange.data.access_token;
  const itemId = exchange.data.item_id;

  let institutionName = institution?.name || null;
  let institutionId = institution?.institution_id || null;
  if (!institutionName) {
    try {
      const item = await client().itemGet({ access_token: accessToken });
      institutionId = item.data.item.institution_id;
      if (institutionId) {
        const inst = await client().institutionsGetById({
          institution_id: institutionId,
          country_codes: ["US"],
        });
        institutionName = inst.data.institution.name;
      }
    } catch { /* best effort */ }
  }

  const accessTokenEnc = encrypt(accessToken);
  store.savePlaidItem({ itemId, accessTokenEnc, institutionId, institutionName });

  const result = await syncItem({
    item_id: itemId,
    access_token_enc: accessTokenEnc,
    institution_name: institutionName,
    cursor: null,
  });
  generateBudgets();
  return { itemId, institutionName, ...result };
}

async function syncItem(item) {
  const accessToken = decrypt(item.access_token_enc);
  const institutionName = item.institution_name;
  const c = client();
  let accountsAdded = 0;
  let txAdded = 0;
  let txRemoved = 0;
  let holdingsCount = 0;

  // 1) Accounts + balances
  const acctResp = await c.accountsGet({ access_token: accessToken });
  for (const a of acctResp.data.accounts) {
    const mapped = mapAccount(a, item.item_id, institutionName);
    store.upsertAccount(mapped);
    accountsAdded++;
    // Tag debt accounts: classify revolving vs installment, and pull the credit
    // limit for utilization (if the institution exposes it here).
    if (isOwedType(mapped.type)) {
      store.updateLiabilityFromPlaid(mapped.id, {
        debtClass: mapped.type === "credit" ? "revolving" : "installment",
        creditLimit: a.balances?.limit ?? null,
      });
    }
  }

  // 2) Transactions (incremental via cursor). Right after linking, Plaid may not
  // have transactions ready yet (PRODUCT_NOT_READY) — that's fine, a later
  // /plaid/sync (or webhook) will pick them up from the saved cursor.
  let cursor = item.cursor || undefined;
  let productReady = true;
  try {
    let hasMore = true;
    while (hasMore) {
      const resp = await c.transactionsSync({ access_token: accessToken, cursor, count: 250 });
      const data = resp.data;
      for (const t of data.added) { store.upsertTransaction(mapTransaction(t, item.item_id)); txAdded++; }
      for (const t of data.modified) { store.upsertTransaction(mapTransaction(t, item.item_id)); }
      for (const t of data.removed) { store.removeTransaction(t.transaction_id); txRemoved++; }
      cursor = data.next_cursor;
      hasMore = data.has_more;
    }
    store.setItemCursor(item.item_id, cursor || null);
  } catch (e) {
    if (e?.response?.data?.error_code === "PRODUCT_NOT_READY") {
      productReady = false; // leave cursor as-is; retry on next sync
    } else {
      throw e;
    }
  }

  // 3) Investments holdings (only if the institution supports it)
  try {
    const hold = await c.investmentsHoldingsGet({ access_token: accessToken });
    const securities = new Map(hold.data.securities.map((s) => [s.security_id, s]));
    const rows = hold.data.holdings.map((h) => {
      const sec = securities.get(h.security_id) || {};
      return {
        id: `${h.account_id}:${h.security_id}`,
        account: h.account_id,
        securityId: h.security_id,
        ticker: sec.ticker_symbol || null,
        name: sec.name || null,
        quantity: h.quantity,
        price: h.institution_price,
        value: h.institution_value,
      };
    });
    store.replaceHoldingsForItem(item.item_id, rows);
    holdingsCount = rows.length;
    // Ensure investment accounts/balances are current too.
    for (const a of hold.data.accounts) store.upsertAccount(mapAccount(a, item.item_id, institutionName));
  } catch {
    // Institution doesn't support investments, or no investment accounts — fine.
  }

  // 4) Recurring income + bills (best effort; needs some history to be ready)
  let recurring = { income: 0, bills: 0 };
  try {
    recurring = await syncRecurring(accessToken, item.item_id);
  } catch (e) {
    if (e?.response?.data?.error_code !== "PRODUCT_NOT_READY") {
      console.warn("[plaid] recurring sync skipped:", e?.response?.data?.error_code || e?.message);
    }
  }

  // 5) Liabilities: statement balance, minimum due, due date, APR, credit limit.
  // Only where the institution/consent supports it; user overrides are preserved.
  try {
    await syncLiabilitiesData(accessToken);
  } catch (e) {
    const code = e?.response?.data?.error_code;
    if (code !== "PRODUCTS_NOT_SUPPORTED" && code !== "NO_LIABILITY_ACCOUNTS" && code !== "PRODUCT_NOT_READY") {
      console.warn("[plaid] liabilities sync skipped:", code || e?.message);
    }
  }

  store.setItemSynced(item.item_id);
  return {
    accounts: accountsAdded, transactionsAdded: txAdded, transactionsRemoved: txRemoved,
    holdings: holdingsCount, income: recurring.income, bills: recurring.bills, productReady,
  };
}

// Pull Plaid's detected recurring streams and persist them as income + bills.
async function syncRecurring(accessToken, itemId) {
  const resp = await client().transactionsRecurringGet({ access_token: accessToken });
  const { inflow_streams = [], outflow_streams = [] } = resp.data;

  let income = 0;
  for (const s of inflow_streams) {
    if (s.is_active === false) continue;
    store.upsertIncomeStream({
      id: s.stream_id,
      source: s.merchant_name || s.description || "Income",
      amount: Math.round(Math.abs(s.average_amount?.amount ?? s.last_amount?.amount ?? 0)),
      cadence: mapFrequency(s.frequency),
      nextDate: nextDateFor(s),
      kind: mapIncomeKind(s.personal_finance_category),
      active: true,
    });
    income++;
  }

  let bills = 0;
  for (const s of outflow_streams) {
    if (s.is_active === false) continue;
    const category = mapCategory(s.personal_finance_category);
    store.upsertOutflowStream({
      id: s.stream_id,
      name: s.merchant_name || s.description || "Bill",
      amount: Math.round(Math.abs(s.average_amount?.amount ?? s.last_amount?.amount ?? 0)),
      cadence: mapFrequency(s.frequency),
      nextDate: nextDateFor(s),
      category,
      kind: mapOutflowKind(category),
    });
    bills++;
  }
  return { income, bills };
}

// Pull Plaid Liabilities (credit cards + loans) and populate the debt fields the
// Liabilities/Loans pages use. Respects user overrides (updateLiabilityFromPlaid).
const dayOfMonth = (iso) => {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d.getUTCDate();
};

// Pick the representative APR for a card: prefer the purchase APR, else the
// highest rate present. Plaid gives whole-percent numbers (e.g. 20.74).
function pickApr(aprs = []) {
  if (!aprs.length) return null;
  const purchase = aprs.find((a) => a.apr_type === "purchase_apr");
  const chosen = purchase ?? aprs.reduce((m, a) => (a.apr_percentage > (m?.apr_percentage ?? -1) ? a : m), null);
  return chosen?.apr_percentage != null ? chosen.apr_percentage / 100 : null;
}

async function syncLiabilitiesData(accessToken) {
  const resp = await client().liabilitiesGet({ access_token: accessToken });
  const accounts = resp.data.accounts || [];
  const limitFor = (id) => accounts.find((a) => a.account_id === id)?.balances?.limit ?? null;
  const { credit = [], mortgage = [], student = [] } = resp.data.liabilities || {};

  for (const c of credit) {
    store.updateLiabilityFromPlaid(c.account_id, {
      debtClass: "revolving",
      statementBalance: c.last_statement_balance ?? null,
      minDue: c.minimum_payment_amount ?? null,
      dueDay: dayOfMonth(c.next_payment_due_date),
      apr: pickApr(c.aprs),
      creditLimit: limitFor(c.account_id),
    });
  }

  const mapLoan = (l) => {
    store.updateLiabilityFromPlaid(l.account_id, {
      debtClass: "installment",
      minDue: l.next_monthly_payment ?? l.minimum_payment_amount ?? null,
      dueDay: dayOfMonth(l.next_payment_due_date ?? l.next_monthly_payment_due_date),
      apr: l.interest_rate?.percentage != null ? l.interest_rate.percentage / 100 : null,
    });
  };
  for (const m of mortgage) mapLoan(m);
  for (const s of student) mapLoan(s);
}

// Auto-generate discretionary budget baselines from trailing-90-day spend
// (PRD §4.4). Only fills categories the user hasn't set a budget for.
const BUDGET_CATEGORIES = new Set([
  "Groceries", "Dining", "Transport", "Shopping", "Entertainment",
  "Health", "Travel", "Subscriptions", "Utilities",
]);
export function generateBudgets() {
  const { transactions } = store.getState();
  const cutoff = Date.now() - 90 * dayMs;
  const totals = new Map();
  for (const t of transactions) {
    if (t.amount >= 0) continue;
    if (!BUDGET_CATEGORIES.has(t.category)) continue;
    if (new Date(t.date).getTime() < cutoff) continue;
    totals.set(t.category, (totals.get(t.category) ?? 0) + Math.abs(t.amount));
  }
  let created = 0;
  for (const [category, total] of totals) {
    const monthly = round25(total / 3); // 90 days -> monthly
    if (monthly > 0) { store.seedBudgetIfAbsent(category, monthly); created++; }
  }
  return created;
}

// Dev helper: create a sandbox item WITHOUT the browser Link flow, then
// exchange + sync it. Lets you smoke-test the whole backend with one request.
export async function sandboxQuickAdd(institutionId = "ins_109508") {
  if (PLAID_ENV !== "sandbox") throw new Error("sandbox-only helper");
  const pt = await client().sandboxPublicTokenCreate({
    institution_id: institutionId,
    initial_products: [Products.Transactions, Products.Liabilities],
  });
  return exchangePublicToken(pt.data.public_token, { institution_id: institutionId });
}

export async function syncAll() {
  const items = store.getPlaidItems();
  const results = [];
  for (const item of items) {
    try {
      results.push({ itemId: item.item_id, ...(await syncItem(item)) });
    } catch (e) {
      results.push({ itemId: item.item_id, error: e instanceof Error ? e.message : "sync failed" });
    }
  }
  const budgets = generateBudgets();
  return { items: results.length, budgets, results };
}
