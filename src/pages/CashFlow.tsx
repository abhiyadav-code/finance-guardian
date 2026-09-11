import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area, AreaChart, CartesianGrid, ComposedChart, Bar, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis, ReferenceLine,
} from "recharts";
import {
  ArrowLeft, ArrowDownRight, ArrowUpRight, Wallet, Briefcase, Banknote,
  Repeat, CreditCard, Home, Zap, Car, Sparkles, AlertTriangle,
  Wand2, Check, Loader2, TrendingUp, TrendingDown, Minus, Plus, Trash2, Pencil,
  Info, ChevronDown,
} from "lucide-react";
import { TopBar } from "@/components/finance/TopBar";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useFinanceStore } from "@/lib/finance-store";
import { fmt, fmtCents, accountLabel, type Transaction, type Category } from "@/lib/finance-data";
import {
  buildProjection,
  type IncomeStream, type OutflowStream, type Cadence, type PlannedItem,
} from "@/lib/cashflow-data";
import { deriveMonthlyForecast, monthBreakdown, type Forecast, type MonthBreakdown } from "@/lib/derive";
import { api } from "@/lib/api";
import { toast } from "sonner";

const HORIZONS: { label: string; days: number }[] = [
  { label: "30d", days: 30 },
  { label: "90d", days: 90 },
  { label: "6mo", days: 182 },
  { label: "1yr", days: 365 },
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
  const plannedItems = useFinanceStore((s) => s.plannedItems);

  const forecast = useMemo(
    () => deriveMonthlyForecast(accounts, transactions, income, outflows, budgets, plannedItems),
    [accounts, transactions, income, outflows, budgets, plannedItems]
  );

  const [days, setDays] = useState(90);

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
        <div>
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Dashboard
          </Link>
          <h1 className="font-display mt-2 text-4xl md:text-5xl">Cash flow</h1>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Plan the year — actuals vs. projections, model what-ifs, and set budgets to see the impact.
          </p>
        </div>

        <Tabs defaultValue="forecast" className="mt-6">
          <TabsList>
            <TabsTrigger value="forecast">Forecast</TabsTrigger>
            <TabsTrigger value="budget">Budget</TabsTrigger>
          </TabsList>

          <TabsContent value="forecast" className="mt-6 space-y-6">
            <ForecastSection forecast={forecast} />
            <AdjustmentsManager plannedItems={plannedItems} />

        {/* Near-term daily projection */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Near term · daily cash on hand</p>
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
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
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

            {/* Recurring drivers */}
            <div className="grid min-w-0 gap-6 lg:grid-cols-2">
              <IncomeCard income={income} onToggle={toggleIncome} onAmount={setIncomeAmount} />
              <OutflowCard outflows={outflows} />
            </div>
          </TabsContent>

          <TabsContent value="budget" className="mt-6">
            <BudgetProjector
              budgets={budgets}
              setBudget={setBudget}
              transactions={transactions}
              monthlyIn={monthlyIn}
              essentialOut={outflows.reduce((s, o) => s + o.amount, 0)}
            />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

// ---------- 12-month forecast ----------

const monthName = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-US", { month: "short", year: "2-digit" });
};
const monthRangeLabel = (start: string, end: string) =>
  start === end ? monthName(start) : `${monthName(start).split(" ")[0]}–${monthName(end)}`;

type DrawerTarget =
  | null
  | { type: "month"; key: string; label: string; actual: boolean }
  | { type: "metric"; which: "cash" | "ratio" | "lowpoint" | "investments" };

function ForecastSection({ forecast: f }: { forecast: Forecast }) {
  const ratioPct = Math.round(f.expenseToIncome * 100);
  const now = new Date();
  const nowKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const nowLabel = f.months.find((m) => m.key === nowKey)?.label;
  const [drawer, setDrawer] = useState<DrawerTarget>(null);
  const openMonthByLabel = (label?: string) => {
    const m = label && f.months.find((x) => x.label === label);
    if (m) setDrawer({ type: "month", key: m.key, label: m.label, actual: m.actual });
  };
  return (
    <section className="panel p-6 md:p-8">
      <header>
        <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Year ahead</p>
        <h2 className="font-display mt-1 text-2xl">12-month cash-flow forecast</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Actuals for months that have passed, projections ahead — including recurring income &amp; bills,
          category budgets, and your planned adjustments. <span className="text-foreground/70">Click any month, or the ⓘ on a figure, to see what's behind it.</span>
        </p>
      </header>

      <div className="mt-5 grid grid-cols-2 gap-3 md:grid-cols-4">
        <FKpi label="Cash on hand" value={fmt(f.startCash)} tone="neutral" sub="checking + savings" onInfo={() => setDrawer({ type: "metric", which: "cash" })} />
        <FKpi label="Expense : income" value={`${ratioPct}%`} tone={ratioPct <= 100 ? "up" : "alert"}
          sub={ratioPct <= 100 ? "within income" : "over income"} onInfo={() => setDrawer({ type: "metric", which: "ratio" })} />
        <FKpi label="Low point" value={f.lowest ? fmt(f.lowest.value) : "—"} tone={f.dipsBelowZero ? "alert" : "neutral"}
          sub={f.lowest?.label ?? ""} onInfo={() => setDrawer({ type: "metric", which: "lowpoint" })} />
        <FKpi label="Investments to draw" value={fmt(f.liquidatable)} tone="neutral" sub="if you must liquidate" onInfo={() => setDrawer({ type: "metric", which: "investments" })} />
      </div>

      {f.dipsBelowZero && (
        <div className="mt-4 flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
          <p className="text-destructive/90">
            Cash is projected to dip to <span className="font-medium">{fmt(f.lowest!.value)}</span> around {f.firstDipLabel}.
            Plan a transfer or asset sale, or trim spending in the <span className="font-medium">Budget</span> tab.
          </p>
        </div>
      )}

      <div className="mt-5 h-[340px] w-full cursor-pointer">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={f.months} margin={{ left: 0, right: 0, top: 8, bottom: 0 }}
            onClick={(s: any) => openMonthByLabel(s?.activeLabel)}>
            <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
            <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false} />
            {/* left: monthly flows (income/expenses/net) */}
            <YAxis yAxisId="flow" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            {/* right: running cash balance (much larger scale) */}
            <YAxis yAxisId="cash" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} tickLine={false} axisLine={false}
              tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`} />
            <Tooltip content={<ForecastTooltip />} />
            <ReferenceLine yAxisId="flow" y={0} stroke="hsl(var(--destructive))" strokeDasharray="3 3" />
            {nowLabel && (
              <ReferenceLine yAxisId="flow" x={nowLabel} stroke="hsl(var(--muted-foreground))" strokeDasharray="4 4"
                label={{ value: "now", position: "insideTopRight", fontSize: 10, fill: "hsl(var(--muted-foreground))" }} />
            )}
            <Bar yAxisId="flow" dataKey="income" name="Income" fill="hsl(var(--success))" radius={[3, 3, 0, 0]} maxBarSize={20} />
            <Bar yAxisId="flow" dataKey="expenses" name="Expenses" fill="hsl(var(--destructive))" radius={[3, 3, 0, 0]} maxBarSize={20} />
            <Line yAxisId="flow" type="monotone" dataKey="net" name="Net" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            <Line yAxisId="cash" type="monotone" dataKey="cashOnHand" name="Cash on hand" stroke="hsl(var(--foreground))" strokeWidth={2} strokeDasharray="5 3" dot={false} connectNulls={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Bars: income vs. expenses each month · amber line: net (left axis) · dashed line: projected cash balance
        (right axis, forward only). The dotted marker is this month; left of it is actuals where we have history.
      </p>

      <ForecastDrawer target={drawer} forecast={f} onClose={() => setDrawer(null)} />
    </section>
  );
}

function FKpi({ label, value, sub, tone, onInfo }: { label: string; value: string; sub?: string; tone: "up" | "alert" | "neutral"; onInfo?: () => void }) {
  const tint = tone === "up" ? "text-success" : tone === "alert" ? "text-destructive" : "text-foreground";
  return (
    <div className="relative rounded-xl border border-border bg-background/40 p-4">
      {onInfo && (
        <button onClick={onInfo} title="What is this?" className="absolute right-2.5 top-2.5 text-muted-foreground/60 transition-colors hover:text-foreground">
          <Info className="h-3.5 w-3.5" />
        </button>
      )}
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className={`font-mono-fin mt-1.5 text-xl tabular-nums ${tint}`}>{value}</p>
      {sub && <p className="mt-0.5 text-[10px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

// Slide-out detail: what's behind a forecast month, or what a KPI means.
function ForecastDrawer({ target, forecast, onClose }: { target: DrawerTarget; forecast: Forecast; onClose: () => void }) {
  const accounts = useFinanceStore((s) => s.accounts);
  const transactions = useFinanceStore((s) => s.transactions);
  const income = useFinanceStore((s) => s.income);
  const outflows = useFinanceStore((s) => s.outflows);
  const budgets = useFinanceStore((s) => s.budgets);
  const plannedItems = useFinanceStore((s) => s.plannedItems);

  const bd: MonthBreakdown | null = useMemo(
    () => (target?.type === "month" ? monthBreakdown(target.key, target.actual, transactions, income, outflows, budgets, plannedItems) : null),
    [target, transactions, income, outflows, budgets, plannedItems]
  );

  const open = !!target;
  let title = "", desc = "", body: React.ReactNode = null;

  if (target?.type === "month" && bd) {
    const mLabel = new Date(target.key + "-01").toLocaleDateString("en-US", { month: "long", year: "numeric" });
    title = mLabel;
    desc = target.actual ? "Actuals from your transactions this month." : "Projected from recurring income, bills, budgets, and planned adjustments.";
    const incTotal = bd.income.reduce((s, g) => s + g.amount, 0);
    const expTotal = bd.expenses.reduce((s, g) => s + g.amount, 0);
    body = (
      <div className="space-y-6">
        <BreakdownBlock title="Money in" tone="success" total={incTotal} groups={bd.income} showDates={target.actual} />
        <BreakdownBlock title="Money out" tone="destructive" total={expTotal} groups={bd.expenses} showDates={target.actual} />
        <div className="rounded-lg border border-border bg-background/40 p-3 text-sm">
          <div className="flex items-center justify-between"><span className="text-muted-foreground">Net this month</span>
            <span className={`font-mono-fin ${incTotal - expTotal >= 0 ? "text-success" : "text-destructive"}`}>{incTotal - expTotal >= 0 ? "+" : "−"}{fmtCents(Math.abs(incTotal - expTotal))}</span></div>
        </div>
        {!target.actual && (
          <p className="text-[11px] text-muted-foreground">
            Projected months use your recurring streams + category budgets + planned adjustments. Connect more accounts or
            adjust budgets to refine them. Expenses look low? It usually means budgets aren't set for every category yet.
          </p>
        )}
      </div>
    );
  } else if (target?.type === "metric") {
    const w = target.which;
    if (w === "cash") {
      title = "Cash on hand";
      desc = "Money you can spend right now.";
      const cash = accounts.filter((a) => a.type === "checking" || a.type === "savings");
      body = (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">The sum of your <span className="text-foreground">checking + savings</span> balances. It excludes investments, credit, and loans.</p>
          <AccountList accounts={cash} total={forecast.startCash} />
        </div>
      );
    } else if (w === "ratio") {
      title = "Expense : income ratio";
      desc = "Are you living within your income?";
      body = (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">Total expenses ÷ total income across the 13-month window. <span className="text-foreground">Under 100%</span> means you're spending less than you earn.</p>
          <div className="rounded-lg border border-border bg-background/40 p-4 text-sm">
            <Row label="Total income (13 mo)" value={fmt(forecast.totalIncome)} tone="success" />
            <Row label="Total expenses (13 mo)" value={fmt(forecast.totalExpenses)} tone="destructive" />
            <div className="my-2 border-t border-border" />
            <Row label="Ratio" value={`${Math.round(forecast.expenseToIncome * 100)}%`} tone={forecast.expenseToIncome <= 1 ? "success" : "destructive"} />
          </div>
        </div>
      );
    } else if (w === "lowpoint") {
      title = "Low point";
      desc = "Your tightest cash month ahead.";
      body = (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The lowest your <span className="text-foreground">projected cash balance</span> (checking + savings) reaches over the year — <span className="text-foreground">not an expense</span>.
            It's the running balance after each month's income and bills net out, starting from today's {fmt(forecast.startCash)}.
          </p>
          {forecast.lowest && (
            <div className="rounded-lg border border-border bg-background/40 p-4 text-sm">
              <Row label="Lowest balance" value={fmt(forecast.lowest.value)} tone={forecast.dipsBelowZero ? "destructive" : "neutral"} />
              <Row label="When" value={forecast.lowest.label} tone="neutral" />
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">If it dips below zero, plan a transfer or sell some investments before that month.</p>
        </div>
      );
    } else {
      title = "Investments to draw";
      desc = "Your backstop if cash runs short.";
      const inv = accounts.filter((a) => a.type === "investment");
      body = (
        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            The total value of your <span className="text-foreground">investment accounts</span> you could sell (liquidate) to cover a shortfall — brokerage, 401(k), RSUs, crypto, etc.
            It's a <span className="text-foreground">reserve, not spending money</span>, so it's shown separately from cash on hand.
          </p>
          <AccountList accounts={inv} total={forecast.liquidatable} />
          <p className="text-[11px] text-muted-foreground">Selling some of these is the usual way to cover a projected cash dip.</p>
        </div>
      );
    }
  }

  return (
    <Sheet open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl">{title}</SheetTitle>
          {desc && <SheetDescription>{desc}</SheetDescription>}
        </SheetHeader>
        <div className="mt-5">{body}</div>
      </SheetContent>
    </Sheet>
  );
}

function BreakdownBlock({ title, tone, total, groups, showDates }: { title: string; tone: "success" | "destructive"; total: number; groups: { category: string; amount: number; items: { name: string; amount: number; date?: string; tag?: string }[] }[]; showDates?: boolean }) {
  const tint = tone === "success" ? "text-success" : "text-destructive";
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground">{title}</p>
        <span className={`font-mono-fin text-sm ${tint}`}>{fmtCents(total)}</span>
      </div>
      {groups.length === 0 ? (
        <p className="text-xs text-muted-foreground">Nothing here this month.</p>
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {groups.map((g) => (
            <details key={g.category} className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2.5 text-sm">
                <span className="flex items-center gap-1.5">
                  <ChevronDown className="h-3.5 w-3.5 text-muted-foreground transition-transform group-open:rotate-180" />
                  {g.category} <span className="text-[10px] text-muted-foreground">· {g.items.length}</span>
                </span>
                <span className="font-mono-fin tabular-nums">{fmtCents(g.amount)}</span>
              </summary>
              <ul className="border-t border-border bg-background/40 px-3 py-1.5">
                {g.items.map((it, i) => (
                  <li key={i} className="flex items-center justify-between gap-3 py-1 text-xs">
                    <span className="min-w-0 truncate text-muted-foreground">
                      {it.name}
                      {showDates && it.date ? <span className="ml-1.5 text-[10px] opacity-60">{new Date(it.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span> : null}
                      {it.tag ? <span className="ml-1.5 rounded bg-secondary px-1 text-[9px] uppercase tracking-wider">{it.tag}</span> : null}
                    </span>
                    <span className="font-mono-fin shrink-0 tabular-nums">{fmtCents(it.amount)}</span>
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function AccountList({ accounts, total }: { accounts: { name: string; nickname?: string | null; mask: string; balance: number }[]; total: number }) {
  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {accounts.sort((a, b) => b.balance - a.balance).map((a, i) => (
        <div key={i} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <span className="min-w-0 truncate">{accountLabel(a as any)} <span className="text-[10px] text-muted-foreground">{a.mask}</span></span>
          <span className="font-mono-fin shrink-0 tabular-nums">{fmtCents(a.balance)}</span>
        </div>
      ))}
      <div className="flex items-center justify-between px-3 py-2 text-sm font-medium">
        <span>Total</span><span className="font-mono-fin tabular-nums">{fmtCents(total)}</span>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone: "success" | "destructive" | "neutral" }) {
  const tint = tone === "success" ? "text-success" : tone === "destructive" ? "text-destructive" : "text-foreground";
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-mono-fin tabular-nums ${tint}`}>{value}</span>
    </div>
  );
}

function ForecastTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border border-border bg-popover p-3 text-xs shadow-soft">
      <p className="font-medium">{label} <span className="text-muted-foreground">· {p.actual ? "actual" : "projected"}</span></p>
      <div className="mt-2 space-y-0.5">
        <p className="text-success">Income {fmt(p.income)}</p>
        <p className="text-destructive">Expenses {fmt(p.expenses)}</p>
        <p className={p.net >= 0 ? "text-success" : "text-destructive"}>Net {p.net >= 0 ? "+" : "−"}{fmt(Math.abs(p.net))}</p>
        {p.cashOnHand != null && <p className="border-t border-border pt-1 text-foreground">Cash after: {fmt(p.cashOnHand)}</p>}
        {(p.plannedIncome > 0 || p.plannedExpense > 0) && (
          <p className="text-[10px] text-muted-foreground">
            incl. planned {p.plannedIncome > 0 ? `+${fmt(p.plannedIncome)}` : ""}{p.plannedExpense > 0 ? ` −${fmt(p.plannedExpense)}` : ""}
          </p>
        )}
      </div>
    </div>
  );
}

// ---------- Forward adjustments ----------

function AdjustmentsManager({ plannedItems }: { plannedItems: PlannedItem[] }) {
  const removePlannedItem = useFinanceStore((s) => s.removePlannedItem);
  const [editing, setEditing] = useState<PlannedItem | null>(null);
  const [addOpen, setAddOpen] = useState(false);

  return (
    <section className="panel p-6 md:p-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">What-ifs</p>
          <h2 className="font-display mt-1 text-2xl">Planned income &amp; expenses</h2>
          <p className="mt-1 max-w-xl text-sm text-muted-foreground">
            Add a bonus, a seasonal expense (day school, summer camp), or a planned asset sale. It flows straight
            into the forecast above so you can see the impact and when you'd need to draw down.
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
          <Plus className="mr-1.5 h-4 w-4" /> Add adjustment
        </Button>
      </header>

      {plannedItems.length === 0 ? (
        <div className="mt-6 rounded-xl border border-dashed border-border py-10 text-center text-sm text-muted-foreground">
          No planned adjustments yet. Add a one-off or seasonal item to model it.
        </div>
      ) : (
        <ul className="mt-5 divide-y divide-border">
          {plannedItems.map((p) => {
            const Icon = p.kind === "income" ? ArrowUpRight : ArrowDownRight;
            const tone = p.kind === "income" ? "text-success" : "text-destructive";
            return (
              <li key={p.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <div className="flex min-w-0 items-center gap-3">
                  <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${p.kind === "income" ? "bg-success/10 ring-1 ring-success/30" : "bg-destructive/10 ring-1 ring-destructive/20"}`}>
                    <Icon className={`h-4 w-4 ${tone}`} />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{p.name}</p>
                    <p className="text-[11px] text-muted-foreground">
                      {monthRangeLabel(p.startMonth, p.endMonth)}{p.category ? ` · ${p.category}` : ""}
                      {p.startMonth !== p.endMonth ? " · per month" : ""}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <p className={`font-mono-fin text-sm tabular-nums ${tone}`}>{p.kind === "income" ? "+" : "−"}{fmtCents(p.amount)}</p>
                  <button onClick={() => setEditing(p)} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted-foreground hover:text-foreground" title="Edit">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => { removePlannedItem(p.id); toast.success(`Removed ${p.name}`); }} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-destructive hover:bg-destructive/10" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <AdjustmentDialog open={addOpen} onOpenChange={setAddOpen} />
      <AdjustmentDialog open={!!editing} onOpenChange={(v) => { if (!v) setEditing(null); }} existing={editing ?? undefined} />
    </section>
  );
}

function AdjustmentDialog({
  open, onOpenChange, existing,
}: { open: boolean; onOpenChange: (v: boolean) => void; existing?: PlannedItem }) {
  const categories = useFinanceStore((s) => s.categories);
  const addPlannedItem = useFinanceStore((s) => s.addPlannedItem);
  const updatePlannedItem = useFinanceStore((s) => s.updatePlannedItem);

  const thisMonth = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}`;
  const [name, setName] = useState(existing?.name ?? "");
  const [kind, setKind] = useState<"income" | "expense">(existing?.kind ?? "expense");
  const [amount, setAmount] = useState(existing ? String(existing.amount) : "");
  const [category, setCategory] = useState(existing?.category ?? "");
  const [start, setStart] = useState(existing?.startMonth ?? thisMonth);
  const [end, setEnd] = useState(existing?.endMonth ?? existing?.startMonth ?? thisMonth);

  // reset local state when opening a different item
  const key = existing?.id ?? "new";
  const [seed, setSeed] = useState(key);
  if (seed !== key) {
    setSeed(key);
    setName(existing?.name ?? ""); setKind(existing?.kind ?? "expense");
    setAmount(existing ? String(existing.amount) : ""); setCategory(existing?.category ?? "");
    setStart(existing?.startMonth ?? thisMonth); setEnd(existing?.endMonth ?? existing?.startMonth ?? thisMonth);
  }

  const save = () => {
    if (!name.trim()) { toast.error("Name the adjustment"); return; }
    const payload = {
      name: name.trim(), kind, amount: Number(amount) || 0,
      category: category || null, startMonth: start, endMonth: end < start ? start : end,
    };
    if (existing) { updatePlannedItem(existing.id, payload); toast.success(`Updated ${payload.name}`); }
    else { addPlannedItem(payload); toast.success(`Added ${payload.name}`); }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">{existing ? "Edit adjustment" : "Add an adjustment"}</DialogTitle>
          <DialogDescription>A one-off or seasonal amount. Set the same month for both to make it a one-off.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <AField label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Q1 bonus / Summer camp" className="h-9" autoFocus />
          </AField>
          <div className="grid grid-cols-2 gap-3">
            <AField label="Type">
              <Select value={kind} onValueChange={(v) => setKind(v as "income" | "expense")}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="income">Income</SelectItem>
                  <SelectItem value="expense">Expense</SelectItem>
                </SelectContent>
              </Select>
            </AField>
            <AField label="Amount / month">
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
                <Input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0" className="h-9 pl-6" />
              </div>
            </AField>
          </div>
          <AField label="Category (optional)">
            <Select value={category || "none"} onValueChange={(v) => setCategory(v === "none" ? "" : v)}>
              <SelectTrigger className="h-9"><SelectValue placeholder="None" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                {categories.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </AField>
          <div className="grid grid-cols-2 gap-3">
            <AField label="From month">
              <Input type="month" value={start} onChange={(e) => setStart(e.target.value)} className="h-9" />
            </AField>
            <AField label="To month">
              <Input type="month" value={end} onChange={(e) => setEnd(e.target.value)} className="h-9" />
            </AField>
          </div>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground">Cancel</Button>
          <Button onClick={save} className="bg-primary text-primary-foreground hover:bg-primary/90">{existing ? "Save" : "Add"}</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function AField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

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
    // Claude when a key is configured (server-side), else a local heuristic.
    setGoal(targetGoal);
    setLoading(true);
    setSuggestions(null);
    setSummary("");
    try {
      const { source, suggestions } = await api.budgetSuggest(targetGoal);
      setSuggestions(suggestions.map((s) => ({
        category: s.category, suggested: s.suggested, rationale: s.rationale, confidence: 1,
      })));
      const totalSave = suggestions.reduce((t, s) => t + (s.monthlySaving || 0), 0);
      setSummary(
        suggestions.length
          ? `${source === "ai" ? "Claude" : "Guardian"} found ${suggestions.length} cut${suggestions.length === 1 ? "" : "s"} worth about ${fmt(totalSave)}/mo — roughly ${fmt(totalSave * 12)}/yr. Apply what fits; the forecast updates instantly.`
          : "You're already lean in these categories — no obvious cuts."
      );
    } catch (e) {
      toast.error("Couldn't get suggestions", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setLoading(false);
    }
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
