import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Banknote, Pencil, CalendarClock } from "lucide-react";
import { TopBar } from "@/components/finance/TopBar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFinanceStore, type Account } from "@/lib/finance-store";
import { fmtCents } from "@/lib/finance-data";
import { deriveLoans, type LoanRow } from "@/lib/derive";
import { toast } from "sonner";

const pct = (n: number) => `${(n * 100).toFixed(2)}%`;
const ordinal = (d: number) => {
  if (!d) return "—";
  const s = ["th", "st", "nd", "rd"], v = d % 100;
  return d + (s[(v - 20) % 10] || s[v] || s[0]);
};
const payoffLabel = (months: number | null) => {
  if (months === null) return "—";
  if (months <= 0) return "Paid off";
  const y = Math.floor(months / 12), m = months % 12;
  return y ? `${y}y ${m}m` : `${m}m`;
};

const Loans = () => {
  const accounts = useFinanceStore((s) => s.accounts);
  const view = useMemo(() => deriveLoans(accounts), [accounts]);

  return (
    <div className="min-h-screen">
      <TopBar />
      <main className="mx-auto max-w-5xl px-6 py-8 pb-28 md:px-10 md:py-10 md:pb-10">
        <div>
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-3 w-3" /> Dashboard
          </Link>
          <h1 className="font-display mt-2 text-4xl md:text-5xl">Loans</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
            Long-term installment debt — mortgage, auto, and student loans. Fixed monthly payments,
            tracked separately from your revolving credit cards.
          </p>
        </div>

        {!view.hasLoans ? (
          <div className="panel mt-8 py-16 text-center text-sm text-muted-foreground">
            No installment loans. Connect a mortgage, auto, or student loan — or mark a card as a loan
            from the Liabilities page — and it'll appear here.
          </div>
        ) : (
          <>
            <section className="panel mt-6 grid gap-3 p-6 sm:grid-cols-2 md:p-8">
              <div className="rounded-xl border border-border bg-background/40 p-4">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Total balance owed</p>
                <p className="font-mono-fin mt-2 text-3xl tabular-nums">{fmtCents(view.totalBalance)}</p>
              </div>
              <div className="rounded-xl border border-border bg-background/40 p-4">
                <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">Total monthly payment</p>
                <p className="font-mono-fin mt-2 text-3xl tabular-nums text-primary">{fmtCents(view.totalMonthly)}</p>
              </div>
            </section>

            <div className="mt-6 space-y-3">
              {view.loans.map((l) => <LoanCard key={l.account.id} loan={l} />)}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

function LoanCard({ loan }: { loan: LoanRow }) {
  const a = loan.account;
  return (
    <div className="panel p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-secondary text-muted-foreground ring-1 ring-border">
            <Banknote className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <p className="font-medium leading-tight">{a.name}</p>
              {a.owner && (
                <span className="rounded-full bg-secondary px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-muted-foreground ring-1 ring-border">
                  {a.owner}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {a.institution && a.institution !== "Seed" ? `${a.institution} · ` : ""}{a.mask}
            </p>
          </div>
        </div>
        <LoanEdit account={a} />
      </div>

      <div className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Balance</p>
          <p className="font-mono-fin mt-0.5 text-xl tabular-nums">{fmtCents(loan.balance)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">APR</p>
          <p className="font-mono-fin mt-0.5 tabular-nums text-muted-foreground">{a.apr != null ? pct(a.apr) : "—"}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Monthly</p>
          <p className="font-mono-fin mt-0.5 tabular-nums text-primary">{fmtCents(loan.monthlyPayment)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Payoff</p>
          <p className="font-mono-fin mt-0.5 inline-flex items-center gap-1 tabular-nums">
            <CalendarClock className="h-3 w-3 text-muted-foreground" /> {payoffLabel(loan.payoffMonths)}
          </p>
        </div>
      </div>

      {a.notes && <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">{a.notes}</p>}
    </div>
  );
}

function LoanEdit({ account }: { account: Account }) {
  const update = useFinanceStore((s) => s.updateLiability);
  const [open, setOpen] = useState(false);
  const [owner, setOwner] = useState(account.owner ?? "");
  const [owed, setOwed] = useState(String(Math.max(0, -account.balance)));
  const [aprPct, setAprPct] = useState(account.apr != null ? String((account.apr * 100).toFixed(2)) : "");
  const [monthly, setMonthly] = useState(String(account.payment ?? account.minDue ?? ""));
  const [dueDay, setDueDay] = useState(String(account.dueDay ?? ""));
  const [notes, setNotes] = useState(account.notes ?? "");

  const num = (s: string) => (s.trim() === "" ? null : Number(s));

  const save = () => {
    update(account.id, {
      owner: owner.trim() || null,
      balance: -(Number(owed) || 0),
      apr: aprPct.trim() === "" ? null : (Number(aprPct) || 0) / 100,
      payment: num(monthly),
      minDue: num(monthly),
      dueDay: dueDay.trim() === "" ? null : Math.min(31, Math.max(1, Number(dueDay) || 1)),
      notes: notes.trim() || null,
    });
    setOpen(false);
    toast.success(`Updated ${account.name}`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted-foreground transition-colors hover:text-foreground"
          title="Edit loan"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-4">
        <p className="font-display text-lg">{account.name}</p>
        <p className="mb-3 text-[11px] text-muted-foreground">{account.mask}</p>
        <div className="grid grid-cols-2 gap-3">
          <EditField label="Owner" span>
            <Input value={owner} onChange={(e) => setOwner(e.target.value)} placeholder="You / Partner" className="h-8 text-sm" />
          </EditField>
          <EditField label="Balance owed">
            <Input type="number" value={owed} onChange={(e) => setOwed(e.target.value)} className="h-8 text-sm" />
          </EditField>
          <EditField label="APR %">
            <Input type="number" value={aprPct} onChange={(e) => setAprPct(e.target.value)} placeholder="4.89" className="h-8 text-sm" />
          </EditField>
          <EditField label="Monthly">
            <Input type="number" value={monthly} onChange={(e) => setMonthly(e.target.value)} className="h-8 text-sm" />
          </EditField>
          <EditField label="Due day">
            <Input type="number" value={dueDay} onChange={(e) => setDueDay(e.target.value)} placeholder="1" className="h-8 text-sm" />
          </EditField>
          <EditField label="Notes" span>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Term, rate lock…" className="h-8 text-sm" />
          </EditField>
        </div>
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

export default Loans;
