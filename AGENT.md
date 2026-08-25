# Finance Guardian — Agent integration

Finance Guardian exposes a **read-only "brief" endpoint** so an assistant (e.g. a
Daily Executive Brief agent) can tell you what bills are **overdue** or **due soon**
without you opening the app.

It returns only due dates, amounts, and account nicknames — **never** full account
numbers, credentials, or Plaid tokens.

## Endpoint

```
GET http://localhost:8080/finance-guardian/api/agent/brief
```

- `8080` is the **production** instance (your real data). `8081` is the demo.
- Read-only. No side effects.

### Auth (optional but recommended)

By default the endpoint is open (it only listens on `localhost`). To require a
token, set `FG_AGENT_TOKEN` in `server/.env.prod` and restart:

```
FG_AGENT_TOKEN=some-long-random-string
```

Then pass it any of these ways:

```bash
curl "http://localhost:8080/finance-guardian/api/agent/brief?token=some-long-random-string"
curl -H "X-Agent-Token: some-long-random-string" http://localhost:8080/finance-guardian/api/agent/brief
curl -H "Authorization: Bearer some-long-random-string" http://localhost:8080/finance-guardian/api/agent/brief
```

## Response shape

```jsonc
{
  "generatedAt": "2026-07-20T15:00:00.000Z",
  "summary": {
    "overdueCount": 1,
    "dueSoonCount": 2,
    "overdueMinimumDue": 35,
    "dueSoonMinimumDue": 180,
    "overdueBalance": 2810.02,
    "nextDueDate": "2026-07-05",
    "headline": "1 payment overdue"
  },
  "overdue": [
    {
      "account": "BofA Visa (Atmos)",   // nickname if set, else bank name
      "owner": "You",
      "type": "credit",
      "dueDate": "2026-07-05",
      "daysUntilDue": -15,
      "overdue": true,
      "overdueByDays": 15,
      "currentBalance": 12500,
      "statementBalance": 12500,
      "minimumDue": 150,
      "autopay": false,
      "status": "unpaid"
    }
  ],
  "dueSoon": [ /* same shape, due within 14 days */ ],
  "later":   [ /* same shape, due later this cycle */ ]
}
```

**How to read it:** `overdue` first (most days overdue first), then `dueSoon`
(soonest first). `autopay: true` means it should pay itself — flag it only if it's
still `overdue` (autopay may have failed). `minimumDue` is the must-pay to avoid a
late fee; `statementBalance` is the pay-in-full amount to avoid interest.

## Wiring it into a Claude agent

Drop a skill like this into your Daily Executive Brief agent (e.g.
`~/.claude/skills/finance-guardian-bills/SKILL.md`):

```markdown
---
name: finance-guardian-bills
description: Check Finance Guardian for overdue or soon-due bills and credit-card
  payments. Use when building a daily/exec brief, or when the user asks "what bills
  are due", "anything overdue", "what do I need to pay".
---

Fetch the brief and summarize what needs attention.

    curl -s "http://localhost:8080/finance-guardian/api/agent/brief"

(If a token is configured, add `?token=$FG_AGENT_TOKEN`.)

Report, in priority order:
1. Anything in `overdue` — name, how many days overdue, and the minimum due. Lead
   with these; they risk late fees / interest.
2. Anything in `dueSoon` due in the next few days.
Use `summary.headline` as the one-line status. If both lists are empty, say bills
are under control. Never print account numbers.
```

That's it — the agent curls one endpoint and speaks the priorities. No polling
loop needed; call it when the brief runs.

## Notes

- The same due logic powers the **"Needs attention"** panel at the top of the
  Liabilities page in the web app, so the agent and the UI always agree.
- Marking a card **Paid** in the app removes it from the brief for that cycle.
- A cloud-hosted agent can't reach `localhost`; this is designed for an agent
  running on the same Mac (e.g. Claude Code). To reach it remotely you'd expose
  the endpoint through the same secure tunnel used for Plaid OAuth (see roadmap).
```
