import { Shield } from "lucide-react";

export function GuardianStatus() {
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
            <h1 className="font-display mt-1 text-3xl leading-tight md:text-5xl">
              Watching, quietly.
            </h1>
            <p className="mt-2 max-w-md text-sm text-muted-foreground">
              4 accounts connected · 24 transactions reviewed today ·{" "}
              <span className="text-foreground">3 things worth your attention</span>.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6 md:gap-10">
          <Stat label="Net worth" value="$262,080" delta="+1.4% MoM" tone="up" />
          <Stat label="Burn / mo" value="$10,323" delta="−$210 vs avg" tone="up" />
          <Stat label="Runway" value="7.8 mo" delta="+0.4 mo" tone="up" />
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value, delta, tone }: { label: string; value: string; delta: string; tone: "up" | "down" }) {
  return (
    <div>
      <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="font-display mt-1 text-2xl md:text-3xl">{value}</p>
      <p className={`mt-1 text-xs font-mono-fin ${tone === "up" ? "text-success" : "text-destructive"}`}>{delta}</p>
    </div>
  );
}
