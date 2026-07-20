import { describe, it, expect } from "vitest";
import {
  deriveSummary, deriveLiabilities, deriveLoans, dedupeAccounts, owedOf,
} from "./derive";
import type { Account } from "./finance-data";

// Small factory so each test spells out only the fields it cares about.
let n = 0;
function acct(partial: Partial<Account> & { type: Account["type"]; balance: number }): Account {
  n += 1;
  return {
    id: partial.id ?? `a${n}`,
    name: partial.name ?? `Account ${n}`,
    mask: partial.mask ?? `··${1000 + n}`,
    ...partial,
  };
}

// A representative household: 3 checking + 1 savings + credit cards + a loan,
// plus one investment. Synthetic figures (never real balances).
const CHECKING_A = acct({ id: "chk-a", type: "checking", balance: 1_225.35 });
const CHECKING_B = acct({ id: "chk-b", type: "checking", balance: 95_700.84 });
const CHECKING_C = acct({ id: "chk-c", type: "checking", balance: 212.15 });
const SAVINGS = acct({ id: "sav", type: "savings", balance: 146_603.70 });
const CARD_1 = acct({ id: "cc1", type: "credit", balance: -2_819.18, debtClass: "revolving" });
const CARD_2 = acct({ id: "cc2", type: "credit", balance: -12_660.56, debtClass: "revolving" });
const AUTO_LOAN = acct({ id: "ln1", type: "loan", balance: -28_500, debtClass: "installment", apr: 0.05, payment: 680 });
const BROKERAGE = acct({ id: "brk", type: "investment", balance: 184_500 });

const HOUSEHOLD = [CHECKING_A, CHECKING_B, CHECKING_C, SAVINGS, CARD_1, CARD_2, AUTO_LOAN, BROKERAGE];

const CASH_SUM = 1_225.35 + 95_700.84 + 212.15 + 146_603.70; // 243_742.04

describe("cash / liquid assets", () => {
  it("liquid assets = sum of checking + savings only", () => {
    const s = deriveSummary(HOUSEHOLD, []);
    expect(s.liquidAssets).toBeCloseTo(CASH_SUM, 2);
  });

  it("excludes credit, loan, and investment from cash", () => {
    // Cash must not move when we add/remove non-cash accounts.
    const withoutInvestments = deriveSummary(
      HOUSEHOLD.filter((a) => a.type !== "investment"),
      []
    );
    expect(withoutInvestments.liquidAssets).toBeCloseTo(CASH_SUM, 2);
  });

  it("a brokerage CMA mis-typed as checking inflates cash; reclassifying to investment fixes it", () => {
    // The real bug: a Merrill CMA-Edge account Plaid reports as depository.
    const cmaAsChecking = acct({ id: "cma", type: "checking", balance: 95_700.84 });
    const inflated = deriveSummary([...HOUSEHOLD, cmaAsChecking], []);
    expect(inflated.liquidAssets).toBeCloseTo(CASH_SUM + 95_700.84, 2);

    // After reclassifying it to investment, cash returns to the true figure
    // and net worth is unchanged (it's still an asset).
    const fixed = deriveSummary([...HOUSEHOLD, { ...cmaAsChecking, type: "investment" }], []);
    expect(fixed.liquidAssets).toBeCloseTo(CASH_SUM, 2);
    expect(fixed.netWorth).toBeCloseTo(inflated.netWorth, 2);
  });

  it("does NOT double-count when the same account id appears twice", () => {
    // Simulate a bad merge / optimistic-insert repeat.
    const dupey = [...HOUSEHOLD, { ...CHECKING_B }, { ...SAVINGS }];
    const s = deriveSummary(dupey, []);
    expect(s.liquidAssets).toBeCloseTo(CASH_SUM, 2); // still counted once each
    expect(s.accountsCount).toBe(HOUSEHOLD.length);
  });

  it("cash total equals the sum of the individual account balances (reconciliation)", () => {
    const cashAccounts = HOUSEHOLD.filter((a) => a.type === "checking" || a.type === "savings");
    const handTally = cashAccounts.reduce((t, a) => t + a.balance, 0);
    const s = deriveSummary(HOUSEHOLD, []);
    expect(s.liquidAssets).toBeCloseTo(handTally, 2);
  });
});

describe("net worth", () => {
  it("net worth = sum of every account balance, each counted once", () => {
    const s = deriveSummary(HOUSEHOLD, []);
    const expected = HOUSEHOLD.reduce((t, a) => t + a.balance, 0);
    expect(s.netWorth).toBeCloseTo(expected, 2);
  });

  it("a large loan mis-typed as 'credit' inflates debt but never touches cash", () => {
    // Root cause of the reported bug: a mortgage synced under the old
    // loan→credit mapping. It must NOT appear in liquid assets.
    const mortgageAsCredit = acct({ id: "mtg", type: "credit", balance: -1_181_002.13, debtClass: "revolving" });
    const s = deriveSummary([...HOUSEHOLD, mortgageAsCredit], []);
    expect(s.liquidAssets).toBeCloseTo(CASH_SUM, 2);          // cash unchanged
    expect(s.netWorth).toBeLessThan(0);                        // net worth cratered by the mortgage
  });
});

describe("dedupeAccounts", () => {
  it("keeps one row per id, last write wins", () => {
    const out = dedupeAccounts([
      acct({ id: "x", type: "checking", balance: 100 }),
      acct({ id: "x", type: "checking", balance: 250 }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].balance).toBe(250);
  });
});

describe("deriveLiabilities (revolving only)", () => {
  it("includes credit cards and excludes installment loans", () => {
    const v = deriveLiabilities(HOUSEHOLD, 100_000);
    const ids = v.groups.flatMap((g) => g.rows.map((r) => r.account.id));
    expect(ids).toContain("cc1");
    expect(ids).toContain("cc2");
    expect(ids).not.toContain("ln1"); // loan lives on the Loans page
  });

  it("owed = -balance; total owed = sum of card balances owed", () => {
    const v = deriveLiabilities([CARD_1, CARD_2], 100_000);
    expect(v.totalOwed).toBeCloseTo(owedOf(CARD_1) + owedOf(CARD_2), 2);
    expect(v.totalOwed).toBeCloseTo(2_819.18 + 12_660.56, 2);
  });

  it("allocation: remaining = snapshot - sum(payments); flags over-allocation", () => {
    const c1 = acct({ id: "p1", type: "credit", balance: -1000, debtClass: "revolving", payment: 600 });
    const c2 = acct({ id: "p2", type: "credit", balance: -1000, debtClass: "revolving", payment: 300 });
    const v = deriveLiabilities([c1, c2], 1000);
    expect(v.allocated).toBeCloseTo(900, 2);
    expect(v.remaining).toBeCloseTo(100, 2);
    expect(v.overAllocated).toBe(false);

    const over = deriveLiabilities([c1, c2], 800);
    expect(over.remaining).toBeCloseTo(-100, 2);
    expect(over.overAllocated).toBe(true);
  });

  it("next-month owed = owed - payment, per account and in total", () => {
    const c = acct({ id: "nm", type: "credit", balance: -1000, debtClass: "revolving", payment: 250 });
    const v = deriveLiabilities([c], 5000);
    expect(v.totalNextMonthOwed).toBeCloseTo(750, 2);
  });

  it("0% promo card auto-fills payment to the minimum due and reads 0% effective APR", () => {
    const future = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
    const promo = acct({
      id: "promo", type: "credit", balance: -8000, debtClass: "revolving",
      apr: 0.2099, minDue: 125, promoKind: "balance_transfer", promoAprUntil: future,
      payment: null,
    });
    const v = deriveLiabilities([promo], 20_000);
    const row = v.groups.flatMap((g) => g.rows).find((r) => r.account.id === "promo")!;
    expect(row.paymentAuto).toBe(true);
    expect(row.payment).toBeCloseTo(125, 2);   // auto-filled to min due
    expect(row.effectiveApr).toBe(0);          // 0% while promo is live
    expect(row.promoActive).toBe(true);
    // and it sits in the "deferred" bucket
    expect(v.groups.find((g) => g.group === "deferred")?.rows.length).toBe(1);
  });

  it("an expired promo falls back to the go-to APR and the monthly bucket", () => {
    const past = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const expired = acct({
      id: "ex", type: "credit", balance: -8000, debtClass: "revolving",
      apr: 0.2099, minDue: 125, promoKind: "balance_transfer", promoAprUntil: past, payment: 400,
    });
    const v = deriveLiabilities([expired], 20_000);
    const row = v.groups.flatMap((g) => g.rows).find((r) => r.account.id === "ex")!;
    expect(row.promoActive).toBe(false);
    expect(row.effectiveApr).toBeCloseTo(0.2099, 4);
    expect(row.paymentAuto).toBe(false);
    expect(v.groups.find((g) => g.group === "monthly")?.rows.length).toBe(1);
  });

  it("does not double-count a duplicated card id", () => {
    const v = deriveLiabilities([CARD_1, { ...CARD_1 }], 100_000);
    expect(v.totalOwed).toBeCloseTo(owedOf(CARD_1), 2);
  });
});

describe("deriveLoans (installment only)", () => {
  it("includes loans, excludes credit cards, and totals balance + monthly", () => {
    const v = deriveLoans(HOUSEHOLD);
    expect(v.loans.map((l) => l.account.id)).toEqual(["ln1"]);
    expect(v.totalBalance).toBeCloseTo(28_500, 2);
    expect(v.totalMonthly).toBeCloseTo(680, 2);
  });

  it("payoff months is null when the payment can't cover interest", () => {
    const stuck = acct({ id: "stuck", type: "loan", balance: -10_000, debtClass: "installment", apr: 0.2, payment: 100 });
    const v = deriveLoans([stuck]);
    expect(v.loans[0].payoffMonths).toBeNull();
  });
});
