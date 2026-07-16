import { LayoutDashboard, LineChart, CreditCard, Banknote, ReceiptText } from "lucide-react";
import { NavLink } from "@/components/NavLink";

const tabs = [
  { to: "/",             label: "Home",         Icon: LayoutDashboard, end: true },
  { to: "/cash-flow",    label: "Cash flow",    Icon: LineChart },
  { to: "/liabilities",  label: "Liabilities",  Icon: CreditCard },
  { to: "/loans",        label: "Loans",        Icon: Banknote },
  { to: "/transactions", label: "Activity",     Icon: ReceiptText },
] as const;

/**
 * Bottom tab navigation for phones. The desktop header nav is hidden below the
 * `md` breakpoint, so this gives small screens a thumb-friendly way to move
 * between the three core screens — essential for the interactive demo.
 */
export function MobileTabBar() {
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border/60 bg-background/85 backdrop-blur-xl md:hidden"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      aria-label="Primary"
    >
      <ul className="mx-auto flex max-w-md items-stretch justify-around">
        {tabs.map(({ to, label, Icon, end }) => (
          <li key={to} className="flex-1">
            <NavLink
              to={to}
              end={end}
              className="flex flex-col items-center gap-1 py-2.5 text-[9px] font-medium whitespace-nowrap text-muted-foreground transition-colors"
              activeClassName="text-primary"
            >
              <Icon className="h-5 w-5" strokeWidth={2} />
              {label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
}
