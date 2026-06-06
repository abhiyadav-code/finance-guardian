import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { usePlaidLink } from "react-plaid-link";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Lock, Loader2, Check, ShieldCheck, Sparkles, Building2, AlertTriangle,
} from "lucide-react";
import { useFinanceStore } from "@/lib/finance-store";
import { api, STATIC_DEMO } from "@/lib/api";
import { toast } from "sonner";

type Step = "intro" | "syncing" | "done" | "unconfigured" | "error";

export function ConnectAccountDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate();
  const hydrate = useFinanceStore((s) => s.hydrate);

  const [step, setStep] = useState<Step>("intro");
  const [linkToken, setLinkToken] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [summary, setSummary] = useState<
    { institutionName: string | null; accounts: number; transactionsAdded: number; holdings: number } | null
  >(null);

  // When the dialog opens: confirm Plaid is configured, then fetch a link token.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setStep("intro");
    setErrorMsg("");
    setSummary(null);
    setLinkToken(null);

    (async () => {
      try {
        const status = await api.plaidStatus();
        if (cancelled) return;
        if (!status.configured) { setStep("unconfigured"); return; }
        const { link_token } = await api.plaidLinkToken();
        if (cancelled) return;
        setLinkToken(link_token);
      } catch (e) {
        if (cancelled) return;
        setErrorMsg(e instanceof Error ? e.message : "Couldn't reach the backend.");
        setStep("error");
      }
    })();

    return () => { cancelled = true; };
  }, [open]);

  const onSuccess = useCallback(
    async (public_token: string, metadata: { institution?: { name?: string; institution_id?: string } | null }) => {
      setStep("syncing");
      try {
        const result = await api.plaidExchange(public_token, metadata.institution ?? undefined);
        await hydrate();
        setSummary(result);
        setStep("done");
      } catch (e) {
        setErrorMsg(e instanceof Error ? e.message : "Failed to import accounts.");
        setStep("error");
      }
    },
    [hydrate]
  );

  const { open: openPlaid, ready } = usePlaidLink({
    token: linkToken,
    onSuccess,
    onExit: (err) => {
      if (err) {
        setErrorMsg(err.display_message || err.error_message || "Connection cancelled.");
        setStep("error");
      }
    },
  });

  const close = (v: boolean) => onOpenChange(v);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-md overflow-hidden border-border bg-card p-0 sm:rounded-2xl">
        {/* Header bar */}
        <div className="flex items-center gap-2 border-b border-border bg-background/40 px-5 py-3 text-xs text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-success" />
          <span>Secure connection · powered by Plaid</span>
          <Lock className="ml-auto h-3.5 w-3.5" />
        </div>

        {step === "intro" && (
          <div className="p-6">
            <DialogHeader className="text-left">
              <DialogTitle className="font-display text-2xl">Connect a bank</DialogTitle>
              <DialogDescription>
                Read-only access via Plaid. Your bank credentials are entered in Plaid's
                secure window — Guardian never sees or stores them.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-6 rounded-xl border border-border bg-background/40 p-4 text-sm text-muted-foreground">
              <ul className="space-y-2">
                <li className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Choose your institution in Plaid</li>
                <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-success" /> Read-only · revocable any time</li>
                <li className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> We import your history & categorize it</li>
              </ul>
            </div>

            <Button
              onClick={() => openPlaid()}
              disabled={!ready || !linkToken}
              className="mt-6 w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {linkToken ? "Continue with Plaid" : <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Preparing…</>}
            </Button>
          </div>
        )}

        {step === "syncing" && (
          <div className="px-6 py-12 text-center">
            <div className="relative mx-auto grid h-16 w-16 place-items-center rounded-full bg-primary/10 ring-1 ring-primary/30">
              <Sparkles className="h-7 w-7 text-primary" />
              <span className="pulse-dot absolute inset-0 rounded-full" aria-hidden />
            </div>
            <h3 className="font-display mt-6 text-2xl">Importing your history</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Pulling accounts & transactions · categorizing · scanning for anomalies.
            </p>
            <ul className="mx-auto mt-6 max-w-xs space-y-2 text-left text-xs text-muted-foreground">
              <li className="flex items-center gap-2"><Check className="h-3.5 w-3.5 text-success" /> Authenticated with your bank</li>
              <li className="flex items-center gap-2"><Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Syncing transactions</li>
            </ul>
          </div>
        )}

        {step === "done" && (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto grid h-16 w-16 place-items-center rounded-full bg-success/15 ring-1 ring-success/30">
              <Check className="h-8 w-8 text-success" strokeWidth={2.5} />
            </div>
            <h3 className="font-display mt-5 text-2xl">{summary?.institutionName ?? "Bank"} connected</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {summary?.accounts ?? 0} account{summary?.accounts === 1 ? "" : "s"} ·{" "}
              {summary?.transactionsAdded ?? 0} transactions imported
              {summary && summary.holdings > 0 ? ` · ${summary.holdings} holdings` : ""}.
            </p>
            <div className="mt-7 flex flex-col gap-2">
              <Button
                className="bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => { close(false); toast.success("Accounts connected"); navigate("/transactions"); }}
              >
                Review transactions
              </Button>
              <Button variant="ghost" onClick={() => close(false)} className="text-muted-foreground">
                Back to dashboard
              </Button>
            </div>
          </div>
        )}

        {step === "unconfigured" && STATIC_DEMO && (
          <div className="px-6 py-10">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 ring-1 ring-primary/30">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <h3 className="font-display mt-5 text-center text-2xl">You're in the live demo</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              This interactive preview runs on built-in sample data, so there's nothing to connect.
              In the real app, this is where you'd securely link a bank through Plaid — read-only,
              and your credentials never touch Guardian.
            </p>
            <div className="mt-5 rounded-xl border border-border bg-background/40 p-4 text-sm text-muted-foreground">
              <ul className="space-y-2">
                <li className="flex items-center gap-2"><Building2 className="h-4 w-4 text-primary" /> Pick your bank in Plaid's secure window</li>
                <li className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-success" /> Read-only access · revocable any time</li>
                <li className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-primary" /> History imported & auto-categorized</li>
              </ul>
            </div>
            <Button onClick={() => close(false)} className="mt-6 w-full bg-primary text-primary-foreground hover:bg-primary/90">
              Keep exploring the demo
            </Button>
          </div>
        )}

        {step === "unconfigured" && !STATIC_DEMO && (
          <div className="px-6 py-10">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-primary/10 ring-1 ring-primary/30">
              <Building2 className="h-7 w-7 text-primary" />
            </div>
            <h3 className="font-display mt-5 text-center text-2xl">Plaid isn't set up yet</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground">
              Add your Plaid keys to the backend, then restart it:
            </p>
            <pre className="mt-4 overflow-x-auto rounded-lg border border-border bg-background/60 p-3 text-left text-[11px] leading-relaxed text-muted-foreground">
{`# server/.env
PLAID_CLIENT_ID=your_client_id
PLAID_SECRET=your_sandbox_secret
PLAID_ENV=sandbox`}
            </pre>
            <Button variant="ghost" onClick={() => close(false)} className="mt-5 w-full text-muted-foreground">
              Close
            </Button>
          </div>
        )}

        {step === "error" && (
          <div className="px-6 py-10 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-destructive/10 ring-1 ring-destructive/30">
              <AlertTriangle className="h-7 w-7 text-destructive" />
            </div>
            <h3 className="font-display mt-5 text-2xl">Something went wrong</h3>
            <p className="mt-2 text-sm text-muted-foreground">{errorMsg}</p>
            <div className="mt-7 flex flex-col gap-2">
              <Button className="bg-primary text-primary-foreground hover:bg-primary/90" onClick={() => setStep("intro")}>
                Try again
              </Button>
              <Button variant="ghost" onClick={() => close(false)} className="text-muted-foreground">Close</Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
