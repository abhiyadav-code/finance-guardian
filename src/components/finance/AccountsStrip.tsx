import { useFinanceStore } from "@/lib/finance-store";
import { fmt } from "@/lib/finance-data";
import { Landmark, PiggyBank, LineChart, CreditCard, Plus } from "lucide-react";

const iconFor = {
  checking:   Landmark,
  savings:    PiggyBank,
  investment: LineChart,
  credit:     CreditCard,
} as const;

export function AccountsStrip({ onConnect }: { onConnect?: () => void }) {
  const accounts = useFinanceStore((s) => s.accounts);
  return (
    <section className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
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

      {onConnect && (
        <button
          onClick={onConnect}
          className="group flex flex-col items-start justify-center gap-1 rounded-2xl border border-dashed border-border p-4 text-left transition-all hover:border-primary/60 hover:bg-primary/5"
        >
          <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/15 text-primary ring-1 ring-primary/30 transition-transform group-hover:scale-110">
            <Plus className="h-3.5 w-3.5" />
          </span>
          <span className="mt-1 text-sm font-medium">Connect account</span>
          <span className="text-[11px] text-muted-foreground">via Plaid · 2 min</span>
        </button>
      )}
    </section>
  );
}
