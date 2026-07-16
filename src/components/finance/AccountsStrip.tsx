import { useFinanceStore } from "@/lib/finance-store";
import { fmt, type Account, type AccountType } from "@/lib/finance-data";
import { Landmark, PiggyBank, LineChart, CreditCard, Banknote, Plus } from "lucide-react";

const iconFor: Record<AccountType, typeof Landmark> = {
  checking:   Landmark,
  savings:    PiggyBank,
  investment: LineChart,
  credit:     CreditCard,
  loan:       Banknote,
};

// Accounts are always labeled and grouped by type across the app.
const TYPE_ORDER: AccountType[] = ["checking", "savings", "investment", "credit", "loan"];
const TYPE_LABEL: Record<AccountType, string> = {
  checking:   "Checking",
  savings:    "Savings",
  investment: "Investments",
  credit:     "Credit cards",
  loan:       "Loans",
};

export function AccountsStrip({ onConnect }: { onConnect?: () => void }) {
  const accounts = useFinanceStore((s) => s.accounts);

  const groups = TYPE_ORDER
    .map((type) => ({ type, items: accounts.filter((a) => a.type === type) }))
    .filter((g) => g.items.length > 0);

  return (
    <div className="space-y-5">
      {groups.map(({ type, items }) => {
        const subtotal = items.reduce((s, a) => s + a.balance, 0);
        return (
          <section key={type}>
            <header className="mb-2 flex items-baseline justify-between">
              <h3 className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
                {TYPE_LABEL[type]} <span className="text-foreground/40">· {items.length}</span>
              </h3>
              <span className={`font-mono-fin text-xs tabular-nums ${subtotal < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                {fmt(subtotal)}
              </span>
            </header>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4 lg:grid-cols-5">
              {items.map((a) => <AccountCard key={a.id} account={a} />)}

              {type === "checking" && onConnect && (
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
            </div>
          </section>
        );
      })}
    </div>
  );
}

function AccountCard({ account: a }: { account: Account }) {
  const Icon = iconFor[a.type];
  const negative = a.balance < 0;
  return (
    <div className="panel p-4">
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
}
