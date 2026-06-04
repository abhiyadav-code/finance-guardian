import { Shield } from "lucide-react";
import { useMemo } from "react";
import { useFinanceStore } from "@/lib/finance-store";
import { deriveSummary } from "@/lib/derive";
import { fmt } from "@/lib/finance-data";

export function GuardianStatus() {
  const accounts = useFinanceStore((s) => s.accounts);
  const transactions = useFinanceStore((s) => s.transactions);
  const s = useMemo(() => deriveSummary(accounts, transactions), [accounts, transactions]);

  const runwayLabel = Number.isFinite(s.runwayMonths) ? `${s.runwayMonths.toFixed(1)} mo` : "—";
  const headline = !s.hasData
    ? "Ready when you are."
    : s.flaggedCount > 0
    ? "Watching, quietly."
    : "All clear.";
  const subtitle = !s.hasData
    ? "Connect an account to begin monitoring your finances."
    : `${s.accountsCount} account${s.accountsCount === 1 ? "" : "s"} connected · ${s.txCount} transactions reviewed · ` +
      (s.flaggedCount > 0
        ? `${s.flaggedCount} thing${s.flaggedCount === 1 ? "" : "s"} worth your attention`
        : "nothing needs your attention");

  return (
    <div className="panel relative overflow-hidden p-8 md:p-10">
      {/* ambient glow */}
      <div className="pointer-events-none absolute inset-0 bg-gradient-guardian opacity-80" />
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-primary/10 blur-3xl" />

      <div className="relative flex flex-col gap-8 md:flex-row md:items-center md:justify-between">
        <div className="flex items-start gap-5">
          <div className="relative grid h-14 w-14 place-items-center rounded-full bg-primary/10 ring-1 ring-primary/30">
            <Shield className="h-6 w-6 text-primary" strokeWidth={2.2} />
            <span className="pulse-dot absolute inset-0 rounded-full" aria-hidden />
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-muted-foreground">Guardian status</p>
            <h1 className="font-display mt-1 text-3xl leading-tight md:text-5xl">{headline}</h1>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6 md:gap-10">
          <Stat label="Net worth" value={fmt(s.netWorth)} />
          <Stat label="Burn / mo" value={fmt(s.burn)} />
          <Stat label="Runway" value={runwayLabel} />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="font-display mt-1 text-2xl md:text-3xl">{value}</p>
    </div>
  );
}
