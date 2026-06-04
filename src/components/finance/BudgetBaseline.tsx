import { useMemo } from "react";
import { fmt } from "@/lib/finance-data";
import { useFinanceStore } from "@/lib/finance-store";
import { deriveBudgetRows } from "@/lib/derive";

const MONTH = new Date().toLocaleDateString("en-US", { month: "long" });

export function BudgetBaseline() {
  const transactions = useFinanceStore((s) => s.transactions);
  const budgets = useFinanceStore((s) => s.budgets);
  const sorted = useMemo(() => deriveBudgetRows(transactions, budgets), [transactions, budgets]);

  return (
    <section className="panel p-6 md:p-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Auto budget · {MONTH}</p>
          <h2 className="font-display mt-1 text-2xl">Baseline, no spreadsheet.</h2>
        </div>
        <span className="text-xs text-muted-foreground">Spend vs ceiling</span>
      </header>

      {sorted.length === 0 && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No budgets yet — they'll appear as spending data comes in.
        </p>
      )}

      <ul className="space-y-4">
        {sorted.map((b) => {
          const pct = Math.min(140, (b.spent / (b.baseline || 1)) * 100);
          const over = b.spent > b.baseline;
          const barColor = over
            ? "bg-destructive"
            : pct > 85
            ? "bg-primary"
            : "bg-success";

          return (
            <li key={b.category}>
              <div className="mb-1.5 flex items-baseline justify-between gap-3 text-sm">
                <span className="font-medium">{b.category}</span>
                <span className="font-mono-fin text-xs text-muted-foreground">
                  <span className={over ? "text-destructive" : "text-foreground"}>{fmt(b.spent)}</span>
                  <span className="mx-1.5 opacity-50">/</span>
                  {fmt(b.baseline)}
                </span>
              </div>
              <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                <div
                  className={`h-full rounded-full ${barColor} transition-all duration-700 ease-out`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
                {over && (
                  <span
                    className="absolute right-0 top-1/2 h-3 w-[2px] -translate-y-1/2 bg-destructive"
                    aria-hidden
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
