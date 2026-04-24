import { Link } from "react-router-dom";
import { useFinanceStore } from "@/lib/finance-store";
import { fmtCents } from "@/lib/finance-data";
import { AlertTriangle, Repeat, Copy, Sparkles, ArrowRight } from "lucide-react";

const flagMeta = {
  anomaly:              { Icon: AlertTriangle, label: "Anomaly",       cls: "text-destructive bg-destructive/10 ring-destructive/30" },
  shadow_subscription:  { Icon: Repeat,        label: "New recurring", cls: "text-primary bg-primary/10 ring-primary/30" },
  duplicate:            { Icon: Copy,          label: "Duplicate",     cls: "text-primary bg-primary/10 ring-primary/30" },
} as const;

export function TransactionList() {
  const items = transactions.slice(0, 10);

  return (
    <section className="panel p-6 md:p-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Recent activity</p>
          <h2 className="font-display mt-1 text-2xl">Auto-classified, instantly.</h2>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
          <Sparkles className="h-3 w-3 text-primary" /> 94.6% model accuracy
        </span>
      </header>

      <ul className="divide-y divide-border">
        {items.map((t) => {
          const flag = t.flagged ? flagMeta[t.flagged] : null;
          const isIncome = t.amount > 0;
          return (
            <li key={t.id} className="group grid grid-cols-[auto_1fr_auto] items-center gap-4 py-3.5 first:pt-0 last:pb-0">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-sm font-medium text-foreground/80">
                {t.merchant.charAt(0)}
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">{t.merchant}</p>
                  {flag && (
                    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1 ${flag.cls}`}>
                      <flag.Icon className="h-3 w-3" /> {flag.label}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">
                  {t.category} · conf {(t.confidence * 100).toFixed(0)}% · {new Date(t.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              </div>

              <p className={`font-mono-fin text-sm tabular-nums ${isIncome ? "text-success" : "text-foreground"}`}>
                {isIncome ? "+" : ""}{fmtCents(t.amount)}
              </p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
