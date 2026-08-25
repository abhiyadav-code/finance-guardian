// Bill due-date logic shared by the agent brief endpoint. (The web UI computes
// the same thing client-side in src/lib/derive.ts.) Given the app's accounts,
// returns what's overdue and what's due soon so an assistant can flag priorities.
const DAY = 86_400_000;
const LIABILITY = new Set(["credit", "loan"]);
const DUE_SOON_DAYS = 14;

const lastDayOfMonth = (y, m) => new Date(y, m + 1, 0).getDate();

function cycleDueDate(dueDay, now) {
  const y = now.getFullYear();
  const m = now.getMonth();
  return new Date(y, m, Math.min(dueDay, lastDayOfMonth(y, m)));
}

export function computeBrief(accounts, now = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const items = [];
  for (const a of accounts) {
    if (!LIABILITY.has(a.type)) continue;
    const owed = Math.max(0, -a.balance);
    const statement = a.statementBalance ?? 0;
    if (owed <= 0 && statement <= 0) continue; // nothing owed
    if (!a.dueDay) continue;
    const paid = a.payStatus === "paid";
    const due = cycleDueDate(a.dueDay, now);
    const days = Math.round((due - startOfToday) / DAY);
    items.push({
      id: a.id,
      account: a.nickname && a.nickname.trim() ? a.nickname.trim() : a.name,
      owner: a.owner ?? null,
      mask: a.mask ?? null,
      type: a.type,
      dueDate: due.toISOString().slice(0, 10),
      daysUntilDue: days,
      overdue: !paid && days < 0,
      overdueByDays: !paid && days < 0 ? -days : 0,
      currentBalance: Math.round(owed * 100) / 100,
      statementBalance: a.statementBalance ?? null,
      minimumDue: a.minDue ?? null,
      autopay: !!a.autopay,
      status: a.payStatus ?? "unpaid",
      paid,
    });
  }
  const unpaid = items.filter((i) => !i.paid);
  const overdue = unpaid.filter((i) => i.overdue).sort((a, b) => b.overdueByDays - a.overdueByDays);
  const dueSoon = unpaid
    .filter((i) => !i.overdue && i.daysUntilDue <= DUE_SOON_DAYS)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  const later = unpaid
    .filter((i) => !i.overdue && i.daysUntilDue > DUE_SOON_DAYS)
    .sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  const sum = (arr, k) => Math.round(arr.reduce((s, i) => s + (i[k] || 0), 0) * 100) / 100;

  return {
    generatedAt: now.toISOString(),
    summary: {
      overdueCount: overdue.length,
      dueSoonCount: dueSoon.length,
      overdueMinimumDue: sum(overdue, "minimumDue"),
      dueSoonMinimumDue: sum(dueSoon, "minimumDue"),
      overdueBalance: sum(overdue, "currentBalance"),
      nextDueDate: (overdue[0] || dueSoon[0] || later[0])?.dueDate ?? null,
      headline:
        overdue.length > 0
          ? `${overdue.length} payment${overdue.length === 1 ? "" : "s"} overdue`
          : dueSoon.length > 0
          ? `${dueSoon.length} due within ${DUE_SOON_DAYS} days`
          : "Nothing overdue or due soon",
    },
    overdue,
    dueSoon,
    later,
  };
}
