import { useEffect } from "react";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useFinanceStore } from "@/lib/finance-store";
import { MobileTabBar } from "@/components/MobileTabBar";
import Index from "./pages/Index.tsx";
import NotFound from "./pages/NotFound.tsx";
import Transactions from "./pages/Transactions.tsx";
import CashFlow from "./pages/CashFlow.tsx";
import Liabilities from "./pages/Liabilities.tsx";
import Loans from "./pages/Loans.tsx";

const queryClient = new QueryClient();

const App = () => {
  // Load persisted state from the local backend on startup.
  const hydrate = useFinanceStore((s) => s.hydrate);
  useEffect(() => {
    hydrate();
  }, [hydrate]);

  return (
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter basename={import.meta.env.BASE_URL}>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/transactions" element={<Transactions />} />
            <Route path="/cash-flow" element={<CashFlow />} />
            <Route path="/liabilities" element={<Liabilities />} />
            <Route path="/loans" element={<Loans />} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          <MobileTabBar />
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ThemeProvider>
  );
};

export default App;
