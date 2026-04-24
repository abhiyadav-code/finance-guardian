import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { runway, fmt } from "@/lib/finance-data";
import { Switch } from "@/components/ui/switch";

export function RunwayCard() {
  const [layoffMode, setLayoffMode] = useState(false);

  const monthly = useMemo(
    () => runway.monthlyEssential + (layoffMode ? 0 : runway.monthlyLifestyle),
    [layoffMode]
  );
  const months = runway.liquidAssets / monthly;
  const pct = Math.min(100, (months / 18) * 100); // 18 mo full bar

  const tone =
    months >= 9 ? "text-success" :
    months >= 4 ? "text-primary" : "text-destructive";

  return (
    <section className="panel relative overflow-hidden p-6 md:p-8">
      <div className="pointer-events-none absolute -bottom-24 -left-16 h-64 w-64 rounded-full bg-primary/5 blur-3xl" />

      <header className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Layoff runway</p>
          <h2 className="font-display mt-1 text-2xl">If income stops today.</h2>
        </div>

        <label className="flex cursor-pointer items-center gap-3 rounded-full border border-border bg-background/60 px-3 py-2 text-xs">
          <span className={layoffMode ? "text-primary" : "text-muted-foreground"}>Layoff mode</span>
          <Switch checked={layoffMode} onCheckedChange={setLayoffMode} />
        </label>
      </header>

      <div key={String(layoffMode)} className="animate-ticker mt-8 flex items-baseline gap-3">
        <span className={`font-display text-7xl leading-none md:text-8xl ${tone}`}>
          {months.toFixed(1)}
        </span>
        <span className="text-xl text-muted-foreground">months</span>
      </div>

      <div className="mt-6">
        <div className="h-2 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full rounded-full bg-gradient-runway transition-[width] duration-700 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-2 flex justify-between font-mono-fin text-[10px] text-muted-foreground">
          <span>0 mo</span><span>6</span><span>12</span><span>18+</span>
        </div>
      </div>

      <dl className="mt-8 grid grid-cols-3 gap-6 border-t border-border pt-6">
        <Cell label="Liquid assets" value={fmt(runway.liquidAssets)} />
        <Cell label="Essential / mo" value={fmt(runway.monthlyEssential)} />
        <Cell
          label={layoffMode ? "Lifestyle (cut)" : "Lifestyle / mo"}
          value={fmt(runway.monthlyLifestyle)}
          dim={layoffMode}
        />
      </dl>

      <p className="mt-6 text-xs text-muted-foreground">
        {layoffMode
          ? "Non-essential categories paused. You'd survive on essentials only."
          : "Toggle layoff mode to see what trimming non-essentials buys you."}
      </p>

      <Link
        to="/cash-flow"
        className="mt-4 inline-flex items-center gap-1.5 text-xs text-primary transition-colors hover:text-primary-glow"
      >
        Project cash on hand month-by-month <ArrowRight className="h-3 w-3" />
      </Link>
    </section>
  );
}

function Cell({ label, value, dim }: { label: string; value: string; dim?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className={`font-mono-fin mt-1 text-lg ${dim ? "text-muted-foreground line-through" : ""}`}>{value}</p>
    </div>
  );
}
