import { AlertTriangle, Eye, Info, ChevronRight } from "lucide-react";
import { insights } from "@/lib/finance-data";

const styles = {
  alert: { ring: "ring-destructive/40", bg: "bg-destructive/10",  fg: "text-destructive", Icon: AlertTriangle, label: "Alert" },
  watch: { ring: "ring-primary/40",     bg: "bg-primary/10",      fg: "text-primary",     Icon: Eye,           label: "Watch" },
  info:  { ring: "ring-muted-foreground/30", bg: "bg-muted",      fg: "text-muted-foreground", Icon: Info,    label: "Info"  },
} as const;

export function InsightFeed() {
  return (
    <section className="panel p-6 md:p-8">
      <header className="mb-6 flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Low-noise alerts</p>
          <h2 className="font-display mt-1 text-2xl">This week's signals</h2>
        </div>
        <span className="font-mono-fin text-xs text-muted-foreground">4 / month avg</span>
      </header>

      <ul className="divide-y divide-border">
        {insights.map((it) => {
          const s = styles[it.severity];
          return (
            <li key={it.id} className="group flex items-start gap-4 py-4 first:pt-0 last:pb-0">
              <div className={`mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-full ring-1 ${s.bg} ${s.ring}`}>
                <s.Icon className={`h-4 w-4 ${s.fg}`} strokeWidth={2.2} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-medium uppercase tracking-[0.14em] ${s.fg}`}>{s.label}</span>
                  <span className="text-[10px] text-muted-foreground">· {it.when}</span>
                </div>
                <p className="mt-0.5 font-medium leading-snug">{it.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{it.detail}</p>
              </div>
              <button className="self-center rounded-full p-2 text-muted-foreground transition-colors group-hover:bg-accent group-hover:text-foreground" aria-label="Open insight">
                <ChevronRight className="h-4 w-4" />
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
