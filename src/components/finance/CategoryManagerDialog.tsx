import { useMemo, useState } from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Lock, Trash2, Plus } from "lucide-react";
import { useFinanceStore } from "@/lib/finance-store";
import { DEFAULT_CATEGORIES } from "@/lib/finance-data";
import { toast } from "sonner";

const BUILTIN = new Set(DEFAULT_CATEGORIES.map((c) => c.toLowerCase()));

export function CategoryManagerDialog({
  open, onOpenChange,
}: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const categories = useFinanceStore((s) => s.categories);
  const transactions = useFinanceStore((s) => s.transactions);
  const addCategory = useFinanceStore((s) => s.addCategory);
  const removeCategory = useFinanceStore((s) => s.removeCategory);
  const [draft, setDraft] = useState("");

  // How many transactions currently use each category.
  const usage = useMemo(() => {
    const m = new Map<string, number>();
    for (const t of transactions) m.set(t.category, (m.get(t.category) ?? 0) + 1);
    return m;
  }, [transactions]);

  const add = () => {
    const clean = draft.trim();
    if (!clean) return;
    addCategory(clean);
    setDraft("");
    toast.success(`Added "${clean}"`);
  };

  const remove = (name: string) => {
    const used = usage.get(name) ?? 0;
    removeCategory(name);
    toast.success(`Removed "${name}"`, {
      description: used > 0 ? `${used} transaction${used === 1 ? "" : "s"} kept this label; recategorize them from the list.` : undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display text-2xl">Manage categories</DialogTitle>
          <DialogDescription>
            Add your own categories or remove custom ones (a typo, say). Built-in categories are locked.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
            placeholder="New category name"
            className="h-9"
          />
          <Button onClick={add} disabled={!draft.trim()} className="h-9 bg-primary text-primary-foreground hover:bg-primary/90">
            <Plus className="mr-1 h-4 w-4" /> Add
          </Button>
        </div>

        <ul className="mt-1 max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {categories.map((c) => {
            const builtin = BUILTIN.has(c.toLowerCase());
            const used = usage.get(c) ?? 0;
            return (
              <li key={c} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="flex items-center gap-2">
                  {c}
                  {used > 0 && <span className="text-[10px] text-muted-foreground">· {used} used</span>}
                </span>
                {builtin ? (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                    <Lock className="h-3 w-3" /> Built-in
                  </span>
                ) : (
                  <button
                    onClick={() => remove(c)}
                    className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs text-destructive transition-colors hover:bg-destructive/10"
                    title="Remove category"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Remove
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
