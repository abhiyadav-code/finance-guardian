import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Lock, Search, Loader2, Check, Building2, ShieldCheck, Sparkles,
} from "lucide-react";
import { useFinanceStore, type Account } from "@/lib/finance-store";
import { type Transaction } from "@/lib/finance-data";
import { toast } from "sonner";

type Step = "institution" | "credentials" | "selectAccounts" | "syncing" | "done";

const INSTITUTIONS = [
  { id: "chase",    name: "Chase",                color: "from-blue-600 to-blue-800",       initials: "CH" },
  { id: "boa",      name: "Bank of America",      color: "from-red-600 to-red-800",         initials: "BA" },
  { id: "wells",    name: "Wells Fargo",          color: "from-amber-600 to-red-700",       initials: "WF" },
  { id: "citi",     name: "Citibank",             color: "from-sky-600 to-blue-800",        initials: "CI" },
  { id: "capone",   name: "Capital One",          color: "from-rose-600 to-rose-900",       initials: "C1" },
  { id: "amex",     name: "American Express",     color: "from-slate-500 to-slate-800",     initials: "AX" },
  { id: "schwab",   name: "Charles Schwab",       color: "from-cyan-600 to-blue-800",       initials: "CS" },
  { id: "ally",     name: "Ally Bank",            color: "from-violet-600 to-indigo-800",   initials: "AL" },
  { id: "discover", name: "Discover",             color: "from-orange-500 to-orange-700",   initials: "DI" },
];

type AccountOption = { id: string; name: string; mask: string; type: Account["type"]; balance: number; selected: boolean };

const ACCOUNTS_BY_INSTITUTION: Record<string, AccountOption[]> = {
  chase: [
    { id: "chase-chk", name: "Total Checking",    mask: "··8821", type: "checking",   balance:  4210.18, selected: true },
    { id: "chase-sav", name: "Premier Savings",   mask: "··8822", type: "savings",    balance: 12500.00, selected: true },
    { id: "chase-cc",  name: "Sapphire Reserve",  mask: "··2204", type: "credit",     balance: -1840.55, selected: true },
  ],
  boa: [
    { id: "boa-chk",   name: "Advantage Checking", mask: "··3301", type: "checking",  balance:  6212.40, selected: true },
    { id: "boa-cc",    name: "Travel Rewards",     mask: "··9088", type: "credit",    balance:  -612.10, selected: true },
  ],
  wells: [
    { id: "wf-chk",    name: "Everyday Checking",  mask: "··4410", type: "checking",  balance:  2014.00, selected: true },
    { id: "wf-sav",    name: "Way2Save",           mask: "··4411", type: "savings",   balance:  8200.00, selected: true },
  ],
  citi:     [{ id: "citi-cc",   name: "Double Cash",       mask: "··1207", type: "credit",  balance: -310.40, selected: true }],
  capone:   [{ id: "co-cc",     name: "Venture X",         mask: "··6611", type: "credit",  balance: -922.18, selected: true }],
  amex:     [{ id: "amex-gold", name: "Gold Card",         mask: "··1011", type: "credit",  balance: -1240.00, selected: true }],
  schwab:   [{ id: "sch-brk",   name: "Brokerage Account", mask: "··7782", type: "investment", balance: 48200.00, selected: true }],
  ally:     [{ id: "ally-sav",  name: "Online Savings",    mask: "··3344", type: "savings", balance:  18000.00, selected: true }],
  discover: [{ id: "disc-cc",   name: "It Cash Back",      mask: "··5577", type: "credit",  balance:   -210.00, selected: true }],
};

const SAMPLE_MERCHANTS: { merchant: string; amount: number; category: Transaction["category"]; conf: number; essential: boolean }[] = [
  { merchant: "Trader Joe's",      amount:  -82.40, category: "Groceries",     conf: 0.99, essential: true },
  { merchant: "Sweetgreen",        amount:  -18.30, category: "Dining",        conf: 0.98, essential: false },
  { merchant: "Uber",              amount:  -24.10, category: "Transport",     conf: 0.99, essential: false },
  { merchant: "Apple Music",       amount:  -10.99, category: "Subscriptions", conf: 0.99, essential: false },
  { merchant: "CVS Pharmacy",      amount:  -42.18, category: "Health",        conf: 0.95, essential: true },
  { merchant: "Target",            amount: -132.55, category: "Shopping",      conf: 0.93, essential: false },
  { merchant: "Chevron",           amount:  -68.00, category: "Transport",     conf: 0.99, essential: true },
  { merchant: "AMC Theatres",      amount:  -45.00, category: "Entertainment", conf: 0.96, essential: false },
];

export function ConnectAccountDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const addInstitution = useFinanceStore((s) => s.addInstitution);

  const [step, setStep] = useState<Step>("institution");
  const [search, setSearch] = useState("");
  const [institution, setInstitution] = useState<typeof INSTITUTIONS[number] | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [accountOptions, setAccountOptions] = useState<AccountOption[]>([]);

  const reset = () => {
    setStep("institution");
    setSearch(""); setInstitution(null);
    setUsername(""); setPassword("");
    setAccountOptions([]); setSubmitting(false);
  };

  const close = (v: boolean) => {
    if (!v) setTimeout(reset, 200);
    onOpenChange(v);
  };

  const filtered = INSTITUTIONS.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase())
  );

  const pickInstitution = (inst: typeof INSTITUTIONS[number]) => {
    setInstitution(inst);
    setStep("credentials");
  };

  const submitCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;
    setSubmitting(true);
    await new Promise((r) => setTimeout(r, 1100));
    setAccountOptions(ACCOUNTS_BY_INSTITUTION[institution!.id] ?? []);
    setSubmitting(false);
    setStep("selectAccounts");
  };

  const toggleAccount = (id: string) => {
    setAccountOptions((opts) => opts.map((a) => (a.id === id ? { ...a, selected: !a.selected } : a)));
  };

  const finishSync = async () => {
    setStep("syncing");
    await new Promise((r) => setTimeout(r, 1800));

    const selected = accountOptions.filter((a) => a.selected);
    const newAccounts: Account[] = selected.map((a) => ({
      id: a.id, name: `${institution!.name} ${a.name}`, balance: a.balance, type: a.type, mask: a.mask,
    }));

    // Generate fresh transactions for the first selected non-investment account
    const txAccount = selected.find((a) => a.type !== "investment");
    const newTx: Transaction[] = txAccount
      ? SAMPLE_MERCHANTS.map((m, i) => {
          const date = new Date();
          date.setDate(date.getDate() - i);
          return {
            id: `${txAccount.id}-tx-${i}`,
            date: date.toISOString(),
            merchant: m.merchant,
            amount: m.amount,
            category: m.category,
            account: txAccount.id,
            confidence: m.conf,
            essential: m.essential,
            flagged: null,
          };
        })
      : [];

    addInstitution(institution!.name, newAccounts, newTx);
    setStep("done");
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md overflow-hidden border-border bg-card p-0 sm:rounded-2xl">
        {/* Header bar */}
        <div className="flex items-center gap-2 border-b border-border bg-background/40 px-5 py-3 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          <span>Secure connection · powered by Plaid</span>
          <Lock className="ml-auto h-3.5 w-3.5" />
        </div>

        {step === "institution" && (
          <div className="p-6">
            <DialogHeader className="text-left">
              <DialogTitle className="font-display text-2xl">Connect a bank</DialogTitle>
              <DialogDescription>
                Read-only access. We never see or store your credentials.
              </DialogDescription>
            </DialogHeader>

            <div className="relative mt-5">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                placeholder="Search 12,000+ institutions"
                className="pl-9"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <ul className="mt-4 max-h-72 space-y-1 overflow-y-auto pr-1">
              {filtered.map((inst) => (
                <li key={inst.id}>
                  <button
                    onClick={() => pickInstitution(inst)}
                    className="flex w-full items-center gap-3 rounded-xl border border-transparent p-2.5 text-left transition-colors hover:border-border hover:bg-secondary"
                  >
                    <div className={`grid h-9 w-9 place-items-center rounded-lg bg-gradient-to-br ${inst.color} text-xs font-semibold text-white`}>
                      {inst.initials}
                    </div>
                    <span className="flex-1 text-sm">{inst.name}</span>
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="py-8 text-center text-sm text-muted-foreground">
                  No institutions match "{search}"
                </li>
              )}
            </ul>
          </div>
        )}

        {step === "credentials" && institution && (
          <form onSubmit={submitCredentials} className="p-6">
            <div className="flex items-center gap-3">
              <div className={`grid h-10 w-10 place-items-center rounded-lg bg-gradient-to-br ${institution.color} text-sm font-semibold text-white`}>
                {institution.initials}
              </div>
              <div>
                <p className="font-display text-xl">{institution.name}</p>
                <p className="text-xs text-muted-foreground">Sign in to continue</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              <div className="space-y-2">
                <Label htmlFor="user">Username</Label>
                <Input id="user" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="you@bank.com" autoComplete="off" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="pass">Password</Label>
                <Input id="pass" type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••" autoComplete="off" />
              </div>
            </div>

            <div className="mt-6 flex items-center gap-3">
              <Button type="button" variant="ghost" onClick={() => setStep("institution")} className="text-muted-foreground">
                Back
              </Button>
              <Button type="submit" disabled={!username || !password || submitting} className="ml-auto bg-primary text-primary-foreground hover:bg-primary/90">
                {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Verifying</> : "Continue"}
              </Button>
            </div>

            <p className="mt-5 flex items-center gap-2 text-[11px] text-muted-foreground">
              <Lock className="h-3 w-3" /> 256-bit encryption. Read-only. Revocable any time.
            </p>
          </form>
        )}

        {step === "selectAccounts" && (
          <div className="p-6">
            <DialogHeader className="text-left">
              <DialogTitle className="font-display text-2xl">Choose accounts to monitor</DialogTitle>
              <DialogDescription>Pick what Guardian should watch.</DialogDescription>
            </DialogHeader>

            <ul className="mt-5 space-y-2">
              {accountOptions.map((a) => (
                <li key={a.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-xl border border-border p-3 transition-colors hover:bg-secondary">
                    <Checkbox checked={a.selected} onCheckedChange={() => toggleAccount(a.id)} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{a.name}</p>
                      <p className="text-[11px] uppercase tracking-wider text-muted-foreground">{a.type} · {a.mask}</p>
                    </div>
                    <span className="font-mono-fin text-sm tabular-nums">
                      {new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(a.balance)}
                    </span>
                  </label>
                </li>
              ))}
            </ul>

            <div className="mt-6 flex items-center gap-3">
              <Button variant="ghost" onClick={() => setStep("credentials")} className="text-muted-foreground">Back</Button>
              <Button
                onClick={finishSync}
                disabled={!accountOptions.some((a) => a.selected)}
                className="ml-auto bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Connect {accountOptions.filter((a) => a.selected).length} account{accountOptions.filter((a) => a.selected).length === 1 ? "" : "s"}
              </Button>
            </div>
          </div>
        )}

        {step === "syncing" && (
          <div className="px-6 py-12 text-center">
            <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary/10 ring-1 ring-primary/30">
              <Sparkles className="h-7 w-7 text-primary" />
              <span className="pulse-dot absolute inset-0 rounded-full" aria-hidden />
            </div>
            <h3 className="font-display mt-6 text-2xl">Importing 90 days of history</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              AI categorizing transactions · scanning for anomalies · learning your patterns.
            </p>

            <ul className="mx-auto mt-6 max-w-xs space-y-2 text-left text-xs text-muted-foreground">
              <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-success" /> Authenticated with {institution?.name}</li>
              <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-success" /> Pulling transaction history</li>
              <li className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Running categorization model</li>
            </ul>
          </div>
        )}

        {step === "done" && (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/15 ring-1 ring-success/30">
              <Check className="h-8 w-8 text-success" strokeWidth={2.5} />
            </div>
            <h3 className="font-display mt-5 text-2xl">{institution?.name} connected</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {accountOptions.filter((a) => a.selected).length} accounts now under Guardian watch.
            </p>
            <div className="mt-7 flex flex-col gap-2">
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  close(false);
                  toast.success("Account connected — review your transactions");
                  navigate("/transactions");
                }}
              >
                Review transactions
              </Button>
              <Button variant="ghost" onClick={() => close(false)} className="text-muted-foreground">
                Back to dashboard
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
