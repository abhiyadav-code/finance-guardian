import { accounts, fmt } from "@/lib/finance-data";
import { Landmark, PiggyBank, LineChart, CreditCard } from "lucide-react";

const iconFor = {
  checking:   Landmark,
  savings:    PiggyBank,
  investment: LineChart,
  credit:     CreditCard,
} as const;

export function AccountsStrip() {
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
      {accounts.map((a) => {
        const Icon = iconFor[a.type];
        const negative = a.balance < 0;
        return (
          <div key={a.id} className="panel p-4">
            <div className="flex items-center gap-2 text-muted-foreground">
              <Icon className="h-3.5 w-3.5" />
              <span className="text-[10px] uppercase tracking-[0.14em]">{a.type}</span>
            </div>
            <p className="mt-2 truncate text-sm">{a.name}</p>
            <p className={`font-mono-fin mt-1 text-xl tabular-nums ${negative ? "text-destructive" : ""}`}>
              {fmt(a.balance)}
            </p>
            <p className="mt-1 text-[10px] text-muted-foreground">{a.mask}</p>
          </div>
        );
      })}
    </section>
  );
}
