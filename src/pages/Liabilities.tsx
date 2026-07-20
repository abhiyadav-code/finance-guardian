import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, Wallet, CreditCard, AlertTriangle, Check, Clock, Circle,
  Pencil, RefreshCw, Landmark, BadgePercent,
} from "lucide-react";
import { TopBar } from "@/components/finance/TopBar";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useFinanceStore, type Account } from "@/lib/finance-store";
import { fmt, fmtCents, type DebtClass, type PayStatus, type PromoKind } from "@/lib/finance-data";
import {
  deriveLiabilities, isPromoActive, type LiabilityRow, type LiabilityGroupView,
} from "@/lib/derive";
import { toast } from "sonner";

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const ordinal = (d: number) => {
  if (!d) return "—";
  const s = ["th", "st", "nd", "rd"], v = d % 100;
  return d + (s[(v - 20) % 10] || s[v] || s[0]);
};
const monthYear = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", year: "2-digit" }) : "";

const STATUS_META: Record<PayStatus, { label: string; Icon: typeof Check; cls: string }> = {
  unpaid:    { label: "Unpaid",    Icon: Circle, cls: "border-border bg-secondary text-muted-foreground" },
  scheduled: { label: "Scheduled", Icon: Clock,  cls: "border-primary/40 bg-primary/10 text-primary" },
  paid:      { label: "Paid",      Icon: Check,  cls: "border-success/40 bg-success/10 text-success" },
};
const NEXT_STATUS: Record<PayStatus, PayStatus> = { unpaid: "scheduled", scheduled: "paid", paid: "unpaid" };

const utilTone = (u: number | null) =>
  u === null ? "text-muted-foreground"
  : u >= 0.7 ? "text-destructive"
  : u >= 0.3 ? "text-primary"
  : "text-success";

const Liabilities = () => {
  const accounts = useFinanceStore((s) => s.accounts);
  const fundingSnapshot = useFinanceStore((s) => s.fundingSnapshot);
  const setFundingSnapshot = useFinanceStore((s) => s.setFundingSnapshot);

  const view = useMemo(
    () => deriveLiabilities(accounts, fundingSnapshot),
    [accounts, fundingSnapshot]
  );

  return (
    <div className="min-h-screen">
      <TopBar />

      <main className="mx-auto max-w-7xl px-6 py-8 pb-28 md:px-10 md:py-10 md:pb-10">
        <div>
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Dashboard
          </Link>
          <h1 className="font-display mt-2 text-4xl md:text-5xl">Liabilities</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Every card and loan in one place — balance, statement, and terms. Allocate this month's
            payments from checking, mark them off, and see next month's balance to plan your draw.
          </p>
        </div>

        {!view.hasLiabilities ? (
          <div className="panel mt-8 py-16 text-center text-sm text-muted-foreground">
            No credit cards or loans yet. Connect an account, and your liabilities will appear here.
          </div>
        ) : (
          <>
            <AllocationPanel view={view} onResnapshot={() => {
              setFundingSnapshot();
              toast.success("Checking snapshot refreshed");
            }} />

            <div className="mt-8 space-y-8">
              {view.groups.map((g) => (
                <GroupSection key={g.group} group={g} />
              ))}
            </div>

            <GrandTotals view={view} />
          </>
        )}
      </main>
    </div>
  );
};

// ---------- Allocation (funding) panel ----------

function AllocationPanel({
  view, onResnapshot,
}: { view: ReturnType<typeof deriveLiabilities>; onResnapshot: () => void }) {
  const accounts = useFinanceStore((s) => s.accounts);
  const setFundingAccount = useFinanceStore((s) => s.setFundingAccount);
  const cashAccounts = accounts.filter((a) => a.type === "checking" || a.type === "savings");
  const clampPct = Math.min(100, Math.max(0, view.pctAllocated * 100));
  return (
    <section className="panel mt-6 p-6 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">Paying from</p>
          <div className="mt-1 flex items-center gap-2">
            <Landmark className="h-5 w-5 shrink-0 text-muted-foreground" />
            {cashAccounts.length > 0 ? (
              <Select
                value={view.fundingAccount?.id ?? ""}
                onValueChange={(id) => setFundingAccount(id)}
              >
                <SelectTrigger className="h-9 w-auto gap-2 border-none bg-transparent px-1 font-display text-2xl focus:ring-0">
                  <SelectValue placeholder="Choose account" />
                </SelectTrigger>
                <SelectContent>
                  {cashAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id}>
                      {a.name} <span className="text-muted-foreground">{a.mask} · {fmtCents(a.balance)}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <h2 className="font-display text-2xl">Checking</h2>
            )}
          </div>
        </div>
        <button
          onClick={onResnapshot}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
          title="Re-freeze the funding account's current balance as this cycle's starting point"
        >
          <RefreshCw className="h-3.5 w-3.5" /> Refresh snapshot
        </button>
      </div>

      <div className="mt-6 grid gap-3 sm:grid-cols-3">
        <Stat label="Checking snapshot" value={fmtCents(view.snapshot)} tone="neutral" Icon={Wallet} />
        <Stat label="Allocated to payments" value={fmtCents(view.allocated)} tone="down" Icon={CreditCard} />
        <Stat
          label="Left in checking after"
          value={fmtCents(view.remaining)}
          tone={view.overAllocated ? "alert" : "up"}
          Icon={view.overAllocated ? AlertTriangle : Check}
        />
      </div>

      {/* Allocation progress */}
      <div className="mt-5">
        <div className="mb-1.5 flex items-center justify-between text-xs text-muted-foreground">
          <span>{Math.round(view.pctAllocated * 100)}% of checking allocated</span>
          {view.overAllocated && (
            <span className="inline-flex items-center gap-1 text-destructive">
              <AlertTriangle className="h-3 w-3" /> Over by {fmtCents(-view.remaining)}
            </span>
          )}
        </div>
        <div className="h-2.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className={`h-full rounded-full transition-all ${view.overAllocated ? "bg-destructive" : "bg-primary"}`}
            style={{ width: `${clampPct}%` }}
          />
        </div>
      </div>
    </section>
  );
}

function Stat({
  label, value, tone, Icon,
}: {
  label: string; value: string;
  tone: "up" | "down" | "neutral" | "alert";
  Icon: React.ComponentType<{ className?: string }>;
}) {
  const tint =
    tone === "up" ? "text-success" :
    tone === "down" ? "text-destructive" :
    tone === "alert" ? "text-destructive" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-background/40 p-4">
      <div className="flex items-center justify-between text-muted-foreground">
        <span className="text-[10px] uppercase tracking-[0.16em]">{label}</span>
        <Icon className={`h-3.5 w-3.5 ${tint}`} />
      </div>
      <p className={`font-mono-fin mt-2 text-2xl tabular-nums ${tint}`}>{value}</p>
    </div>
  );
}

// ---------- Group section ----------

function GroupSection({ group }: { group: LiabilityGroupView }) {
  return (
    <section>
      <header className="mb-3 flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-border pb-2">
        <h2 className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
          {group.label} <span className="text-foreground/50">· {group.rows.length}</span>
        </h2>
        <div className="flex flex-wrap items-baseline gap-x-5 gap-y-1 font-mono-fin text-xs tabular-nums">
          <span className="text-muted-foreground">Owed <span className="text-foreground">{fmtCents(group.owed)}</span></span>
          <span className="text-muted-foreground">Paying <span className="text-primary">{fmtCents(group.payment)}</span></span>
          <span className="text-muted-foreground">Next mo. <span className="text-foreground">{fmtCents(group.nextMonthOwed)}</span></span>
        </div>
      </header>

      {/* Desktop table */}
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[980px] border-separate border-spacing-y-1 text-sm">
          <thead>
            <tr className="text-left text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
              <th className="px-3 py-1 font-medium">Account</th>
              <th className="px-3 py-1 text-right font-medium">Balance</th>
              <th className="px-3 py-1 text-right font-medium">Statement</th>
              <th className="px-3 py-1 text-right font-medium">APR</th>
              <th className="px-3 py-1 text-right font-medium">Util</th>
              <th className="px-3 py-1 text-right font-medium">Min due</th>
              <th className="px-3 py-1 text-center font-medium">Due</th>
              <th className="px-3 py-1 text-center font-medium">Auto</th>
              <th className="px-3 py-1 text-right font-medium">Payment</th>
              <th className="px-3 py-1 text-center font-medium">Status</th>
              <th className="px-3 py-1 text-right font-medium">Next mo.</th>
              <th className="px-3 py-1 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {group.rows.map((r) => <LiabilityTableRow key={r.account.id} row={r} />)}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="space-y-3 lg:hidden">
        {group.rows.map((r) => <LiabilityCard key={r.account.id} row={r} />)}
      </div>
    </section>
  );
}

// ---------- Desktop table row ----------

function LiabilityTableRow({ row }: { row: LiabilityRow }) {
  const a = row.account;
  const update = useFinanceStore((s) => s.updateLiability);
  return (
    <tr className="bg-card/40 [&>td]:border-y [&>td]:border-border/60 [&>td:first-child]:rounded-l-lg [&>td:first-child]:border-l [&>td:last-child]:rounded-r-lg [&>td:last-child]:border-r">
      <td className="px-3 py-2.5">
        <AccountIdentity account={a} />
      </td>
      <td className="px-3 py-2.5 text-right font-mono-fin tabular-nums">{fmtCents(row.owed)}</td>
      <td className="px-3 py-2.5 text-right font-mono-fin tabular-nums text-muted-foreground">{fmtCents(row.statement)}</td>
      <td className="px-3 py-2.5 text-right font-mono-fin tabular-nums">
        <AprCell row={row} />
      </td>
      <td className={`px-3 py-2.5 text-right font-mono-fin tabular-nums ${utilTone(row.utilization)}`}>
        {row.utilization != null ? `${Math.round(row.utilization * 100)}%` : "—"}
      </td>
      <td className="px-3 py-2.5 text-right font-mono-fin tabular-nums text-muted-foreground">{fmtCents(row.minDue)}</td>
      <td className="px-3 py-2.5 text-center text-muted-foreground">{ordinal(a.dueDay ?? 0)}</td>
      <td className="px-3 py-2.5 text-center">
        <Switch checked={!!a.autopay} onCheckedChange={(v) => update(a.id, { autopay: v })} />
      </td>
      <td className="px-3 py-2.5 text-right">
        <PaymentInput value={row.payment} auto={row.paymentAuto} onChange={(n) => update(a.id, { payment: n })} className="w-28" />
      </td>
      <td className="px-3 py-2.5 text-center">
        <StatusPill status={a.payStatus ?? "unpaid"} onCycle={() => update(a.id, { payStatus: NEXT_STATUS[a.payStatus ?? "unpaid"] })} />
      </td>
      <td className="px-3 py-2.5 text-right font-mono-fin tabular-nums font-medium">{fmtCents(row.nextMonthOwed)}</td>
      <td className="px-3 py-2.5">
        <div className="flex items-center gap-1">
          <NotesInput key={a.notes ?? ""} value={a.notes ?? ""} onCommit={(v) => update(a.id, { notes: v })} className="w-40" />
          <EditLiability account={a} />
        </div>
      </td>
    </tr>
  );
}

// ---------- Mobile card ----------

function LiabilityCard({ row }: { row: LiabilityRow }) {
  const a = row.account;
  const update = useFinanceStore((s) => s.updateLiability);
  return (
    <div className="panel p-4">
      <div className="flex items-start justify-between gap-2">
        <AccountIdentity account={a} />
        <EditLiability account={a} />
      </div>

      <div className="mt-3 flex items-end justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Balance</p>
          <p className="font-mono-fin text-2xl tabular-nums">{fmtCents(row.owed)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Statement</p>
          <p className="font-mono-fin text-sm tabular-nums text-muted-foreground">{fmtCents(row.statement)}</p>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2 border-t border-border pt-3 text-xs">
        <Field
          label="APR"
          value={row.promoActive ? "0%" : a.apr != null ? pct(a.apr) : "—"}
          tone={row.promoActive ? "text-success" : undefined}
        />
        <Field label="Limit" value={a.creditLimit ? fmt(a.creditLimit) : "—"} />
        <Field label="Util" value={row.utilization != null ? `${Math.round(row.utilization * 100)}%` : "—"} tone={utilTone(row.utilization)} />
        <Field label="Min due" value={fmtCents(row.minDue)} />
        <Field label="Due" value={ordinal(a.dueDay ?? 0)} />
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Autopay</p>
          <div className="mt-1"><Switch checked={!!a.autopay} onCheckedChange={(v) => update(a.id, { autopay: v })} /></div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-border pt-3">
        <div className="flex items-center gap-2">
          <span className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Pay</span>
          <PaymentInput value={row.payment} auto={row.paymentAuto} onChange={(n) => update(a.id, { payment: n })} className="w-24" />
          <StatusPill status={a.payStatus ?? "unpaid"} onCycle={() => update(a.id, { payStatus: NEXT_STATUS[a.payStatus ?? "unpaid"] })} />
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Next mo.</p>
          <p className="font-mono-fin text-sm font-medium tabular-nums">{fmtCents(row.nextMonthOwed)}</p>
        </div>
      </div>

      <NotesInput
        key={a.notes ?? ""}
        value={a.notes ?? ""}
        onCommit={(v) => update(a.id, { notes: v })}
        placeholder="Add a note…"
        className="mt-3 w-full"
      />
    </div>
  );
}

// ---------- Grand totals ----------

function GrandTotals({ view }: { view: ReturnType<typeof deriveLiabilities> }) {
  return (
    <section className="panel mt-8 p-6 md:p-8">
      <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">The bottom line</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Stat label="Total owed today" value={fmtCents(view.totalOwed)} tone="neutral" Icon={CreditCard} />
        <Stat label="Paying this cycle" value={fmtCents(view.totalPayment)} tone="down" Icon={Wallet} />
        <Stat label="Owed next month" value={fmtCents(view.totalNextMonthOwed)} tone="up" Icon={Check} />
      </div>
      <p className="mt-4 text-xs text-muted-foreground">
        Next month's total is what you'll owe after this cycle's payments post — the amount you'll need to
        plan to draw against. Minimum due across all accounts this cycle: {fmtCents(view.totalMinDue)}.
      </p>
    </section>
  );
}

// ---------- Small shared bits ----------

function Field({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={`font-mono-fin mt-0.5 tabular-nums ${tone ?? ""}`}>{value}</p>
    </div>
  );
}

// Account identity: card icon + name + owner chip + mask, and a 0%-promo badge.
function AccountIdentity({ account: a }: { account: Account }) {
  const promo = isPromoActive(a);
  return (
    <div className="flex items-center gap-2.5">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-secondary text-muted-foreground ring-1 ring-border">
        <CreditCard className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="truncate font-medium leading-tight">{a.name}</p>
          {a.owner && (
            <span className="shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground ring-1 ring-border">
              {a.owner}
            </span>
          )}
        </div>
        <p className="truncate text-[11px] text-muted-foreground">
          {a.institution && a.institution !== "Seed" ? `${a.institution} · ` : ""}{a.mask}
        </p>
        {promo && (
          <span className="mt-1 inline-flex items-center gap-1 rounded-full border border-success/40 bg-success/10 px-1.5 py-0.5 text-[10px] font-medium text-success">
            <BadgePercent className="h-2.5 w-2.5" />
            {a.promoKind === "balance_transfer" ? "0% BT" : "0% intro"} · till {monthYear(a.promoAprUntil)}
          </span>
        )}
      </div>
    </div>
  );
}

function StatusPill({ status, onCycle }: { status: PayStatus; onCycle: () => void }) {
  const m = STATUS_META[status];
  return (
    <button
      onClick={onCycle}
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${m.cls}`}
      title="Click to change status"
    >
      <m.Icon className="h-3 w-3" /> {m.label}
    </button>
  );
}

// APR cell: shows 0% (green) with a tooltip during a live promo, else the go-to rate.
function AprCell({ row }: { row: LiabilityRow }) {
  const a = row.account;
  if (row.promoActive) {
    return (
      <span
        className="text-success"
        title={`0% promo till ${monthYear(a.promoAprUntil)} · go-to ${a.apr != null ? pct(a.apr) : "—"}`}
      >
        0%
      </span>
    );
  }
  return <span className="text-muted-foreground">{a.apr != null ? pct(a.apr) : "—"}</span>;
}

function PaymentInput({
  value, auto, onChange, className,
}: { value: number; auto?: boolean; onChange: (n: number) => void; className?: string }) {
  return (
    <div className="relative inline-block">
      <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">$</span>
      <Input
        type="number"
        inputMode="decimal"
        value={value ? String(value) : ""}
        placeholder="0"
        title={auto ? "Auto-filled to the minimum due (0% promo)" : undefined}
        onChange={(e) => onChange(Math.max(0, Number(e.target.value) || 0))}
        className={`h-8 pl-5 text-right font-mono-fin text-sm tabular-nums ${auto ? "text-primary/90 ring-1 ring-primary/30" : ""} ${className ?? ""}`}
      />
    </div>
  );
}

// Uncontrolled so typing never fights a re-render; commits on blur. The `key`
// (set by the caller to the current value) resets the field if notes change
// elsewhere.
function NotesInput({
  value, onCommit, placeholder, className,
}: { value: string; onCommit: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <Input
      defaultValue={value}
      placeholder={placeholder ?? "Note…"}
      onBlur={(e) => { if (e.target.value !== value) onCommit(e.target.value); }}
      className={`h-8 text-xs ${className ?? ""}`}
    />
  );
}

// ---------- Edit account attributes ----------

const PROMO_NONE = "none";

function EditLiability({ account }: { account: Account }) {
  const update = useFinanceStore((s) => s.updateLiability);
  const [open, setOpen] = useState(false);

  // Local editable copy; committed on save.
  const [owner, setOwner] = useState(account.owner ?? "");
  const [owed, setOwed] = useState(String(Math.max(0, -account.balance)));
  const [statement, setStatement] = useState(String(account.statementBalance ?? 0));
  const [aprPct, setAprPct] = useState(account.apr != null ? String((account.apr * 100).toFixed(2)) : "");
  const [limit, setLimit] = useState(String(account.creditLimit ?? ""));
  const [minDue, setMinDue] = useState(String(account.minDue ?? 0));
  const [dueDay, setDueDay] = useState(String(account.dueDay ?? ""));
  const [debtClass, setDebtClass] = useState<DebtClass>(account.debtClass ?? (account.type === "loan" ? "installment" : "revolving"));
  const [promoKind, setPromoKind] = useState<PromoKind | typeof PROMO_NONE>(account.promoKind ?? PROMO_NONE);
  const [promoUntil, setPromoUntil] = useState((account.promoAprUntil ?? "").slice(0, 10));
  const [btDate, setBtDate] = useState((account.balanceTransferDate ?? "").slice(0, 10));

  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  const save = () => {
    const isBT = promoKind === "balance_transfer";
    update(account.id, {
      owner: owner.trim() || null,
      balance: -(Number(owed) || 0), // stored negative (amount owed)
      statementBalance: num(statement),
      apr: aprPct.trim() === "" ? null : (Number(aprPct) || 0) / 100,
      creditLimit: num(limit),
      minDue: num(minDue),
      dueDay: dueDay.trim() === "" ? null : Math.min(31, Math.max(1, Number(dueDay) || 1)),
      debtClass,
      promoKind: promoKind === PROMO_NONE ? null : promoKind,
      promoAprUntil: promoKind === PROMO_NONE ? null : (promoUntil || null),
      balanceTransferDate: isBT ? (btDate || null) : null,
    });
    setOpen(false);
    toast.success(`Updated ${account.name}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
          title="Edit account details"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[80vh] w-72 overflow-y-auto p-4">
        <p className="font-display text-lg">{account.name}</p>
        <p className="mb-3 text-[11px] text-muted-foreground">{account.mask}</p>

        <div className="grid grid-cols-2 gap-3">
          <EditField label="Owner" span>
            <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="You / Partner" className="h-8 text-sm" />
          </EditField>
          <EditField label="Balance owed">
            <Input type="number" value={owed} onChange={(e) => setOwed(e.target.value)} className="h-8 text-sm" />
          </EditField>
          <EditField label="Statement">
            <Input type="number" value={statement} onChange={(e) => setStatement(e.target.value)} className="h-8 text-sm" />
          </EditField>
          <EditField label="APR % (go-to)">
            <Input type="number" value={aprPct} onChange={(e) => setAprPct(e.target.value)} placeholder="20.74" className="h-8 text-sm" />
          </EditField>
          <EditField label="Limit">
            <Input type="number" value={limit} onChange={(e) => setLimit(e.target.value)} className="h-8 text-sm" />
          </EditField>
          <EditField label="Min due">
            <Input type="number" value={minDue} onChange={(e) => setMinDue(e.target.value)} className="h-8 text-sm" />
          </EditField>
          <EditField label="Due day">
            <Input type="number" value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="15" className="h-8 text-sm" />
          </EditField>
          <EditField label="Type" span>
            <Select value={debtClass} onValueChange={(v) => setDebtClass(v as DebtClass)}>
              <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="revolving">Credit card (revolving)</SelectItem>
                <SelectItem value="installment">Loan (installment)</SelectItem>
              </SelectContent>
            </Select>
          </EditField>

          {debtClass === "revolving" && (
            <>
              <EditField label="0% APR promo" span>
                <Select value={promoKind} onValueChange={(v) => setPromoKind(v as PromoKind | typeof PROMO_NONE)}>
                  <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={PROMO_NONE}>No promo (standard APR)</SelectItem>
                    <SelectItem value="purchase">Purchase intro 0%</SelectItem>
                    <SelectItem value="balance_transfer">Balance transfer 0%</SelectItem>
                  </SelectContent>
                </Select>
              </EditField>
              {promoKind !== PROMO_NONE && (
                <EditField label="0% ends" span={promoKind !== "balance_transfer"}>
                  <Input type="date" value={promoUntil} onChange={(e) => setPromoUntil(e.target.value)} className="h-8 text-sm" />
                </EditField>
              )}
              {promoKind === "balance_transfer" && (
                <EditField label="Transfer date">
                  <Input type="date" value={btDate} onChange={(e) => setBtDate(e.target.value)} className="h-8 text-sm" />
                </EditField>
              )}
            </>
          )}
        </div>

        {debtClass === "revolving" && promoKind !== PROMO_NONE && (
          <p className="mt-3 text-[11px] leading-snug text-muted-foreground">
            While the promo is live this card sits in <span className="text-success">Deferred · 0%</span> and its
            payment auto-fills to the minimum. It moves to <span className="text-foreground">Monthly</span> when the
            0% ends.
          </p>
        )}

        <div className="mt-4 flex justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setOpen(false)} className="text-muted-foreground">Cancel</Button>
          <Button size="sm" onClick={save} className="bg-primary text-primary-foreground hover:bg-primary/90">Save</Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function EditField({ label, span, children }: { label: string; span?: boolean; children: React.ReactNode }) {
  return (
    <div className={span ? "col-span-2" : ""}>
      <label className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</label>
      <div className="mt-1">{children}</div>
    </div>
  );
}

export default Liabilities;
