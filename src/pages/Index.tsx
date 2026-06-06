import { useState } from "react";
import { TopBar } from "@/components/finance/TopBar";
import { GuardianStatus } from "@/components/finance/GuardianStatus";
import { AccountsStrip } from "@/components/finance/AccountsStrip";
import { InsightFeed } from "@/components/finance/InsightFeed";
import { RunwayCard } from "@/components/finance/RunwayCard";
import { BudgetBaseline } from "@/components/finance/BudgetBaseline";
import { TransactionList } from "@/components/finance/TransactionList";
import { ConnectAccountDialog } from "@/components/finance/ConnectAccountDialog";

const Index = () => {
  const [connectOpen, setConnectOpen] = useState(false);

  return (
    <div className="min-h-screen">
      <TopBar />

      <main className="mx-auto max-w-7xl px-6 py-8 pb-28 md:px-10 md:py-12 md:pb-12">
        {/* Hero / status */}
        <div className="animate-fade-in-up">
          <GuardianStatus />
        </div>

        {/* Accounts */}
        <div className="mt-6 animate-fade-in-up [animation-delay:80ms]">
          <AccountsStrip onConnect={() => setConnectOpen(true)} />
        </div>

        {/* Two-column body */}
        <div className="mt-6 grid gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <div className="animate-fade-in-up [animation-delay:160ms]">
              <InsightFeed />
            </div>
            <div className="animate-fade-in-up [animation-delay:280ms]">
              <TransactionList />
            </div>
          </div>

          <aside className="space-y-6">
            <div className="animate-fade-in-up [animation-delay:200ms]">
              <RunwayCard />
            </div>
            <div className="animate-fade-in-up [animation-delay:320ms]">
              <BudgetBaseline />
            </div>
          </aside>
        </div>

        <footer className="mt-16 border-t border-border pt-6 text-xs text-muted-foreground">
          <p>
            Finance Guardian — prototype. Data shown is illustrative. The "Check Engine Light" for household finances:
            classify automatically, detect anomalies silently, quantify runway on demand.
          </p>
        </footer>
      </main>

      <ConnectAccountDialog open={connectOpen} onOpenChange={setConnectOpen} />
    </div>
  );
};

export default Index;
