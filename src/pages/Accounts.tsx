import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Area, AreaChart, ResponsiveContainer, YAxis } from "recharts";
import {
  ArrowLeft, Landmark, PiggyBank, LineChart, CreditCard, Banknote,
  Pencil, Plus, Trash2, PenLine,
} from "lucide-react";
import { TopBar } from "@/components/finance/TopBar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFinanceStore, type Account } from "@/lib/finance-store";
import { fmt, fmtCents, accountLabel, type AccountType } from "@/lib/finance-data";
import { api } from "@/lib/api";
import { toast } from "sonner";

const iconFor: Record<AccountType, typeof Landmark> = {
  checking: Landmark, savings: PiggyBank, investment: LineChart, credit: CreditCard, loan: Banknote,
};
const TYPE_ORDER: AccountType[] = ["checking", "savings", "investment", "credit", "loan"];
const TYPE_LABEL: Record<AccountType, string> = {
  checking: "Checking", savings: "Savings", investment: "Investments", credit: "Credit cards", loan: "Loans",
};
const TYPE_OPTIONS: { value: AccountType; label: string }[] = [
  { value: "checking", label: "Checking" }, { value: "savings", label: "Savings" },
  { value: "investment", label: "Investment" }, { value: "credit", label: "Credit card" }, { value: "loan", label: "Loan" },
];

const asOf = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";

const Accounts = () => {
  const allAccounts = useFinanceStore((s) => s.accounts);
  const [addOpen, setAddOpen] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<string>("all");

  // Distinct owners present, for the filter chips.
  const owners = useMemo(() => {
    const set = new Set<string>();
    let anyUnassigned = false;
    for (const a of allAccounts) { if (a.owner && a.owner.trim()) set.add(a.owner.trim()); else anyUnassigned = true; }
    return { list: [...set].sort(), anyUnassigned };
  }, [allAccounts]);

  const accounts = useMemo(
    () => (ownerFilter === "all" ? allAccounts
      : allAccounts.filter((a) => (a.owner?.trim() || "Unassigned") === ownerFilter)),
    [allAccounts, ownerFilter]
  );

  const totals = useMemo(() => {
    const assets = accounts.filter((a) => ["checking", "savings", "investment"].includes(a.type)).reduce((t, a) => t + a.balance, 0);
    const debt = accounts.filter((a) => ["credit", "loan"].includes(a.type)).reduce((t, a) => t + Math.max(0, -a.balance), 0);
    return { assets, debt, net: assets - debt };
  }, [accounts]);

  const groups = TYPE_ORDER
    .map((type) => ({ type, items: accounts.filter((a) => a.type === type) }))
    .filter((g) => g.items.length > 0);

  const chip = (val: string, label: string) => (
    <button
      key={val}
      onClick={() => setOwnerFilter(val)}
      className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        ownerFilter === val ? "bg-primary text-primary-foreground" : "border border-border bg-card text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto max-w-5xl px-6 py-8 pb-28 md:px-10 md:py-10 md:pb-10">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <Link to="/" className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-3 w-3" /> Dashboard
            </Link>
            <h1 className="font-display mt-2 text-4xl md:text-5xl">Accounts</h1>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Every account in one place. Rename them so they're easy to recognize, fix a mis-typed account,
              or add one Plaid can't reach (like a 529) and track its balance over time.
            </p>
          </div>
          <Button onClick={() => setAddOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="mr-1.5 h-4 w-4" /> Add account
          </Button>
        </div>

        {/* Owner filter */}
        {(owners.list.length > 0 || owners.anyUnassigned) && (
          <div className="mt-6 flex flex-wrap items-center gap-2">
            <span className="mr-1 text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Owner</span>
            {chip("all", "All")}
            {owners.list.map((o) => chip(o, o))}
            {owners.anyUnassigned && chip("Unassigned", "Unassigned")}
          </div>
        )}

        {/* Snapshot */}
        <section className="panel mt-4 grid gap-3 p-6 sm:grid-cols-3 md:p-8">
          <Snap label="Assets" value={fmt(totals.assets)} tone="text-foreground" />
          <Snap label="Debt" value={fmt(totals.debt)} tone="text-destructive" />
          <Snap label={ownerFilter === "all" ? "Net worth" : `Net worth · ${ownerFilter}`} value={fmt(totals.net)} tone={totals.net >= 0 ? "text-success" : "text-destructive"} />
        </section>

        <div className="mt-8 space-y-8">
          {groups.map(({ type, items }) => {
            const subtotal = items.reduce((s, a) => s + a.balance, 0);
            return (
              <section key={type}>
                <header className="mb-3 flex items-baseline justify-between border-b border-border pb-2">
                  <h2 className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                    {TYPE_LABEL[type]} <span className="text-foreground/50">· {items.length}</span>
                  </h2>
                  <span className={`font-mono-fin text-xs tabular-nums ${subtotal < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                    {fmt(subtotal)}
                  </span>
                </header>
                <div className="space-y-2">
                  {items.map((a) => <AccountRow key={a.id} account={a} />)}
                </div>
              </section>
            );
          })}
        </div>
      </main>

      <AddAccountDialog open={addOpen} onOpenChange={setAddOpen} />
    </div>
  );
};

function Snap({ label, value, tone }: { label: string; value: string; tone: string }) {
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className={`font-mono-fin mt-2 text-2xl tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

function AccountRow({ account: a }: { account: Account }) {
  const Icon = iconFor[a.type];
  const nicknamed = !!(a.nickname && a.nickname.trim() && a.nickname.trim() !== a.name);
  const negative = a.balance < 0;
  return (
    <div className="panel flex items-center justify-between gap-3 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground ring-1 ring-border">
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate font-medium leading-tight">{accountLabel(a)}</p>
            {a.owner && (
              <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground ring-1 ring-border">
                {a.owner}
              </span>
            )}
            {a.isManual && (
              <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-primary ring-1 ring-primary/30">
                Manual
              </span>
            )}
          </div>
          <p className="truncate text-[11px] text-muted-foreground">
            {a.institution && a.institution !== "Seed" ? `${a.institution}` : ""}
            {a.mask ? `${a.institution && a.institution !== "Seed" ? " · " : ""}${a.mask}` : ""}
            {nicknamed ? `${(a.institution && a.institution !== "Seed") || a.mask ? " · " : ""}${a.name}` : ""}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-3">
        {a.isManual && <ManualSparkline id={a.id} />}
        <div className="text-right">
          <p className={`font-mono-fin text-lg tabular-nums ${negative ? "text-destructive" : ""}`}>{fmtCents(a.balance)}</p>
          {a.isManual && a.balanceAsof && (
            <p className="text-[10px] text-muted-foreground">as of {asOf(a.balanceAsof)}</p>
          )}
        </div>
        <EditAccount account={a} />
      </div>
    </div>
  );
}

// Tiny balance-over-time sparkline for manual accounts.
function ManualSparkline({ id }: { id: string }) {
  const [data, setData] = useState<{ balance: number; at: string }[]>([]);
  useEffect(() => {
    let alive = true;
    api.accountHistory(id).then((r) => { if (alive) setData(r.history); }).catch(() => {});
    return () => { alive = false; };
  }, [id]);
  if (data.length < 2) return null;
  const up = data[data.length - 1].balance >= data[0].balance;
  return (
    <div className="hidden h-8 w-24 sm:block" title="Balance over time">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 2, bottom: 2, left: 0, right: 0 }}>
          <YAxis hide domain={["dataMin", "dataMax"]} />
          <Area
            type="monotone" dataKey="balance" strokeWidth={1.5}
            stroke={up ? "hsl(var(--success))" : "hsl(var(--destructive))"}
            fill={up ? "hsl(var(--success))" : "hsl(var(--destructive))"} fillOpacity={0.12}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function EditAccount({ account: a }: { account: Account }) {
  const setNickname = useFinanceStore((s) => s.setNickname);
  const setAccountType = useFinanceStore((s) => s.setAccountType);
  const setManualBalance = useFinanceStore((s) => s.setManualBalance);
  const updateLiability = useFinanceStore((s) => s.updateLiability);
  const removeAccount = useFinanceStore((s) => s.removeAccount);
  const [open, setOpen] = useState(false);
  const [nick, setNick] = useState(a.nickname ?? "");
  const [type, setType] = useState<AccountType>(a.type);
  const [bal, setBal] = useState(String(a.balance));
  const [owner, setOwner] = useState(a.owner ?? "");
  const [promoUntil, setPromoUntil] = useState((a.promoAprUntil ?? "").slice(0, 10));
  const isDebt = type === "credit" || type === "loan";

  const save = () => {
    if ((nick.trim() || null) !== (a.nickname ?? null)) setNickname(a.id, nick);
    if (type !== a.type) setAccountType(a.id, type);
    if (a.isManual && Number(bal) !== a.balance) setManualBalance(a.id, Number(bal) || 0);
    if ((owner.trim() || null) !== (a.owner ?? null)) updateLiability(a.id, { owner: owner.trim() || null });
    const pu = promoUntil || null;
    if (isDebt && pu !== ((a.promoAprUntil ?? "").slice(0, 10) || null)) {
      updateLiability(a.id, { promoAprUntil: pu, promoKind: pu ? (a.promoKind ?? "purchase") : null });
    }
    setOpen(false);
    toast.success(`Updated ${nick.trim() || a.name}`);
  };
  const del = () => {
    removeAccount(a.id);
    setOpen(false);
    toast.success(`Removed ${accountLabel(a)}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
          title="Edit account"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-4">
        <p className="text-sm font-medium">{a.name}</p>
        <p className="mb-3 text-[11px] text-muted-foreground">
          {a.mask || (a.isManual ? "Manual account" : "")}{a.subtype ? ` · Plaid: ${a.subtype}` : ""}
        </p>

        <div className="space-y-3">
          <Field label="Nickname">
            <Input value={nick} onChange={(e) => setNick(e.target.value)} placeholder={a.name} className="h-8 text-sm" />
          </Field>
          <Field label="Owner">
            <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="Abhi / Rachana / Joint" className="h-8 text-sm" />
          </Field>
          <Field label="Type">
            <Select value={type} onValueChange={(v) => setType(v as AccountType)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          {isDebt && (
            <Field label="0% APR until (optional)">
              <Input type="date" value={promoUntil} onChange={(e) => setPromoUntil(e.target.value)} className="h-8 text-sm" />
              <p className="mt-1 text-[10px] text-muted-foreground">Sets it as 0%-promo debt — it moves to the "Deferred · 0%" group and only the minimum is due.</p>
            </Field>
          )}
          {a.isManual ? (
            <Field label="Balance">
              <Input type="number" value={bal} onChange={(e) => setBal(e.target.value)} className="h-8 text-sm" />
            </Field>
          ) : (
            <p className="text-[11px] text-muted-foreground">Balance is synced from your bank via Plaid.</p>
          )}
        </div>

        <div className="mt-4 flex items-center justify-between">
          {a.isManual ? (
            <button onClick={del} className="inline-flex items-center gap-1 text-xs text-destructive hover:underline">
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="text-muted-foreground">Cancel</Button>
            <Button size="sm" onClick={save} className="bg-primary text-primary-foreground hover:bg-primary/90">Save</Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function AddAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const addManualAccount = useFinanceStore((s) => s.addManualAccount);
  const [name, setName] = useState("");
  const [type, setType] = useState<AccountType>("investment");
  const [balance, setBalance] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => { setName(""); setType("investment"); setBalance(""); };

  const submit = async () => {
    if (!name.trim()) { toast.error("Give the account a name"); return; }
    setBusy(true);
    const id = await addManualAccount({ name: name.trim(), type, balance: Number(balance) || 0 });
    setBusy(false);
    if (id) {
      toast.success(`Added ${name.trim()}`);
      reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Add a manual account</DialogTitle>
          <DialogDescription>
            For accounts Plaid can't connect (e.g. a 529 plan). Update the balance any time — we'll track it over time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <Field label="Name">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="my529 College Savings" className="h-9" autoFocus />
          </Field>
          <Field label="Type">
            <Select value={type} onValueChange={(v) => setType(v as AccountType)}>
              <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Current balance">
            <div className="relative">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">$</span>
              <Input type="number" value={balance} onChange={(e) => setBalance(e.target.value)} placeholder="0.00" className="h-9 pl-6" />
            </div>
          </Field>
        </div>
        <div className="mt-2 flex justify-end gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="text-muted-foreground">Cancel</Button>
          <Button onClick={submit} disabled={busy} className="bg-primary text-primary-foreground hover:bg-primary/90">
            <PenLine className="mr-1.5 h-4 w-4" /> Add account
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export default Accounts;
