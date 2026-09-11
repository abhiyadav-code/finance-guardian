import { describe, it, expect } from "vitest";
import { buildProjection, type PlannedItem } from "./cashflow-data";

describe("buildProjection — planned adjustments", () => {
  const nextMonthKey = () => {
    const d = new Date(); d.setMonth(d.getMonth() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  };

  it("a planned expense pulls down the near-term cash line", () => {
    const nm = nextMonthKey();
    const base = buildProjection({ startingCash: 10000, income: [], outflows: [], discretionaryByCategory: {}, days: 40 });
    const planned: PlannedItem[] = [{ id: "p", name: "Gym", kind: "expense", amount: 5000, startMonth: nm, endMonth: nm }];
    const withPlan = buildProjection({ startingCash: 10000, income: [], outflows: [], discretionaryByCategory: {}, days: 40, planned });
    expect(base[base.length - 1].cashOnHand).toBe(10000);          // unchanged baseline
    expect(withPlan[withPlan.length - 1].cashOnHand).toBe(5000);   // -5000 applied
  });

  it("a planned income lifts the near-term cash line", () => {
    const nm = nextMonthKey();
    const planned: PlannedItem[] = [{ id: "b", name: "Bonus", kind: "income", amount: 8000, startMonth: nm, endMonth: nm }];
    const r = buildProjection({ startingCash: 1000, income: [], outflows: [], discretionaryByCategory: {}, days: 40, planned });
    expect(r[r.length - 1].cashOnHand).toBe(9000);
  });
});
