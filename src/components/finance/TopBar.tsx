import { Shield } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink } from "@/components/NavLink";
import { ThemeToggle } from "@/components/ThemeToggle";
import { SyncButton } from "@/components/SyncButton";
import { api } from "@/lib/api";

export function TopBar() {
  const [instance, setInstance] = useState<string | null>(null);
  useEffect(() => {
    api.config().then((c) => setInstance(c.instance)).catch(() => {});
  }, []);
  const isDemo = instance === "demo";
  const showBadge = instance && instance !== "production" && instance !== "local";

  return (
    <header className="sticky top-0 z-20 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4 md:px-10">
        <div className="flex items-center gap-2.5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-gradient-amber text-primary-foreground shadow-glow">
            <Shield className="h-4 w-4" strokeWidth={2.6} />
          </div>
          <div className="leading-tight">
            <p className="font-display text-base">Finance Guardian</p>
            <p className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Always on</p>
          </div>
          {showBadge && (
            <span className={`ml-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider ring-1 ${
              isDemo ? "bg-primary/10 text-primary ring-primary/30" : "bg-secondary text-muted-foreground ring-border"
            }`}>
              {isDemo ? "Demo" : instance}
            </span>
          )}
        </div>

        <nav className="hidden items-center gap-7 text-sm text-muted-foreground md:flex">
          <NavLink to="/" end className="hover:text-foreground" activeClassName="text-foreground">Dashboard</NavLink>
          <NavLink to="/cash-flow" className="hover:text-foreground" activeClassName="text-foreground">Cash flow</NavLink>
          <NavLink to="/liabilities" className="hover:text-foreground" activeClassName="text-foreground">Liabilities</NavLink>
          <NavLink to="/loans" className="hover:text-foreground" activeClassName="text-foreground">Loans</NavLink>
          <NavLink to="/transactions" className="hover:text-foreground" activeClassName="text-foreground">Transactions</NavLink>
        </nav>

        <div className="flex items-center gap-3">
          <span className="hidden items-center gap-2 rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs text-muted-foreground md:inline-flex">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-success" />
            Models healthy
          </span>
          <SyncButton />
          <ThemeToggle />
          <div className="grid h-9 w-9 place-items-center rounded-full bg-secondary text-sm font-medium ring-1 ring-border">
            M
          </div>
        </div>
      </div>
    </header>
  );
}
