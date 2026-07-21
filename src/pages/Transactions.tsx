import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { TopBar } from "@/components/finance/TopBar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { useFinanceStore } from "@/lib/finance-store";
import { fmtCents } from "@/lib/finance-data";
import {
  ArrowLeft, Search, Sparkles, Pencil, Check, AlertTriangle, Repeat, Copy, Plus,
} from "lucide-react";
import { ConnectAccountDialog } from "@/components/finance/ConnectAccountDialog";
import { CategoryManagerDialog } from "@/components/finance/CategoryManagerDialog";
import { SlidersHorizontal } from "lucide-react";
import { toast } from "sonner";

const flagMeta = {
  anomaly:             { Icon: AlertTriangle, label: "Anomaly",       cls: "text-destructive bg-destructive/10 ring-destructive/30" },
  shadow_subscription: { Icon: Repeat,        label: "New recurring", cls: "text-primary bg-primary/10 ring-primary/30" },
  duplicate:           { Icon: Copy,          label: "Duplicate",     cls: "text-primary bg-primary/10 ring-primary/30" },
} as const;

const Transactions = () => {
  const transactions = useFinanceStore((s) => s.transactions);
  const accounts = useFinanceStore((s) => s.accounts);
  const recategorize = useFinanceStore((s) => s.recategorize);
  const categories = useFinanceStore((s) => s.categories);

  const [query, setQuery] = useState("");
  const [accountFilter, setAccountFilter] = useState<string>("all");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [connectOpen, setConnectOpen] = useState(false);
  const [manageCatsOpen, setManageCatsOpen] = useState(false);

  const filtered = useMemo(() => {
    return transactions
      .filter((t) => (accountFilter === "all" ? true : t.account === accountFilter))
      .filter((t) => (categoryFilter === "all" ? true : t.category === categoryFilter))
      .filter((t) => (query ? t.merchant.toLowerCase().includes(query.toLowerCase()) : true));
  }, [transactions, query, accountFilter, categoryFilter]);

  // Group by date label
  const grouped = useMemo(() => {
    const map = new Map<string, typeof filtered>();
    for (const t of filtered) {
      const label = new Date(t.date).toLocaleDateString("en-US", {
        weekday: "long", month: "short", day: "numeric",
      });
      if (!map.has(label)) map.set(label, []);
      map.get(label)!.push(t);
    }
    return Array.from(map.entries());
  }, [filtered]);

  return (
    <div className="min-h-screen">
      <TopBar />

      <main className="mx-auto max-w-6xl px-6 py-8 pb-28 md:px-10 md:py-10 md:pb-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link to="/" className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3" /> Dashboard
            </Link>
            <h1 className="font-display mt-2 text-4xl md:text-5xl">Transactions</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {filtered.length} of {transactions.length} ·{" "}
              <span className="inline-flex items-center gap-1 text-foreground">
                <Sparkles className="h-3 w-3 text-primary" /> AI-categorized · tap any tag to override
              </span>
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => setManageCatsOpen(true)}
              className="border-border bg-background/60 text-muted-foreground hover:text-foreground"
            >
              <SlidersHorizontal className="mr-1.5 h-4 w-4" /> Categories
            </Button>
            <Button
              onClick={() => setConnectOpen(true)}
              className="bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Plus className="mr-1.5 h-4 w-4" /> Connect account
            </Button>
          </div>
        </div>

        {/* Filter bar */}
        <div className="mt-6 grid gap-3 md:grid-cols-[1fr_auto_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search merchant"
              className="pl-9"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>

          <Select value={accountFilter} onValueChange={setAccountFilter}>
            <SelectTrigger className="md:w-56"><SelectValue placeholder="Account" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All accounts</SelectItem>
              {accounts.map((a) => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="md:w-48"><SelectValue placeholder="Category" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All categories</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c} value={c}>{c}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Grouped list */}
        <div className="mt-8 space-y-8">
          {grouped.map(([label, rows]) => {
            const total = rows.reduce((s, r) => s + r.amount, 0);
            return (
              <section key={label}>
                <header className="mb-3 flex items-baseline justify-between border-b border-border pb-2">
                  <h2 className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</h2>
                  <span className={`font-mono-fin text-xs ${total >= 0 ? "text-success" : "text-muted-foreground"}`}>
                    {total >= 0 ? "+" : ""}{fmtCents(total)}
                  </span>
                </header>

                <ul className="panel divide-y divide-border p-2">
                  {rows.map((t) => {
                    const flag = t.flagged ? flagMeta[t.flagged] : null;
                    const isIncome = t.amount > 0;
                    const acct = accounts.find((a) => a.id === t.account);
                    return (
                      <li key={t.id} className="grid grid-cols-[auto_1fr_auto] items-center gap-4 px-3 py-3">
                        <div className="grid h-10 w-10 place-items-center rounded-xl bg-secondary text-sm font-medium text-foreground/80">
                          {t.merchant.charAt(0)}
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="truncate font-medium">{t.merchant}</p>
                            {flag && (
                              <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ring-1 ${flag.cls}`}>
                                <flag.Icon className="h-3 w-3" /> {flag.label}
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                            {/* Category override popover */}
                            <CategoryTag
                              category={t.category}
                              confidence={t.confidence}
                              userOverride={t.userOverride}
                              onChange={(next) => {
                                if (next === t.category) return;
                                recategorize(t.id, next);
                                toast.success(`Recategorized as ${next}`, {
                                  description: "Guardian will learn from this correction.",
                                });
                              }}
                            />
                            <span>·</span>
                            <span className="truncate">{acct?.name ?? "Unknown account"}</span>
                          </div>
                        </div>

                        <p className={`font-mono-fin text-sm tabular-nums ${isIncome ? "text-success" : "text-foreground"}`}>
                          {isIncome ? "+" : ""}{fmtCents(t.amount)}
                        </p>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}

          {grouped.length === 0 && (
            <div className="panel py-16 text-center text-sm text-muted-foreground">
              No transactions match your filters.
            </div>
          )}
        </div>
      </main>

      <ConnectAccountDialog open={connectOpen} onOpenChange={setConnectOpen} />
      <CategoryManagerDialog open={manageCatsOpen} onOpenChange={setManageCatsOpen} />
    </div>
  );
};

function CategoryTag({
  category, confidence, userOverride, onChange,
}: {
  category: string;
  confidence: number;
  userOverride?: boolean;
  onChange: (next: string) => void;
}) {
  const categories = useFinanceStore((s) => s.categories);
  const addCategory = useFinanceStore((s) => s.addCategory);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const lowConf = !userOverride && confidence < 0.85;

  const trimmed = query.trim();
  const filtered = trimmed
    ? categories.filter((c) => c.toLowerCase().includes(trimmed.toLowerCase()))
    : categories;
  const exactExists = categories.some((c) => c.toLowerCase() === trimmed.toLowerCase());

  const choose = (c: string) => {
    onChange(c);
    setOpen(false);
    setQuery("");
  };
  const createAndChoose = () => {
    if (!trimmed) return;
    choose(addCategory(trimmed));
  };

  return (
    <Popover open={open} onOpenChange={(v) => { setOpen(v); if (!v) setQuery(""); }}>
      <PopoverTrigger asChild>
        <button
          className={`group inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] transition-colors
            ${userOverride
              ? "border-success/40 bg-success/10 text-success"
              : lowConf
              ? "border-primary/40 bg-primary/10 text-primary"
              : "border-border bg-secondary text-foreground/80 hover:border-primary/40 hover:text-foreground"}`}
        >
          {userOverride ? <Check className="h-2.5 w-2.5" /> : <Sparkles className="h-2.5 w-2.5" />}
          {category}
          {!userOverride && (
            <span className="font-mono-fin opacity-60">{Math.round(confidence * 100)}%</span>
          )}
          <Pencil className="h-2.5 w-2.5 opacity-0 transition-opacity group-hover:opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-1">
        <div className="p-1">
          <Input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && trimmed && !exactExists) { e.preventDefault(); createAndChoose(); }
            }}
            placeholder="Search or add category…"
            className="h-8 text-sm"
          />
        </div>
        <ul className="max-h-56 overflow-y-auto">
          {filtered.map((c) => (
            <li key={c}>
              <button
                onClick={() => choose(c)}
                className={`flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm transition-colors hover:bg-secondary
                  ${c === category ? "text-primary" : ""}`}
              >
                <span>{c}</span>
                {c === category && <Check className="h-3.5 w-3.5" />}
              </button>
            </li>
          ))}
        </ul>
        {trimmed && !exactExists && (
          <button
            onClick={createAndChoose}
            className="mt-0.5 flex w-full items-center gap-2 rounded-md border-t border-border px-2 py-2 text-sm text-primary transition-colors hover:bg-secondary"
          >
            <Plus className="h-3.5 w-3.5" />
            Create &ldquo;{trimmed}&rdquo;
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}

export default Transactions;
