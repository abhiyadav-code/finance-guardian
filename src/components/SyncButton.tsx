import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { useFinanceStore } from "@/lib/finance-store";
import { STATIC_DEMO } from "@/lib/api";
import { toast } from "sonner";

export function SyncButton() {
  const sync = useFinanceStore((s) => s.sync);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (busy) return;
    setBusy(true);
    try {
      await sync();
      if (STATIC_DEMO) {
        toast.success("You're viewing the live demo", {
          description: "Sample data only — connect a bank in the full app to sync for real.",
        });
      } else {
        toast.success("Synced with your banks");
      }
    } catch (e) {
      toast.error("Sync failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={run}
      disabled={busy}
      title="Sync with your banks"
      aria-label="Sync with your banks"
      className="grid h-9 w-9 place-items-center rounded-full border border-border bg-background/60 text-muted-foreground transition-colors hover:text-foreground disabled:opacity-60"
    >
      <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
    </button>
  );
}
