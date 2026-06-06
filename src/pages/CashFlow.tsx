import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area, AreaChart, CartesianGrid, ComposedChart, Bar, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine,
} from "recharts";
import {
  ArrowLeft, ArrowDownRight, ArrowUpRight, Wallet, Briefcase, Banknote,
  Repeat, CreditCard, Home, Zap, Car, Sparkles, AlertTriangle,
  Wand2, Check, Loader2, TrendingUp, TrendingDown, Minus,
} from "lucide-react";
import { TopBar } from "@/components/finance/TopBar";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFinanceStore } from "@/lib/finance-store";
import { fmt, type Transaction, type Category } from "@/lib/finance-data";
import { buildProjection, type IncomeStream, type OutflowStream, type Cadence } from "@/lib/cashflow-data";
import { toast } from "sonner";

const HORIZONS: { label: string; days: number }[] = [
  { label: "30d", days: 30 },
  { label: "60d", days: 60 },
  { label: "90d", days: 90 },
  { label: "6mo", days: 182 },
];

const cadenceLabel = { weekly: "/wk", biweekly: "/2wk", semimonthly: "/2×mo", monthly: "/mo", quarterly: "/qtr", annually: "/yr" } as const;

const incomeKindIcon = {
  paycheck:     Briefcase,
  unemployment: Banknote,
  freelance:    Sparkles,
  dividend:     ArrowUpRight,
  other:        Wallet,
} as const;

const outflowKindIcon = {
  credit_card:  CreditCard,
  rent:         Home,
  loan:         Car,
  subscription: Repeat,
  utility:      Zap,
  other:        Wallet,
} as const;

const CashFlow = () => {
  const accounts = useFinanceStore((s) => s.accounts);
  const income = useFinanceStore((s) => s.income);
  const outflows = useFinanceStore((s) => s.outflows);
  const budgets = useFinanceStore((s) => s.budgets);
  const transactions = useFinanceStore((s) => s.transactions);
  const setBudget = useFinanceStore((s) => s.setBudget);
  const toggleIncome = useFinanceStore((s) => s.toggleIncome);
  const setIncomeAmount = useFinanceStore((s) => s.setIncomeAmount);

  const [days, setDays] = useState(60);

  // Cash on hand = liquid (checking + savings)
  const startingCash = useMemo(
    () => accounts.filter((a) => a.type === "checking" || a.type === "savings").reduce((s, a) => s + a.balance, 0),
    [accounts]
  );

  const projection = useMemo(
    () => buildProjection({
      startingCash,
      income, outflows,
      discretionaryByCategory: budgets,
      days,
    }),
    [startingCash, income, outflows, budgets, days]
  );

  const last = projection[projection.length - 1];
  const lowest = projection.reduce((m, p) => (p.cashOnHand < m.cashOnHand ? p : m), projection[0]);
  const totalIn = last.cumulativeIn;
  const totalOut = last.cumulativeOut;
  const monthlyIn = (totalIn / days) * 30;
  const monthlyOut = (totalOut / days) * 30;
  const negativeAhead = lowest.cashOnHand < 0;

  // Monthly bars view (group projection by month)
  const monthlyBars = useMemo(() => {
    const map = new Map<string, { month: string; in: number; out: number }>();
    for (const p of projection) {
      const key = new Date(p.date).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      const cur = map.get(key) ?? { month: key, in: 0, out: 0 };
      cur.in += p.inToday;
      cur.out += p.outToday;
      map.set(key, cur);
    }
    return Array.from(map.values());
  }, [projection]);

  return (
    <div className="min-h-screen">
      <TopBar />

      <main className="mx-auto max-w-7xl px-6 py-8 pb-28 md:px-10 md:py-10 md:pb-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link to="/" className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3" /> Dashboard
            </Link>
            <h1 className="font-display mt-2 text-4xl md:text-5xl">Cash flow</h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              What's coming in, what's going out, and what your bank balance looks like — including the future.
            </p>
          </div>

          {/* Horizon picker */}
          <div className="inline-flex rounded-full border border-border bg-card p-1">
            {HORIZONS.map((h) => (
              <button
                key={h.label}
                onClick={() => setDays(h.days)}
                className={`rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  days === h.days ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {h.label}
              </button>
            ))}
          </div>
        </div>

        {/* KPI strip */}
        <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Cash on hand today" value={fmt(startingCash)} sub="Checking + savings" tone="neutral" Icon={Wallet} />
          <Kpi label="Projected in next 30d" value={fmt(monthlyIn)} sub={`${income.filter((i) => i.active).length} active streams`} tone="up" Icon={ArrowUpRight} />
          <Kpi label="Projected out next 30d" value={fmt(monthlyOut)} sub="Bills + budgets" tone="down" Icon={ArrowDownRight} />
          <Kpi
            label={`Cash in ${days} days`}
            value={fmt(last.cashOnHand)}
            sub={negativeAhead ? `Lows out at ${fmt(lowest.cashOnHand)}` : `Lowest: ${fmt(lowest.cashOnHand)}`}
            tone={last.cashOnHand >= startingCash ? "up" : negativeAhead ? "alert" : "down"}
            Icon={negativeAhead ? AlertTriangle : Sparkles}
          />
        </section>

        {/* Chart panel */}
        <section className="panel mt-6 p-6 md:p-8">
          <header className="mb-2 flex items-end justify-between">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Projected balance</p>
              <h2 className="font-display mt-1 text-2xl">Cash on hand · next {days} days</h2>
            </div>
            <p className="text-xs text-muted-foreground">
              Based on recurring income, scheduled bills, and your category budgets
            </p>
          </header>

          <Tabs defaultValue="line" className="mt-4">
            <TabsList>
              <TabsTrigger value="line">Cash on hand</TabsTrigger>
              <TabsTrigger value="bars">Monthly in vs out</TabsTrigger>
            </TabsList>

            <TabsContent value="line" className="mt-4">
              <div className="h-[340px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={projection} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="cashFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%"  stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                        <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} interval={Math.ceil(projection.length / 8)} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<CashTooltip />} />
                    <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
                    <Area type="monotone" dataKey="cashOnHand" stroke="hsl(var(--primary))" strokeWidth={2} fill="url(#cashFill)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>

            <TabsContent value="bars" className="mt-4">
              <div className="h-[340px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={monthlyBars} margin={{ left: 0, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                    <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
                      tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
                    <Tooltip content={<BarsTooltip />} />
                    <Bar dataKey="in"  name="In"  fill="hsl(var(--success))" radius={[6, 6, 0, 0]} maxBarSize={36} />
                    <Bar dataKey="out" name="Out" fill="hsl(var(--destructive))" radius={[6, 6, 0, 0]} maxBarSize={36} />
                    <Line type="monotone" dataKey={(d) => d.in - d.out} name="Net" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </TabsContent>
          </Tabs>

          {negativeAhead && (
            <div className="mt-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
              <div>
                <p className="font-medium text-destructive">Cash dips below $0 around {lowest.label}</p>
                <p className="text-xs text-destructive/80">
                  Trim a category budget below or pause a non-essential outflow to fix this projection.
                </p>
              </div>
            </div>
          )}
        </section>

        {/* Two-column body: streams + budget projector */}
        <div className="mt-6 grid min-w-0 gap-6 lg:grid-cols-2">
          <IncomeCard income={income} onToggle={toggleIncome} onAmount={setIncomeAmount} />
          <OutflowCard outflows={outflows} />
        </div>

        <div className="mt-6">
          <BudgetProjector
            budgets={budgets}
            setBudget={setBudget}
            transactions={transactions}
            monthlyIn={monthlyIn}
            essentialOut={outflows.reduce((s, o) => s + o.amount, 0)}
          />
        </div>
      </main>
    </div>
  );
};

// ---------- Components ----------

function Kpi({
  label, value, sub, tone, Icon,
}: {
  label: string; value: string; sub: string;
  tone: "up" | "down" | "neutral" | "alert";
  Icon: React.ComponentType<{ className?: string }>;
}) {
  const tint =
    tone === "up"    ? "text-success" :
    tone === "down"  ? "text-destructive" :
    tone === "alert" ? "text-destructive" : "text-foreground";
  return (
    <div className="panel p-4">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[10px] uppercase tracking-[0.16em]">{label}</span>
        <Icon className={`h-3.5 w-3.5 ${tint}`} />
      </div>
      <p className={`font-mono-fin mt-2 text-2xl tabular-nums ${tint}`}>{value}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">{sub}</p>
    </div>
  );
}

function CashTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as ReturnType<typeof buildProjection>[number];
  return (
    <div className="rounded-xl border border-border bg-popover p-3 text-xs shadow-soft">
      <p className="font-medium">{p.label}</p>
      <p className="font-mono-fin mt-1 text-base">{fmt(p.cashOnHand)}</p>
      {p.events.length > 0 && (
        <ul className="mt-2 space-y-1 border-t border-border pt-2">
          {p.events.map((e, i) => (
            <li key={i} className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">{e.name}</span>
              <span className={`font-mono-fin ${e.kind === "in" ? "text-success" : "text-destructive"}`}>
                {e.kind === "in" ? "+" : "−"}{fmt(e.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BarsTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const inn = payload.find((p: any) => p.dataKey === "in")?.value ?? 0;
  const out = payload.find((p: any) => p.dataKey === "out")?.value ?? 0;
  const net = inn - out;
  return (
    <div className="rounded-xl border border-border bg-popover p-3 text-xs shadow-soft">
      <p className="font-medium">{label}</p>
      <div className="mt-2 grid grid-cols-3 gap-3">
        <div><p className="text-muted-foreground">In</p>  <p className="font-mono-fin text-success">{fmt(inn)}</p></div>
        <div><p className="text-muted-foreground">Out</p> <p className="font-mono-fin text-destructive">{fmt(out)}</p></div>
        <div><p className="text-muted-foreground">Net</p> <p className={`font-mono-fin ${net >= 0 ? "text-success" : "text-destructive"}`}>{fmt(net)}</p></div>
      </div>
    </div>
  );
}

function IncomeCard({
  income, onToggle, onAmount,
}: { income: IncomeStream[]; onToggle: (id: string) => void; onAmount: (id: string, n: number) => void }) {
  return (
    <section className="panel min-w-0 p-6 md:p-7">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Money in</p>
          <h2 className="font-display mt-1 text-2xl">Income streams</h2>
        </div>
        <span className="text-[10px] uppercase tracking-[0.14em] text-success">
          {fmt(income.filter((i) => i.active).reduce((s, i) => s + monthlyEquivalent(i.amount, i.cadence), 0))} / mo
        </span>
      </header>

      <ul className="mt-5 divide-y divide-border">
        {income.map((s) => {
          const Icon = incomeKindIcon[s.kind];
          return (
            <li key={s.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className={`grid h-9 w-9 place-items-center rounded-lg ${s.active ? "bg-success/10 ring-1 ring-success/30" : "bg-secondary"}`}>
                <Icon className={`h-4 w-4 ${s.active ? "text-success" : "text-muted-foreground"}`} />
              </div>
              <div className="min-w-0 flex-1">
                <p className={`truncate text-sm font-medium ${s.active ? "" : "text-muted-foreground line-through"}`}>{s.source}</p>
                <p className="text-[11px] text-muted-foreground capitalize">
                  {s.kind.replace("_", " ")} · next {new Date(s.nextDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
                  <Input
                    type="number"
                    value={s.amount}
                    onChange={(e) => onAmount(s.id, Number(e.target.value))}
                    className="h-8 w-24 pl-5 text-right font-mono-fin text-sm tabular-nums"
                  />
                </div>
                <span className="w-10 text-[10px] text-muted-foreground">{cadenceLabel[s.cadence]}</span>
                <Switch checked={s.active} onCheckedChange={() => onToggle(s.id)} />
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-4 text-[11px] text-muted-foreground">
        Toggle a paycheck off to model job loss · edit amounts to model a raise or unemployment pay.
      </p>
    </section>
  );
}

function OutflowCard({ outflows }: { outflows: OutflowStream[] }) {
  return (
    <section className="panel min-w-0 p-6 md:p-7">
      <header className="flex items-end justify-between">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Money out</p>
          <h2 className="font-display mt-1 text-2xl">Scheduled bills</h2>
        </div>
        <span className="text-[10px] uppercase tracking-[0.14em] text-destructive">
          {fmt(outflows.reduce((s, o) => s + monthlyEquivalent(o.amount, o.cadence), 0))} / mo
        </span>
      </header>

      <ul className="mt-5 divide-y divide-border">
        {outflows.map((o) => {
          const Icon = outflowKindIcon[o.kind];
          return (
            <li key={o.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <div className="grid h-9 w-9 place-items-center rounded-lg bg-destructive/10 ring-1 ring-destructive/20">
                <Icon className="h-4 w-4 text-destructive" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{o.name}</p>
                <p className="text-[11px] text-muted-foreground capitalize">
                  {o.kind.replace("_", " ")} · {o.category} · next {new Date(o.nextDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </p>
              </div>
              <p className="font-mono-fin text-sm tabular-nums">−{fmt(o.amount)}<span className="ml-1 text-[10px] text-muted-foreground">{cadenceLabel[o.cadence]}</span></p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

type Suggestion = {
  category: string;
  suggested: number;
  rationale: string;
  confidence: number;
};

type SuggestionGoal = "balanced" | "aggressive_save" | "comfort";

const GOAL_LABELS: Record<SuggestionGoal, string> = {
  balanced: "Balanced",
  aggressive_save: "Save aggressively",
  comfort: "Comfort first",
};

/** Aggregate the user's discretionary spend per category over the recent window. */
function buildCategoryStats(
  transactions: Transaction[],
  budgets: Record<Category, number>
) {
  const now = Date.now();
  const ms90 = 90 * 24 * 60 * 60 * 1000;
  const ms30 = 30 * 24 * 60 * 60 * 1000;

  const byCat = new Map<
    string,
    { recent: number[]; older: number[]; merchants: Set<string> }
  >();

  for (const t of transactions) {
    if (t.amount >= 0) continue; // skip income/transfers in
    if (t.category === "Income" || t.category === "Transfer") continue;
    if (!(t.category in budgets)) continue;
    const age = now - new Date(t.date).getTime();
    if (age > ms90) continue;
    const bucket = byCat.get(t.category) ?? { recent: [], older: [], merchants: new Set() };
    const spend = Math.abs(t.amount);
    if (age <= ms30) bucket.recent.push(spend);
    else bucket.older.push(spend);
    bucket.merchants.add(t.merchant);
    byCat.set(t.category, bucket);
  }

  return Object.keys(budgets).map((category) => {
    const b = byCat.get(category) ?? { recent: [], older: [], merchants: new Set<string>() };
    const all = [...b.recent, ...b.older];
    const monthlyAverage = all.length ? (all.reduce((s, n) => s + n, 0) / 90) * 30 : 0;

    // Simple median of monthly buckets: sum recent vs sum older (each ~30d window when older has data)
    const recentSum = b.recent.reduce((s, n) => s + n, 0);
    const olderSum = b.older.reduce((s, n) => s + n, 0) / 2; // ~60d normalized to 30
    const candidates = [recentSum, olderSum].filter((n) => n > 0).sort((a, b) => a - b);
    const monthlyMedian = candidates.length ? candidates[Math.floor(candidates.length / 2)] : monthlyAverage;

    let trend: "up" | "down" | "flat" = "flat";
    if (recentSum > olderSum * 1.15) trend = "up";
    else if (recentSum < olderSum * 0.85 && olderSum > 0) trend = "down";

    return {
      category,
      monthlyAverage: Math.round(monthlyAverage),
      monthlyMedian: Math.round(monthlyMedian),
      trend,
      currentBudget: budgets[category as Category] ?? 0,
      recentMerchants: Array.from(b.merchants).slice(0, 5),
    };
  }).filter((s) => s.monthlyAverage > 0 || s.currentBudget > 0);
}

function BudgetProjector({
  budgets, setBudget, transactions, monthlyIn, essentialOut,
}: {
  budgets: Record<Category, number>;
  setBudget: (cat: Category, amount: number) => void;
  transactions: Transaction[];
  monthlyIn: number;
  essentialOut: number;
}) {
  const totalDiscretionary = Object.values(budgets).reduce((s, n) => s + n, 0);
  const projectedNet = monthlyIn - essentialOut - totalDiscretionary;
  const netTone = projectedNet >= 0 ? "text-success" : "text-destructive";

  const [goal, setGoal] = useState<SuggestionGoal>("balanced");
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[] | null>(null);
  const [summary, setSummary] = useState<string>("");

  const stats = useMemo(
    () => buildCategoryStats(transactions, budgets),
    [transactions, budgets]
  );

  async function requestSuggestions(targetGoal: SuggestionGoal) {
    // AI budget suggestions are moving to the Claude API (see roadmap). The old
    // cloud function has been removed; show a placeholder until that lands.
    setGoal(targetGoal);
    setLoading(false);
    setSuggestions(null);
    setSummary("");
    void stats; // (will feed the Claude prompt)
    toast.info("AI budget suggestions are coming soon", {
      description: "This will run on the Claude API in an upcoming update.",
    });
  }

  function applyAll() {
    if (!suggestions) return;
    for (const s of suggestions) {
      if (s.category in budgets) setBudget(s.category as Category, s.suggested);
    }
    toast.success(`Applied ${suggestions.length} budgets`);
  }

  function applyOne(s: Suggestion) {
    setBudget(s.category as Category, s.suggested);
    toast.success(`${s.category} set to ${fmt(s.suggested)}/mo`);
  }

  const suggestionMap = useMemo(() => {
    const m = new Map<string, Suggestion>();
    suggestions?.forEach((s) => m.set(s.category, s));
    return m;
  }, [suggestions]);

  return (
    <section className="panel p-6 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Forward-looking budget</p>
          <h2 className="font-display mt-1 text-2xl">What if I spent…</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Drag a slider to set a monthly ceiling per category, or let AI suggest one based on your last 90 days.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-background/50 px-4 py-3 text-right">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Projected net / mo</p>
          <p className={`font-mono-fin mt-1 text-2xl ${netTone}`}>{projectedNet >= 0 ? "+" : "−"}{fmt(Math.abs(projectedNet))}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">In {fmt(monthlyIn)} · Bills {fmt(essentialOut)} · Discretionary {fmt(totalDiscretionary)}</p>
        </div>
      </header>

      {/* AI suggestion bar */}
      <div className="mt-6 rounded-2xl border border-primary/20 bg-primary/[0.04] p-4 md:p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary/15 ring-1 ring-primary/30">
              <Wand2 className="h-4 w-4 text-primary" />
            </div>
            <div>
              <p className="text-sm font-medium">AI budget assistant</p>
              <p className="text-[11px] text-muted-foreground">
                Reads your last 90 days of transactions and proposes a realistic monthly ceiling per category.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(Object.keys(GOAL_LABELS) as SuggestionGoal[]).map((g) => (
              <button
                key={g}
                onClick={() => requestSuggestions(g)}
                disabled={loading}
                className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                  goal === g && suggestions
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-muted-foreground hover:text-foreground"
                }`}
              >
                {loading && goal === g ? (
                  <span className="inline-flex items-center gap-1.5"><Loader2 className="h-3 w-3 animate-spin" /> Thinking</span>
                ) : (
                  GOAL_LABELS[g]
                )}
              </button>
            ))}
            {suggestions && (
              <Button size="sm" onClick={applyAll} className="h-8 gap-1.5">
                <Check className="h-3.5 w-3.5" /> Apply all
              </Button>
            )}
          </div>
        </div>
        {summary && (
          <p className="mt-3 border-t border-primary/15 pt-3 text-xs text-foreground/80">{summary}</p>
        )}
      </div>

      <ul className="mt-7 grid gap-x-10 gap-y-6 md:grid-cols-2">
        {Object.entries(budgets).map(([category, amount]) => (
          <BudgetSlider
            key={category}
            category={category}
            amount={amount}
            stat={stats.find((s) => s.category === category)}
            suggestion={suggestionMap.get(category)}
            onChange={(n) => setBudget(category as Category, n)}
            onApplySuggestion={() => {
              const s = suggestionMap.get(category);
              if (s) applyOne(s);
            }}
          />
        ))}
      </ul>
    </section>
  );
}

function BudgetSlider({
  category, amount, stat, suggestion, onChange, onApplySuggestion,
}: {
  category: string;
  amount: number;
  stat?: ReturnType<typeof buildCategoryStats>[number];
  suggestion?: Suggestion;
  onChange: (n: number) => void;
  onApplySuggestion: () => void;
}) {
  const max = Math.max(2000, Math.ceil((Math.max(amount, suggestion?.suggested ?? 0) * 1.6) / 100) * 100);
  const matchesSuggestion = suggestion && Math.abs(amount - suggestion.suggested) < 1;
  const TrendIcon = stat?.trend === "up" ? TrendingUp : stat?.trend === "down" ? TrendingDown : Minus;
  const trendTone =
    stat?.trend === "up" ? "text-destructive" :
    stat?.trend === "down" ? "text-success" : "text-muted-foreground";

  // Position of the AI suggestion marker on the slider track (0-100%)
  const markerPct = suggestion ? Math.min(100, (suggestion.suggested / max) * 100) : null;

  return (
    <li>
      <div className="mb-2 flex items-baseline justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium">{category}</span>
          {stat && (
            <span className={`inline-flex items-center gap-0.5 text-[10px] ${trendTone}`}>
              <TrendIcon className="h-2.5 w-2.5" />
              {fmt(stat.monthlyMedian)} median
            </span>
          )}
        </div>
        <span className="font-mono-fin text-sm tabular-nums text-foreground">
          {fmt(amount)}<span className="ml-1 text-[10px] text-muted-foreground">/mo</span>
        </span>
      </div>

      <div className="relative">
        <Slider
          value={[amount]}
          onValueChange={(v) => onChange(v[0])}
          min={0}
          max={max}
          step={25}
          className="cursor-pointer"
        />
        {markerPct !== null && (
          <div
            className="pointer-events-none absolute -top-1 h-4 w-px bg-primary"
            style={{ left: `${markerPct}%` }}
            aria-hidden
          />
        )}
      </div>

      <div className="mt-1 flex items-center justify-between gap-3 text-[10px] text-muted-foreground">
        <span>$0</span>
        {suggestion ? (
          <button
            onClick={onApplySuggestion}
            disabled={matchesSuggestion}
            className={`group inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] transition-colors ${
              matchesSuggestion
                ? "border border-success/40 bg-success/10 text-success"
                : "border border-primary/30 bg-primary/10 text-primary hover:bg-primary/20"
            }`}
            title={suggestion.rationale}
          >
            {matchesSuggestion ? (
              <><Check className="h-2.5 w-2.5" /> AI: {fmt(suggestion.suggested)}</>
            ) : (
              <><Wand2 className="h-2.5 w-2.5" /> AI suggests {fmt(suggestion.suggested)}</>
            )}
          </button>
        ) : (
          <span>{fmt(max)}</span>
        )}
      </div>

      {suggestion && (
        <p className="mt-1.5 text-[11px] leading-snug text-muted-foreground">
          <span className="text-foreground/70">{suggestion.rationale}</span>
        </p>
      )}
    </li>
  );
}

function monthlyEquivalent(amount: number, cadence: Cadence) {
  switch (cadence) {
    case "weekly":      return amount * 4.33;
    case "biweekly":    return amount * 2.17;
    case "semimonthly": return amount * 2;
    case "monthly":     return amount;
    case "quarterly":   return amount / 3;
    case "annually":    return amount / 12;
  }
}

export default CashFlow;
